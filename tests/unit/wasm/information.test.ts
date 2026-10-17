/** information.wasm against analytic results and independent JS references (tests/unit/wasm/reference.ts). */
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createInformationKernel,
  type InformationExports,
  type InformationKernel,
  textBytes,
} from '../../../src/adapters/wasm/information.ts';
import { KernelError, Status, withArena } from '../../../src/adapters/wasm/runtime.ts';
import { at, instantiate, mulberry32 } from './helpers.ts';
import {
  conditionalEntropy,
  entropyOfCounts,
  huffmanExpectedLength,
  jsDivergence,
  klDivergence,
  mutualInformation,
} from './reference.ts';

let kernel: InformationKernel;
let raw: InformationExports;

beforeAll(async () => {
  raw = await instantiate<InformationExports>('information');
  kernel = createInformationKernel(raw);
});

const randomBytes = (n: number, seed: number, alphabet = 256): Uint8Array => {
  const r = mulberry32(seed);
  return Uint8Array.from({ length: n }, () => Math.floor(r() * alphabet));
};

const kraftSum = (lengths: ArrayLike<number>): number => {
  let s = 0;
  for (let i = 0; i < lengths.length; i++) if (at(lengths, i) > 0) s += 2 ** -at(lengths, i);
  return s;
};

/** Distributions as non-negative integer weights (normalised by the kernels), at least one positive. */
const weights = (minLength: number, maxLength: number) =>
  fc.array(fc.integer({ min: 0, max: 1000 }), { minLength, maxLength }).filter((w) => w.some((v) => v > 0));

describe('entropy (Shannon 1948)', () => {
  it('is 8 bits for all 256 byte values and 0 for a constant string', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(kernel.entropyBytes(all)).toBeCloseTo(8, 12);
    expect(kernel.entropyBytes(new Uint8Array(1000).fill(42))).toBe(0);
    expect(kernel.entropyBytes(new Uint8Array(0))).toBe(0);
    expect(kernel.entropyBytes('aaaa')).toBe(0);
  });

  it('matches the reference on random data and on UTF-8 text', () => {
    for (const alphabet of [2, 5, 26, 256]) {
      const data = randomBytes(5000, alphabet, alphabet);
      const counts = kernel.histogram(data);
      expect(kernel.entropyBytes(data)).toBeCloseTo(entropyOfCounts(counts), 12);
      expect(kernel.entropyCounts(counts)).toBeCloseTo(entropyOfCounts(counts), 12);
    }
    const text = 'Informação é surpresa: a entropia mede a surpresa média.';
    const utf8 = new TextEncoder().encode(text);
    expect(kernel.entropyBytes(text)).toBeCloseTo(entropyOfCounts(kernel.histogram(utf8)), 12);
  });

  it('histogram counts every byte value', () => {
    const counts = kernel.histogram(Uint8Array.from([0, 255, 255, 7, 7, 7]));
    expect(counts.length).toBe(256);
    expect([at(counts, 0), at(counts, 7), at(counts, 255)]).toEqual([1, 3, 2]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(6);
    expect(kernel.histogram('').every((c) => c === 0)).toBe(true);
  });

  it('entropyCounts: log2(k) for k equal counts, 0 for empty or all-zero input', () => {
    expect(kernel.entropyCounts([5, 5, 5, 5, 5, 5, 5, 5])).toBeCloseTo(3, 14);
    expect(kernel.entropyCounts([])).toBe(0);
    expect(kernel.entropyCounts([0, 0, 0])).toBe(0);
    expect(kernel.entropyCounts([0xffff_ffff, 0xffff_ffff])).toBeCloseTo(1, 14);
    expect(() => kernel.entropyCounts([1, -1])).toThrow(RangeError);
    expect(() => kernel.entropyCounts([0.5])).toThrow(RangeError);
  });

  it('conditional entropy H(X_n | X_{n−1}) matches the bigram reference and its bounds', () => {
    // A deterministic successor: the next byte is known, so H(X_n | X_{n−1}) = 0 while H(X) = 2.
    const cycle = Uint8Array.from({ length: 4000 }, (_, i) => i % 4);
    expect(kernel.conditionalEntropyBytes(cycle)).toBeCloseTo(0, 12);
    expect(kernel.entropyBytes(cycle)).toBeCloseTo(2, 12);
    for (const seed of [1, 2, 3]) {
      const data = randomBytes(3000, seed, 1 + seed * 7);
      const h = kernel.conditionalEntropyBytes(data);
      expect(h).toBeCloseTo(conditionalEntropy(data), 10);
      // Conditioning reduces entropy (up to the one-symbol difference between the two estimates).
      expect(h).toBeLessThanOrEqual(kernel.entropyBytes(data) + 1e-2);
    }
    expect(kernel.conditionalEntropyBytes(Uint8Array.of(9))).toBe(0);
    expect(kernel.conditionalEntropyBytes('')).toBe(0);
  });

  it("conditional entropy is Shannon's F_2 = H(X_{n−1}, X_n) − H(X_{n−1}) (1948, §7, Theorem 6)", () => {
    // Theorem 6: F_N = N·G_N − (N−1)·G_{N−1}; for N = 2 the block entropy of the overlapping
    // bigrams minus the entropy of their first symbols, estimated on the same len − 1 positions.
    for (const seed of [11, 12, 13]) {
      const data = randomBytes(2000, seed, 3 + seed);
      const pairs = new Uint32Array(1 << 16);
      for (let i = 1; i < data.length; i++) pairs[at(data, i - 1) * 256 + at(data, i)] += 1;
      const f2 = kernel.entropyCounts(pairs) - kernel.entropyBytes(data.subarray(0, -1));
      expect(kernel.conditionalEntropyBytes(data)).toBeCloseTo(f2, 12);
    }
  });

  it('measures a string as the UTF-8 bytes of its NFC form (canonically equivalent text, equal statistics)', () => {
    const nfc = 'Ação, coração e informação.'.normalize('NFC');
    const nfd = nfc.normalize('NFD');
    expect(nfd).not.toBe(nfc);
    expect(Array.from(textBytes(nfd))).toEqual(Array.from(new TextEncoder().encode(nfc)));
    expect(kernel.histogram(nfd)).toEqual(kernel.histogram(nfc));
    expect(kernel.entropyBytes(nfd)).toBe(kernel.entropyBytes(nfc));
    expect(kernel.conditionalEntropyBytes(nfd)).toBe(kernel.conditionalEntropyBytes(nfc));
    expect(kernel.huffmanLengths(kernel.histogram(nfd))).toEqual(kernel.huffmanLengths(kernel.histogram(nfc)));
    // Bytes are measured verbatim: the decomposed UTF-8 really is a different source.
    expect(kernel.entropyBytes(new TextEncoder().encode(nfd))).not.toBe(kernel.entropyBytes(nfc));
    // A lone surrogate has no UTF-8 form and is measured as U+FFFD, as TextEncoder writes it.
    expect(Array.from(textBytes('a\uD800b'))).toEqual([0x61, 0xef, 0xbf, 0xbd, 0x62]);
  });

  it('conditional entropy releases its 256 KiB bigram table', () => {
    withArena(raw, (arena) => {
      const data = arena.from('u8', randomBytes(100, 9));
      const used = raw.arena_used();
      expect(raw.conditional_entropy_bytes(data.ptr, 100)).toBeGreaterThan(0);
      expect(raw.arena_used()).toBe(used);
    });
  });
});

describe('Huffman coding (Huffman 1952)', () => {
  it('reproduces the CLRS example: {45, 13, 12, 16, 9, 5} → 2.24 bits/symbol', () => {
    const { lengths, expectedLength } = kernel.huffmanLengths([45, 13, 12, 16, 9, 5]);
    expect(Array.from(lengths)).toEqual([1, 3, 3, 3, 4, 4]);
    expect(expectedLength).toBeCloseTo(2.24, 12);
    expect(kraftSum(lengths)).toBe(1);
  });

  it('handles degenerate alphabets: none, one used symbol, zero counts', () => {
    expect(kernel.huffmanLengths([])).toEqual({ lengths: new Uint32Array(0), expectedLength: 0 });
    expect(kernel.huffmanLengths([0, 0])).toEqual({ lengths: new Uint32Array(2), expectedLength: 0 });
    const single = kernel.huffmanLengths([0, 17, 0]);
    expect(Array.from(single.lengths)).toEqual([0, 1, 0]);
    expect(single.expectedLength).toBe(1);
    const withZeros = kernel.huffmanLengths([0, 3, 0, 1, 1, 0]);
    expect(Array.from(withZeros.lengths)).toEqual([0, 1, 0, 2, 2, 0]);
  });

  it('is deterministic and breaks ties towards minimum variance', () => {
    const counts = [4, 2, 2, 1, 1];
    const a = kernel.huffmanLengths(counts);
    expect(Array.from(a.lengths)).toEqual([2, 2, 2, 3, 3]);
    expect(kernel.huffmanLengths(counts)).toEqual(a);
    expect(Array.from(kernel.huffmanLengths([1, 1, 1, 1, 1, 1, 1, 1]).lengths)).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
  });

  it('satisfies Kraft equality and H ≤ L < H + 1 on random distributions (source coding theorem)', () => {
    fc.assert(
      fc.property(weights(2, 300), (counts) => {
        const { lengths, expectedLength } = kernel.huffmanLengths(counts);
        const h = entropyOfCounts(counts);
        const used = counts.filter((c) => c > 0).length;
        expect(expectedLength).toBeCloseTo(huffmanExpectedLength(counts), 12);
        if (used >= 2) {
          expect(expectedLength).toBeGreaterThanOrEqual(h - 1e-12);
          expect(expectedLength).toBeLessThan(h + 1);
          expect(kraftSum(lengths)).toBeCloseTo(1, 12);
        } else {
          // One used symbol: H = 0 but a codeword needs at least one bit (L = H + 1).
          expect([h, expectedLength]).toEqual([0, 1]);
        }
        for (let i = 0; i < counts.length; i++) expect(at(lengths, i) === 0).toBe(at(counts, i) === 0);
      }),
    );
  });

  it('accepts 4096 symbols and rejects more', () => {
    const r = mulberry32(4096);
    const counts = Array.from({ length: 4096 }, () => 1 + Math.floor(r() * 1e6));
    const { expectedLength } = kernel.huffmanLengths(counts);
    expect(expectedLength).toBeCloseTo(huffmanExpectedLength(counts), 9);
    expect(() => kernel.huffmanLengths(new Array<number>(4097).fill(1))).toThrow(RangeError);
    withArena(raw, (arena) => {
      const c = arena.alloc('u32', 4097);
      const out = arena.alloc('u32', 4097);
      expect(raw.huffman_lengths(c.ptr, 4097, out.ptr)).toBeNaN();
    });
  });
});

describe('divergences (Kullback & Leibler 1951; Lin 1991)', () => {
  it('KL(p‖p) = 0, KL ≥ 0 and matches the reference', () => {
    const p = [0.1, 0.4, 0.5];
    const q = [0.8, 0.15, 0.05];
    expect(kernel.klDivergence(p, p)).toBe(0);
    expect(kernel.klDivergence(p, q)).toBeCloseTo(klDivergence(p, q), 12);
    expect(kernel.klDivergence([2, 8, 10], q)).toBeCloseTo(klDivergence(p, q), 12); // normalised internally
    fc.assert(
      fc.property(
        weights(1, 40).chain((w) =>
          fc.tuple(
            fc.constant(w),
            fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: w.length, maxLength: w.length }),
          ),
        ),
        ([pw, qw]) => {
          const d = kernel.klDivergence(pw, qw);
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeCloseTo(Math.max(0, klDivergence(pw, qw)), 9);
          expect(kernel.klDivergence(pw, pw)).toBeCloseTo(0, 12);
        },
      ),
    );
  });

  it('KL is +∞ when p puts mass where q has none; NaN for invalid inputs', () => {
    expect(kernel.klDivergence([1, 1], [1, 0])).toBe(Infinity);
    expect(kernel.klDivergence([1, 0], [1, 1])).toBeCloseTo(1, 14);
    expect(kernel.klDivergence([], [])).toBe(0);
    expect(kernel.klDivergence([-1, 2], [1, 1])).toBeNaN();
    expect(kernel.klDivergence([0, 0], [1, 1])).toBeNaN();
    expect(kernel.klDivergence([NaN, 1], [1, 1])).toBeNaN();
    expect(() => kernel.klDivergence([1], [1, 2])).toThrow(RangeError);
  });

  it('accept finite entries whose sum overflows (normalised after an exact power-of-two rescaling)', () => {
    // Σ = 2e308 overflows a double, yet P = Q = (½, ½).
    expect(kernel.klDivergence([1e308, 1e308], [1, 1])).toBe(0);
    expect(kernel.jsDivergence([1e308, 1e308], [1, 1])).toBe(0);
    expect(kernel.klDivergence([1e308, 1e308], [3, 1])).toBeCloseTo(klDivergence([1, 1], [3, 1]), 14);
    // Scaling by a power of two is exact, so the result is bit-for-bit the unscaled one.
    const big = 2 ** 1013; // 1000 · 2^1013 < Number.MAX_VALUE < 30 · 1000 · 2^1013
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }).chain((n) => fc.tuple(weights(n, n), weights(n, n))),
        ([p, q]) => {
          const scaled = p.map((x) => x * big);
          expect(kernel.jsDivergence(scaled, q)).toBe(kernel.jsDivergence(p, q));
          expect(
            kernel.klDivergence(
              scaled,
              q.map((x) => x + 1),
            ),
          ).toBe(
            kernel.klDivergence(
              p,
              q.map((x) => x + 1),
            ),
          );
        },
      ),
    );
  });

  it('JS ∈ [0, 1] bits, symmetric, 1 for disjoint supports and matches the reference', () => {
    expect(kernel.jsDivergence([1, 0], [0, 1])).toBe(1);
    expect(kernel.jsDivergence([3, 1], [3, 1])).toBe(0);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }).chain((n) => fc.tuple(weights(n, n), weights(n, n))),
        ([p, q]) => {
          const js = kernel.jsDivergence(p, q);
          expect(js).toBeGreaterThanOrEqual(0);
          expect(js).toBeLessThanOrEqual(1);
          expect(js).toBeCloseTo(kernel.jsDivergence(q, p), 12);
          expect(js).toBeCloseTo(Math.min(1, Math.max(0, jsDivergence(p, q))), 9);
        },
      ),
    );
  });
});

describe('channels (Shannon 1948; Elias 1955)', () => {
  it('binary entropy: H2(0.5) = 1, H2(0) = H2(1) = 0, symmetric, clamped, NaN-safe', () => {
    expect(kernel.binaryEntropy(0.5)).toBe(1);
    expect(kernel.binaryEntropy(0)).toBe(0);
    expect(kernel.binaryEntropy(1)).toBe(0);
    expect(kernel.binaryEntropy(-2)).toBe(0);
    expect(kernel.binaryEntropy(7)).toBe(0);
    expect(kernel.binaryEntropy(NaN)).toBeNaN();
    for (const p of [0.01, 0.1, 0.25, 0.4]) {
      expect(kernel.binaryEntropy(p)).toBeCloseTo(kernel.binaryEntropy(1 - p), 14);
      expect(kernel.binaryEntropy(p)).toBeCloseTo(-p * Math.log2(p) - (1 - p) * Math.log2(1 - p), 14);
    }
  });

  it('BSC capacity 1 − H2(p): C(0.11) ≈ 0.5, C(0) = C(1) = 1, C(0.5) = 0', () => {
    expect(Math.abs(kernel.bscCapacity(0.11) - 0.5)).toBeLessThan(1e-3);
    expect(kernel.bscCapacity(0)).toBe(1);
    expect(kernel.bscCapacity(1)).toBe(1);
    expect(kernel.bscCapacity(0.5)).toBe(0);
  });

  it('BEC capacity 1 − e, clamped to [0, 1]', () => {
    expect(kernel.becCapacity(0.25)).toBe(0.75);
    expect(kernel.becCapacity(0)).toBe(1);
    expect(kernel.becCapacity(1)).toBe(0);
    expect(kernel.becCapacity(1.5)).toBe(0);
    expect(kernel.becCapacity(-1)).toBe(1);
    expect(kernel.becCapacity(NaN)).toBeNaN();
  });
});

describe('mutual information (Shannon 1948)', () => {
  it('is 0 for an independent joint and 2 bits for the identity over 4 symbols', () => {
    const px = [0.1, 0.2, 0.3, 0.4];
    const py = [0.5, 0.25, 0.125, 0.125];
    const independent = px.flatMap((a) => py.map((b) => a * b));
    expect(Math.abs(kernel.mutualInformation(independent, 4, 4))).toBeLessThan(1e-12);
    const identity = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 7 : 0));
    expect(kernel.mutualInformation(identity, 4, 4)).toBeCloseTo(2, 14);
  });

  it('matches the reference on random count matrices and is bounded by the marginal entropies', () => {
    const r = mulberry32(77);
    for (const [rows, cols] of [
      [2, 3],
      [5, 5],
      [8, 3],
      [1, 6],
    ] as const) {
      const joint = Array.from({ length: rows * cols }, () => Math.floor(r() * 20));
      const mi = kernel.mutualInformation(joint, rows, cols);
      expect(mi).toBeCloseTo(Math.max(0, mutualInformation(joint, rows, cols)), 12);
      const rowSums = Array.from({ length: rows }, (_, i) =>
        joint.slice(i * cols, (i + 1) * cols).reduce((a, b) => a + b),
      );
      expect(mi).toBeLessThanOrEqual(entropyOfCounts(rowSums) + 1e-12);
      expect(mi).toBeGreaterThanOrEqual(0);
    }
  });

  it('accepts finite entries whose total overflows (1 bit for a scaled 2 × 2 identity)', () => {
    expect(kernel.mutualInformation([1e308, 0, 0, 1e308], 2, 2)).toBe(1);
    expect(kernel.mutualInformation([1e308, 1e308, 1e308, 1e308], 2, 2)).toBeCloseTo(0, 14);
    const joint = [3, 1, 4, 1, 5, 9];
    expect(
      kernel.mutualInformation(
        joint.map((x) => x * 2 ** 1020),
        2,
        3,
      ),
    ).toBe(kernel.mutualInformation(joint, 2, 3));
  });

  it('is 0 for an empty or all-zero matrix and NaN for negative entries', () => {
    expect(kernel.mutualInformation([], 0, 0)).toBe(0);
    expect(kernel.mutualInformation([0, 0, 0, 0], 2, 2)).toBe(0);
    expect(kernel.mutualInformation([1, -1, 0, 1], 2, 2)).toBeNaN();
    expect(() => kernel.mutualInformation([1, 2, 3], 2, 2)).toThrow(RangeError);
  });
});

describe('information content and similarity (Seco, Veale & Hayes 2004; Lin 1998)', () => {
  it('intrinsic IC: root = 0, leaf = 1, monotone in the number of hyponyms', () => {
    const total = 100;
    const ic = kernel.intrinsicIc([99, 0, 9, 49], total);
    expect(at(ic, 0)).toBe(0);
    expect(at(ic, 1)).toBe(1);
    expect(at(ic, 2)).toBeCloseTo(1 - Math.log(10) / Math.log(100), 14);
    expect(at(ic, 3)).toBeLessThan(at(ic, 2));
    expect(kernel.intrinsicIc([], total).length).toBe(0);
  });

  it('intrinsic IC rejects inconsistent taxonomies', () => {
    expect(() => kernel.intrinsicIc([5], 1)).toThrow(RangeError);
    expect(() => kernel.intrinsicIc([100], 100)).toThrow(KernelError);
    withArena(raw, (arena) => {
      const h = arena.from('u32', [1, 2]);
      const out = arena.alloc('f64', 2);
      expect(raw.intrinsic_ic(h.ptr, 2, 1, out.ptr)).toBe(Status.INVALID_PARAMETER);
      expect(raw.intrinsic_ic(h.ptr, 0, 10, out.ptr)).toBe(Status.INVALID_LENGTH);
      expect(raw.intrinsic_ic(h.ptr, 2, 10, h.ptr)).toBe(Status.INVALID_PARAMETER); // out overlaps the input
    });
  });

  it('Lin similarity 2·IC(lcs)/(IC(a)+IC(b)) with the 0/0 convention', () => {
    expect(kernel.linSimilarity(0.3, 0.6, 0.9)).toBeCloseTo(0.4, 14);
    expect(kernel.linSimilarity(0.7, 0.7, 0.7)).toBe(1);
    expect(kernel.linSimilarity(0, 0, 0)).toBe(1);
    expect(kernel.linSimilarity(0, 0.5, 0.5)).toBe(0);
    expect(kernel.linSimilarity(0.5, 0, 0)).toBe(0);
    expect(kernel.linSimilarity(NaN, 0.5, 0.5)).toBeNaN();
    // Combined with the intrinsic IC: siblings under a common parent.
    const [parent, a, b] = kernel.intrinsicIc([2, 0, 0], 10);
    expect(kernel.linSimilarity(parent ?? NaN, a ?? NaN, b ?? NaN)).toBeCloseTo(1 - Math.log(3) / Math.log(10), 14);
  });
});

describe('pointer validation', () => {
  it('returns NaN or −4 for pointers outside the live arena', () => {
    expect(raw.entropy_bytes(0, 10)).toBeNaN();
    expect(raw.entropy_counts(8, 1)).toBeNaN();
    expect(raw.kl_divergence(0, 0, 2)).toBeNaN();
    expect(raw.histogram_u8(0, 1, 0)).toBe(Status.INVALID_PARAMETER);
    withArena(raw, (arena) => {
      const data = arena.alloc('u8', 16);
      const counts = arena.alloc('u32', 255); // one short of 256
      expect(raw.histogram_u8(data.ptr, 16, counts.ptr)).toBe(Status.INVALID_PARAMETER);
      expect(raw.entropy_counts(data.ptr + 1, 2)).toBeNaN(); // misaligned u32
    });
  });
});
