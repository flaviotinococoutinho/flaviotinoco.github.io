//! `signal.wasm` — Fourier analysis and sampling kernels (ABI v1).
//!
//! Every export is a thin wrapper that validates pointers and parameters (see
//! [`kernel_core::mem`]) and calls a plain function from [`fft`], [`window`],
//! [`series`] or [`sampling`]. Buffers are `f64` arrays addressed by `u32` offsets
//! into the arena. Status codes: `0` OK, `-1` invalid length, `-2` not a power of two,
//! `-3` out of memory, `-4` invalid parameter. Outputs must not overlap inputs unless
//! stated otherwise.
#![cfg_attr(not(test), no_std)]

pub mod fft;
pub mod sampling;
pub mod series;
pub mod window;

use kernel_core::arena::Temp;
use kernel_core::mem::{input, output, region};
use kernel_core::{Error, KResult, count_status, finite, status};

kernel_core::export_abi!();

fn nonzero(n: u32) -> KResult {
    if n == 0 {
        Err(Error::InvalidLength)
    } else {
        Ok(())
    }
}

/// In-place forward FFT (Cooley & Tukey 1965) of the complex signal `(re, im)` of
/// length `n`: `X_k = Σ_n x_n e^{−2πikn/N}`, unnormalised.
/// Status: `-1` if `n = 0`, `-2` if `n` is not a power of two (`n = 1` is valid).
#[unsafe(no_mangle)]
pub extern "C" fn fft(re: u32, im: u32, n: u32) -> i32 {
    status(transform(re, im, n, false))
}

/// In-place inverse FFT: `x_n = (1/N) Σ_k X_k e^{+2πikn/N}` (`ifft ∘ fft = id`).
#[unsafe(no_mangle)]
pub extern "C" fn ifft(re: u32, im: u32, n: u32) -> i32 {
    status(transform(re, im, n, true))
}

fn transform(re: u32, im: u32, n: u32, inverse: bool) -> KResult {
    nonzero(n)?;
    // SAFETY: `output` checks that `im` does not overlap the live `re` view.
    let (re, r_re) = unsafe { output::<f64>(re, n, &[])? };
    // SAFETY: as above.
    let (im, _) = unsafe { output::<f64>(im, n, &[r_re])? };
    fft::fft(re, im, inverse)
}

/// `out[k] = sqrt(re[k]² + im[k]²)` for `k = 0..n−1`.
#[unsafe(no_mangle)]
pub extern "C" fn magnitude(re: u32, im: u32, out: u32, n: u32) -> i32 {
    status((|| {
        nonzero(n)?;
        // SAFETY: inputs are shared views; `output` rejects overlap with them.
        let (re, r1) = unsafe { input::<f64>(re, n)? };
        // SAFETY: as above.
        let (im, r2) = unsafe { input::<f64>(im, n)? };
        // SAFETY: as above.
        let (out, _) = unsafe { output::<f64>(out, n, &[r1, r2])? };
        fft::magnitude(re, im, out);
        Ok(())
    })())
}

/// `out[k] = max(10·log10(|X_k|²/n²), floor_db)` (power relative to a full-scale
/// sinusoid; zero bins map to `floor_db`). `floor_db` must be finite (`-4` otherwise).
#[unsafe(no_mangle)]
pub extern "C" fn power_db(re: u32, im: u32, out: u32, n: u32, floor_db: f64) -> i32 {
    status((|| {
        nonzero(n)?;
        let floor_db = finite(floor_db)?;
        // SAFETY: inputs are shared views; `output` rejects overlap with them.
        let (re, r1) = unsafe { input::<f64>(re, n)? };
        // SAFETY: as above.
        let (im, r2) = unsafe { input::<f64>(im, n)? };
        // SAFETY: as above.
        let (out, _) = unsafe { output::<f64>(out, n, &[r1, r2])? };
        fft::power_db(re, im, out, floor_db);
        Ok(())
    })())
}

/// Symmetric window of length `n` (denominator `n−1`; `n = 1` gives `1.0`):
/// `kind` `0` rectangular, `1` Hann, `2` Hamming (0.54/0.46), `3` Blackman
/// (0.42/0.5/0.08), `4` Blackman–Harris 4-term (0.35875/0.48829/0.14128/0.01168).
/// Status: `-1` if `n = 0`, `-4` for an unknown kind.
#[unsafe(no_mangle)]
pub extern "C" fn window(kind: u32, out: u32, n: u32) -> i32 {
    status((|| {
        nonzero(n)?;
        // SAFETY: the only live view.
        let (out, _) = unsafe { output::<f64>(out, n, &[])? };
        window::window(kind, out)
    })())
}

/// Elementwise product `out[i] = a[i]·b[i]`. In-place use is supported when `out`
/// is exactly `a` and/or `b`; any other overlap is rejected with `-4`.
#[unsafe(no_mangle)]
pub extern "C" fn multiply(a: u32, b: u32, out: u32, n: u32) -> i32 {
    status((|| {
        nonzero(n)?;
        let (ra, rb, ro) = (
            region::<f64>(a, n)?,
            region::<f64>(b, n)?,
            region::<f64>(out, n)?,
        );
        if ro == ra && ro == rb {
            // SAFETY: the only live view.
            let (acc, _) = unsafe { output::<f64>(out, n, &[])? };
            window::square_assign(acc);
        } else if ro == ra || ro == rb {
            let other = if ro == ra { b } else { a };
            // SAFETY: shared view; `output` rejects overlap with it.
            let (other, r) = unsafe { input::<f64>(other, n)? };
            // SAFETY: as above.
            let (acc, _) = unsafe { output::<f64>(out, n, &[r])? };
            window::multiply_assign(acc, other);
        } else {
            // SAFETY: shared views; `output` rejects overlap with them.
            let (a, ra) = unsafe { input::<f64>(a, n)? };
            // SAFETY: as above.
            let (b, rb) = unsafe { input::<f64>(b, n)? };
            // SAFETY: as above.
            let (out, _) = unsafe { output::<f64>(out, n, &[ra, rb])? };
            window::multiply(a, b, out);
        }
        Ok(())
    })())
}

/// Partial Fourier sum over `x ∈ [0, 2π·cycles)` sampled at `n` points
/// (`x_j = 2π·cycles·j/n`): `kind` `0` square (first `harmonics` odd terms, 4/π Σ sin(kx)/k),
/// `1` sawtooth (2/π Σ_{k=1..H} (−1)^{k+1} sin(kx)/k), `2` triangle
/// (8/π² Σ_{k odd} (−1)^{(k−1)/2} sin(kx)/k²). `sigma = 1` applies the Lanczos factors
/// `sinc(k/(M+1))`, `M` = highest harmonic, which suppress the Gibbs overshoot.
/// `harmonics = 0` yields zeros. Status: `-1` if `n = 0`, `-4` for unknown kind,
/// `sigma > 1`, `harmonics > 65536` or non-finite `cycles`, `-3` if scratch space for
/// the coefficient table cannot be allocated.
#[unsafe(no_mangle)]
pub extern "C" fn fourier_series(
    kind: u32,
    harmonics: u32,
    sigma: u32,
    out: u32,
    n: u32,
    cycles: f64,
) -> i32 {
    status((|| {
        nonzero(n)?;
        let wave = series::Wave::from_id(kind)?;
        if sigma > 1 || harmonics > series::MAX_HARMONICS {
            return Err(Error::InvalidParameter);
        }
        let cycles = finite(cycles)?;
        // SAFETY: the only caller-supplied view; scratch lies above every live region.
        let (out, _) = unsafe { output::<f64>(out, n, &[])? };
        let temp = Temp::begin();
        let coeffs = temp.alloc::<f64>(harmonics as usize)?;
        series::coefficients(wave, sigma == 1, coeffs);
        series::evaluate(wave, coeffs, cycles, out);
        Ok(())
    })())
}

/// Additive synthesis `out[t] = Σ_{j<m} amps[j]·sin(2π·freqs[j]·t/sample_rate + phases[j])`
/// for `t = 0..n−1`. `m = 0` yields silence. Status: `-1` if `n = 0`; `-4` if
/// `sample_rate ≤ 0` or any parameter is not finite.
#[unsafe(no_mangle)]
pub extern "C" fn synth(
    freqs: u32,
    amps: u32,
    phases: u32,
    m: u32,
    sample_rate: f64,
    out: u32,
    n: u32,
) -> i32 {
    status((|| {
        nonzero(n)?;
        let sr = finite(sample_rate)?;
        if sr <= 0.0 {
            return Err(Error::InvalidParameter);
        }
        // SAFETY: inputs are shared views; `output` rejects overlap with them.
        let (freqs, r1) = unsafe { input::<f64>(freqs, m)? };
        // SAFETY: as above.
        let (amps, r2) = unsafe { input::<f64>(amps, m)? };
        // SAFETY: as above.
        let (phases, r3) = unsafe { input::<f64>(phases, m)? };
        if !freqs
            .iter()
            .chain(amps)
            .chain(phases)
            .all(|v| v.is_finite())
        {
            return Err(Error::InvalidParameter);
        }
        // SAFETY: as above.
        let (out, _) = unsafe { output::<f64>(out, n, &[r1, r2, r3])? };
        series::synth(freqs, amps, phases, sr, out);
        Ok(())
    })())
}

/// Samples `sin(2π·freq·t + phase)` at `t_k = k/fs` for all `t_k < duration`, writing
/// times to `out_t` and values to `out_x` (at most `max_n` each). Returns the number of
/// samples written (`0` when `duration ≤ 0`) or a negative status: `-1` if `max_n = 0`,
/// `-4` if `fs ≤ 0` or a parameter is not finite.
#[unsafe(no_mangle)]
pub extern "C" fn sample_sinusoid(
    freq: f64,
    phase: f64,
    fs: f64,
    duration: f64,
    out_t: u32,
    out_x: u32,
    max_n: u32,
) -> i32 {
    count_status((|| {
        nonzero(max_n)?;
        let (freq, phase, fs, duration) = (
            finite(freq)?,
            finite(phase)?,
            finite(fs)?,
            finite(duration)?,
        );
        if fs <= 0.0 {
            return Err(Error::InvalidParameter);
        }
        // SAFETY: `output` rejects overlap between the two outputs.
        let (t, rt) = unsafe { output::<f64>(out_t, max_n, &[])? };
        // SAFETY: as above.
        let (x, _) = unsafe { output::<f64>(out_x, max_n, &[rt])? };
        Ok(sampling::sample_sinusoid(freq, phase, fs, duration, t, x))
    })())
}

/// Whittaker–Shannon interpolation `x(t) = Σ_k samples[k]·sinc(fs·t − k)` evaluated at
/// `n_out` points uniformly spanning `[t0, t_end]` (inclusive). Status: `-1` if
/// `n_samples = 0` or `n_out = 0`; `-4` if `fs ≤ 0` or any value is not finite.
#[unsafe(no_mangle)]
pub extern "C" fn reconstruct_sinc(
    samples: u32,
    n_samples: u32,
    fs: f64,
    t0: f64,
    out: u32,
    n_out: u32,
    t_end: f64,
) -> i32 {
    status((|| {
        nonzero(n_samples)?;
        nonzero(n_out)?;
        let (fs, t0, t_end) = (finite(fs)?, finite(t0)?, finite(t_end)?);
        if fs <= 0.0 {
            return Err(Error::InvalidParameter);
        }
        // SAFETY: shared view; `output` rejects overlap with it.
        let (samples, r) = unsafe { input::<f64>(samples, n_samples)? };
        if !samples.iter().all(|v| v.is_finite()) {
            return Err(Error::InvalidParameter);
        }
        // SAFETY: as above.
        let (out, _) = unsafe { output::<f64>(out, n_out, &[r])? };
        sampling::reconstruct_sinc(samples, fs, t0, t_end, out);
        Ok(())
    })())
}

/// Folded (aliased) frequency `|f − fs·round(f/fs)| ∈ [0, fs/2]`; `NaN` unless
/// `fs > 0` and both arguments are finite.
#[unsafe(no_mangle)]
pub extern "C" fn alias_frequency(f: f64, fs: f64) -> f64 {
    sampling::alias_frequency(f, fs)
}

/// Normalised spectral entropy `−Σ p_k ln p_k / ln n` of `p_k = mag[k]²/Σ mag²`, in
/// `[0, 1]`; `0` for `n ≤ 1` or zero power; `NaN` for an invalid pointer or non-finite data.
#[unsafe(no_mangle)]
pub extern "C" fn spectral_entropy(mag: u32, n: u32) -> f64 {
    // SAFETY: the only live view.
    match unsafe { input::<f64>(mag, n) } {
        Ok((mag, _)) => fft::spectral_entropy(mag),
        Err(_) => f64::NAN,
    }
}
