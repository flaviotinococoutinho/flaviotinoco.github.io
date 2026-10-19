//! `dynamics.wasm` — dynamical systems, probability and generative kernels (ABI v1).
//!
//! Every export is a thin wrapper that validates pointers and parameters (see
//! [`kernel_core::mem`]) and calls a plain function from [`logistic`], [`lorenz`],
//! [`clt`], [`noise`] or [`flow`]. The flow field keeps its particle state in a
//! persistent (pinned) arena block that `arena_reset` does not free.
#![cfg_attr(not(test), no_std)]

pub mod clt;
pub mod flow;
pub mod logistic;
pub mod lorenz;
pub mod noise;
pub mod pcg;

use core::cell::UnsafeCell;

use kernel_core::mem::output;
use kernel_core::{Error, KResult, arena, finite, status};

kernel_core::export_abi!();

fn nonzero(n: u32) -> KResult {
    if n == 0 {
        Err(Error::InvalidLength)
    } else {
        Ok(())
    }
}

fn logistic_params(r: f64, x0: f64) -> KResult {
    if logistic::valid(r, x0) {
        Ok(())
    } else {
        Err(Error::InvalidParameter)
    }
}

fn r_range(r_min: f64, r_max: f64) -> KResult {
    if (0.0..=4.0).contains(&r_min) && (0.0..=4.0).contains(&r_max) && r_min <= r_max {
        Ok(())
    } else {
        Err(Error::InvalidParameter)
    }
}

/// Logistic-map orbit (May 1976) `out[0] = x0`, `out[k+1] = r·out[k]·(1 − out[k])` for
/// `n` points. Status: `-1` if `n = 0`; `-4` unless `r ∈ [0, 4]` and `x0 ∈ [0, 1]`.
#[unsafe(no_mangle)]
pub extern "C" fn logistic_orbit(r: f64, x0: f64, n: u32, out: u32) -> i32 {
    status((|| {
        nonzero(n)?;
        logistic_params(r, x0)?;
        // SAFETY: the only live view.
        let (out, _) = unsafe { output::<f64>(out, n, &[])? };
        logistic::orbit(r, x0, out);
        Ok(())
    })())
}

/// Lyapunov exponent `λ = (1/n) Σ ln max(|r(1 − 2x_k)|, 1e−300)` of the logistic map
/// over `n` iterates after `transient` (nats per iteration; `λ(4) = ln 2`). `NaN` if
/// `n = 0` or the parameters are invalid (`r ∈ [0, 4]`, `x0 ∈ [0, 1]`).
#[unsafe(no_mangle)]
pub extern "C" fn logistic_lyapunov(r: f64, x0: f64, transient: u32, n: u32) -> f64 {
    if logistic::valid(r, x0) {
        logistic::lyapunov(r, x0, transient, n)
    } else {
        f64::NAN
    }
}

/// Bifurcation diagram (Feigenbaum 1978) as a `width × height` `u32` density image
/// (row-major, row 0 is `x = 1`): column `c` uses `r` at the pixel centre, iterates from
/// the critical point `x = 1/2`, skips `transient` iterates and counts the next
/// `iterations`. Returns the maximum count (for tone mapping), `0` on error (zero size,
/// `width·height ≥ 2^32`, `r` outside `0 ≤ r_min ≤ r_max ≤ 4`, invalid pointer).
#[unsafe(no_mangle)]
pub extern "C" fn logistic_bifurcation(
    r_min: f64,
    r_max: f64,
    width: u32,
    height: u32,
    transient: u32,
    iterations: u32,
    out: u32,
) -> u32 {
    (|| -> KResult<u32> {
        nonzero(width)?;
        nonzero(height)?;
        r_range(r_min, r_max)?;
        let len = width.checked_mul(height).ok_or(Error::InvalidLength)?;
        // SAFETY: the only live view.
        let (out, _) = unsafe { output::<u32>(out, len, &[])? };
        Ok(logistic::bifurcation(
            r_min, r_max, width, height, transient, iterations, out,
        ))
    })()
    .unwrap_or(0)
}

/// Lyapunov exponent for `samples` values of `r` at the pixel centres of `[r_min, r_max]`
/// (aligned with `logistic_bifurcation` columns), from `x0 = 1/2`, written as `f64`.
/// Status: `-1` if `samples = 0` or `n = 0`; `-4` for an invalid range or pointer.
#[unsafe(no_mangle)]
pub extern "C" fn lyapunov_curve(
    r_min: f64,
    r_max: f64,
    samples: u32,
    transient: u32,
    n: u32,
    out: u32,
) -> i32 {
    status((|| {
        nonzero(samples)?;
        nonzero(n)?;
        r_range(r_min, r_max)?;
        // SAFETY: the only live view.
        let (out, _) = unsafe { output::<f64>(out, samples, &[])? };
        logistic::lyapunov_curve(r_min, r_max, transient, n, out);
        Ok(())
    })())
}

/// Lorenz (1963) trajectory integrated with classical RK4: writes `steps` points as
/// `f32` `x, y, z` triples (`steps × 3`); point 0 is `(x0, y0, z0)`. Status: `-1` if
/// `steps = 0`; `-4` for non-finite parameters, `dt ≤ 0`, `steps·3 ≥ 2^32`, or if the
/// trajectory diverges (remaining points then repeat the last finite point).
#[unsafe(no_mangle)]
pub extern "C" fn lorenz(
    sigma: f64,
    rho: f64,
    beta: f64,
    dt: f64,
    steps: u32,
    x0: f64,
    y0: f64,
    z0: f64,
    out: u32,
) -> i32 {
    status((|| {
        nonzero(steps)?;
        let p = lorenz::Params {
            sigma: finite(sigma)?,
            rho: finite(rho)?,
            beta: finite(beta)?,
            dt: finite(dt)?,
        };
        if p.dt <= 0.0 {
            return Err(Error::InvalidParameter);
        }
        let start = [finite(x0)?, finite(y0)?, finite(z0)?];
        let len = steps.checked_mul(3).ok_or(Error::InvalidParameter)?;
        // SAFETY: the only live view.
        let (out, _) = unsafe { output::<f32>(out, len, &[])? };
        lorenz::integrate(&p, start, out)
    })())
}

/// Central-limit-theorem histogram: `samples` draws of `S = Σ_{i<terms} U_i`,
/// `U_i ~ U[0, 1)` from PCG32 (O'Neill 2014) seeded with `pcg32_srandom(seed, 54)` where
/// `seed = seed_hi·2^32 + seed_lo`; each `z = (S − terms/2)/sqrt(terms/12)` is counted
/// in one of `bins` equal `u32` bins over `[−4, 4)`. Status: `-1` if `bins = 0`;
/// `-4` if `terms = 0` or the pointer is invalid.
#[unsafe(no_mangle)]
pub extern "C" fn clt_histogram(
    seed_lo: u32,
    seed_hi: u32,
    terms: u32,
    samples: u32,
    bins: u32,
    out: u32,
) -> i32 {
    status((|| {
        nonzero(bins)?;
        if terms == 0 {
            return Err(Error::InvalidParameter);
        }
        // SAFETY: the only live view.
        let (out, _) = unsafe { output::<u32>(out, bins, &[])? };
        let seed = (u64::from(seed_hi) << 32) | u64::from(seed_lo);
        let mut rng = pcg::Pcg32::new(seed, pcg::CLT_STREAM);
        clt::histogram(&mut rng, terms, samples, out);
        Ok(())
    })())
}

/// 3D simplex noise (Gustavson 2005; kernel `r² = 0.5`, exact normalisation) at
/// `(x, y, z)` for `seed`; deterministic, in `[−1, 1]`; `NaN` for non-finite input.
#[unsafe(no_mangle)]
pub extern "C" fn noise3(x: f64, y: f64, z: f64, seed: u32) -> f64 {
    noise::noise3(x, y, z, seed)
}

/// Persistent flow-field state (lives in a pinned arena block).
struct FlowState {
    field: flow::Field,
    n: u32,
    particles: u32,
    segments: u32,
}

struct FlowCell(UnsafeCell<Option<FlowState>>);

// SAFETY: the kernels are single-threaded (wasm32 without threads or shared memory).
unsafe impl Sync for FlowCell {}

static FLOW: FlowCell = FlowCell(UnsafeCell::new(None));

fn with_flow<R>(f: impl FnOnce(&mut Option<FlowState>) -> R) -> R {
    // SAFETY: single-threaded and non-reentrant; the reference does not escape `f`.
    f(unsafe { &mut *FLOW.0.get() })
}

/// Mutable views of the pinned particle and segment buffers.
///
/// # Safety
///
/// `s` must describe live pinned buffers (guaranteed while it is stored in `FLOW`, since
/// only `flow_init` releases pinned memory), and no other view of them may be alive.
unsafe fn flow_buffers<'a>(s: &FlowState) -> (&'a mut [f32], &'a mut [f32]) {
    let n = s.n as usize;
    // SAFETY: both blocks were allocated by `flow_init` with exactly these lengths, are
    // disjoint, aligned for f32, pinned (unreachable through caller pointers, which must
    // lie in the transient arena) and not otherwise borrowed.
    unsafe {
        (
            core::slice::from_raw_parts_mut(
                arena::ptr(s.particles).cast::<f32>(),
                n * flow::PARTICLE_STRIDE,
            ),
            core::slice::from_raw_parts_mut(
                arena::ptr(s.segments).cast::<f32>(),
                n * flow::SEGMENT_STRIDE,
            ),
        )
    }
}

/// Creates the curl-noise flow field (Bridson et al. 2007) with `n` particles over
/// `[0, width) × [0, height)`. **Releases every arena allocation** (and any previous
/// field), then keeps the particle and segment buffers in a pinned block that
/// `arena_reset` preserves. Status: `-1` unless `1 ≤ n ≤ 65536`; `-4` unless `width`
/// and `height` are finite and positive; `-3` if memory cannot grow.
#[unsafe(no_mangle)]
pub extern "C" fn flow_init(n: u32, seed: u32, width: f64, height: f64) -> i32 {
    status((|| {
        if n == 0 || n > flow::MAX_PARTICLES {
            return Err(Error::InvalidLength);
        }
        let (width, height) = (finite(width)?, finite(height)?);
        if width <= 0.0 || height <= 0.0 {
            return Err(Error::InvalidParameter);
        }
        with_flow(|f| *f = None);
        arena::reset_all();
        let count = n as usize;
        let allocated = arena::alloc_array::<f32>(count * flow::PARTICLE_STRIDE)
            .and_then(|p| Ok((p, arena::alloc_array::<f32>(count * flow::SEGMENT_STRIDE)?)));
        let (particles, segments) = match allocated {
            Ok(ptrs) => ptrs,
            Err(e) => {
                arena::reset_all();
                return Err(e);
            }
        };
        arena::pin();
        let mut state = FlowState {
            field: flow::Field::new(seed, width, height),
            n,
            particles,
            segments,
        };
        // SAFETY: freshly allocated, pinned, disjoint buffers; nothing else views them.
        let (p, s) = unsafe { flow_buffers(&state) };
        state.field.init(p, s);
        with_flow(|f| *f = Some(state));
        Ok(())
    })())
}

/// Advances the flow field by `dt` at noise time `t` (`ψ = noise3(x·scale, y·scale, t)`,
/// velocity `speed·(∂ψ/∂Y, −∂ψ/∂X)` in pixels per time unit) and rewrites the segment
/// buffer. Status: `-4` before `flow_init`, or unless every argument is finite with
/// `dt ≥ 0` and `scale > 0`.
#[unsafe(no_mangle)]
pub extern "C" fn flow_step(t: f64, dt: f64, scale: f64, speed: f64) -> i32 {
    status((|| {
        let (t, dt, scale, speed) = (finite(t)?, finite(dt)?, finite(scale)?, finite(speed)?);
        if dt < 0.0 || scale <= 0.0 {
            return Err(Error::InvalidParameter);
        }
        with_flow(|f| {
            let state = f.as_mut().ok_or(Error::InvalidParameter)?;
            // SAFETY: `state` is stored in FLOW, so its pinned buffers are live; no other
            // view of them exists during this call.
            let (p, s) = unsafe { flow_buffers(state) };
            state.field.step(p, s, t, dt, scale, speed);
            Ok(())
        })
    })())
}

/// Byte offset of the `f32` segment buffer `[x0, y0, x1, y1, alpha] × flow_count()`
/// written by the last `flow_init`/`flow_step` (`0` before `flow_init`).
#[unsafe(no_mangle)]
pub extern "C" fn flow_segments_ptr() -> u32 {
    with_flow(|f| f.as_ref().map_or(0, |s| s.segments))
}

/// Number of particles (and segments) of the current flow field (`0` before `flow_init`).
#[unsafe(no_mangle)]
pub extern "C" fn flow_count() -> u32 {
    with_flow(|f| f.as_ref().map_or(0, |s| s.n))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parameter_validation() {
        assert_eq!(logistic_params(4.0, 1.0), Ok(()));
        assert_eq!(logistic_params(4.1, 0.5), Err(Error::InvalidParameter));
        assert_eq!(logistic_params(3.0, f64::NAN), Err(Error::InvalidParameter));
        assert_eq!(r_range(2.5, 4.0), Ok(()));
        assert_eq!(r_range(3.0, 2.0), Err(Error::InvalidParameter));
        assert!(logistic_lyapunov(5.0, 0.5, 0, 10).is_nan());
    }
}
