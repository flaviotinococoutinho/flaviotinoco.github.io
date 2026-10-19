//! Central limit theorem sampler (Laplace 1810; Lindeberg 1922): standardised sums of
//! i.i.d. `U(0, 1)` variables (the Irwin–Hall distribution).

use crate::pcg::Pcg32;

/// Half-width of the histogram range `[−4, 4)` in standard deviations.
pub const Z_RANGE: f64 = 4.0;

/// For each of `samples` draws, sums `terms` uniforms `U ∈ [0, 1)`, standardises
/// `z = (S − terms/2) / sqrt(terms/12)` and counts it in one of `out.len()` equal bins
/// over `[−4, 4)` (draws outside are dropped). `out` is overwritten. `terms ≥ 1`.
pub fn histogram(rng: &mut Pcg32, terms: u32, samples: u32, out: &mut [u32]) {
    out.fill(0);
    let bins = out.len();
    if bins == 0 || terms == 0 {
        return;
    }
    let mean = f64::from(terms) / 2.0;
    let inv_sd = 1.0 / libm::sqrt(f64::from(terms) / 12.0);
    let scale = bins as f64 / (2.0 * Z_RANGE);
    for _ in 0..samples {
        let mut s = 0.0;
        for _ in 0..terms {
            s += rng.next_f64();
        }
        let z = (s - mean) * inv_sd;
        let pos = (z + Z_RANGE) * scale;
        if pos >= 0.0 {
            let bin = pos as usize;
            if bin < bins {
                out[bin] += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pcg::CLT_STREAM;

    #[test]
    fn twelve_uniforms_look_gaussian() {
        let mut rng = Pcg32::new(2024, CLT_STREAM);
        let mut bins = vec![0_u32; 80];
        histogram(&mut rng, 12, 200_000, &mut bins);
        let total: u32 = bins.iter().sum();
        let within_one: u32 = bins[30..50].iter().sum();
        let frac = f64::from(within_one) / f64::from(total);
        assert!((frac - 0.6827).abs() < 0.01, "{frac}");
        let weighted: f64 = bins
            .iter()
            .enumerate()
            .map(|(i, &c)| ((i as f64 + 0.5) * 0.1 - 4.0) * f64::from(c))
            .sum();
        let mean = weighted / f64::from(total);
        assert!(mean.abs() < 0.01);
    }

    #[test]
    fn one_term_is_uniform_on_plus_minus_sqrt3() {
        let mut rng = Pcg32::new(7, CLT_STREAM);
        let mut bins = vec![0_u32; 8];
        histogram(&mut rng, 1, 10_000, &mut bins);
        // z = (U − 1/2)·√12 ∈ [−1.732, 1.732): only the middle 4 unit-wide bins are hit.
        assert_eq!(bins[0] + bins[1] + bins[6] + bins[7], 0);
        assert_eq!(bins.iter().sum::<u32>(), 10_000);
    }
}
