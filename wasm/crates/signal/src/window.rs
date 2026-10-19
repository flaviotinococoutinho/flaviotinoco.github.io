//! Window functions (Harris 1978) and elementwise products.

use core::f64::consts::TAU;

use kernel_core::{Error, KResult};

/// Window kind ids (ABI): `0` rectangular, `1` Hann, `2` Hamming, `3` Blackman,
/// `4` 4-term Blackman–Harris.
pub const WINDOW_KINDS: u32 = 5;

/// Cosine-sum coefficients `[a0, a1, a2, a3]` of `w = a0 − a1 cos x + a2 cos 2x − a3 cos 3x`.
fn coefficients(kind: u32) -> KResult<[f64; 4]> {
    Ok(match kind {
        0 => [1.0, 0.0, 0.0, 0.0],
        1 => [0.5, 0.5, 0.0, 0.0],
        2 => [0.54, 0.46, 0.0, 0.0],
        3 => [0.42, 0.5, 0.08, 0.0],
        4 => [0.358_75, 0.488_29, 0.141_28, 0.011_68],
        _ => return Err(Error::InvalidParameter),
    })
}

/// Symmetric window of length `N = out.len()`:
/// `w[k] = a0 − a1 cos(2πk/(N−1)) + a2 cos(4πk/(N−1)) − a3 cos(6πk/(N−1))`, `k = 0..N−1`;
/// `N = 1` gives `[1.0]`. The second half mirrors the first, so `w[k] == w[N−1−k]` exactly.
///
/// Errors: [`Error::InvalidLength`] for `N = 0`, [`Error::InvalidParameter`] for an unknown kind.
pub fn window(kind: u32, out: &mut [f64]) -> KResult {
    let [a0, a1, a2, a3] = coefficients(kind)?;
    let n = out.len();
    if n == 0 {
        return Err(Error::InvalidLength);
    }
    if n == 1 {
        out[0] = 1.0;
        return Ok(());
    }
    let denom = (n - 1) as f64;
    for k in 0..n.div_ceil(2) {
        let x = TAU * k as f64 / denom;
        // Grouping the positive and negative terms makes Blackman's endpoints exactly 0.
        let w = (a0 + a2 * libm::cos(2.0 * x)) - (a1 * libm::cos(x) + a3 * libm::cos(3.0 * x));
        out[k] = w;
        out[n - 1 - k] = w;
    }
    Ok(())
}

/// `out[i] = a[i] · b[i]`.
pub fn multiply(a: &[f64], b: &[f64], out: &mut [f64]) {
    for ((o, &x), &y) in out.iter_mut().zip(a).zip(b) {
        *o = x * y;
    }
}

/// In-place variant: `acc[i] *= b[i]`.
pub fn multiply_assign(acc: &mut [f64], b: &[f64]) {
    for (o, &y) in acc.iter_mut().zip(b) {
        *o *= y;
    }
}

/// In-place square: `acc[i] *= acc[i]`.
pub fn square_assign(acc: &mut [f64]) {
    for o in acc.iter_mut() {
        *o *= *o;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hann_endpoints_midpoint_and_symmetry() {
        let mut w = vec![0.0; 65];
        window(1, &mut w).unwrap();
        assert_eq!(w[0], 0.0);
        assert_eq!(w[64], 0.0);
        assert_eq!(w[32], 1.0);
        for k in 0..65 {
            assert_eq!(w[k], w[64 - k]);
        }
    }

    #[test]
    fn known_endpoint_values() {
        let mut w = vec![0.0; 16];
        for (kind, endpoint) in [(0, 1.0), (2, 0.08), (3, 0.0), (4, 0.000_06)] {
            window(kind, &mut w).unwrap();
            assert!((w[0] - endpoint).abs() < 1e-15, "kind {kind}: {}", w[0]);
            assert_eq!(w[0], w[15]);
        }
    }

    #[test]
    fn degenerate_lengths_and_kinds() {
        let mut one = [0.0];
        window(3, &mut one).unwrap();
        assert_eq!(one[0], 1.0);
        assert_eq!(window(1, &mut []), Err(Error::InvalidLength));
        assert_eq!(window(5, &mut [0.0; 4]), Err(Error::InvalidParameter));
    }

    #[test]
    fn products() {
        let mut out = [0.0; 3];
        multiply(&[1.0, 2.0, 3.0], &[4.0, 5.0, 6.0], &mut out);
        assert_eq!(out, [4.0, 10.0, 18.0]);
        multiply_assign(&mut out, &[0.5, 0.1, 0.0]);
        assert_eq!(out, [2.0, 1.0, 0.0]);
        square_assign(&mut out);
        assert_eq!(out, [4.0, 1.0, 0.0]);
    }
}
