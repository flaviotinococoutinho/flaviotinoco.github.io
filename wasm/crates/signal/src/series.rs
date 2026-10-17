//! Fourier partial sums (Gibbs phenomenon, Lanczos σ-factors) and additive synthesis.

use core::f64::consts::{PI, TAU};

use kernel_core::{Error, KResult};

/// Largest accepted number of harmonics `H`.
pub const MAX_HARMONICS: u32 = 1 << 16;

/// Re-seed the sine recurrence with exact values every this many terms.
const RESEED: usize = 32;

/// Waveform ids (ABI): `0` square, `1` sawtooth, `2` triangle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Wave {
    /// `4/π Σ_{k odd} sin(kx)/k` — the first `H` odd harmonics.
    Square,
    /// `2/π Σ_{k=1..H} (−1)^{k+1} sin(kx)/k`.
    Sawtooth,
    /// `8/π² Σ_{k odd} (−1)^{(k−1)/2} sin(kx)/k²` — the first `H` odd harmonics.
    Triangle,
}

impl Wave {
    /// Parses the ABI id.
    pub fn from_id(id: u32) -> KResult<Self> {
        match id {
            0 => Ok(Self::Square),
            1 => Ok(Self::Sawtooth),
            2 => Ok(Self::Triangle),
            _ => Err(Error::InvalidParameter),
        }
    }

    /// Harmonic index of the `i`-th term (`i = 0..H`) and the spacing between terms.
    const fn harmonic(self, i: usize) -> usize {
        match self {
            Self::Sawtooth => i + 1,
            Self::Square | Self::Triangle => 2 * i + 1,
        }
    }

    const fn spacing(self) -> usize {
        match self {
            Self::Sawtooth => 1,
            Self::Square | Self::Triangle => 2,
        }
    }
}

/// Lanczos σ-factor `sinc(k/(M+1)) = sin(πk/(M+1)) / (πk/(M+1))`.
#[must_use]
pub fn lanczos_sigma(k: usize, highest: usize) -> f64 {
    let u = PI * k as f64 / (highest + 1) as f64;
    if u == 0.0 { 1.0 } else { libm::sin(u) / u }
}

/// Writes the `H = coeffs.len()` sine coefficients `b_k` of the partial sum, multiplied
/// by the Lanczos σ-factors when `sigma` is set (`M` = highest harmonic index).
pub fn coefficients(wave: Wave, sigma: bool, coeffs: &mut [f64]) {
    let h = coeffs.len();
    if h == 0 {
        return;
    }
    let highest = wave.harmonic(h - 1);
    for (i, c) in coeffs.iter_mut().enumerate() {
        let k = wave.harmonic(i);
        let kf = k as f64;
        let alternating = if i % 2 == 0 { 1.0 } else { -1.0 };
        let b = match wave {
            Wave::Square => 4.0 / (PI * kf),
            Wave::Sawtooth => alternating * 2.0 / (PI * kf),
            Wave::Triangle => alternating * 8.0 / (PI * PI * kf * kf),
        };
        *c = if sigma {
            b * lanczos_sigma(k, highest)
        } else {
            b
        };
    }
}

/// Evaluates `Σ_i coeffs[i] · sin(k_i x)` at `x_j = 2π·cycles·j/N`, `j = 0..N−1`
/// (`N = out.len()`), where `k_i` are the harmonics of `wave`.
///
/// `sin(kx)` is advanced with the Chebyshev recurrence
/// `sin((k+d)x) = 2cos(dx)·sin(kx) − sin((k−d)x)` and re-seeded with exact values every
/// 32 terms, which bounds the accumulated rounding error.
pub fn evaluate(wave: Wave, coeffs: &[f64], cycles: f64, out: &mut [f64]) {
    let n = out.len() as f64;
    let d = wave.spacing();
    for (j, o) in out.iter_mut().enumerate() {
        // Reduce the phase to [0, 2π) first: the series is 2π-periodic.
        let turns = cycles * j as f64 / n;
        let x = TAU * (turns - libm::floor(turns));
        let two_cos_dx = 2.0 * libm::cos(d as f64 * x);
        let mut acc = 0.0;
        let (mut prev, mut cur) = (0.0, 0.0);
        for (i, &c) in coeffs.iter().enumerate() {
            if i % RESEED == 0 {
                let k = wave.harmonic(i) as f64;
                cur = libm::sin(k * x);
                prev = libm::sin((k - d as f64) * x);
            } else {
                let next = two_cos_dx * cur - prev;
                prev = cur;
                cur = next;
            }
            acc += c * cur;
        }
        *o = acc;
    }
}

/// Additive synthesis: `out[t] = Σ_j amps[j] · sin(2π·freqs[j]·t/sample_rate + phases[j])`
/// for `t = 0..out.len()−1`. Phases are reduced modulo one cycle before `sin`, so long
/// buffers keep full precision.
pub fn synth(freqs: &[f64], amps: &[f64], phases: &[f64], sample_rate: f64, out: &mut [f64]) {
    out.fill(0.0);
    for ((&f, &a), &phi) in freqs.iter().zip(amps).zip(phases) {
        let cycles_per_sample = f / sample_rate;
        for (t, o) in out.iter_mut().enumerate() {
            let turns = cycles_per_sample * t as f64;
            *o += a * libm::sin(TAU * (turns - libm::floor(turns)) + phi);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn partial_sum(wave: Wave, h: usize, sigma: bool, n: usize) -> Vec<f64> {
        let mut c = vec![0.0; h];
        coefficients(wave, sigma, &mut c);
        let mut out = vec![0.0; n];
        evaluate(wave, &c, 1.0, &mut out);
        out
    }

    fn direct(wave: Wave, h: usize, x: f64) -> f64 {
        let mut c = vec![0.0; h];
        coefficients(wave, false, &mut c);
        c.iter()
            .enumerate()
            .map(|(i, b)| b * (wave.harmonic(i) as f64 * x).sin())
            .sum()
    }

    #[test]
    fn recurrence_matches_direct_summation() {
        for wave in [Wave::Square, Wave::Sawtooth, Wave::Triangle] {
            let n = 64;
            let h = 300;
            let out = partial_sum(wave, h, false, n);
            for (j, v) in out.iter().enumerate() {
                let x = TAU * j as f64 / n as f64;
                assert!((v - direct(wave, h, x)).abs() < 1e-11, "{wave:?} j={j}");
            }
        }
    }

    #[test]
    fn converges_to_the_waveforms() {
        let n = 8;
        // x = π/2 (j = 2 of 8): square → 1, triangle → 1, sawtooth → x/π = 0.5
        let sq = partial_sum(Wave::Square, 4000, false, n);
        let tri = partial_sum(Wave::Triangle, 2000, false, n);
        let saw = partial_sum(Wave::Sawtooth, 4000, false, n);
        assert!((sq[2] - 1.0).abs() < 1e-3);
        assert!((tri[2] - 1.0).abs() < 1e-3);
        assert!((saw[2] - 0.5).abs() < 1e-3);
    }

    #[test]
    fn gibbs_overshoot_and_sigma_suppression() {
        let n = 1 << 14;
        let raw = partial_sum(Wave::Square, 200, false, n);
        let smooth = partial_sum(Wave::Square, 200, true, n);
        let max_raw = raw.iter().copied().fold(f64::MIN, f64::max);
        let max_smooth = smooth.iter().copied().fold(f64::MIN, f64::max);
        // Gibbs: (2/π)·Si(π) = 1.178979744...
        assert!((max_raw - 1.178_979_744).abs() < 2e-3, "{max_raw}");
        // Lanczos σ-factors: the peak tends to max_u (G(u+π) − G(u−π))/π² = 1.023740...
        // with G(s) = s·Si(s) + cos s (a running mean of the Gibbs profile), i.e. the
        // overshoot drops from 8.95 % to 1.19 % of the jump.
        assert!((max_smooth - 1.023_740).abs() < 2e-3, "{max_smooth}");
    }

    #[test]
    fn zero_harmonics_is_silence() {
        let out = partial_sum(Wave::Square, 0, true, 16);
        assert!(out.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn synth_matches_closed_form() {
        let mut out = vec![0.0; 100];
        synth(&[5.0, 12.5], &[1.0, 0.25], &[0.0, 1.0], 100.0, &mut out);
        for (t, v) in out.iter().enumerate() {
            let tt = t as f64 / 100.0;
            let want = (TAU * 5.0 * tt).sin() + 0.25 * (TAU * 12.5 * tt + 1.0).sin();
            assert!((v - want).abs() < 1e-12);
        }
    }
}
