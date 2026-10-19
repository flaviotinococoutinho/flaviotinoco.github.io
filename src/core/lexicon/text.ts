/**
 * Text primitives shared by every matching engine (pure, total).
 *
 * Invariants:
 *  - Text and dictionary keys are compared in Unicode Normalization Form C
 *    (UAX #15). NFC is applied to a COPY of the author's text (`nfcView`) and
 *    offsets are mapped back, so the stage never rewrites a single code point.
 *  - Case folding is LENGTH-PRESERVING per code unit (and per code point for
 *    astral characters): an offset in the folded string is the same offset in
 *    the original. It is also context-free — unlike String#toLowerCase, whose
 *    Final_Sigma rule makes the fold of a substring differ from the substring of
 *    a fold — so a key folded alone matches the same key folded inside a text.
 *  - Every whitespace character (JS `\s`: spaces, NBSP, thin spaces, line
 *    terminators) folds to U+0020, and a space inside a dictionary key matches
 *    a whitespace RUN. Phrases thus survive Markdown soft line breaks, NBSPs and
 *    double spaces.
 *  - A "word character" is \p{L} | \p{N} | \p{M}. JS `\b` only knows
 *    [A-Za-z0-9_] ("ação" would match inside "reação"); \p{M} matters because a
 *    combining mark after a base letter must never be read as a boundary
 *    (docs/research/lexicon.md §1, correctness matrix).
 */

const WORD = /^[\p{L}\p{N}\p{M}]$/u;
const SPACE = /^\s$/u;
const BMP = 0x10000;

const isSurrogate = (c: number): boolean => c >= 0xd800 && c <= 0xdfff;
const isHighSurrogate = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLowSurrogate = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;

/** 1 if the BMP code unit is a word character (surrogates: 0, handled by code point). */
const WORD_TABLE: Uint8Array = (() => {
  const table = new Uint8Array(BMP);
  for (let c = 0; c < BMP; c++) {
    if (!isSurrogate(c) && WORD.test(String.fromCharCode(c))) table[c] = 1;
  }
  return table;
})();

export const isWordCodePoint = (cp: number): boolean =>
  cp < BMP ? WORD_TABLE[cp] === 1 : WORD.test(String.fromCodePoint(cp));

/** Is the code point that ENDS just before UTF-16 offset `i` a word character? */
export const isWordBefore = (s: string, i: number): boolean => {
  if (i <= 0) return false;
  const unit = s.charCodeAt(i - 1);
  if (isLowSurrogate(unit) && i >= 2 && isHighSurrogate(s.charCodeAt(i - 2))) {
    return isWordCodePoint(s.codePointAt(i - 2) ?? unit);
  }
  return WORD_TABLE[unit] === 1;
};

/** Is the code point that STARTS at UTF-16 offset `i` a word character? */
export const isWordAt = (s: string, i: number): boolean => {
  if (i >= s.length) return false;
  const unit = s.charCodeAt(i);
  if (isHighSurrogate(unit)) return isWordCodePoint(s.codePointAt(i) ?? unit);
  return WORD_TABLE[unit] === 1;
};

/** True when [start, end) is delimited by non-word characters (or the string edges). */
export const hasWordBoundaries = (s: string, start: number, end: number): boolean =>
  !isWordBefore(s, start) && !isWordAt(s, end);

/**
 * Per-code-unit fold table: lower case when the single-character mapping keeps
 * the length (1 unit) and the word/non-word class (so boundaries computed on
 * the folded text equal boundaries on the original); whitespace → U+0020.
 * U+0130 'İ' lowers to two units (i + U+0307) and is therefore kept as is.
 */
const FOLD_TABLE: Uint16Array = (() => {
  const table = new Uint16Array(BMP);
  for (let c = 0; c < BMP; c++) {
    if (isSurrogate(c)) {
      table[c] = c;
      continue;
    }
    const ch = String.fromCharCode(c);
    if (SPACE.test(ch)) {
      table[c] = 0x20;
      continue;
    }
    const lower = ch.toLowerCase();
    const l = lower.charCodeAt(0);
    table[c] = lower.length === 1 && (WORD_TABLE[l] === 1) === (WORD_TABLE[c] === 1) ? l : c;
  }
  return table;
})();

const fromUnits = (units: Uint16Array): string => {
  let out = '';
  for (let i = 0; i < units.length; i += 4096) {
    out += String.fromCharCode(...units.subarray(i, i + 4096));
  }
  return out;
};

/**
 * Length-preserving, context-free case fold (see module invariants).
 * Law: fold(s).length === s.length and fold(a + b) === fold(a) + fold(b) whenever
 * the split does not cut a surrogate pair.
 */
export const fold = (s: string): string => {
  const units = new Uint16Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (isHighSurrogate(c) && i + 1 < s.length && isLowSurrogate(s.charCodeAt(i + 1))) {
      const cp = s.codePointAt(i) ?? c;
      const lower = String.fromCodePoint(cp).toLowerCase();
      const lcp = lower.codePointAt(0) ?? cp;
      const keep = lower.length !== 2 || isWordCodePoint(lcp) !== isWordCodePoint(cp);
      units[i] = keep ? c : lower.charCodeAt(0);
      units[i + 1] = keep ? s.charCodeAt(i + 1) : lower.charCodeAt(1);
      i++;
      continue;
    }
    units[i] = FOLD_TABLE[c] ?? c;
  }
  return fromUnits(units);
};

/** Collapses every whitespace run to one U+0020 (the comparison form of a phrase). */
export const normalizeSpaces = (s: string): string => s.replace(/\s+/gu, ' ');

/** Upper-cases the first code point (sentence-initial capitalisation). */
export const upperFirst = (s: string): string => {
  const first = s.codePointAt(0);
  if (first === undefined) return s;
  const head = String.fromCodePoint(first);
  return head.toUpperCase() + s.slice(head.length);
};

/** Escapes a code point for use OUTSIDE a character class under the `u` flag. */
export const escapeLiteral = (ch: string): string => {
  if (ch === ' ') return '\\s+';
  return /^[\\^$.*+?()[\]{}|/]$/u.test(ch) ? `\\${ch}` : ch;
};

/** Escapes a code point for use INSIDE a character class under the `u` flag. */
export const escapeClassChar = (ch: string): string => (/^[\\\][^-]$/u.test(ch) ? `\\${ch}` : ch);

/** Unicode-aware replacement for `\b…\b` around a pattern body (requires the `u` flag). */
export const BOUNDARY_BEFORE = '(?<![\\p{L}\\p{N}\\p{M}])';
export const BOUNDARY_AFTER = '(?![\\p{L}\\p{N}\\p{M}])';

/**
 * NFC view of a string with an offset map back to the original.
 *
 * Matching runs on `nfc`; each match boundary is mapped with `toOriginal`, so the
 * marks wrap the author's ORIGINAL code units (information preservation). The
 * view is built per extended grapheme cluster (UAX #29): composition happens
 * inside clusters (base + combining marks, Hangul jamo). Inside clusters that
 * NFC leaves unchanged every offset maps exactly; inside a recomposed cluster
 * only its edges map (`undefined` otherwise), so a mark can never split a
 * recomposed character. If per-cluster normalisation disagrees with whole-string
 * NFC the view is unavailable (`undefined`) and the caller must skip the text —
 * never guess.
 */
export interface NfcView {
  readonly nfc: string;
  /** Maps an offset of `nfc` (0..nfc.length) to the original string, if exact. */
  readonly toOriginal: (offset: number) => number | undefined;
}

const graphemes = new Intl.Segmenter('und', { granularity: 'grapheme' });

export const nfcView = (s: string): NfcView | undefined => {
  const whole = s.normalize('NFC');
  if (whole === s) return { nfc: s, toOriginal: (i) => (i >= 0 && i <= s.length ? i : undefined) };
  const map: number[] = [];
  let nfc = '';
  for (const { segment, index } of graphemes.segment(s)) {
    const normalized = segment.normalize('NFC');
    if (normalized === segment) {
      for (let k = 0; k < segment.length; k++) map.push(index + k);
    } else {
      map.push(index);
      for (let k = 1; k < normalized.length; k++) map.push(-1);
    }
    nfc += normalized;
  }
  if (nfc !== whole) return undefined;
  map.push(s.length);
  return {
    nfc,
    toOriginal: (i) => {
      const o = map[i];
      return o === undefined || o < 0 ? undefined : o;
    },
  };
};
