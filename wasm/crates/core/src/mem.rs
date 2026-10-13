//! Validated, typed views of caller-supplied linear-memory regions.
//!
//! A region `(ptr, len)` of `T` is accepted only when it is non-null, aligned to
//! `align_of::<T>()` and lies entirely inside the live transient arena `[floor, top)`
//! (i.e. it was obtained from `arena_alloc` since the last `arena_reset`). This keeps
//! callers away from the stack, static data and persistent kernel state, so a bad
//! pointer yields `-4` instead of memory corruption or a trap. Zero-length regions are
//! always valid and never dereferenced.

use core::mem::{align_of, size_of};

use crate::{Error, KResult, arena};

/// Element types that may be viewed in linear memory.
///
/// # Safety
///
/// Implementors must be `Copy`, contain no padding, and accept every bit pattern.
pub unsafe trait Pod: Copy + 'static {}

// SAFETY: primitive integers and floats have no padding and no invalid bit patterns.
unsafe impl Pod for u8 {}
// SAFETY: as above.
unsafe impl Pod for u32 {}
// SAFETY: as above.
unsafe impl Pod for u64 {}
// SAFETY: as above.
unsafe impl Pod for f32 {}
// SAFETY: as above.
unsafe impl Pod for f64 {}

/// A byte range `[start, end)` of linear memory.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Region {
    start: u64,
    end: u64,
}

impl Region {
    /// The empty region (overlaps nothing).
    pub const EMPTY: Self = Self { start: 0, end: 0 };

    /// Whether the two regions share at least one byte.
    #[must_use]
    pub const fn overlaps(self, other: Self) -> bool {
        self.start < self.end
            && other.start < other.end
            && self.start < other.end
            && other.start < self.end
    }
}

/// Largest region size in bytes: slices may not span more than `isize::MAX` bytes
/// (2 GiB − 1 on wasm32), even though linear memory can reach 4 GiB.
const MAX_REGION_BYTES: u64 = isize::MAX as u64;

/// Validates the region `(ptr, len)` of `T` against the live arena.
pub fn region<T: Pod>(ptr: u32, len: u32) -> KResult<Region> {
    if len == 0 {
        return Ok(Region::EMPTY);
    }
    let (floor, top) = arena::live();
    let start = u64::from(ptr);
    // No overflow: len < 2^32 and size_of::<T>() <= 8.
    let bytes = u64::from(len) * size_of::<T>() as u64;
    let end = start + bytes;
    let aligned = start % align_of::<T>() as u64 == 0;
    if ptr == 0
        || !aligned
        || start < u64::from(floor)
        || end > u64::from(top)
        || bytes > MAX_REGION_BYTES
    {
        return Err(Error::InvalidParameter);
    }
    Ok(Region { start, end })
}

/// Fails with [`Error::InvalidParameter`] when `r` overlaps any of `others`.
pub fn disjoint(r: Region, others: &[Region]) -> KResult {
    if others.iter().any(|o| r.overlaps(*o)) {
        Err(Error::InvalidParameter)
    } else {
        Ok(())
    }
}

/// A shared view of a caller-supplied input region.
///
/// # Safety
///
/// While the returned slice is alive, no mutable view of an overlapping region may
/// exist. Use [`output`] (which checks overlap) for every mutable view.
pub unsafe fn input<'a, T: Pod>(ptr: u32, len: u32) -> KResult<(&'a [T], Region)> {
    let r = region::<T>(ptr, len)?;
    if len == 0 {
        return Ok((&[], r));
    }
    // SAFETY: `r` is non-null, aligned and inside the live arena (addressable,
    // initialised linear memory); `T: Pod`; aliasing is the caller's obligation.
    let s = unsafe { core::slice::from_raw_parts(arena::ptr(ptr).cast::<T>(), len as usize) };
    Ok((s, r))
}

/// A mutable view of a caller-supplied output region that must not overlap `others`.
///
/// # Safety
///
/// `others` must contain the region of every view (shared or mutable) that is alive
/// while the returned slice is.
pub unsafe fn output<'a, T: Pod>(
    ptr: u32,
    len: u32,
    others: &[Region],
) -> KResult<(&'a mut [T], Region)> {
    let r = region::<T>(ptr, len)?;
    disjoint(r, others)?;
    if len == 0 {
        return Ok((&mut [], r));
    }
    // SAFETY: as in `input`, and the region overlaps no other live view.
    let s = unsafe { core::slice::from_raw_parts_mut(arena::ptr(ptr).cast::<T>(), len as usize) };
    Ok((s, r))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlap_is_symmetric_and_ignores_empty_regions() {
        let a = Region { start: 10, end: 20 };
        let b = Region { start: 19, end: 30 };
        let c = Region { start: 20, end: 30 };
        assert!(a.overlaps(b) && b.overlaps(a));
        assert!(!a.overlaps(c) && !c.overlaps(a));
        assert!(!a.overlaps(Region::EMPTY));
        assert!(!Region { start: 15, end: 15 }.overlaps(a));
        assert_eq!(disjoint(a, &[c, Region::EMPTY]), Ok(()));
        assert_eq!(disjoint(a, &[c, b]), Err(Error::InvalidParameter));
    }

    #[test]
    fn empty_regions_are_always_valid() {
        assert_eq!(region::<f64>(0, 0), Ok(Region::EMPTY));
        assert_eq!(region::<f64>(7, 0), Ok(Region::EMPTY));
    }
}
