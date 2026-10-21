/** Scales (d3-scale model): invert ∘ map = id, monotone, bounds map to bounds; degenerate and log cases. */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { clamp, linearScale, logScale } from '../../../src/core/labs/scale.ts';

const finite = fc.double({ min: -1e6, max: 1e6, noNaN: true });

describe('linear scale', () => {
  test.prop([finite, finite, finite, finite, finite])(
    'inverts, is monotone and maps the bounds',
    (d0, d1, r0, r1, x) => {
      fc.pre(Math.abs(d1 - d0) > 1e-6 && Math.abs(r1 - r0) > 1e-6);
      const s = linearScale(d0, d1, r0, r1);
      expect(s.map(d0)).toBeCloseTo(r0, 6);
      expect(s.map(d1)).toBeCloseTo(r1, 6);
      const y = s.map(x);
      expect(s.invert(y)).toBeCloseTo(x, 3);
      const up = (d1 - d0) * (r1 - r0) > 0;
      const y2 = s.map(x + 1);
      expect(up ? y2 > y : y2 < y).toBe(true);
    },
  );

  it('maps a degenerate domain to the middle of the range and inverts to d0', () => {
    const s = linearScale(5, 5, 0, 10);
    expect(s.map(5)).toBe(5);
    expect(s.map(999)).toBe(5);
    expect(s.invert(7)).toBe(5);
    expect(s.domain).toEqual([5, 5]);
    expect(s.range).toEqual([0, 10]);
  });

  it('inverts to d0 when the range is degenerate', () => {
    const s = linearScale(0, 10, 3, 3);
    expect(s.map(4)).toBe(3);
    expect(s.invert(3)).toBe(0);
  });
});

describe('logarithmic scale', () => {
  it('needs a positive, finite domain', () => {
    expect(logScale(0, 10, 0, 1).ok).toBe(false);
    expect(logScale(1, -10, 0, 1).ok).toBe(false);
    expect(logScale(1, Number.POSITIVE_INFINITY, 0, 1).ok).toBe(false);
  });

  test.prop([fc.double({ min: 1e-3, max: 1e3, noNaN: true })])('inverts on the domain; x ≤ 0 maps to NaN', (x) => {
    const s = logScale(1e-3, 1e3, 0, 100);
    if (!s.ok) throw new Error(s.error);
    const y = s.value.map(x);
    expect(y).toBeGreaterThanOrEqual(-1e-9);
    expect(y).toBeLessThanOrEqual(100 + 1e-9);
    expect(s.value.invert(y)).toBeCloseTo(x, 6);
    expect(Number.isNaN(s.value.map(0))).toBe(true);
    expect(s.value.map(1)).toBeCloseTo(50, 9);
  });
});

describe('clamp', () => {
  it('keeps values inside the interval and NaN as NaN', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(Number.isNaN(clamp(Number.NaN, 0, 1))).toBe(true);
  });
});
