//! Shannon entropy (Shannon 1948), divergences (Kullback & Leibler 1951; Lin 1991),
//! channel capacities and mutual information. All quantities are in bits.

/// Byte histogram: `counts[b]` = occurrences of byte value `b` (the slice is overwritten).
pub fn histogram(data: &[u8], counts: &mut [u32; 256]) {
    counts.fill(0);
    for &b in data {
        counts[b as usize] += 1;
    }
}

/// `−p·log2 p` for `p = c/total`, with `0·log 0 = 0`.
fn plogp(c: f64, total: f64) -> f64 {
    if c > 0.0 {
        let p = c / total;
        -p * libm::log2(p)
    } else {
        0.0
    }
}

/// Shannon entropy `H = −Σ (c_i/N) log2(c_i/N)` of a count vector, `N = Σ c_i`.
/// Returns `0` for an empty vector or `N = 0`.
#[must_use]
pub fn entropy_counts(counts: &[u32]) -> f64 {
    let total: u64 = counts.iter().map(|&c| u64::from(c)).sum();
    if total == 0 {
        return 0.0;
    }
    let total = total as f64;
    let h: f64 = counts.iter().map(|&c| plogp(f64::from(c), total)).sum();
    h.max(0.0)
}

/// Order-0 entropy of a byte string in bits/symbol (`0` for empty input).
#[must_use]
pub fn entropy_bytes(data: &[u8]) -> f64 {
    let mut counts = [0_u32; 256];
    histogram(data, &mut counts);
    entropy_counts(&counts)
}

/// Conditional entropy `H(X_n | X_{n−1}) = −Σ_{a,b} p(a,b) log2 p(b|a)` estimated from the
/// `len − 1` overlapping bigrams of `data` (`p(a)` is the marginal of the first symbol of
/// each bigram). `table` is a 256×256 scratch array (overwritten). `0` if `len < 2`.
#[must_use]
pub fn conditional_entropy(data: &[u8], table: &mut [u32]) -> f64 {
    if data.len() < 2 || table.len() < 1 << 16 {
        return 0.0;
    }
    let table = &mut table[..1 << 16];
    table.fill(0);
    for pair in data.windows(2) {
        table[(usize::from(pair[0]) << 8) | usize::from(pair[1])] += 1;
    }
    let total = (data.len() - 1) as f64;
    let mut h = 0.0;
    for row in table.chunks_exact(256) {
        let row_total: u64 = row.iter().map(|&c| u64::from(c)).sum();
        if row_total == 0 {
            continue;
        }
        let row_total = row_total as f64;
        for &c in row {
            if c > 0 {
                let c = f64::from(c);
                // −p(a,b)·log2 p(b|a); every term is ≥ 0.
                h -= (c / total) * libm::log2(c / row_total);
            }
        }
    }
    h.max(0.0)
}

/// Binary entropy `H2(p) = −p log2 p − (1−p) log2(1−p)`; `p` is clamped to `[0, 1]`,
/// `H2(0) = H2(1) = 0`, and a `NaN` argument yields `NaN`.
#[must_use]
pub fn binary_entropy(p: f64) -> f64 {
    if p.is_nan() {
        return f64::NAN;
    }
    let p = p.clamp(0.0, 1.0);
    if p == 0.0 || p == 1.0 {
        return 0.0;
    }
    (-p * libm::log2(p) - (1.0 - p) * libm::log2(1.0 - p)).clamp(0.0, 1.0)
}

/// Capacity of the binary symmetric channel with crossover `p`: `C = 1 − H2(p)` bits/use.
#[must_use]
pub fn bsc_capacity(p: f64) -> f64 {
    1.0 - binary_entropy(p)
}

/// Capacity of the binary erasure channel with erasure probability `e` (clamped to
/// `[0, 1]`): `C = 1 − e` bits/use. `NaN` yields `NaN`.
#[must_use]
pub fn bec_capacity(e: f64) -> f64 {
    if e.is_nan() {
        f64::NAN
    } else {
        1.0 - e.clamp(0.0, 1.0)
    }
}

/// Sum of a non-negative, finite vector, or `None` if any entry is invalid.
fn mass(v: &[f64]) -> Option<f64> {
    let mut s = 0.0;
    for &x in v {
        if !(x.is_finite() && x >= 0.0) {
            return None;
        }
        s += x;
    }
    s.is_finite().then_some(s)
}

/// Kullback–Leibler divergence `D(P‖Q) = Σ P_i log2(P_i/Q_i)` in bits, where `P`, `Q`
/// are `p`, `q` normalised to unit sum. `+∞` when some `P_i > 0` has `Q_i = 0`; `0` for
/// empty input; `NaN` if the lengths differ, an entry is negative or not finite, or a
/// vector has zero mass. Clamped at `0` to absorb rounding.
#[must_use]
pub fn kl_divergence(p: &[f64], q: &[f64]) -> f64 {
    if p.len() != q.len() {
        return f64::NAN;
    }
    if p.is_empty() {
        return 0.0;
    }
    let (Some(sp), Some(sq)) = (mass(p), mass(q)) else {
        return f64::NAN;
    };
    if sp == 0.0 || sq == 0.0 {
        return f64::NAN;
    }
    let mut d = 0.0;
    for (&pi, &qi) in p.iter().zip(q) {
        if pi == 0.0 {
            continue;
        }
        if qi == 0.0 {
            return f64::INFINITY;
        }
        let (pi, qi) = (pi / sp, qi / sq);
        // A subnormal entry can round to 0 when normalised: its term is 0·log 0 = 0.
        if pi > 0.0 {
            d += pi * (libm::log2(pi) - libm::log2(qi));
        }
    }
    d.max(0.0)
}

/// Jensen–Shannon divergence `JS = ½D(P‖M) + ½D(Q‖M)`, `M = (P+Q)/2`, in bits and in
/// `[0, 1]`. Same input rules and degenerate values as [`kl_divergence`] (never `+∞`).
#[must_use]
pub fn js_divergence(p: &[f64], q: &[f64]) -> f64 {
    if p.len() != q.len() {
        return f64::NAN;
    }
    if p.is_empty() {
        return 0.0;
    }
    let (Some(sp), Some(sq)) = (mass(p), mass(q)) else {
        return f64::NAN;
    };
    if sp == 0.0 || sq == 0.0 {
        return f64::NAN;
    }
    let mut js = 0.0;
    for (&pi, &qi) in p.iter().zip(q) {
        let (pi, qi) = (pi / sp, qi / sq);
        let m = 0.5 * (pi + qi);
        if pi > 0.0 {
            js += 0.5 * pi * (libm::log2(pi) - libm::log2(m));
        }
        if qi > 0.0 {
            js += 0.5 * qi * (libm::log2(qi) - libm::log2(m));
        }
    }
    js.clamp(0.0, 1.0)
}

/// Mutual information `I(X;Y) = Σ p(x,y) log2(p(x,y)/(p(x)p(y)))` in bits from a
/// row-major `rows × cols` joint count/probability matrix (normalised internally).
/// `col_sums` is scratch of length `cols`. Returns `0` for an empty or all-zero matrix,
/// `NaN` for negative/non-finite entries or inconsistent sizes. Clamped at `0`.
#[must_use]
pub fn mutual_information(joint: &[f64], rows: usize, cols: usize, col_sums: &mut [f64]) -> f64 {
    if rows.checked_mul(cols) != Some(joint.len()) || col_sums.len() != cols {
        return f64::NAN;
    }
    let Some(total) = mass(joint) else {
        return f64::NAN;
    };
    if total == 0.0 {
        return 0.0;
    }
    col_sums.fill(0.0);
    for row in joint.chunks_exact(cols) {
        for (c, &v) in col_sums.iter_mut().zip(row) {
            *c += v;
        }
    }
    let log_total = libm::log2(total);
    let mut mi = 0.0;
    for row in joint.chunks_exact(cols) {
        let row_sum: f64 = row.iter().sum();
        if row_sum == 0.0 {
            continue;
        }
        let log_row = libm::log2(row_sum);
        for (&v, &c) in row.iter().zip(col_sums.iter()) {
            if v > 0.0 {
                mi += (v / total) * (libm::log2(v) + log_total - log_row - libm::log2(c));
            }
        }
    }
    mi.max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entropy_of_uniform_and_constant_bytes() {
        let all: Vec<u8> = (0..=255).collect();
        assert!((entropy_bytes(&all) - 8.0).abs() < 1e-12);
        assert_eq!(entropy_bytes(&[7; 100]), 0.0);
        assert_eq!(entropy_bytes(&[]), 0.0);
        assert_eq!(entropy_counts(&[]), 0.0);
        assert_eq!(entropy_counts(&[0, 0]), 0.0);
        assert!((entropy_counts(&[1, 1, 1, 1]) - 2.0).abs() < 1e-15);
    }

    #[test]
    fn conditional_entropy_of_structured_sequences() {
        let mut table = vec![0_u32; 1 << 16];
        // Deterministic successor → H(X_n | X_{n−1}) = 0, while H(X) = 2 bits.
        let cyclic: Vec<u8> = (0..400).map(|i| (i % 4) as u8).collect();
        assert!(conditional_entropy(&cyclic, &mut table).abs() < 1e-12);
        // Markov chain x' = x + 1 + coin (mod 4): two equiprobable successors → 1 bit.
        let mut state = 0x9e37_79b9_u32;
        let mut x = 0_u8;
        let data: Vec<u8> = (0..20_000)
            .map(|_| {
                state ^= state << 13;
                state ^= state >> 17;
                state ^= state << 5;
                x = (x + 1 + (state >> 31) as u8) % 4;
                x
            })
            .collect();
        let h = conditional_entropy(&data, &mut table);
        assert!((h - 1.0).abs() < 0.01, "{h}");
        assert_eq!(conditional_entropy(&[1], &mut table), 0.0);
    }

    #[test]
    fn binary_entropy_and_capacities() {
        assert_eq!(binary_entropy(0.5), 1.0);
        assert_eq!(binary_entropy(0.0), 0.0);
        assert_eq!(binary_entropy(1.0), 0.0);
        assert_eq!(binary_entropy(-3.0), 0.0);
        assert!(binary_entropy(f64::NAN).is_nan());
        assert!((bsc_capacity(0.11) - 0.5).abs() < 1e-3);
        assert_eq!(bec_capacity(0.25), 0.75);
        assert_eq!(bec_capacity(2.0), 0.0);
    }

    #[test]
    fn divergences() {
        let p = [0.1, 0.4, 0.5];
        let q = [0.8, 0.15, 0.05];
        assert_eq!(kl_divergence(&p, &p), 0.0);
        assert!(kl_divergence(&p, &q) > 0.0);
        assert_eq!(kl_divergence(&[1.0, 0.0], &[0.0, 1.0]), f64::INFINITY);
        assert_eq!(js_divergence(&[1.0, 0.0], &[0.0, 1.0]), 1.0);
        assert_eq!(js_divergence(&p, &p), 0.0);
        // Normalisation: scaled vectors give the same divergence.
        assert!((kl_divergence(&[2.0, 8.0, 10.0], &q) - kl_divergence(&p, &q)).abs() < 1e-12);
        assert!(kl_divergence(&[-1.0, 2.0], &[0.5, 0.5]).is_nan());
        assert!(kl_divergence(&[0.0, 0.0], &[0.5, 0.5]).is_nan());
        assert_eq!(kl_divergence(&[], &[]), 0.0);
    }

    #[test]
    fn mutual_information_extremes() {
        let mut scratch = vec![0.0; 4];
        let mut identity = vec![0.0; 16];
        for i in 0..4 {
            identity[i * 5] = 1.0;
        }
        assert_eq!(mutual_information(&identity, 4, 4, &mut scratch), 2.0);
        let a = [0.1, 0.2, 0.3, 0.4];
        let b = [0.25, 0.5, 0.125, 0.125];
        let indep: Vec<f64> = a
            .iter()
            .flat_map(|x| b.iter().map(move |y| x * y))
            .collect();
        assert!(mutual_information(&indep, 4, 4, &mut scratch) < 1e-12);
        assert_eq!(mutual_information(&[0.0; 16], 4, 4, &mut scratch), 0.0);
    }
}
