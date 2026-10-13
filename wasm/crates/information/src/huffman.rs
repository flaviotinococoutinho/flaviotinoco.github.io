//! Optimal prefix codes (Huffman 1952) via the two-queue construction
//! (van Leeuwen 1976), with deterministic, minimum-variance tie-breaking.

/// Largest accepted alphabet size.
pub const MAX_SYMBOLS: usize = 4096;

/// Scratch space for [`huffman_lengths`]; each slice needs at least the stated length
/// for an alphabet of `k` symbols.
pub struct Scratch<'a> {
    /// `k` sort keys.
    pub keys: &'a mut [u64],
    /// `k` internal-node weights.
    pub weights: &'a mut [u64],
    /// `2k` parent links (reused for depths).
    pub links: &'a mut [u32],
}

/// In-place heapsort (small code, no allocation, `O(n log n)`); keys are unique here,
/// so the order is fully determined.
fn heapsort(v: &mut [u64]) {
    fn sift_down(v: &mut [u64], mut root: usize, end: usize) {
        loop {
            let mut child = 2 * root + 1;
            if child >= end {
                return;
            }
            if child + 1 < end && v[child + 1] > v[child] {
                child += 1;
            }
            if v[root] >= v[child] {
                return;
            }
            v.swap(root, child);
            root = child;
        }
    }
    let n = v.len();
    for start in (0..n / 2).rev() {
        sift_down(v, start, n);
    }
    for end in (1..n).rev() {
        v.swap(0, end);
        sift_down(v, 0, end);
    }
}

/// Optimal prefix-code lengths for `counts` (`k = counts.len() ≤ 4096`), written to
/// `lengths` (`0` for unused symbols; a single used symbol gets length `1`). Returns the
/// expected code length `L = Σ c_i l_i / Σ c_i` in bits/symbol (`0` if no symbol is used).
///
/// Ties are broken deterministically: leaves are ordered by `(count, symbol index)` and,
/// between equal-weight leaf and internal nodes, the leaf is merged first — the
/// minimum-variance Huffman code (Schwartz 1964).
///
/// Returns `None` if `k > 4096`, the slices are too short, or `lengths.len() != k`.
#[must_use]
pub fn huffman_lengths(counts: &[u32], lengths: &mut [u32], s: Scratch<'_>) -> Option<f64> {
    let k = counts.len();
    if k > MAX_SYMBOLS
        || lengths.len() != k
        || s.keys.len() < k
        || s.weights.len() < k
        || s.links.len() < 2 * k
    {
        return None;
    }
    lengths.fill(0);

    // Leaves: used symbols sorted by (count, index).
    let mut m = 0;
    let mut total = 0_u64;
    for (i, &c) in counts.iter().enumerate() {
        if c > 0 {
            s.keys[m] = (u64::from(c) << 32) | i as u64;
            m += 1;
            total += u64::from(c);
        }
    }
    match m {
        0 => return Some(0.0),
        1 => {
            lengths[(s.keys[0] & 0xFFFF_FFFF) as usize] = 1;
            return Some(1.0);
        }
        _ => {}
    }
    let keys = &mut s.keys[..m];
    heapsort(keys);

    // Nodes 0..m are leaves (sorted), m..2m−1 internal nodes in creation order.
    let leaf_weight = |i: usize| keys[i] >> 32;
    let links = &mut s.links[..2 * m - 1];
    let weights = &mut s.weights[..m - 1];
    let (mut next_leaf, mut next_internal) = (0, 0);
    for created in 0..m - 1 {
        let mut pick = || {
            let take_leaf = next_leaf < m
                && (next_internal == created || leaf_weight(next_leaf) <= weights[next_internal]);
            if take_leaf {
                next_leaf += 1;
                (next_leaf - 1, leaf_weight(next_leaf - 1))
            } else {
                next_internal += 1;
                (m + next_internal - 1, weights[next_internal - 1])
            }
        };
        let (a, wa) = pick();
        let (b, wb) = pick();
        let node = (m + created) as u32;
        links[a] = node;
        links[b] = node;
        weights[created] = wa + wb;
    }

    // Depths: parents always have larger indices, so walk downwards from the root and
    // overwrite each parent link with the node's depth.
    let root = 2 * m - 2;
    links[root] = 0;
    for node in (0..root).rev() {
        let parent = links[node] as usize;
        links[node] = links[parent] + 1;
    }

    let mut weighted = 0_u64;
    for (leaf, &key) in keys.iter().enumerate() {
        let depth = links[leaf];
        lengths[(key & 0xFFFF_FFFF) as usize] = depth;
        weighted += (key >> 32) * u64::from(depth);
    }
    Some(weighted as f64 / total as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(counts: &[u32]) -> (Vec<u32>, f64) {
        let k = counts.len();
        let (mut keys, mut weights, mut links) = (vec![0; k], vec![0; k], vec![0; 2 * k]);
        let mut lengths = vec![0; k];
        let l = huffman_lengths(
            counts,
            &mut lengths,
            Scratch {
                keys: &mut keys,
                weights: &mut weights,
                links: &mut links,
            },
        )
        .unwrap();
        (lengths, l)
    }

    fn kraft(lengths: &[u32]) -> f64 {
        lengths
            .iter()
            .filter(|&&l| l > 0)
            .map(|&l| 2f64.powi(-(l as i32)))
            .sum()
    }

    #[test]
    fn clrs_example() {
        // CLRS §16.3: a..f = 45, 13, 12, 16, 9, 5 → 224/100 bits/symbol.
        let (lengths, l) = run(&[45, 13, 12, 16, 9, 5]);
        assert_eq!(lengths, vec![1, 3, 3, 3, 4, 4]);
        assert!((l - 2.24).abs() < 1e-12);
        assert_eq!(kraft(&lengths), 1.0);
    }

    #[test]
    fn degenerate_alphabets() {
        assert_eq!(run(&[]), (vec![], 0.0));
        assert_eq!(run(&[0, 0, 0]), (vec![0, 0, 0], 0.0));
        assert_eq!(run(&[0, 9, 0]), (vec![0, 1, 0], 1.0));
        assert_eq!(run(&[3, 0, 3]), (vec![1, 0, 1], 1.0));
    }

    #[test]
    fn minimum_variance_tie_breaking() {
        // Equal weights: the balanced (minimum-variance) code has all lengths 2.
        let (lengths, l) = run(&[1, 1, 1, 1]);
        assert_eq!(lengths, vec![2, 2, 2, 2]);
        assert_eq!(l, 2.0);
        // Classic example where tie-breaking matters: {.4,.2,.2,.1,.1}.
        let (lengths, l) = run(&[4, 2, 2, 1, 1]);
        assert_eq!(lengths, vec![2, 2, 2, 3, 3]);
        assert!((l - 2.2).abs() < 1e-12);
    }

    #[test]
    fn source_coding_theorem_bounds() {
        let mut state = 12_345_u32;
        for trial in 0..50 {
            let k = 2 + trial * 7;
            let counts: Vec<u32> = (0..k)
                .map(|_| {
                    state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                    state >> 20
                })
                .collect();
            let (lengths, l) = run(&counts);
            let total: f64 = counts.iter().map(|&c| f64::from(c)).sum();
            let h: f64 = counts
                .iter()
                .filter(|&&c| c > 0)
                .map(|&c| {
                    let p = f64::from(c) / total;
                    -p * p.log2()
                })
                .sum();
            assert!(h <= l + 1e-12 && l < h + 1.0, "H={h} L={l}");
            if counts.iter().filter(|&&c| c > 0).count() >= 2 {
                assert!((kraft(&lengths) - 1.0).abs() < 1e-12);
            }
        }
    }

    #[test]
    fn rejects_oversized_alphabets() {
        let counts = vec![1; MAX_SYMBOLS + 1];
        let (mut keys, mut weights, mut links) = (vec![0; 5000], vec![0; 5000], vec![0; 10000]);
        let mut lengths = vec![0; MAX_SYMBOLS + 1];
        let s = Scratch {
            keys: &mut keys,
            weights: &mut weights,
            links: &mut links,
        };
        assert!(huffman_lengths(&counts, &mut lengths, s).is_none());
    }
}
