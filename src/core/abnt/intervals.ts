/**
 * Interval nesting: from overlapping proposals to a well-formed mark forest.
 *
 * Marks become elements, and elements must nest: two spans either are disjoint
 * or one contains the other. Proposals are accepted greedily by priority (lower
 * number first); a proposal that CROSSES an accepted span (partial overlap), or
 * duplicates its exact range, is rejected. Containment in either direction is
 * fine ("C. E. Shannon" as a no-break group containing the proper name
 * "Shannon"). Rejection only loses structure, never text.
 *
 * LAW (tests/unit/abnt/intervals.test.ts): the text leaves of `toSegments`
 * tile [0, length) exactly, in order — so concatenating them reproduces the
 * input string (the stage's plain-text invariant).
 */

export interface Span<T> {
  readonly start: number;
  readonly end: number;
  /** Lower wins. */
  readonly priority: number;
  readonly value: T;
}

export type Segment<T> =
  | { readonly kind: 'text'; readonly start: number; readonly end: number }
  | {
      readonly kind: 'mark';
      readonly start: number;
      readonly end: number;
      readonly value: T;
      readonly children: readonly Segment<T>[];
    };

const crosses = (a: { start: number; end: number }, b: { start: number; end: number }): boolean =>
  (a.start < b.start && b.start < a.end && a.end < b.end) || (b.start < a.start && a.start < b.end && b.end < a.end);

const sameRange = (a: { start: number; end: number }, b: { start: number; end: number }): boolean =>
  a.start === b.start && a.end === b.end;

/** Greedy acceptance by priority (stable for equal priorities). Empty or out-of-range spans are rejected. */
export const nestSpans = <T>(
  length: number,
  proposals: readonly Span<T>[],
): { readonly accepted: readonly Span<T>[]; readonly rejected: readonly Span<T>[] } => {
  const accepted: Span<T>[] = [];
  const rejected: Span<T>[] = [];
  const ordered = proposals.map((p, i) => ({ p, i })).sort((a, b) => a.p.priority - b.p.priority || a.i - b.i);
  for (const { p } of ordered) {
    const valid = p.start >= 0 && p.end <= length && p.start < p.end;
    if (valid && !accepted.some((a) => crosses(a, p) || sameRange(a, p))) accepted.push(p);
    else rejected.push(p);
  }
  return { accepted, rejected };
};

/** Builds the forest of a set of pairwise nested-or-disjoint spans over [0, length). */
export const toSegments = <T>(length: number, spans: readonly Span<T>[]): readonly Segment<T>[] => {
  // Outer spans first: by start, then longer first, then priority.
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end || a.priority - b.priority);
  const build = (from: number, to: number, items: readonly Span<T>[]): readonly Segment<T>[] => {
    const out: Segment<T>[] = [];
    let pos = from;
    let i = 0;
    while (i < items.length) {
      const outer = items[i];
      if (outer === undefined) break;
      // Children of `outer` are the following spans that lie inside it.
      let j = i + 1;
      while (j < items.length && (items[j]?.start ?? Infinity) < outer.end) j++;
      if (outer.start > pos) out.push({ kind: 'text', start: pos, end: outer.start });
      out.push({
        kind: 'mark',
        start: outer.start,
        end: outer.end,
        value: outer.value,
        children: build(outer.start, outer.end, items.slice(i + 1, j)),
      });
      pos = outer.end;
      i = j;
    }
    if (pos < to) out.push({ kind: 'text', start: pos, end: to });
    return out;
  };
  return build(0, length, sorted);
};

/** The text leaves of a forest, in order (used by the injectivity law). */
export const leaves = <T>(
  segments: readonly Segment<T>[],
): readonly { readonly start: number; readonly end: number }[] =>
  segments.flatMap((s) => (s.kind === 'text' ? [{ start: s.start, end: s.end }] : leaves(s.children)));
