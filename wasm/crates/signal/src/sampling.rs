//! Sampling and reconstruction: Nyquist–Shannon / Whittaker–Shannon (Whittaker 1915;
//! Shannon 1949) and aliasing.

use core::f64::consts::{PI, TAU};

/// Samples `x(t) = sin(2π·freq·t + phase)` at `t_k = k/fs` for every `k ≥ 0` with
/// `t_k < duration`, writing at most `out_t.len()` samples (`out_x` has the same length).
/// Returns the number of samples written.
pub fn sample_sinusoid(
    freq: f64,
    phase: f64,
    fs: f64,
    duration: f64,
    out_t: &mut [f64],
    out_x: &mut [f64],
) -> u32 {
    let mut count = 0_u32;
    for (k, (t_out, x_out)) in out_t.iter_mut().zip(out_x.iter_mut()).enumerate() {
        let t = k as f64 / fs;
        if t >= duration {
            break;
        }
        let turns = freq * t;
        *t_out = t;
        *x_out = libm::sin(TAU * (turns - libm::floor(turns)) + phase);
        count += 1;
    }
    count
}

/// Whittaker–Shannon interpolation `x(t) = Σ_k samples[k] · sinc(fs·t − k)` with the
/// normalised `sinc(u) = sin(πu)/(πu)`, evaluated at `N = out.len()` points uniformly
/// spanning `[t0, t_end]` (endpoints included; `N = 1` evaluates `t0` only).
///
/// Uses `sin(π(v − k)) = (−1)^{k+r}·sin(π(v − r))` with `r = round(v)`, so each output
/// point costs one `sin`, and is exact at the sample instants.
pub fn reconstruct_sinc(samples: &[f64], fs: f64, t0: f64, t_end: f64, out: &mut [f64]) {
    let n_out = out.len();
    let span = t_end - t0;
    let denom = if n_out > 1 { (n_out - 1) as f64 } else { 1.0 };
    for (i, o) in out.iter_mut().enumerate() {
        let t = t0 + span * (i as f64 / denom);
        let v = fs * t;
        let r = libm::round(v);
        let w = v - r; // |w| ≤ 1/2, exact
        let s = libm::sin(PI * w);
        if s == 0.0 {
            // Exactly on a sample instant: sinc(v − k) = δ_{k,r}.
            *o = if r >= 0.0 && r < samples.len() as f64 {
                samples[r as usize]
            } else {
                0.0
            };
            continue;
        }
        // Parity of r (saturating cast; beyond 2^53 every f64 is even anyway).
        let r_odd = (r as i64) & 1 == 1;
        let mut acc = 0.0;
        for (k, &x) in samples.iter().enumerate() {
            let d = (r - k as f64) + w; // v − k without cancellation near k ≈ v
            let odd = ((k & 1) == 1) != r_odd;
            let term = x * s / (PI * d);
            acc += if odd { -term } else { term };
        }
        *o = acc;
    }
}

/// Apparent (folded) frequency of a sinusoid of frequency `f` sampled at `fs`:
/// `|f − fs·round(f/fs)|`, in `[0, fs/2]`. Returns `NaN` unless `fs > 0` and both are finite.
#[must_use]
pub fn alias_frequency(f: f64, fs: f64) -> f64 {
    if !(f.is_finite() && fs.is_finite() && fs > 0.0) {
        return f64::NAN;
    }
    libm::fabs(f - fs * libm::round(f / fs))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aliasing_folds_into_nyquist_band() {
        assert_eq!(alias_frequency(7.0, 10.0), 3.0);
        assert_eq!(alias_frequency(3.0, 10.0), 3.0);
        assert_eq!(alias_frequency(10.0, 10.0), 0.0);
        assert_eq!(alias_frequency(-13.0, 10.0), 3.0);
        assert_eq!(alias_frequency(5.0, 10.0), 5.0);
        assert!(alias_frequency(1.0, 0.0).is_nan());
        assert!(alias_frequency(f64::NAN, 10.0).is_nan());
    }

    #[test]
    fn sampling_counts_and_values() {
        let mut t = [0.0; 32];
        let mut x = [0.0; 32];
        let n = sample_sinusoid(1.0, 0.0, 8.0, 1.0, &mut t, &mut x);
        assert_eq!(n, 8);
        assert_eq!(t[7], 7.0 / 8.0);
        assert!((x[2] - 1.0).abs() < 1e-15);
        assert_eq!(sample_sinusoid(1.0, 0.0, 8.0, 0.0, &mut t, &mut x), 0);
        assert_eq!(sample_sinusoid(1.0, 0.0, 8.0, 100.0, &mut t, &mut x), 32);
    }

    #[test]
    fn reconstruction_is_exact_at_sample_instants() {
        let samples = [0.5, -1.0, 2.0, 0.25, 0.0, 3.0];
        let mut out = [0.0; 6];
        reconstruct_sinc(&samples, 4.0, 0.0, 5.0 / 4.0, &mut out);
        assert_eq!(out, samples);
    }

    #[test]
    fn reconstruction_of_band_limited_signal() {
        let fs = 20.0;
        let f = 0.3 * fs;
        let n = 2000;
        let samples: Vec<f64> = (0..n).map(|k| (TAU * f * k as f64 / fs).sin()).collect();
        let mut out = vec![0.0; 501];
        // Interior: t in [40, 60] s, far from the edges at 0 and 100 s.
        reconstruct_sinc(&samples, fs, 40.0, 60.0, &mut out);
        let mut err2 = 0.0;
        for (i, v) in out.iter().enumerate() {
            let t = 40.0 + 20.0 * i as f64 / 500.0;
            err2 += (v - (TAU * f * t).sin()).powi(2);
        }
        let rms = (err2 / out.len() as f64).sqrt();
        assert!(rms < 1e-2, "rms {rms}");
    }
}
