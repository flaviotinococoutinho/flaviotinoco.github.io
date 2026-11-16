/**
 * Reading memory (src/core/reading/memory.ts): codec law, bounded size, the furthest point never shrinks,
 * and the offer to continue.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  MEMORY_MAX_AGE_DAYS,
  MEMORY_MAX_ENTRIES,
  RESUME_MAX,
  RESUME_MIN,
  dayOf,
  decodeMemory,
  encodeMemory,
  forget,
  remember,
  sectionAt,
  shouldOffer,
  type ReadingMemory,
} from '../../../src/core/reading/memory.ts';

const page = fc.stringMatching(/^\/[a-z0-9/-]{1,40}$/);
const section = fc.option(fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/), { nil: null });
const step = fc.record({
  page,
  progress: fc.double({ min: 0, max: 1, noNaN: true }),
  section,
  day: fc.integer({ min: 0, max: 40_000 }),
});
const memory: fc.Arbitrary<ReadingMemory> = fc
  .array(step, { maxLength: 60 })
  .map((steps) => steps.reduce<ReadingMemory>((m, s) => remember(m, s.page, s.progress, s.section, s.day), {}));

describe('codec', () => {
  test.prop([memory])('decode ∘ encode = id', (m) => {
    expect(decodeMemory(encodeMemory(m))).toEqual(m);
  });

  test.prop([fc.string()])('decoding never throws and keeps only well-formed entries', (text) => {
    const m = decodeMemory(text);
    for (const [p, e] of Object.entries(m)) {
      expect(p.startsWith('/')).toBe(true);
      expect(e.progress >= 0 && e.progress <= 1).toBe(true);
      expect(e.furthest).toBeGreaterThanOrEqual(e.progress);
    }
  });

  it('drops what is not a record', () => {
    expect(
      decodeMemory('{"/pt/ensaios/x/":{"p":0.5,"d":20000},"no-slash":{"p":0.5,"d":1},"/y/":{"p":"x","d":1}}'),
    ).toEqual({
      '/pt/ensaios/x/': { progress: 0.5, furthest: 0.5, section: null, day: 20000 },
    });
    expect(decodeMemory('not json')).toEqual({});
    expect(decodeMemory(null)).toEqual({});
    expect(decodeMemory('[1,2]')).toEqual({});
  });
});

describe('remember', () => {
  test.prop([fc.array(step, { maxLength: 120 })])('never keeps more than the bound', (steps) => {
    const m = steps.reduce<ReadingMemory>((acc, s) => remember(acc, s.page, s.progress, s.section, s.day), {});
    expect(Object.keys(m).length).toBeLessThanOrEqual(MEMORY_MAX_ENTRIES);
  });

  test.prop([memory, page, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })])(
    'the furthest point only grows: the candle does not grow back',
    (m, p, a, b) => {
      const once = remember(m, p, a, null, 30_000);
      const twice = remember(once, p, b, null, 30_001);
      expect(twice[p]?.furthest ?? 0).toBeGreaterThanOrEqual(once[p]?.furthest ?? 0);
      expect(twice[p]?.progress).toBeCloseTo(b, 3);
    },
  );

  test.prop([memory, page, fc.double({ min: 0, max: 1, noNaN: true })])(
    'the page just read is always kept',
    (m, p, x) => {
      expect(remember(m, p, x, null, 50_000)[p]).toBeDefined();
    },
  );

  it('forgets the page asked and nothing else', () => {
    const m = remember(remember({}, '/a/', 0.3, null, 1), '/b/', 0.4, null, 2);
    expect(Object.keys(forget(m, '/a/'))).toEqual(['/b/']);
  });

  it('ignores what is not a page or a day', () => {
    expect(remember({}, 'relative', 0.5, null, 1)).toEqual({});
    expect(remember({}, '/a/', Number.NaN, null, 1)).toEqual({});
    expect(remember({}, '/a/', 0.5, null, -1)).toEqual({});
  });
});

describe('the offer to continue', () => {
  it('needs a reader who got somewhere, did not finish, and came back in time', () => {
    const entry = { progress: 0.4, furthest: 0.4, section: 'cadeia', day: 1000 };
    expect(shouldOffer(entry, 1000)).toBe(true);
    expect(shouldOffer(entry, 1000 + MEMORY_MAX_AGE_DAYS + 1)).toBe(false);
    expect(shouldOffer({ ...entry, progress: RESUME_MIN / 2 }, 1000)).toBe(false);
    expect(shouldOffer({ ...entry, progress: (RESUME_MAX + 1) / 2 }, 1000)).toBe(false);
    expect(shouldOffer(undefined, 1000)).toBe(false);
  });

  it('counts days since the epoch', () => {
    expect(dayOf(0)).toBe(0);
    expect(dayOf(86_400_000 * 20_407 + 5)).toBe(20_407);
    expect(dayOf(Number.NaN)).toBe(0);
  });

  it('places the reader in the last section whose heading has passed the line', () => {
    const headings = [
      { id: 'a', top: 100 },
      { id: 'b', top: 900 },
      { id: 'c', top: 2000 },
    ];
    expect(sectionAt(headings, 50)).toBeNull();
    expect(sectionAt(headings, 1000)).toBe('b');
    expect(sectionAt(headings, 5000)).toBe('c');
  });
});
