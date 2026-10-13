//! `information.wasm` — information-theory kernels (ABI v1).
//!
//! Every export is a thin wrapper that validates pointers and parameters (see
//! [`kernel_core::mem`]) and calls a plain function from [`entropy`], [`huffman`] or
//! [`similarity`]. All quantities are in bits. `f64`-returning functions return `NaN`
//! for invalid pointers/parameters and the documented value for empty input.
#![cfg_attr(not(test), no_std)]

pub mod entropy;
pub mod huffman;
pub mod similarity;

use kernel_core::arena::Temp;
use kernel_core::mem::{input, output};
use kernel_core::{Error, KResult, status};

kernel_core::export_abi!();

/// Maps a wrapper result to an `f64` return value (`NaN` on error).
fn value(r: KResult<f64>) -> f64 {
    r.unwrap_or(f64::NAN)
}

/// Byte histogram: writes 256 `u32` counts of the `len` bytes at `data` to `counts_out`.
/// Empty input yields all-zero counts. Status: `-4` for invalid pointers.
#[unsafe(no_mangle)]
pub extern "C" fn histogram_u8(data: u32, len: u32, counts_out: u32) -> i32 {
    status((|| {
        // SAFETY: shared view; `output` rejects overlap with it.
        let (data, r) = unsafe { input::<u8>(data, len)? };
        // SAFETY: as above.
        let (counts, _) = unsafe { output::<u32>(counts_out, 256, &[r])? };
        let counts: &mut [u32; 256] = counts.try_into().map_err(|_| Error::InvalidLength)?;
        entropy::histogram(data, counts);
        Ok(())
    })())
}

/// Shannon entropy (Shannon 1948) in bits of the `k` `u32` counts at `counts`:
/// `H = −Σ (c_i/N) log2(c_i/N)`. `0` for `k = 0` or all-zero counts.
#[unsafe(no_mangle)]
pub extern "C" fn entropy_counts(counts: u32, k: u32) -> f64 {
    // SAFETY: the only live view.
    value(unsafe { input::<u32>(counts, k) }.map(|(c, _)| entropy::entropy_counts(c)))
}

/// Order-0 (memoryless) entropy of `len` bytes in bits/symbol; `0` for empty input.
#[unsafe(no_mangle)]
pub extern "C" fn entropy_bytes(data: u32, len: u32) -> f64 {
    // SAFETY: the only live view.
    value(unsafe { input::<u8>(data, len) }.map(|(d, _)| entropy::entropy_bytes(d)))
}

/// Conditional entropy `H(X_n | X_{n−1})` in bits from the bigram counts of `len` bytes
/// (a 256×256 `u32` table is allocated in the arena and released before returning).
/// `0` if `len < 2`; `NaN` for an invalid pointer or if the table cannot be allocated.
#[unsafe(no_mangle)]
pub extern "C" fn conditional_entropy_bytes(data: u32, len: u32) -> f64 {
    value((|| {
        // SAFETY: shared view; scratch lies above every live region.
        let (data, _) = unsafe { input::<u8>(data, len)? };
        if data.len() < 2 {
            return Ok(0.0);
        }
        let temp = Temp::begin();
        let table = temp.alloc::<u32>(1 << 16)?;
        Ok(entropy::conditional_entropy(data, table))
    })())
}

/// Optimal prefix-code lengths (Huffman 1952) for `k ≤ 4096` `u32` counts, written as
/// `u32` to `lengths_out` (`0` for zero counts; a single used symbol gets length 1).
/// Deterministic minimum-variance tie-breaking. Returns the expected code length in
/// bits/symbol (`0` if every count is zero); `NaN` if `k > 4096`, a pointer is invalid,
/// or scratch space cannot be allocated.
#[unsafe(no_mangle)]
pub extern "C" fn huffman_lengths(counts: u32, k: u32, lengths_out: u32) -> f64 {
    value((|| {
        if k as usize > huffman::MAX_SYMBOLS {
            return Err(Error::InvalidLength);
        }
        // SAFETY: shared view; `output` rejects overlap with it; scratch lies above both.
        let (counts, r) = unsafe { input::<u32>(counts, k)? };
        // SAFETY: as above.
        let (lengths, _) = unsafe { output::<u32>(lengths_out, k, &[r])? };
        let n = k as usize;
        let temp = Temp::begin();
        let scratch = huffman::Scratch {
            keys: temp.alloc::<u64>(n)?,
            weights: temp.alloc::<u64>(n)?,
            links: temp.alloc::<u32>(2 * n)?,
        };
        huffman::huffman_lengths(counts, lengths, scratch).ok_or(Error::InvalidParameter)
    })())
}

/// Kullback–Leibler divergence `D(P‖Q)` in bits of two length-`k` `f64` vectors
/// (normalised internally). `+∞` if some `p_i > 0` has `q_i = 0`; `0` for `k = 0`;
/// `NaN` for negative/non-finite entries, zero mass or invalid pointers.
#[unsafe(no_mangle)]
pub extern "C" fn kl_divergence(p: u32, q: u32, k: u32) -> f64 {
    value((|| {
        // SAFETY: shared views only.
        let ((p, _), (q, _)) = unsafe { (input::<f64>(p, k)?, input::<f64>(q, k)?) };
        Ok(entropy::kl_divergence(p, q))
    })())
}

/// Jensen–Shannon divergence in bits (base-2, bounded in `[0, 1]`) of two length-`k`
/// `f64` vectors (normalised internally). Same degenerate values as `kl_divergence`.
#[unsafe(no_mangle)]
pub extern "C" fn js_divergence(p: u32, q: u32, k: u32) -> f64 {
    value((|| {
        // SAFETY: shared views only.
        let ((p, _), (q, _)) = unsafe { (input::<f64>(p, k)?, input::<f64>(q, k)?) };
        Ok(entropy::js_divergence(p, q))
    })())
}

/// Binary entropy `H2(p)` in bits; `p` clamped to `[0, 1]`, `H2(0) = H2(1) = 0`, `NaN → NaN`.
#[unsafe(no_mangle)]
pub extern "C" fn binary_entropy(p: f64) -> f64 {
    entropy::binary_entropy(p)
}

/// Binary symmetric channel capacity `1 − H2(p)` bits/use (Shannon 1948).
#[unsafe(no_mangle)]
pub extern "C" fn bsc_capacity(p: f64) -> f64 {
    entropy::bsc_capacity(p)
}

/// Binary erasure channel capacity `1 − e` bits/use (Elias 1955); `e` clamped to `[0, 1]`.
#[unsafe(no_mangle)]
pub extern "C" fn bec_capacity(e: f64) -> f64 {
    entropy::bec_capacity(e)
}

/// Mutual information `I(X;Y)` in bits from a row-major `rows × cols` `f64` joint
/// count/probability matrix (normalised internally; column sums use arena scratch).
/// `0` for an empty or all-zero matrix; `NaN` for negative/non-finite entries, invalid
/// pointers, `rows·cols ≥ 2^32` or failed scratch allocation.
#[unsafe(no_mangle)]
pub extern "C" fn mutual_information(joint: u32, rows: u32, cols: u32) -> f64 {
    value((|| {
        let len = rows.checked_mul(cols).ok_or(Error::InvalidLength)?;
        if len == 0 {
            return Ok(0.0);
        }
        // SAFETY: shared view; scratch lies above every live region.
        let (joint, _) = unsafe { input::<f64>(joint, len)? };
        let temp = Temp::begin();
        let col_sums = temp.alloc::<f64>(cols as usize)?;
        Ok(entropy::mutual_information(
            joint,
            rows as usize,
            cols as usize,
            col_sums,
        ))
    })())
}

/// Intrinsic information content (Seco, Veale & Hayes 2004) of `n` concepts:
/// `out[i] = 1 − ln(hyponyms[i] + 1) / ln(total)` (`f64`, in `[0, 1]`).
/// Status: `-1` if `n = 0`; `-4` if `total < 2`, any `hyponyms[i] ≥ total`, or a
/// pointer is invalid (nothing is written then).
#[unsafe(no_mangle)]
pub extern "C" fn intrinsic_ic(hyponyms: u32, n: u32, total: u32, out: u32) -> i32 {
    status((|| {
        if n == 0 {
            return Err(Error::InvalidLength);
        }
        // SAFETY: shared view; `output` rejects overlap with it.
        let (hypo, r) = unsafe { input::<u32>(hyponyms, n)? };
        if !hypo.iter().all(|&h| similarity::valid_ic_input(h, total)) {
            return Err(Error::InvalidParameter);
        }
        // SAFETY: as above.
        let (out, _) = unsafe { output::<f64>(out, n, &[r])? };
        for (o, &h) in out.iter_mut().zip(hypo) {
            *o = similarity::intrinsic_ic(h, total);
        }
        Ok(())
    })())
}

/// Lin's similarity (Lin 1998) `2·IC(lcs) / (IC(a) + IC(b))`, clamped to `[0, 1]`;
/// `1` when all three ICs are `0`, `0` for any other zero denominator, `NaN → NaN`.
#[unsafe(no_mangle)]
pub extern "C" fn lin_similarity(ic_lcs: f64, ic_a: f64, ic_b: f64) -> f64 {
    similarity::lin_similarity(ic_lcs, ic_a, ic_b)
}
