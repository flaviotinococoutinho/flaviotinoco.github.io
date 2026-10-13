//! Discrete Fourier transform (Cooley & Tukey 1965) and spectral measures.

use core::f64::consts::TAU;

use kernel_core::{Error, KResult};

/// In-place iterative radix-2 Cooley–Tukey FFT (decimation in time).
///
/// Forward (`inverse = false`): `X_k = Σ_n x_n e^{-2πikn/N}` (unnormalised).
/// Inverse (`inverse = true`): `x_n = (1/N) Σ_k X_k e^{+2πikn/N}`.
///
/// Errors: [`Error::InvalidLength`] when `N = 0` or `re`/`im` lengths differ,
/// [`Error::NotPowerOfTwo`] when `N` is not a power of two. `N = 1` is the identity.
pub fn fft(re: &mut [f64], im: &mut [f64], inverse: bool) -> KResult {
    let n = re.len();
    if n == 0 || im.len() != n {
        return Err(Error::InvalidLength);
    }
    if !n.is_power_of_two() {
        return Err(Error::NotPowerOfTwo);
    }
    if n == 1 {
        return Ok(());
    }

    // Bit-reversal permutation.
    let shift = usize::BITS - n.trailing_zeros();
    for i in 0..n {
        let j = i.reverse_bits() >> shift;
        if j > i {
            re.swap(i, j);
            im.swap(i, j);
        }
    }

    // Butterflies. Twiddles are evaluated directly (N − 1 sincos calls in total) rather
    // than by recurrence, which keeps the error at O(ε log N).
    let sign = if inverse { 1.0 } else { -1.0 };
    let mut len = 2;
    while len <= n {
        let half = len / 2;
        let step = sign * TAU / len as f64;
        for k in 0..half {
            let (s, c) = libm::sincos(step * k as f64);
            let mut a = k;
            while a < n {
                let b = a + half;
                let tr = re[b] * c - im[b] * s;
                let ti = re[b] * s + im[b] * c;
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                a += len;
            }
        }
        len <<= 1;
    }

    if inverse {
        let scale = 1.0 / n as f64;
        re.iter_mut().for_each(|v| *v *= scale);
        im.iter_mut().for_each(|v| *v *= scale);
    }
    Ok(())
}

/// `out[k] = sqrt(re[k]² + im[k]²)`.
pub fn magnitude(re: &[f64], im: &[f64], out: &mut [f64]) {
    for ((o, &r), &i) in out.iter_mut().zip(re).zip(im) {
        *o = libm::sqrt(r * r + i * i);
    }
}

/// Power spectrum in decibels relative to a full-scale sinusoid of the transform length:
/// `out[k] = max(10·log10(|X_k|² / N²), floor_db)` with `N = out.len()`.
///
/// Zero (and NaN) bins map to `floor_db`.
pub fn power_db(re: &[f64], im: &[f64], out: &mut [f64], floor_db: f64) {
    let n = out.len() as f64;
    let norm = 1.0 / (n * n);
    for ((o, &r), &i) in out.iter_mut().zip(re).zip(im) {
        let db = 10.0 * libm::log10((r * r + i * i) * norm);
        *o = if db > floor_db { db } else { floor_db };
    }
}

/// Normalised spectral (Shannon) entropy of a magnitude spectrum:
/// `H = −Σ p_k ln p_k / ln N` with `p_k = |X_k|² / Σ_j |X_j|²`, in `[0, 1]`.
///
/// Returns `0` for `N ≤ 1` or zero total power, `NaN` if any magnitude is not finite.
/// Magnitudes are rescaled by their maximum first, so huge values cannot overflow.
#[must_use]
pub fn spectral_entropy(mag: &[f64]) -> f64 {
    let n = mag.len();
    let mut max = 0.0_f64;
    for &m in mag {
        if !m.is_finite() {
            return f64::NAN;
        }
        max = max.max(libm::fabs(m));
    }
    if n <= 1 || max == 0.0 {
        return 0.0;
    }
    let inv = 1.0 / max;
    let total: f64 = mag.iter().map(|&m| (m * inv) * (m * inv)).sum();
    let mut h = 0.0;
    for &m in mag {
        let p = (m * inv) * (m * inv) / total;
        if p > 0.0 {
            h -= p * libm::log(p);
        }
    }
    (h / libm::log(n as f64)).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn naive_dft(re: &[f64], im: &[f64]) -> (Vec<f64>, Vec<f64>) {
        let n = re.len();
        let mut out_re = vec![0.0; n];
        let mut out_im = vec![0.0; n];
        for k in 0..n {
            for t in 0..n {
                let a = -TAU * ((k * t) % n) as f64 / n as f64;
                let (s, c) = (a.sin(), a.cos());
                out_re[k] += re[t] * c - im[t] * s;
                out_im[k] += re[t] * s + im[t] * c;
            }
        }
        (out_re, out_im)
    }

    fn signal(n: usize) -> (Vec<f64>, Vec<f64>) {
        let re = (0..n)
            .map(|i| ((i * 7919) % 101) as f64 / 50.0 - 1.0)
            .collect();
        let im = (0..n)
            .map(|i| ((i * 104_729) % 97) as f64 / 48.0 - 1.0)
            .collect();
        (re, im)
    }

    #[test]
    fn matches_naive_dft() {
        for n in [1, 2, 4, 8, 64, 256] {
            let (re0, im0) = signal(n);
            let (want_re, want_im) = naive_dft(&re0, &im0);
            let (mut re, mut im) = (re0.clone(), im0.clone());
            fft(&mut re, &mut im, false).unwrap();
            for k in 0..n {
                assert!((re[k] - want_re[k]).abs() < 1e-10 * n as f64, "n={n} k={k}");
                assert!((im[k] - want_im[k]).abs() < 1e-10 * n as f64, "n={n} k={k}");
            }
        }
    }

    #[test]
    fn inverse_round_trips_and_parseval_holds() {
        let n = 1024;
        let (re0, im0) = signal(n);
        let (mut re, mut im) = (re0.clone(), im0.clone());
        fft(&mut re, &mut im, false).unwrap();
        let energy_t: f64 = re0.iter().zip(&im0).map(|(a, b)| a * a + b * b).sum();
        let energy_f: f64 = re.iter().zip(&im).map(|(a, b)| a * a + b * b).sum::<f64>() / n as f64;
        assert!((energy_t - energy_f).abs() < 1e-9 * energy_t);
        fft(&mut re, &mut im, true).unwrap();
        for i in 0..n {
            assert!((re[i] - re0[i]).abs() < 1e-12 && (im[i] - im0[i]).abs() < 1e-12);
        }
    }

    #[test]
    fn rejects_bad_lengths() {
        let mut a = vec![0.0; 12];
        let mut b = vec![0.0; 12];
        assert_eq!(fft(&mut a, &mut b, false), Err(Error::NotPowerOfTwo));
        assert_eq!(fft(&mut [], &mut [], false), Err(Error::InvalidLength));
        assert_eq!(
            fft(&mut [0.0; 4], &mut [0.0; 2], false),
            Err(Error::InvalidLength)
        );
    }

    #[test]
    fn power_db_is_zero_for_full_scale_and_clamped() {
        // A unit impulse in bin 0 of size N=4 → |X|² / N² = 16/16 → 0 dB.
        let mut out = [0.0; 4];
        power_db(&[4.0, 0.0, 2.0, 0.0], &[0.0; 4], &mut out, -100.0);
        assert!((out[0]).abs() < 1e-12);
        assert_eq!(out[1], -100.0);
        assert!((out[2] - 10.0 * (0.25_f64).log10()).abs() < 1e-12);
    }

    #[test]
    fn spectral_entropy_bounds() {
        assert_eq!(spectral_entropy(&[]), 0.0);
        assert_eq!(spectral_entropy(&[3.0]), 0.0);
        assert_eq!(spectral_entropy(&[0.0; 8]), 0.0);
        assert_eq!(spectral_entropy(&[1.0, 0.0, 0.0, 0.0]), 0.0);
        assert!((spectral_entropy(&[2.0; 16]) - 1.0).abs() < 1e-12);
        assert!((spectral_entropy(&[1e300; 16]) - 1.0).abs() < 1e-12);
        assert!(spectral_entropy(&[1.0, f64::NAN]).is_nan());
    }
}
