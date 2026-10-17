//! The Lorenz (1963) system `ẋ = σ(y − x)`, `ẏ = x(ρ − z) − y`, `ż = xy − βz`,
//! integrated with the classical fourth-order Runge–Kutta method.

use kernel_core::{Error, KResult};

/// Parameters `(σ, ρ, β)` and the step `dt`.
#[derive(Clone, Copy, Debug)]
pub struct Params {
    /// Prandtl number σ.
    pub sigma: f64,
    /// Rayleigh number ρ.
    pub rho: f64,
    /// Geometric factor β.
    pub beta: f64,
    /// Time step.
    pub dt: f64,
}

fn field(p: &Params, [x, y, z]: [f64; 3]) -> [f64; 3] {
    [p.sigma * (y - x), x * (p.rho - z) - y, x * y - p.beta * z]
}

fn axpy(a: [f64; 3], k: f64, b: [f64; 3]) -> [f64; 3] {
    [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]]
}

/// One RK4 step.
#[must_use]
pub fn rk4(p: &Params, s: [f64; 3]) -> [f64; 3] {
    let h = p.dt;
    let k1 = field(p, s);
    let k2 = field(p, axpy(s, h / 2.0, k1));
    let k3 = field(p, axpy(s, h / 2.0, k2));
    let k4 = field(p, axpy(s, h, k3));
    core::array::from_fn(|i| s[i] + h / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]))
}

/// Writes `out.len() / 3` points as `f32` `x, y, z` triples; point 0 is the initial
/// state, point `i` the state after `i` steps.
///
/// If the trajectory stops being representable (non-finite in `f64` or `f32`), the
/// remaining points repeat the last valid one and [`Error::InvalidParameter`] is returned.
pub fn integrate(p: &Params, start: [f64; 3], out: &mut [f32]) -> KResult {
    let mut s = start;
    let mut last = [start[0] as f32, start[1] as f32, start[2] as f32];
    let mut diverged = false;
    for point in out.chunks_exact_mut(3) {
        if !diverged {
            let v = [s[0] as f32, s[1] as f32, s[2] as f32];
            if v.iter().all(|c| c.is_finite()) {
                last = v;
                s = rk4(p, s);
            } else {
                diverged = true;
            }
        }
        point.copy_from_slice(&last);
    }
    if diverged {
        Err(Error::InvalidParameter)
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CLASSIC: Params = Params {
        sigma: 10.0,
        rho: 28.0,
        beta: 8.0 / 3.0,
        dt: 0.01,
    };

    #[test]
    fn classic_attractor_is_bounded() {
        let mut out = vec![0.0_f32; 3 * 20_000];
        integrate(&CLASSIC, [1.0, 1.0, 1.0], &mut out).unwrap();
        assert_eq!(&out[..3], &[1.0, 1.0, 1.0]);
        for p in out.chunks_exact(3).skip(1000) {
            assert!(p[0].abs() < 30.0 && p[1].abs() < 30.0 && p[2] > 0.0 && p[2] < 60.0);
        }
    }

    #[test]
    fn rk4_matches_exact_decay() {
        // σ = 1, ρ = 0 from (1, 0, 0): y and z stay 0 (ẏ = −xz − y, ż = xy − βz), so the
        // system reduces to ẋ = −x with x(t) = e^{−t}; RK4's global error is O(h⁴).
        let p = Params {
            sigma: 1.0,
            rho: 0.0,
            beta: 1.0,
            dt: 0.1,
        };
        let mut s = [1.0, 0.0, 0.0];
        for _ in 0..10 {
            s = rk4(&p, s);
        }
        assert!((s[0] - (-1.0_f64).exp()).abs() < 1e-6);
    }

    #[test]
    fn divergence_is_reported() {
        let p = Params {
            sigma: 10.0,
            rho: 28.0,
            beta: 8.0 / 3.0,
            dt: 10.0,
        };
        let mut out = vec![0.0_f32; 3 * 100];
        assert_eq!(
            integrate(&p, [1.0, 1.0, 1.0], &mut out),
            Err(Error::InvalidParameter)
        );
        assert!(out.iter().all(|v| v.is_finite()));
    }
}
