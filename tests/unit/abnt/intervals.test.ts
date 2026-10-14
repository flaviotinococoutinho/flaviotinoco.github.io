import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { leaves, nestSpans, type Segment, type Span, toSegments } from '../../../src/core/abnt/intervals.ts';

const spanArb = (length: number): fc.Arbitrary<Span<number>> =>
  fc
    .tuple(fc.nat(length), fc.nat(length), fc.nat(5), fc.nat(1000))
    .map(([a, b, priority, value]) => ({ start: Math.min(a, b), end: Math.max(a, b), priority, value }));

const forestArb = fc
  .nat(60)
  .chain((length) => fc.tuple(fc.constant(length), fc.array(spanArb(length), { maxLength: 15 })));

const wellNested = (segments: readonly Segment<number>[], from: number, to: number): boolean => {
  let pos = from;
  for (const s of segments) {
    if (s.start !== pos || s.end <= s.start) return false;
    if (s.kind === 'mark' && !wellNested(s.children, s.start, s.end)) return false;
    pos = s.end;
  }
  return pos === to || (segments.length === 0 && from === to);
};

describe('interval nesting', () => {
  test.prop([forestArb])('LAW: text leaves tile [0, length) exactly, in order', ([length, spans]) => {
    const { accepted } = nestSpans(length, spans);
    const tiles = leaves(toSegments(length, accepted));
    let pos = 0;
    for (const t of tiles) {
      expect(t.start).toBe(pos);
      pos = t.end;
    }
    expect(pos).toBe(length);
  });

  test.prop([forestArb])('the forest is well nested and contains exactly the accepted spans', ([length, spans]) => {
    const { accepted, rejected } = nestSpans(length, spans);
    expect(accepted.length + rejected.length).toBe(spans.length);
    const forest = toSegments(length, accepted);
    expect(wellNested(forest, 0, length)).toBe(true);
    const marks = (xs: readonly Segment<number>[]): number =>
      xs.reduce((n, s) => n + (s.kind === 'mark' ? 1 + marks(s.children) : 0), 0);
    expect(marks(forest)).toBe(accepted.length);
  });

  it('keeps containment, rejects crossings, duplicates and empty spans by priority', () => {
    const { accepted, rejected } = nestSpans(13, [
      { start: 7, end: 13, priority: 0, value: 1 }, // "Shannon"
      { start: 0, end: 13, priority: 4, value: 2 }, // "C. E. Shannon"
      { start: 5, end: 9, priority: 5, value: 3 }, // crosses the name
      { start: 7, end: 13, priority: 6, value: 4 }, // duplicate range
      { start: 3, end: 3, priority: 7, value: 5 }, // empty
    ]);
    expect(accepted.map((s) => s.value)).toEqual([1, 2]);
    expect(rejected.map((s) => s.value)).toEqual([3, 4, 5]);
    expect(toSegments(13, accepted)).toEqual([
      {
        kind: 'mark',
        start: 0,
        end: 13,
        value: 2,
        children: [
          { kind: 'text', start: 0, end: 7 },
          { kind: 'mark', start: 7, end: 13, value: 1, children: [{ kind: 'text', start: 7, end: 13 }] },
        ],
      },
    ]);
  });
});
