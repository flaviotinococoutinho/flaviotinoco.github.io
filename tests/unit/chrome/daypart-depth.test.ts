import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  DAYPARTS,
  DAYPART_BOUNDARIES,
  daypartExpression,
  daypartOf,
  normaliseHour,
} from '../../../src/core/chrome/daypart.ts';
import { DEPTHS, depthOffset, parseDepth, progressToken, viewProgress } from '../../../src/core/chrome/depth.ts';

describe('daypart', () => {
  it('follows the documented table', () => {
    const expected = ['night', 'night', 'night', 'night', 'night', 'night', 'dawn', 'dawn', 'dawn', 'dawn'];
    expected.push(...Array<string>(7).fill('day'), ...Array<string>(4).fill('dusk'), ...Array<string>(3).fill('night'));
    expect(Array.from({ length: 24 }, (_, h) => daypartOf(h))).toEqual(expected);
  });

  test.prop([fc.double({ noNaN: true, min: -1e6, max: 1e6 }), fc.integer({ min: -50, max: 50 })])(
    'is periodic with period 24',
    (h, k) => {
      // Compare on integral hours to avoid floating-point drift at the boundaries.
      const hour = Math.floor(h);
      expect(daypartOf(hour + 24 * k)).toBe(daypartOf(hour));
    },
  );

  test.prop([fc.double()])('is total over every double (including NaN and ±∞)', (h) => {
    expect(DAYPARTS).toContain(daypartOf(h));
    const n = normaliseHour(h);
    expect(n >= 0 && n < 24).toBe(true);
  });

  test.prop([fc.double({ noNaN: true, min: 0, max: 23.999 })])('depends only on the whole hour', (h) => {
    expect(daypartOf(h)).toBe(daypartOf(Math.floor(h)));
  });

  it('compiles to an expression equal to the function', () => {
    // The compiled artefact itself is evaluated, exactly as the pre-paint script embeds it
    // (in a fresh V8 context, so it can only see the variable it is given).
    const expression = daypartExpression('h');
    for (let h = 0; h < 24; h++) expect(runInNewContext(expression, { h })).toBe(daypartOf(h));
  });

  it('boundaries are strictly increasing within a day', () => {
    const bounds = DAYPART_BOUNDARIES.map(([b]) => b);
    expect(bounds).toEqual([...bounds].sort((a, b) => a - b));
    expect(new Set(bounds).size).toBe(bounds.length);
    expect(bounds.every((b) => b > 0 && b < 24)).toBe(true);
  });
});

describe('depth mapping', () => {
  it('parses the closed set of depths only', () => {
    for (const d of DEPTHS) expect(parseDepth(String(d))).toBe(d);
    for (const bad of ['4', '-4', '1.5', '', 'x', ' ', '01', null, undefined]) expect(parseDepth(bad)).toBeNull();
  });

  test.prop([
    fc.double({ min: -1e5, max: 1e5, noNaN: true }),
    fc.double({ min: 0, max: 1e5, noNaN: true }),
    fc.double({ min: 1, max: 1e5, noNaN: true }),
  ])('progress stays in [0, 1]', (top, height, vh) => {
    const p = viewProgress(top, height, vh);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  test.prop([
    fc.double({ min: -1e4, max: 1e4, noNaN: true }),
    fc.double({ min: 0, max: 1e4, noNaN: true }),
    fc.double({ min: 1, max: 1e4, noNaN: true }),
    fc.double({ min: 0, max: 1e3, noNaN: true }),
  ])('progress is monotone in scroll (top decreases as the page scrolls down)', (top, height, vh, scroll) => {
    expect(viewProgress(top - scroll, height, vh)).toBeGreaterThanOrEqual(viewProgress(top, height, vh));
  });

  it('matches the cover range end points and centre', () => {
    const vh = 800;
    const h = 400;
    expect(viewProgress(vh, h, vh)).toBe(0); // top edge entering at the bottom
    expect(viewProgress(-h, h, vh)).toBe(1); // bottom edge leaving at the top
    expect(viewProgress((vh - h) / 2, h, vh)).toBeCloseTo(0.5, 12); // centred
  });

  it('degenerate geometry yields the resting value', () => {
    expect(viewProgress(Number.NaN, 10, 100)).toBe(0.5);
    expect(viewProgress(0, 0, 0)).toBe(0.5);
  });

  test.prop([
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.constantFrom(...DEPTHS),
    fc.double({ min: 0, max: 100, noNaN: true }),
  ])('offset is antisymmetric about the centre and vanishes without motion', (p, d, unit) => {
    expect(depthOffset(p, d, unit, 0) === 0).toBe(true);
    expect(depthOffset(p, d, unit, 1) + depthOffset(1 - p, d, unit, 1)).toBeCloseTo(0, 9);
    expect(depthOffset(0.5, d, unit, 1) === 0).toBe(true);
  });

  it('formats progress tokens with fixed precision', () => {
    expect(progressToken(0.123456)).toBe('0.123');
    expect(progressToken(2)).toBe('1.000');
    expect(progressToken(-1)).toBe('0.000');
  });
});
