/**
 * The shared leftmost-longest resolver.
 *
 * Every engine reduces to a function `next(pos)` that returns the best
 * candidate STARTING AT OR AFTER `pos`, where "best" is the total order
 *
 *   smaller start  >  larger end  >  smaller form rank
 *
 * (leftmost, then longest, then dictionary priority). The resolver accepts that
 * candidate, jumps to its end and asks again, which yields the unique greedy
 * sequence of non-overlapping matches — POSIX "leftmost-longest" semantics,
 * the same that the naive reference (scan every position, take the longest
 * valid term) produces. Because all engines share this function, they can only
 * differ in how they find candidates, and the equivalence property tests pin
 * that down.
 */
import type { SurfaceForm } from './forms.ts';
import type { LexiconEntry } from './types.ts';

export interface Candidate {
  readonly start: number;
  readonly end: number;
  readonly form: SurfaceForm;
}

/** A dictionary hit: UTF-16 offsets [start, end) in the matched (NFC) text. */
export interface Match {
  readonly start: number;
  readonly end: number;
  readonly entry: LexiconEntry;
}

/** Negative when `a` is better than `b` (see module comment). */
export const compareCandidates = (a: Candidate, b: Candidate): number =>
  a.start - b.start || b.end - a.end || a.form.rank - b.form.rank;

/** Better of two optional candidates. */
export const best = (a: Candidate | undefined, b: Candidate | undefined): Candidate | undefined =>
  a === undefined ? b : b === undefined ? a : compareCandidates(a, b) <= 0 ? a : b;

export const resolveLeftmostLongest = (next: (pos: number) => Candidate | undefined): readonly Match[] => {
  const out: Match[] = [];
  let pos = 0;
  for (let c = next(pos); c !== undefined; c = next(pos)) {
    out.push({ start: c.start, end: c.end, entry: c.form.entry });
    // Keys are never empty, so end > start and the loop always advances.
    pos = Math.max(c.end, c.start + 1);
  }
  return out;
};

/** `next` over a list of candidates (any order): sorts once, then walks forward. */
export const cursorOver = (candidates: readonly Candidate[]): ((pos: number) => Candidate | undefined) => {
  const sorted = [...candidates].sort(compareCandidates);
  let i = 0;
  return (pos) => {
    while (i < sorted.length && (sorted[i]?.start ?? Infinity) < pos) i++;
    return sorted[i];
  };
};
