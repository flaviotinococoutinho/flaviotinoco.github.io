//! 3D simplex noise (Perlin 2001), following Gustavson's reference implementation
//! ("Simplex noise demystified", 2005) with two documented changes:
//!
//! 1. **Kernel radius** `r² = 0.5` instead of the original `0.6`. With `0.6` a
//!    vertex outside the current simplex can still be inside its kernel but is never
//!    summed, which makes the field discontinuous across simplex faces (jumps of up to
//!    ~5·10⁻³ on Gustavson's ×32 output scale along random test lines); with `0.5` the
//!    largest increment per 10⁻⁵ step is ~3·10⁻⁵, i.e. the field is continuous.
//! 2. **Normalisation** by the exact worst-case amplitude for `r² = 0.5`: the maximum of
//!    `Σ_c (0.5 − |d_c|²)⁴ · max_g (g·d_c)` over positions and all 12 gradient choices is
//!    `0.013007157182859354` (numerical maximisation), so the output covers `[−1, 1]`
//!    (the reference permutation attains that bound) and is clamped for rounding only.
//!
//! Seeding: with `h = lowbias32(seed)` split into bytes `s0..s3`, lattice point `(i,j,k)`
//! gets gradient `(P[((i ^ s0) + P[((j ^ s1) + P[(k ^ s2)]])] ^ s3) mod 12` (indices mod
//! 256, `P` = Perlin's permutation). `lowbias32(0) = 0`, so seed `0` is exactly the
//! reference hash.

/// Ken Perlin's reference permutation of `0..=255`.
const PERM: [u8; 256] = [
    151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69,
    142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219,
    203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
    74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230,
    220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76,
    132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173,
    186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206,
    59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163,
    70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
    178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162,
    241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204,
    176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141,
    128, 195, 78, 66, 215, 61, 156, 180,
];

/// The 12 edge midpoints of the cube (Gustavson's `grad3`).
const GRAD3: [[f64; 3]; 12] = [
    [1.0, 1.0, 0.0],
    [-1.0, 1.0, 0.0],
    [1.0, -1.0, 0.0],
    [-1.0, -1.0, 0.0],
    [1.0, 0.0, 1.0],
    [-1.0, 0.0, 1.0],
    [1.0, 0.0, -1.0],
    [-1.0, 0.0, -1.0],
    [0.0, 1.0, 1.0],
    [0.0, -1.0, 1.0],
    [0.0, 1.0, -1.0],
    [0.0, -1.0, -1.0],
];

/// Skewing factor `(√(n+1) − 1)/n` for `n = 3`.
const F3: f64 = 1.0 / 3.0;
/// Unskewing factor `(1 − 1/√(n+1))/n` for `n = 3`.
const G3: f64 = 1.0 / 6.0;
/// Squared kernel radius (see module docs).
pub const RADIUS2: f64 = 0.5;
/// Worst-case raw amplitude for `RADIUS2 = 0.5` (see module docs).
pub const PEAK: f64 = 0.013_007_157_182_859_354;

/// Chris Wellons' `lowbias32` integer hash (a bijection with `lowbias32(0) = 0`).
#[must_use]
pub const fn lowbias32(mut x: u32) -> u32 {
    x ^= x >> 16;
    x = x.wrapping_mul(0x7feb_352d);
    x ^= x >> 15;
    x = x.wrapping_mul(0x846c_a68b);
    x ^= x >> 16;
    x
}

/// Precomputed seed bytes, so repeated evaluations skip the hash.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Key([usize; 4]);

impl Key {
    /// Derives the lattice hash key of `seed`.
    #[must_use]
    pub const fn new(seed: u32) -> Self {
        let b = lowbias32(seed).to_le_bytes();
        Self([b[0] as usize, b[1] as usize, b[2] as usize, b[3] as usize])
    }
}

#[inline]
fn perm(i: usize) -> usize {
    PERM[i & 255] as usize
}

#[inline]
fn gradient(key: &Key, i: usize, j: usize, k: usize) -> &'static [f64; 3] {
    let [s0, s1, s2, s3] = key.0;
    let h = perm(((i & 255) ^ s0) + perm(((j & 255) ^ s1) + perm((k & 255) ^ s2)));
    &GRAD3[(h ^ s3) % 12]
}

#[inline]
fn corner(g: &[f64; 3], x: f64, y: f64, z: f64) -> f64 {
    let t = RADIUS2 - x * x - y * y - z * z;
    if t > 0.0 {
        let t2 = t * t;
        t2 * t2 * (g[0] * x + g[1] * y + g[2] * z)
    } else {
        0.0
    }
}

/// Lattice cell index `⌊v⌋ mod 2^64`, as an unsigned value whose low byte is `⌊v⌋ mod 256`.
#[inline]
fn cell(v: f64) -> (f64, usize) {
    let f = libm::floor(v);
    // Saturating cast; two's complement keeps `& 255` equal to the floored value mod 256.
    (f, (f as i64) as usize)
}

/// Simplex noise at `(x, y, z)` with a precomputed [`Key`]; in `[−1, 1]`.
#[must_use]
pub fn noise3_keyed(x: f64, y: f64, z: f64, key: &Key) -> f64 {
    // Skew to find the simplex cell.
    let s = (x + y + z) * F3;
    let (fi, i) = cell(x + s);
    let (fj, j) = cell(y + s);
    let (fk, k) = cell(z + s);
    let t = (fi + fj + fk) * G3;
    let (x0, y0, z0) = (x - (fi - t), y - (fj - t), z - (fk - t));

    // Which of the six tetrahedra: offsets of the second and third corners.
    let (i1, j1, k1, i2, j2, k2) = if x0 >= y0 {
        if y0 >= z0 {
            (1, 0, 0, 1, 1, 0)
        } else if x0 >= z0 {
            (1, 0, 0, 1, 0, 1)
        } else {
            (0, 0, 1, 1, 0, 1)
        }
    } else if y0 < z0 {
        (0, 0, 1, 0, 1, 1)
    } else if x0 < z0 {
        (0, 1, 0, 0, 1, 1)
    } else {
        (0, 1, 0, 1, 1, 0)
    };

    let (x1, y1, z1) = (
        x0 - i1 as f64 + G3,
        y0 - j1 as f64 + G3,
        z0 - k1 as f64 + G3,
    );
    let (x2, y2, z2) = (
        x0 - i2 as f64 + 2.0 * G3,
        y0 - j2 as f64 + 2.0 * G3,
        z0 - k2 as f64 + 2.0 * G3,
    );
    let (x3, y3, z3) = (
        x0 - 1.0 + 3.0 * G3,
        y0 - 1.0 + 3.0 * G3,
        z0 - 1.0 + 3.0 * G3,
    );

    let n = corner(gradient(key, i, j, k), x0, y0, z0)
        + corner(
            gradient(
                key,
                i.wrapping_add(i1),
                j.wrapping_add(j1),
                k.wrapping_add(k1),
            ),
            x1,
            y1,
            z1,
        )
        + corner(
            gradient(
                key,
                i.wrapping_add(i2),
                j.wrapping_add(j2),
                k.wrapping_add(k2),
            ),
            x2,
            y2,
            z2,
        )
        + corner(
            gradient(key, i.wrapping_add(1), j.wrapping_add(1), k.wrapping_add(1)),
            x3,
            y3,
            z3,
        );
    (n / PEAK).clamp(-1.0, 1.0)
}

/// Simplex noise at `(x, y, z)` for `seed`; in `[−1, 1]`, `NaN` for non-finite input.
#[must_use]
pub fn noise3(x: f64, y: f64, z: f64, seed: u32) -> f64 {
    if !(x.is_finite() && y.is_finite() && z.is_finite()) {
        return f64::NAN;
    }
    noise3_keyed(x, y, z, &Key::new(seed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn permutation_is_a_permutation() {
        let mut seen = [false; 256];
        for &p in &PERM {
            assert!(!seen[p as usize]);
            seen[p as usize] = true;
        }
    }

    #[test]
    fn lowbias32_fixes_zero_and_mixes() {
        assert_eq!(lowbias32(0), 0);
        assert_ne!(lowbias32(1), 1);
        assert_eq!(Key::new(0), Key([0; 4]));
    }

    #[test]
    fn zero_at_lattice_points_bounded_and_deterministic() {
        // Integer points with i + j + k ≡ 0 (mod 3) are vertices of the skewed lattice.
        assert_eq!(noise3(0.0, 0.0, 0.0, 0), 0.0);
        assert_eq!(noise3(3.0, -2.0, 8.0, 9), 0.0);
        assert_eq!(noise3(-5.0, 1.0, 1.0, u32::MAX), 0.0);
        let mut max = 0.0_f64;
        for i in 0..20_000 {
            let f = f64::from(i);
            let (x, y, z) = (
                (f * 0.731).sin() * 40.0,
                (f * 0.377).cos() * 40.0,
                f * 0.013,
            );
            let v = noise3(x, y, z, 1234);
            assert!((-1.0..=1.0).contains(&v));
            assert_eq!(v, noise3(x, y, z, 1234));
            max = max.max(v.abs());
        }
        assert!(max > 0.5, "the field should use most of its range ({max})");
        assert!(noise3(f64::NAN, 0.0, 0.0, 0).is_nan());
    }

    #[test]
    fn seeds_change_the_field() {
        let a: Vec<f64> = (0..64)
            .map(|i| noise3(f64::from(i) * 0.37, 0.5, 0.25, 1))
            .collect();
        let b: Vec<f64> = (0..64)
            .map(|i| noise3(f64::from(i) * 0.37, 0.5, 0.25, 2))
            .collect();
        assert_ne!(a, b);
    }

    #[test]
    fn continuous_across_simplex_faces() {
        // Walk a long line in tiny steps: with r² = 0.5 every increment stays below the
        // Lipschitz bound (no jumps at simplex boundaries).
        let h = 1e-5;
        let mut prev = noise3(0.1, 0.2, 0.3, 0);
        let mut worst = 0.0_f64;
        for s in 1..400_000 {
            let t = f64::from(s) * h;
            let v = noise3(0.1 + 0.7 * t, 0.2 + 0.5 * t, 0.3 + 0.3 * t, 0);
            worst = worst.max((v - prev).abs());
            prev = v;
        }
        assert!(worst < 10.0 * h, "max increment {worst}");
    }
}
