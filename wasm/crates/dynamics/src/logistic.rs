//! The logistic map `x_{k+1} = r·x_k·(1 − x_k)` (May 1976; Feigenbaum 1978).

/// Floor applied to `|f'(x)|` before taking the logarithm, so superstable points
/// (`x = 1/2`) contribute `ln(1e−300) ≈ −690.8` instead of `−∞`.
pub const DERIVATIVE_FLOOR: f64 = 1e-300;

/// Initial condition used by the bifurcation image and the Lyapunov curve: the critical
/// point `x = 1/2`, whose orbit is attracted by every stable cycle (Singer 1978).
pub const CRITICAL_POINT: f64 = 0.5;

/// Whether `(r, x0)` keeps the orbit in `[0, 1]`: `r ∈ [0, 4]`, `x0 ∈ [0, 1]`.
#[must_use]
pub fn valid(r: f64, x0: f64) -> bool {
    (0.0..=4.0).contains(&r) && (0.0..=1.0).contains(&x0)
}

#[inline]
fn step(r: f64, x: f64) -> f64 {
    // Clamping guards against rounding pushing x a hair outside [0, 1].
    (r * x * (1.0 - x)).clamp(0.0, 1.0)
}

/// Orbit `out[0] = x0`, `out[k+1] = r·out[k]·(1 − out[k])`.
pub fn orbit(r: f64, x0: f64, out: &mut [f64]) {
    let mut x = x0;
    for o in out.iter_mut() {
        *o = x;
        x = step(r, x);
    }
}

/// Lyapunov exponent `λ = (1/n) Σ_{k=T}^{T+n−1} ln max(|r(1 − 2x_k)|, 1e−300)` after
/// discarding `T = transient` iterates. `NaN` for `n = 0`.
#[must_use]
pub fn lyapunov(r: f64, x0: f64, transient: u32, n: u32) -> f64 {
    if n == 0 {
        return f64::NAN;
    }
    let mut x = x0;
    for _ in 0..transient {
        x = step(r, x);
    }
    let mut sum = 0.0;
    for _ in 0..n {
        let d = libm::fabs(r * (1.0 - 2.0 * x));
        sum += libm::log(d.max(DERIVATIVE_FLOOR));
        x = step(r, x);
    }
    sum / f64::from(n)
}

/// `r` at the centre of column `i` of `count` columns spanning `[r_min, r_max]`.
#[must_use]
pub fn column_r(r_min: f64, r_max: f64, i: u32, count: u32) -> f64 {
    r_min + (r_max - r_min) * ((f64::from(i) + 0.5) / f64::from(count))
}

/// Density image of the attractor: for each column `c` (`r` at the pixel centre), iterate
/// from the critical point, discard `transient` iterates, then add each of the next
/// `iterations` iterates to row `⌊(1 − x)·height⌋` (row 0 is `x = 1`). `out` is
/// `width × height` row-major and is overwritten. Returns the maximum count.
pub fn bifurcation(
    r_min: f64,
    r_max: f64,
    width: u32,
    height: u32,
    transient: u32,
    iterations: u32,
    out: &mut [u32],
) -> u32 {
    out.fill(0);
    let (w, h) = (width as usize, height as usize);
    let hf = f64::from(height);
    let mut max = 0;
    for c in 0..width {
        let r = column_r(r_min, r_max, c, width);
        let mut x = CRITICAL_POINT;
        for _ in 0..transient {
            x = step(r, x);
        }
        for _ in 0..iterations {
            x = step(r, x);
            // x ∈ [0, 1] ⇒ row ∈ [0, height]; x = 0 lands on the last row.
            let row = ((1.0 - x) * hf) as usize;
            let idx = row.min(h - 1) * w + c as usize;
            out[idx] += 1;
            max = max.max(out[idx]);
        }
    }
    max
}

/// Lyapunov exponent for each of `out.len()` columns spanning `[r_min, r_max]` (pixel
/// centres, aligned with [`bifurcation`]), starting from the critical point.
pub fn lyapunov_curve(r_min: f64, r_max: f64, transient: u32, n: u32, out: &mut [f64]) {
    let count = out.len() as u32;
    for (i, o) in out.iter_mut().enumerate() {
        *o = lyapunov(
            column_r(r_min, r_max, i as u32, count),
            CRITICAL_POINT,
            transient,
            n,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::f64::consts::LN_2;

    #[test]
    fn fixed_point_attracts_for_r_2_8() {
        let mut out = vec![0.0; 2000];
        orbit(2.8, 0.2, &mut out);
        assert_eq!(out[0], 0.2);
        assert!((out[1999] - (1.0 - 1.0 / 2.8)).abs() < 1e-12);
    }

    #[test]
    fn lyapunov_signs_and_full_chaos() {
        assert!((lyapunov(4.0, 0.3, 1000, 1_000_000) - LN_2).abs() < 0.01);
        assert!(lyapunov(3.2, 0.3, 1000, 10_000) < 0.0);
        assert!(lyapunov(3.9, 0.3, 1000, 100_000) > 0.0);
        assert!(lyapunov(3.9, 0.3, 0, 0).is_nan());
        // Analytic value at the stable fixed point: λ = ln|2 − r|.
        assert!((lyapunov(2.8, 0.3, 5000, 1000) - (0.8_f64).ln()).abs() < 1e-9);
    }

    #[test]
    fn bifurcation_counts_every_iterate() {
        let (w, h) = (64, 32);
        let mut img = vec![0_u32; w * h];
        let max = bifurcation(2.5, 4.0, w as u32, h as u32, 100, 200, &mut img);
        assert!(max > 0);
        assert_eq!(img.iter().map(|&c| u64::from(c)).sum::<u64>(), 64 * 200);
        // r ≈ 2.51 (column 0): a fixed point, so all 200 iterates share one pixel.
        let col0: Vec<u32> = (0..h).map(|row| img[row * w]).collect();
        assert_eq!(col0.iter().filter(|&&c| c > 0).count(), 1);
        assert_eq!(max, 200);
    }

    #[test]
    fn curve_is_aligned_with_pixel_centres() {
        let mut out = vec![0.0; 4];
        lyapunov_curve(0.0, 4.0, 10, 10, &mut out);
        assert!((out[0] - lyapunov(0.5, CRITICAL_POINT, 10, 10)).abs() < 1e-15);
        assert!((out[3] - lyapunov(3.5, CRITICAL_POINT, 10, 10)).abs() < 1e-15);
    }
}
