/** The logistic map: constants, orbits, period detection, the sign of λ and the tone map of densities. */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  PERIOD_DOUBLINGS,
  PERIOD_THREE,
  R_INFINITY,
  detectPeriod,
  exponentSign,
  logisticOrbit,
  logisticStep,
  toneMap,
} from '../../../src/core/labs/logistic.ts';

describe('map and orbit', () => {
  it('iterates r·x·(1 − x), keeps the orbit in [0, 1] and starts at x0', () => {
    expect(logisticStep(4, 0.5)).toBe(1);
    expect(logisticOrbit(2.8, 0.2, 3)).toEqual([0.2, 2.8 * 0.2 * 0.8, logisticStep(2.8, 2.8 * 0.2 * 0.8)]);
    expect(logisticOrbit(4, 0.3, 0)).toEqual([]);
  });

  test.prop([fc.double({ min: 0, max: 4, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })])(
    'stays in the unit interval',
    (r, x0) => {
      for (const x of logisticOrbit(r, x0, 200)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
    },
  );

  it('orders the period-doubling cascade before r∞ and the period-3 window', () => {
    const rs = PERIOD_DOUBLINGS.map((p) => p.r);
    expect(rs).toEqual([...rs].sort((a, b) => a - b));
    expect(PERIOD_DOUBLINGS.map((p) => p.period)).toEqual([2, 4, 8, 16]);
    expect(rs[rs.length - 1]).toBeLessThan(R_INFINITY);
    expect(R_INFINITY).toBeLessThan(PERIOD_THREE);
    expect(PERIOD_THREE).toBeCloseTo(3.828427, 6);
  });
});

describe('period detection', () => {
  it('finds the fixed point, the 2- and 4-cycles, and reports chaos as null', () => {
    const orbit = (r: number) => logisticOrbit(r, 0.2, 2000);
    expect(detectPeriod(orbit(2.8))).toBe(1);
    expect(detectPeriod(orbit(3.2))).toBe(2);
    expect(detectPeriod(orbit(3.5))).toBe(4);
    expect(detectPeriod(orbit(3.84))).toBe(3);
    expect(detectPeriod(orbit(4))).toBeNull();
    expect(detectPeriod([0.5, 0.5, 0.5])).toBeNull();
    expect(detectPeriod(orbit(3.2), 1)).toBeNull();
  });
});

describe('exponent sign and tone map', () => {
  it('reads a band around zero as zero', () => {
    expect(exponentSign(0.5)).toBe('positive');
    expect(exponentSign(-0.5)).toBe('negative');
    expect(exponentSign(0.001)).toBe('zero');
    expect(exponentSign(0.01, 0.1)).toBe('zero');
  });

  it('maps densities monotonically to 0…255, with the maximum at 255 and zeros at 0', () => {
    const tones = toneMap([0, 1, 10, 100], 100);
    expect(tones[0]).toBe(0);
    expect(tones[3]).toBe(255);
    expect(tones[1]).toBeGreaterThan(0);
    expect(tones[2]).toBeGreaterThan(tones[1] ?? 0);
    expect(tones[3]).toBeGreaterThan(tones[2] ?? 0);
    expect([...toneMap([3, 4], 0)]).toEqual([0, 0]);
    expect(toneMap([], 5)).toHaveLength(0);
  });
});
