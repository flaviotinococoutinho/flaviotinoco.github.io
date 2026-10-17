//! Curl-noise particle flow (Bridson, Hourihan & Nordenstam 2007) for the generative
//! hero animation.
//!
//! The velocity is the 2D curl of the stream function `ψ(x, y, t) = noise3(x·s, y·s, t)`:
//! `v = speed · (∂ψ/∂Y, −∂ψ/∂X)` with `(X, Y) = (x·s, y·s)` (derivatives in noise space,
//! so `speed` is in pixels per time unit independently of the scale `s`). A curl field is
//! divergence-free, so particles swirl without sinks or sources. Derivatives are central
//! differences with step `1e−4` in noise space.
//!
//! Particle layout (`f32`): `[x, y, age, life]`. Segment layout (`f32`):
//! `[x0, y0, x1, y1, alpha]` — the motion during the last step, with
//! `alpha = clamp(min(age, life − age) / (0.2·life), 0, 1)` (fade in and out).
//! A particle that leaves `[0, width) × [0, height)` or outlives its lifetime respawns
//! at a uniform random position with a fresh lifetime in `[2, 6)` time units, emitting
//! a degenerate, fully transparent segment for that step.

use crate::noise::{Key, noise3_keyed};
use crate::pcg::{FLOW_STREAM, Pcg32};

/// Largest accepted particle count.
pub const MAX_PARTICLES: u32 = 1 << 16;
/// `f32`s per particle: `x, y, age, life`.
pub const PARTICLE_STRIDE: usize = 4;
/// `f32`s per segment: `x0, y0, x1, y1, alpha`.
pub const SEGMENT_STRIDE: usize = 5;
/// Lifetime range in time units.
pub const LIFE_MIN: f64 = 2.0;
/// Upper end (exclusive) of the lifetime range.
pub const LIFE_MAX: f64 = 6.0;
/// Fraction of the lifetime spent fading in (and, symmetrically, out).
pub const FADE: f64 = 0.2;
/// Central-difference step in noise space.
pub const EPS: f64 = 1e-4;

/// Field configuration and generator state.
#[derive(Clone, Copy, Debug)]
pub struct Field {
    width: f64,
    height: f64,
    key: Key,
    rng: Pcg32,
}

/// Opacity of a particle of age `age` and lifetime `life`.
#[must_use]
pub fn alpha(age: f64, life: f64) -> f64 {
    let fade = FADE * life;
    // Both ramps are NaN together (NaN age or life), and `f64::min` would then pick
    // the other operand; the explicit comparisons below map NaN to 0 instead.
    let a = (age / fade).min((life - age) / fade);
    if a >= 1.0 {
        1.0
    } else if a > 0.0 {
        a
    } else {
        0.0
    }
}

/// Curl-noise velocity at pixel position `(x, y)` and time `t`.
#[must_use]
pub fn velocity(key: &Key, x: f64, y: f64, t: f64, scale: f64, speed: f64) -> (f64, f64) {
    let (nx, ny) = (x * scale, y * scale);
    let d_dy =
        (noise3_keyed(nx, ny + EPS, t, key) - noise3_keyed(nx, ny - EPS, t, key)) / (2.0 * EPS);
    let d_dx =
        (noise3_keyed(nx + EPS, ny, t, key) - noise3_keyed(nx - EPS, ny, t, key)) / (2.0 * EPS);
    (speed * d_dy, -speed * d_dx)
}

/// Largest `f32` strictly below `limit` (for keeping spawn positions inside the field).
fn below(limit: f64) -> f32 {
    let l = limit as f32;
    if f64::from(l) >= limit {
        l.next_down()
    } else {
        l
    }
}

impl Field {
    /// A field over `[0, width) × [0, height)`; both must be finite and positive.
    #[must_use]
    pub fn new(seed: u32, width: f64, height: f64) -> Self {
        Self {
            width,
            height,
            key: Key::new(seed),
            rng: Pcg32::new(u64::from(seed), FLOW_STREAM),
        }
    }

    /// Respawns `p` uniformly in the field; `age = u·life` when `stagger`, else `0`.
    fn spawn(&mut self, p: &mut [f32], stagger: bool) {
        let x = (self.rng.next_f64() * self.width) as f32;
        let y = (self.rng.next_f64() * self.height) as f32;
        let life = LIFE_MIN + self.rng.next_f64() * (LIFE_MAX - LIFE_MIN);
        let age = if stagger {
            self.rng.next_f64() * life
        } else {
            0.0
        };
        p[0] = x.min(below(self.width));
        p[1] = y.min(below(self.height));
        p[2] = age as f32;
        p[3] = life as f32;
    }

    /// Initialises every particle (staggered ages) and a transparent segment for each.
    pub fn init(&mut self, particles: &mut [f32], segments: &mut [f32]) {
        for (p, s) in particles
            .chunks_exact_mut(PARTICLE_STRIDE)
            .zip(segments.chunks_exact_mut(SEGMENT_STRIDE))
        {
            self.spawn(p, true);
            s.copy_from_slice(&[p[0], p[1], p[0], p[1], 0.0]);
        }
    }

    /// Advances every particle by `dt` (explicit Euler on the curl field at time `t`).
    pub fn step(
        &mut self,
        particles: &mut [f32],
        segments: &mut [f32],
        t: f64,
        dt: f64,
        scale: f64,
        speed: f64,
    ) {
        for (p, s) in particles
            .chunks_exact_mut(PARTICLE_STRIDE)
            .zip(segments.chunks_exact_mut(SEGMENT_STRIDE))
        {
            let (x, y) = (f64::from(p[0]), f64::from(p[1]));
            let (vx, vy) = velocity(&self.key, x, y, t, scale, speed);
            let nx = (x + vx * dt) as f32;
            let ny = (y + vy * dt) as f32;
            let age = f64::from(p[2]) + dt;
            let life = f64::from(p[3]);
            let inside = f64::from(nx) >= 0.0
                && f64::from(nx) < self.width
                && f64::from(ny) >= 0.0
                && f64::from(ny) < self.height;
            if inside && age < life {
                s.copy_from_slice(&[p[0], p[1], nx, ny, alpha(age, life) as f32]);
                p[0] = nx;
                p[1] = ny;
                p[2] = age as f32;
            } else {
                self.spawn(p, false);
                s.copy_from_slice(&[p[0], p[1], p[0], p[1], 0.0]);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(seed: u32, n: usize, steps: usize) -> (Vec<f32>, Vec<f32>) {
        let mut field = Field::new(seed, 640.0, 360.0);
        let mut p = vec![0.0; n * PARTICLE_STRIDE];
        let mut s = vec![0.0; n * SEGMENT_STRIDE];
        field.init(&mut p, &mut s);
        for k in 0..steps {
            field.step(&mut p, &mut s, k as f64 * 0.016, 1.0 / 60.0, 0.004, 40.0);
        }
        (p, s)
    }

    #[test]
    fn deterministic_for_a_seed() {
        assert_eq!(run(7, 200, 120), run(7, 200, 120));
        assert_ne!(run(7, 200, 120).1, run(8, 200, 120).1);
    }

    #[test]
    fn segments_stay_inside_and_are_finite() {
        let (p, s) = run(3, 500, 600);
        for seg in s.chunks_exact(SEGMENT_STRIDE) {
            assert!(seg.iter().all(|v| v.is_finite()));
            assert!((0.0..640.0).contains(&seg[0]) && (0.0..640.0).contains(&seg[2]));
            assert!((0.0..360.0).contains(&seg[1]) && (0.0..360.0).contains(&seg[3]));
            assert!((0.0..=1.0).contains(&seg[4]));
        }
        for q in p.chunks_exact(PARTICLE_STRIDE) {
            assert!(q[2] >= 0.0 && q[2] < q[3] && f64::from(q[3]) < LIFE_MAX);
        }
    }

    #[test]
    fn curl_field_is_divergence_free() {
        let key = Key::new(11);
        let h = 1e-3;
        for i in 0..50 {
            let (x, y) = (f64::from(i) * 13.7, f64::from(i) * 7.1);
            let div = (velocity(&key, x + h, y, 0.3, 0.01, 1.0).0
                - velocity(&key, x - h, y, 0.3, 0.01, 1.0).0)
                / (2.0 * h)
                + (velocity(&key, x, y + h, 0.3, 0.01, 1.0).1
                    - velocity(&key, x, y - h, 0.3, 0.01, 1.0).1)
                    / (2.0 * h);
            assert!(div.abs() < 1e-3, "div {div}");
        }
    }

    #[test]
    fn alpha_fades_in_and_out() {
        assert_eq!(alpha(0.0, 5.0), 0.0);
        assert_eq!(alpha(2.5, 5.0), 1.0);
        assert!((alpha(0.5, 5.0) - 0.5).abs() < 1e-12);
        assert_eq!(alpha(5.0, 5.0), 0.0);
        assert_eq!(alpha(f64::NAN, 5.0), 0.0);
    }

    #[test]
    fn spawn_stays_strictly_inside() {
        assert!(below(640.0) < 640.0);
        assert!(f64::from(below(0.1)) < 0.1);
    }
}
