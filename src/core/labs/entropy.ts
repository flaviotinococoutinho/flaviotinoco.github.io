/**
 * Empirical source statistics of a text for the entropy lab (C. E. Shannon, "A mathematical theory of
 * communication", Bell System Technical Journal 27, 1948, §§6–7 and Theorem 9; D. A. Huffman, Proc. IRE
 * 40(9), 1952).
 *
 * The text is read as a sequence of symbols, either Unicode code points or UTF-8 bytes, always of its NFC
 * normalisation (UAX #15), as `information.wasm` measures strings (src/adapters/wasm/information.ts):
 * "ação" typed with combining marks or precomposed is the same source. With bytes, an accented letter of
 * pt-BR costs two symbols; with code points, one.
 *
 * Counting is done here (pure); the island hands the counts to the kernel, which computes the entropy
 * H = −Σ p log2 p, Huffman code lengths and their mean L, and H(X_n | X_{n−1}) = H(X_{n−1}, X_n) − H(X_{n−1})
 * from the overlapping bigrams (Shannon's F_2). `entropyOfCounts` is the same formula in TypeScript, for the
 * summaries and the tests.
 */

export type SymbolUnit = 'char' | 'byte';

const encoder = new TextEncoder();

/** The symbol sequence of a text: code points or UTF-8 bytes of its NFC form. */
export const symbolsOf = (text: string, unit: SymbolUnit): readonly number[] => {
  const nfc = text.normalize('NFC');
  return unit === 'byte' ? [...encoder.encode(nfc)] : [...nfc].map((c) => c.codePointAt(0) ?? 0);
};

export interface SymbolCounts {
  /** Distinct symbols in order of first appearance. */
  readonly symbols: readonly number[];
  /** counts[i] = occurrences of symbols[i]. */
  readonly counts: readonly number[];
  /** Length of the sequence. */
  readonly total: number;
}

/** Occurrences of each distinct symbol (first-appearance order, so ties break deterministically). */
export const countSymbols = (sequence: readonly number[]): SymbolCounts => {
  const index = new Map<number, number>();
  const symbols: number[] = [];
  const counts: number[] = [];
  for (const s of sequence) {
    const i = index.get(s);
    if (i === undefined) {
      index.set(s, symbols.length);
      symbols.push(s);
      counts.push(1);
    } else counts[i] = (counts[i] ?? 0) + 1;
  }
  return { symbols, counts, total: sequence.length };
};

export interface BigramCounts {
  /** Counts of each distinct overlapping pair (x_{i}, x_{i+1}). */
  readonly pairs: readonly number[];
  /** Counts of each distinct first element x_i, i < n − 1 (the condition of H(X_n | X_{n−1})). */
  readonly firsts: readonly number[];
}

/** Bigram statistics of the n − 1 overlapping pairs (empty for fewer than two symbols). */
export const countBigrams = (sequence: readonly number[]): BigramCounts => {
  const pairs = new Map<string, number>();
  const firsts = new Map<number, number>();
  for (let i = 0; i + 1 < sequence.length; i++) {
    const a = sequence[i] ?? 0;
    const key = `${a},${sequence[i + 1] ?? 0}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
    firsts.set(a, (firsts.get(a) ?? 0) + 1);
  }
  return { pairs: [...pairs.values()], firsts: [...firsts.values()] };
};

/** Shannon entropy in bits of a count vector; 0 for an empty or all-zero vector. */
export const entropyOfCounts = (counts: readonly number[]): number => {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const c of counts) if (c > 0) h -= (c / total) * Math.log2(c / total);
  return Math.max(0, h);
};

/** Mean code length Σ c_i ℓ_i / Σ c_i of a code with lengths ℓ for the counts c. */
export const meanLength = (counts: readonly number[], lengths: ArrayLike<number>): number => {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return counts.reduce((acc, c, i) => acc + c * (lengths[i] ?? 0), 0) / total;
};

export interface RankedSymbol {
  readonly symbol: number;
  readonly count: number;
  readonly probability: number;
  /** Huffman code length in bits (0 when unknown). */
  readonly length: number;
}

/** The `k` most frequent symbols (ties: first appearance first), with their code lengths. */
export const topSymbols = (stats: SymbolCounts, lengths: ArrayLike<number>, k: number): readonly RankedSymbol[] =>
  stats.symbols
    .map((symbol, i) => ({
      symbol,
      count: stats.counts[i] ?? 0,
      probability: stats.total > 0 ? (stats.counts[i] ?? 0) / stats.total : 0,
      length: lengths[i] ?? 0,
      order: i,
    }))
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, Math.max(0, k))
    .map(({ symbol, count, probability, length }) => ({ symbol, count, probability, length }));

const hex = (n: number, width: number): string => n.toString(16).toUpperCase().padStart(width, '0');

/**
 * A visible label for a symbol: invisible characters get a conventional sign (space ␣ U+2423,
 * line feed ↵, tab ⇥) or their code (U+XXXX); bytes outside printable ASCII print as 0xHH.
 */
export const symbolLabel = (symbol: number, unit: SymbolUnit): string => {
  if (symbol === 0x20) return '␣';
  if (symbol === 0x0a) return '↵';
  if (symbol === 0x09) return '⇥';
  if (unit === 'byte') return symbol >= 0x21 && symbol <= 0x7e ? String.fromCharCode(symbol) : `0x${hex(symbol, 2)}`;
  const isControl = symbol < 0x20 || (symbol >= 0x7f && symbol < 0xa0);
  const isMark = /^\p{M}$/u.test(String.fromCodePoint(symbol));
  if (isControl || isMark || (symbol >= 0xd800 && symbol <= 0xdfff)) return `U+${hex(symbol, 4)}`;
  return String.fromCodePoint(symbol);
};

/** Accessible name of a symbol (the label, plus its code when the label is a sign). */
export const symbolName = (symbol: number, unit: SymbolUnit): string => {
  const label = symbolLabel(symbol, unit);
  return label.length > 1 || label === '␣' || label === '↵' || label === '⇥'
    ? unit === 'byte'
      ? `0x${hex(symbol, 2)}`
      : `U+${hex(symbol, 4)}`
    : label;
};

export interface EntropyFigures {
  /** Number of distinct symbols m. */
  readonly distinct: number;
  /** log2 m: the entropy of m equiprobable symbols (null when m = 0). */
  readonly maxEntropy: number | null;
  /** ⌈log2 m⌉ bits of a fixed-length code (null when m = 0; 1 bit when m = 1). */
  readonly fixedLength: number | null;
  /** Redundancy 1 − H/log2 m (null when m ≤ 1). */
  readonly redundancy: number | null;
}

/** Figures derived from the entropy H of a source with m distinct symbols. */
export const entropyFigures = (h: number, distinct: number): EntropyFigures => {
  const m = Math.max(0, Math.trunc(distinct));
  const maxEntropy = m === 0 ? null : Math.log2(m);
  return {
    distinct: m,
    maxEntropy,
    fixedLength: m === 0 ? null : Math.max(1, Math.ceil(Math.log2(m) - 1e-12)),
    redundancy: m <= 1 || maxEntropy === null ? null : Math.min(1, Math.max(0, 1 - h / maxEntropy)),
  };
};
