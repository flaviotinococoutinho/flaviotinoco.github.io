/**
 * Typed wrapper for `information.wasm`: entropy, source coding, divergences, channel capacity,
 * mutual information and information-content–based similarity. All quantities are in bits unless
 * stated otherwise. Invalid arguments throw `RangeError`, kernel failures {@link KernelError}.
 *
 * Text inputs: a string is measured as the UTF-8 bytes of its NFC form (see {@link textBytes}), so
 * canonically equivalent spellings of pt-BR text (`ç` as U+00E7 or as `c` + U+0327) give the same
 * statistics. Pass a `Uint8Array` to measure other bytes verbatim.
 */
import { assertU32, assertU32Array, check, type CoreExports, KernelError, Status, withArena } from './runtime.ts';

/**
 * Raw exports of `information.wasm` (ABI v1). Pointers are byte offsets into the live arena; quantities are in
 * bits; `f64` results are `NaN` for invalid pointers/parameters. Prefer the {@link InformationKernel} methods.
 */
export interface InformationExports extends CoreExports {
  /** Writes the 256 `u32` byte counts of `data[0..len)` to `countsOut`; status code. */
  readonly histogram_u8: (data: number, len: number, countsOut: number) => number;
  /** Shannon entropy `−Σ (c_i/N) log2(c_i/N)` of `k` `u32` counts (Shannon 1948); `0` if empty. */
  readonly entropy_counts: (counts: number, k: number) => number;
  /** Order-0 entropy of `len` bytes in bits/symbol (Shannon 1948). */
  readonly entropy_bytes: (data: number, len: number) => number;
  /** `H(X_n | X_{n−1})` in bits/symbol from bigram counts (Shannon 1948); `0` if `len < 2`. */
  readonly conditional_entropy_bytes: (data: number, len: number) => number;
  /** Huffman (1952) code lengths (`u32`) for `k ≤ 4096` counts; returns the expected length in bits/symbol. */
  readonly huffman_lengths: (counts: number, k: number, lengthsOut: number) => number;
  /** `D(P‖Q)` in bits of two finite, non-negative `f64` vectors, normalised internally (Kullback & Leibler 1951). */
  readonly kl_divergence: (p: number, q: number, k: number) => number;
  /** Jensen–Shannon divergence in bits, in `[0, 1]` (Lin 1991). */
  readonly js_divergence: (p: number, q: number, k: number) => number;
  /** `H2(p)` in bits, `p` clamped to `[0, 1]` (Shannon 1948). */
  readonly binary_entropy: (p: number) => number;
  /** BSC capacity `1 − H2(p)` in bits per channel use (Shannon 1948). */
  readonly bsc_capacity: (p: number) => number;
  /** BEC capacity `1 − e` in bits per channel use (Elias 1955). */
  readonly bec_capacity: (e: number) => number;
  /** `I(X;Y)` in bits of a row-major `f64` joint matrix, normalised internally (Shannon 1948). */
  readonly mutual_information: (joint: number, rows: number, cols: number) => number;
  /** `out[i] = 1 − ln(hyponyms[i] + 1)/ln(total)` as `f64` (Seco, Veale & Hayes 2004); status code. */
  readonly intrinsic_ic: (hyponyms: number, n: number, total: number, out: number) => number;
  /** `2·IC(lcs)/(IC(a) + IC(b))` (Lin 1998); `1` when all three are `0`. */
  readonly lin_similarity: (icLcs: number, icA: number, icB: number) => number;
}

/** Largest alphabet accepted by {@link InformationKernel.huffmanLengths}. */
export const MAX_HUFFMAN_SYMBOLS = 4096;

/** Result of {@link InformationKernel.huffmanLengths}. */
export interface HuffmanCode {
  /** Code length in bits per symbol (`0` for symbols with zero count). */
  readonly lengths: Uint32Array;
  /** Expected code length `L = Σ c_i l_i / Σ c_i` in bits/symbol. */
  readonly expectedLength: number;
}

/**
 * Ergonomic interface to `information.wasm`. Byte inputs may be strings, measured as the UTF-8 bytes of
 * their NFC normalisation ({@link textBytes}).
 */
export interface InformationKernel {
  /** The raw exports (for advanced, allocation-free use). */
  readonly exports: InformationExports;
  /**
   * Byte histogram: 256 counts `c_b = #{i : data_i = b}`, the empirical source statistics of Shannon (1948).
   * Strings are measured as {@link textBytes}.
   */
  readonly histogram: (data: Uint8Array | string) => Uint32Array;
  /** Shannon entropy `H = −Σ (c_i/N) log2(c_i/N)` in bits of a count vector (Shannon 1948); `0` if empty. */
  readonly entropyCounts: (counts: ArrayLike<number>) => number;
  /**
   * Order-0 entropy `−Σ_b p_b log2 p_b` of a byte string in bits/byte (Shannon 1948); `0` for empty input.
   * Strings are measured as {@link textBytes}.
   */
  readonly entropyBytes: (data: Uint8Array | string) => number;
  /**
   * Conditional entropy `H(X_n | X_{n−1}) = −Σ p(a,b) log2 p(b|a)` in bits/byte, estimated from
   * overlapping bigrams: Shannon's `F_N` for `N = 2` (Shannon 1948, §7 "The entropy of an information
   * source", Theorem 6); `0` for fewer than two bytes. Strings are measured as {@link textBytes}.
   */
  readonly conditionalEntropyBytes: (data: Uint8Array | string) => number;
  /**
   * Optimal prefix-code lengths (Huffman 1952) for up to 4096 symbol counts, with deterministic
   * minimum-variance tie-breaking; the expected length satisfies `H ≤ L < H + 1` (Shannon 1948).
   */
  readonly huffmanLengths: (counts: ArrayLike<number>) => HuffmanCode;
  /**
   * Kullback–Leibler divergence `D(P‖Q) = Σ P_i log2(P_i/Q_i)` in bits (Kullback & Leibler 1951);
   * inputs are normalised (any finite entries: sums beyond `Number.MAX_VALUE` are fine); `+∞` if some
   * `P_i > 0` has `Q_i = 0`; `NaN` for negative or non-finite entries or zero mass.
   */
  readonly klDivergence: (p: ArrayLike<number>, q: ArrayLike<number>) => number;
  /**
   * Jensen–Shannon divergence `½D(P‖M) + ½D(Q‖M)`, `M = (P+Q)/2`, in bits, bounded in `[0, 1]` (Lin 1991);
   * same input rules as {@link InformationKernel.klDivergence}.
   */
  readonly jsDivergence: (p: ArrayLike<number>, q: ArrayLike<number>) => number;
  /** Binary entropy `H2(p) = −p log2 p − (1−p) log2(1−p)` in bits; `p` clamped to `[0, 1]` (Shannon 1948). */
  readonly binaryEntropy: (p: number) => number;
  /** Binary symmetric channel capacity `C = 1 − H2(p)` bits per channel use (Shannon 1948). */
  readonly bscCapacity: (p: number) => number;
  /** Binary erasure channel capacity `C = 1 − e` bits per channel use (Elias 1955). */
  readonly becCapacity: (e: number) => number;
  /**
   * Mutual information `I(X;Y) = Σ p(x,y) log2(p(x,y)/(p(x)p(y)))` in bits from a row-major
   * `rows × cols` joint count/probability matrix of finite, non-negative entries, normalised internally
   * (sums beyond `Number.MAX_VALUE` are fine); `0` for an all-zero matrix, `NaN` for invalid entries
   * (Shannon 1948).
   */
  readonly mutualInformation: (joint: ArrayLike<number>, rows: number, cols: number) => number;
  /**
   * Intrinsic information content `IC(c) = 1 − ln(hypo(c) + 1)/ln(total)` ∈ `[0, 1]` of each concept,
   * from its hyponym count in a taxonomy of `total` concepts (Seco, Veale & Hayes 2004).
   */
  readonly intrinsicIc: (hyponyms: ArrayLike<number>, total: number) => Float64Array;
  /**
   * Lin's similarity `2·IC(lcs)/(IC(a) + IC(b))` ∈ `[0, 1]` (Lin 1998); `1` when all three ICs are `0`.
   */
  readonly linSimilarity: (icLcs: number, icA: number, icB: number) => number;
}

const encoder = new TextEncoder();

/**
 * The bytes a string is measured as: UTF-8 (RFC 3629) of its Unicode Normalization Form C (UAX #15),
 * the form the site normalises text to at its boundaries (docs/arquitetura.md §2.4). Canonically equivalent
 * strings therefore have identical statistics: `'ação'` typed precomposed or with combining marks (as
 * some keyboards and macOS file names produce) gives the same bytes. Lone surrogates, which UTF-8
 * cannot encode, become U+FFFD (`EF BF BD`), as in the WHATWG Encoding Standard's `TextEncoder`.
 */
export function textBytes(text: string): Uint8Array {
  return encoder.encode(text.normalize('NFC'));
}

function bytes(data: Uint8Array | string): Uint8Array {
  return typeof data === 'string' ? textBytes(data) : data;
}

function checkProbabilities(name: string, p: ArrayLike<number>, q: ArrayLike<number>): void {
  if (p.length !== q.length) throw new RangeError(`${name}: lengths differ (${p.length} vs ${q.length})`);
}

/**
 * Wraps raw `information.wasm` exports in the {@link InformationKernel} interface. Pure: performs no I/O.
 */
export function createInformationKernel(exports: InformationExports): InformationKernel {
  const k = exports;

  const overBytes = (fn: 'entropy_bytes' | 'conditional_entropy_bytes', data: Uint8Array | string): number => {
    const b = bytes(data);
    return withArena(k, (arena) => {
      const buf = arena.from('u8', b);
      const h = k[fn](buf.ptr, b.length);
      // NaN only signals a failed scratch allocation (the bigram table) or a bad pointer.
      if (Number.isNaN(h)) {
        throw new KernelError(fn, fn === 'conditional_entropy_bytes' ? Status.OUT_OF_MEMORY : Status.INVALID_PARAMETER);
      }
      return h;
    });
  };

  const divergence = (fn: 'kl_divergence' | 'js_divergence', p: ArrayLike<number>, q: ArrayLike<number>): number => {
    checkProbabilities(fn, p, q);
    return withArena(k, (arena) => k[fn](arena.from('f64', p).ptr, arena.from('f64', q).ptr, p.length));
  };

  return {
    exports: k,

    histogram: (data) => {
      const b = bytes(data);
      return withArena(k, (arena) => {
        const buf = arena.from('u8', b);
        const counts = arena.alloc('u32', 256);
        check('histogram_u8', k.histogram_u8(buf.ptr, b.length, counts.ptr));
        return counts.read();
      });
    },

    entropyCounts: (counts) => {
      assertU32Array('counts', counts);
      return withArena(k, (arena) => k.entropy_counts(arena.from('u32', counts).ptr, counts.length));
    },

    entropyBytes: (data) => overBytes('entropy_bytes', data),

    conditionalEntropyBytes: (data) => overBytes('conditional_entropy_bytes', data),

    huffmanLengths: (counts) => {
      assertU32Array('counts', counts);
      if (counts.length > MAX_HUFFMAN_SYMBOLS) {
        throw new RangeError(`huffmanLengths supports at most ${MAX_HUFFMAN_SYMBOLS} symbols`);
      }
      return withArena(k, (arena) => {
        const c = arena.from('u32', counts);
        const lengths = arena.alloc('u32', counts.length);
        const expectedLength = k.huffman_lengths(c.ptr, counts.length, lengths.ptr);
        if (Number.isNaN(expectedLength)) throw new KernelError('huffman_lengths', Status.OUT_OF_MEMORY);
        return { lengths: lengths.read(), expectedLength };
      });
    },

    klDivergence: (p, q) => divergence('kl_divergence', p, q),

    jsDivergence: (p, q) => divergence('js_divergence', p, q),

    binaryEntropy: (p) => k.binary_entropy(p),

    bscCapacity: (p) => k.bsc_capacity(p),

    becCapacity: (e) => k.bec_capacity(e),

    mutualInformation: (joint, rows, cols) => {
      assertU32('rows', rows);
      assertU32('cols', cols);
      if (rows * cols !== joint.length) {
        throw new RangeError(`mutualInformation: ${rows}×${cols} matrix needs ${rows * cols} entries`);
      }
      return withArena(k, (arena) => k.mutual_information(arena.from('f64', joint).ptr, rows, cols));
    },

    intrinsicIc: (hyponyms, total) => {
      assertU32Array('hyponyms', hyponyms);
      assertU32('total', total, 2);
      if (hyponyms.length === 0) return new Float64Array(0);
      return withArena(k, (arena) => {
        const h = arena.from('u32', hyponyms);
        const out = arena.alloc('f64', hyponyms.length);
        check('intrinsic_ic', k.intrinsic_ic(h.ptr, hyponyms.length, total, out.ptr));
        return out.read();
      });
    },

    linSimilarity: (icLcs, icA, icB) => k.lin_similarity(icLcs, icA, icB),
  };
}

/** Lazily loads `information.wasm` (one fetch per page, cached) and returns its {@link InformationKernel}. */
export async function loadInformation(): Promise<InformationKernel> {
  const entry = await import('./load-information.ts');
  return entry.loadInformationKernel();
}
