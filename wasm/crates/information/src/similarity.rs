//! Information-content–based semantic similarity: intrinsic IC (Seco, Veale & Hayes
//! 2004) and Lin's similarity (Lin 1998).

/// Intrinsic information content of a concept with `hyponyms` descendants in a taxonomy
/// of `total` concepts: `IC(c) = 1 − ln(hypo(c) + 1) / ln(total)` ∈ `[0, 1]`
/// (root → 0, leaf → 1). Requires `total ≥ 2` and `hyponyms < total`.
#[must_use]
pub fn intrinsic_ic(hyponyms: u32, total: u32) -> f64 {
    let ratio = libm::log(f64::from(hyponyms) + 1.0) / libm::log(f64::from(total));
    (1.0 - ratio).clamp(0.0, 1.0)
}

/// Whether `(hyponyms, total)` is a valid input for [`intrinsic_ic`].
#[must_use]
pub const fn valid_ic_input(hyponyms: u32, total: u32) -> bool {
    total >= 2 && hyponyms < total
}

/// Lin's similarity `sim(a, b) = 2·IC(lcs) / (IC(a) + IC(b))`, clamped to `[0, 1]`.
/// When `IC(a) + IC(b) = 0`: `1` if all three ICs are `0` (identical root concepts),
/// otherwise `0`. Any `NaN` argument yields `NaN`.
#[must_use]
pub fn lin_similarity(ic_lcs: f64, ic_a: f64, ic_b: f64) -> f64 {
    if ic_lcs.is_nan() || ic_a.is_nan() || ic_b.is_nan() {
        return f64::NAN;
    }
    let denom = ic_a + ic_b;
    if denom == 0.0 {
        return if ic_a == 0.0 && ic_b == 0.0 && ic_lcs == 0.0 {
            1.0
        } else {
            0.0
        };
    }
    let sim = 2.0 * ic_lcs / denom;
    if sim.is_nan() {
        0.0
    } else {
        sim.clamp(0.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_and_leaf() {
        assert_eq!(intrinsic_ic(99, 100), 0.0);
        assert_eq!(intrinsic_ic(0, 100), 1.0);
        let mid = intrinsic_ic(9, 100);
        assert!((mid - 0.5).abs() < 1e-12);
        assert!(valid_ic_input(0, 2) && !valid_ic_input(2, 2) && !valid_ic_input(0, 1));
    }

    #[test]
    fn lin_cases() {
        assert_eq!(lin_similarity(0.0, 0.0, 0.0), 1.0);
        assert_eq!(lin_similarity(0.5, 0.5, 0.5), 1.0);
        assert!((lin_similarity(0.3, 0.6, 0.9) - 0.4).abs() < 1e-12);
        assert_eq!(lin_similarity(0.0, 0.7, 0.9), 0.0);
        assert!(lin_similarity(f64::NAN, 0.5, 0.5).is_nan());
        assert_eq!(lin_similarity(0.5, f64::INFINITY, 0.1), 0.0);
    }
}
