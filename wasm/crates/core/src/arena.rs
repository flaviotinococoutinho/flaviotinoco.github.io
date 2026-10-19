//! Bump allocator over linear memory, starting at the linker-defined `__heap_base`.
//!
//! Layout (wasm32): `[0, __heap_base)` holds the 64 KiB shadow stack and static data;
//! the arena grows upwards from `__heap_base`, calling `memory.grow` when needed.
//!
//! ```text
//! base ── persistent blocks ── floor ── transient blocks ── top ── (free)
//! ```
//!
//! * `arena_alloc` bumps `top`; `arena_reset` rewinds `top` to `floor`.
//! * A kernel may [`pin`] its state (e.g. the flow field) so that `arena_reset`
//!   keeps it; [`reset_all`] releases everything.
//! * [`Temp`] provides scoped scratch space above `top` for kernels that need it;
//!   it is released when the guard is dropped, before the call returns.
//!
//! The kernels are single-threaded (no shared memory, no threads), which is what makes
//! the global state below sound.

use core::cell::UnsafeCell;
use core::mem::{align_of, size_of};

use crate::mem::Pod;
use crate::{Error, KResult};

/// Size of a WebAssembly page in bytes.
pub const PAGE: u64 = 65_536;

/// Exclusive upper bound for arena addresses: every region end must fit in a `u32`.
const LIMIT: u64 = u32::MAX as u64;

/// Alignment of the arena base (and therefore the strictest natural alignment we need).
const BASE_ALIGN: u32 = 16;

/// Pure bump-allocator bookkeeping (no memory access), unit-tested on the host.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Bump {
    base: u32,
    floor: u32,
    top: u32,
}

impl Bump {
    /// A new, empty arena whose first byte is `base` rounded up to 16.
    #[must_use]
    pub const fn new(base: u32) -> Self {
        let base = (base.saturating_add(BASE_ALIGN - 1)) & !(BASE_ALIGN - 1);
        Self {
            base,
            floor: base,
            top: base,
        }
    }

    /// Reserves `bytes` bytes aligned to `align`. `ensure(end)` must make the memory
    /// `[0, end)` addressable (growing it if necessary) and report success.
    ///
    /// Returns the start offset, or `None` when `align` is not a power of two, the
    /// region would cross 4 GiB, or `ensure` fails. The state is unchanged on failure.
    pub fn alloc(
        &mut self,
        bytes: u32,
        align: u32,
        ensure: impl FnOnce(u64) -> bool,
    ) -> Option<u32> {
        if !align.is_power_of_two() {
            return None;
        }
        let mask = u64::from(align) - 1;
        let start = (u64::from(self.top) + mask) & !mask;
        let end = start + u64::from(bytes);
        if end > LIMIT || !ensure(end) {
            return None;
        }
        // Both fit in u32 because end <= LIMIT.
        self.top = end as u32;
        Some(start as u32)
    }

    /// Frees every transient allocation (rewinds `top` to `floor`).
    pub fn reset(&mut self) {
        self.top = self.floor;
    }

    /// Frees everything, including pinned (persistent) blocks.
    pub fn reset_all(&mut self) {
        self.floor = self.base;
        self.top = self.base;
    }

    /// Makes every current allocation persistent: later [`Bump::reset`] calls keep it.
    pub fn pin(&mut self) {
        self.floor = self.top;
    }

    /// Rewinds `top` to `mark` if it lies within the transient range.
    pub fn rewind(&mut self, mark: u32) {
        if mark >= self.floor && mark <= self.top {
            self.top = mark;
        }
    }

    /// Bytes in use (persistent and transient).
    #[must_use]
    pub const fn used(&self) -> u32 {
        self.top - self.base
    }

    /// The live transient range `[floor, top)`.
    #[must_use]
    pub const fn live(&self) -> (u32, u32) {
        (self.floor, self.top)
    }
}

#[cfg(target_arch = "wasm32")]
mod sys {
    use super::PAGE;

    unsafe extern "C" {
        /// First byte after the shadow stack and static data (defined by wasm-ld).
        static __heap_base: u8;
    }

    pub(crate) fn heap_base() -> u32 {
        // Only the symbol's address is taken; it is never read.
        let p = &raw const __heap_base;
        // usize is 32 bits on wasm32: lossless.
        p.addr() as u32
    }

    pub(crate) fn memory_bytes() -> u64 {
        core::arch::wasm32::memory_size(0) as u64 * PAGE
    }

    pub(crate) fn ensure(end: u64) -> bool {
        let have = memory_bytes();
        if end <= have {
            return true;
        }
        let pages = (end - have).div_ceil(PAGE);
        core::arch::wasm32::memory_grow(0, pages as usize) != usize::MAX
    }

    pub(crate) fn ptr(offset: u32) -> *mut u8 {
        // On wasm32 a linear-memory offset *is* the address.
        core::ptr::with_exposed_provenance_mut(offset as usize)
    }
}

/// Host emulation of linear memory: lets the crates compile and be unit-tested on the
/// host. Kernels only touch it from single-threaded code.
#[cfg(not(target_arch = "wasm32"))]
mod sys {
    use core::cell::UnsafeCell;

    const BYTES: usize = 1 << 16;

    #[repr(C, align(16))]
    struct HostMemory(UnsafeCell<[u8; BYTES]>);

    // SAFETY: host builds only exist for compilation and single-threaded tests; the
    // wasm32 kernels themselves never run on more than one thread.
    unsafe impl Sync for HostMemory {}

    static MEMORY: HostMemory = HostMemory(UnsafeCell::new([0; BYTES]));

    pub(crate) fn heap_base() -> u32 {
        1024
    }

    pub(crate) fn memory_bytes() -> u64 {
        BYTES as u64
    }

    pub(crate) fn ensure(end: u64) -> bool {
        end <= memory_bytes()
    }

    pub(crate) fn ptr(offset: u32) -> *mut u8 {
        MEMORY.0.get().cast::<u8>().wrapping_add(offset as usize)
    }
}

struct Global(UnsafeCell<Bump>);

// SAFETY: the kernels are single-threaded (wasm32 without threads or shared memory),
// and `with` never lets a reference to the state escape.
unsafe impl Sync for Global {}

static ARENA: Global = Global(UnsafeCell::new(Bump {
    base: 0,
    floor: 0,
    top: 0,
}));

fn with<R>(f: impl FnOnce(&mut Bump) -> R) -> R {
    // SAFETY: single-threaded and non-reentrant (no callbacks into the arena while `f`
    // runs), so this is the only reference to the state for the duration of `f`.
    let bump = unsafe { &mut *ARENA.0.get() };
    if bump.base == 0 {
        *bump = Bump::new(sys::heap_base());
    }
    f(bump)
}

/// `arena_alloc`: see [`Bump::alloc`]. Returns `0` on failure.
#[must_use]
pub fn alloc(bytes: u32, align: u32) -> u32 {
    with(|b| b.alloc(bytes, align, sys::ensure)).unwrap_or(0)
}

/// `arena_reset`: frees every transient allocation.
pub fn reset() {
    with(Bump::reset);
}

/// Frees everything, including persistent blocks (used by `flow_init`).
pub fn reset_all() {
    with(Bump::reset_all);
}

/// Makes every current allocation persistent.
pub fn pin() {
    with(Bump::pin);
}

/// `arena_used`: bytes in use.
#[must_use]
pub fn used() -> u32 {
    with(|b| b.used())
}

/// The live transient range `[floor, top)` that caller-supplied pointers must lie in.
#[must_use]
pub fn live() -> (u32, u32) {
    with(|b| b.live())
}

/// Size of linear memory in bytes.
#[must_use]
pub fn memory_bytes() -> u64 {
    sys::memory_bytes()
}

/// Raw pointer for a linear-memory offset.
#[must_use]
pub fn ptr(offset: u32) -> *mut u8 {
    sys::ptr(offset)
}

/// Allocates `len` elements of `T` and returns their offset (for persistent state).
pub fn alloc_array<T: Pod>(len: usize) -> KResult<u32> {
    // A slice may span at most `isize::MAX` bytes.
    let bytes = len
        .checked_mul(size_of::<T>())
        .filter(|&b| b <= isize::MAX as usize)
        .and_then(|b| u32::try_from(b).ok())
        .ok_or(Error::OutOfMemory)?;
    // Alignments of Pod types are tiny powers of two.
    let align = align_of::<T>() as u32;
    with(|b| b.alloc(bytes, align, sys::ensure)).ok_or(Error::OutOfMemory)
}

/// Scoped scratch space above every live allocation, released on drop.
///
/// Slices handed out by [`Temp::alloc`] are disjoint from each other and from every
/// caller-supplied region (those lie below the `top` recorded when the guard was made).
#[must_use]
pub struct Temp {
    mark: u32,
}

impl Temp {
    /// Records the current `top`; dropping the guard rewinds to it.
    pub fn begin() -> Self {
        Self {
            mark: with(|b| b.top),
        }
    }

    /// Allocates `len` elements of `T`. The contents are unspecified.
    #[allow(clippy::mut_from_ref)] // each call returns a fresh, disjoint region
    pub fn alloc<T: Pod>(&self, len: usize) -> KResult<&mut [T]> {
        let start = alloc_array::<T>(len)?;
        // SAFETY: `[start, start + len·size_of::<T>())` was just reserved above every
        // other live region, is suitably aligned, addressable (ensured by the arena) and
        // stays reserved until `self` is dropped, which the returned borrow cannot outlive.
        // Linear memory is always initialised and `T: Pod` accepts every bit pattern.
        Ok(unsafe { core::slice::from_raw_parts_mut(ptr(start).cast::<T>(), len) })
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        with(|b| b.rewind(self.mark));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unlimited(_: u64) -> bool {
        true
    }

    #[test]
    fn base_is_aligned_to_16() {
        assert_eq!(Bump::new(1).live(), (16, 16));
        assert_eq!(Bump::new(32).live(), (32, 32));
    }

    #[test]
    fn alloc_respects_alignment_and_bumps() {
        let mut b = Bump::new(1024);
        assert_eq!(b.alloc(3, 1, unlimited), Some(1024));
        assert_eq!(b.alloc(8, 8, unlimited), Some(1032));
        assert_eq!(b.alloc(1, 64, unlimited), Some(1088));
        assert_eq!(b.used(), 1089 - 1024);
        // zero-byte allocations return an aligned, non-null offset
        assert_eq!(b.alloc(0, 4, unlimited), Some(1092));
    }

    #[test]
    fn alloc_rejects_bad_alignment_and_overflow() {
        let mut b = Bump::new(1024);
        assert_eq!(b.alloc(8, 0, unlimited), None);
        assert_eq!(b.alloc(8, 3, unlimited), None);
        assert_eq!(b.alloc(u32::MAX, 1, unlimited), None);
        assert_eq!(b.alloc(8, 8, |end| end <= 1028), None);
        assert_eq!(b.used(), 0, "failed allocations leave the state unchanged");
    }

    #[test]
    fn reset_keeps_pinned_blocks() {
        let mut b = Bump::new(1024);
        b.alloc(100, 8, unlimited);
        b.pin();
        let pinned = b.used();
        b.alloc(50, 8, unlimited);
        assert_eq!(b.live(), (1124, 1178)); // 1124 is padded to 1128 for align 8
        b.reset();
        assert_eq!(b.used(), pinned);
        b.reset_all();
        assert_eq!(b.used(), 0);
    }

    #[test]
    fn rewind_ignores_marks_outside_the_transient_range() {
        let mut b = Bump::new(1024);
        b.alloc(64, 8, unlimited);
        b.pin();
        b.alloc(64, 8, unlimited);
        b.rewind(1000);
        assert_eq!(b.live(), (1088, 1152));
        b.rewind(1100);
        assert_eq!(b.live(), (1088, 1100));
    }
}
