/**
 * Heckbert's nice numbers: the step is 1, 2 or 5 × 10^k, ticks are evenly spaced and increasing, loose
 * ticks enclose the data and ticks within a fixed domain stay inside it; degenerate ranges still get a scale.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { looseTicks, niceNumber, stepDecimals, ticksWithin, type Ticks } from '../../../src/core/labs/ticks.ts';

const mantissa = (step: number): number => step / 10 ** Math.floor(Math.log10(step) + 1e-9);
const bound = fc.double({ min: -1e4, max: 1e4, noNaN: true });
const count = fc.integer({ min: 2, max: 12 });

const expectEvenlySpaced = (t: Ticks): void => {
  expect(t.values.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < t.values.length; i++) {
    const v = t.values[i] ?? 0;
    const u = t.values[i - 1] ?? 0;
    expect(v).toBeGreaterThan(u);
    expect(v - u).toBeCloseTo(t.step, 9);
    expect(String(v).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(t.decimals);
  }
};

describe('nice numbers', () => {
  it('rounds to the nearest 1–2–5 and ceils to the smallest 1–2–5 at least x', () => {
    expect(niceNumber(1.4, true)).toBe(1);
    expect(niceNumber(1.6, true)).toBe(2);
    expect(niceNumber(3.5, true)).toBe(5);
    expect(niceNumber(8, true)).toBe(10);
    expect(niceNumber(1.2, false)).toBe(2);
    expect(niceNumber(2, false)).toBe(2);
    expect(niceNumber(2.1, false)).toBe(5);
    expect(niceNumber(6, false)).toBe(10);
    expect(niceNumber(0.03, true)).toBeCloseTo(0.05, 12);
    expect(niceNumber(0, true)).toBe(1);
    expect(niceNumber(Number.NaN, false)).toBe(1);
  });

  it('counts the decimals of a step', () => {
    expect(stepDecimals(1)).toBe(0);
    expect(stepDecimals(20)).toBe(0);
    expect(stepDecimals(0.5)).toBe(1);
    expect(stepDecimals(0.02)).toBe(2);
  });
});

describe('loose ticks', () => {
  test.prop([bound, bound, count])('enclose the range with a nice, even step', (a, b, n) => {
    const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
    fc.pre(hi - lo > 1e-9 * Math.max(Math.abs(lo), Math.abs(hi)) && hi - lo >= 1e-96);
    const r = looseTicks(a, b, n);
    if (!r.ok) throw new Error(r.error);
    const t = r.value;
    expect([1, 2, 5]).toContain(Math.round(mantissa(t.step) * 1e6) / 1e6);
    expect(t.min).toBeLessThanOrEqual(Math.min(a, b) + 1e-9);
    expect(t.max).toBeGreaterThanOrEqual(Math.max(a, b) - 1e-9);
    expect(t.values[0]).toBe(t.min);
    expect(t.values[t.values.length - 1]).toBe(t.max);
    expectEvenlySpaced(t);
  });

  it('widens a degenerate or float-thin range and refuses bad input', () => {
    const zero = looseTicks(0, 0);
    expect(zero.ok && zero.value.min <= -1 && zero.value.max >= 1).toBe(true);
    const five = looseTicks(5, 5);
    expect(five.ok && five.value.min <= 2.5 && five.value.max >= 7.5).toBe(true);
    const thin = looseTicks(1e4, 1e4 + 2e-12);
    expect(thin.ok ? [thin.value.min <= 5e3, thin.value.max >= 1.5e4] : thin.error).toEqual([true, true]);
    // A range below the printable floor is widened to [−1, 1] around zero, as a zero range is.
    const edge = looseTicks(0, 1e-100, 3);
    expect(edge.ok ? [edge.value.min, edge.value.max] : edge.error).toEqual([-1, 1]);
    const tiny = ticksWithin(1e-323, 8.4e-323, 5);
    expect(tiny.ok ? [tiny.value.min, tiny.value.max, tiny.value.values] : tiny.error).toEqual([
      -1,
      1,
      [-1, -0.5, 0, 0.5, 1],
    ]);
    expect(looseTicks(Number.NaN, 1).ok).toBe(false);
    expect(looseTicks(0, Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(looseTicks(0, 1, 1).ok).toBe(false);
    expect(looseTicks(0, 1, 2.5).ok).toBe(false);
  });

  it('prints 0.1 + 0.2 as 0.3', () => {
    const r = looseTicks(0, 0.4, 5);
    expect(r.ok && r.value.values).toEqual([0, 0.1, 0.2, 0.3, 0.4]);
  });
});

describe('ticks within', () => {
  test.prop([bound, bound, count])('stay inside the domain with the same nice step', (a, b, n) => {
    // Thin ranges are widened (tested above); here the domain is kept as given.
    const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
    fc.pre(hi - lo > 1e-9 * Math.max(Math.abs(lo), Math.abs(hi)) && hi - lo >= 1e-96);
    const r = ticksWithin(a, b, n);
    if (!r.ok) throw new Error(r.error);
    const t = r.value;
    for (const v of t.values) {
      expect(v).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-9 * Math.abs(t.step));
      expect(v).toBeLessThanOrEqual(Math.max(a, b) + 1e-9 * Math.abs(t.step));
    }
    expect(t.min).toBe(Math.min(a, b));
    expect(t.max).toBe(Math.max(a, b));
  });

  it('keeps a bound that is itself a multiple of the step', () => {
    const r = ticksWithin(0, 0.3, 5);
    expect(r.ok && r.value.values).toEqual([0, 0.1, 0.2, 0.3]);
    const p = ticksWithin(0, 1, 6);
    expect(p.ok && p.value.values).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});
