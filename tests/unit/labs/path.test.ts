/**
 * SVG path data from numbers: one subpath per maximal run of finite points, coordinates rounded and
 * printed without trailing zeros, bars and stems skipped where they would be empty, cobweb vertices.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  barsPath,
  cobwebPoints,
  formatCoordinate,
  functionPath,
  pointsPath,
  polylinePath,
  stemsPath,
} from '../../../src/core/labs/path.ts';
import { linearScale } from '../../../src/core/labs/scale.ts';

const sx = linearScale(0, 10, 0, 100);
const sy = linearScale(0, 1, 100, 0);
const value = fc.oneof(
  fc.double({ min: 0, max: 10, noNaN: true }),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
);

describe('coordinates', () => {
  it('rounds to the requested decimals (0–6) and never prints -0 or trailing zeros', () => {
    expect(formatCoordinate(1.23456)).toBe('1.23');
    expect(formatCoordinate(1.23456, 4)).toBe('1.2346');
    expect(formatCoordinate(2.5, 0)).toBe('3');
    expect(formatCoordinate(-0.0001)).toBe('0');
    expect(formatCoordinate(3.1, 3)).toBe('3.1');
    expect(formatCoordinate(1 / 3, 9)).toBe('0.333333');
  });
});

describe('polyline', () => {
  test.prop([fc.array(value, { maxLength: 30 })])('draws one subpath per run of finite points', (ys) => {
    const xs = ys.map((_, i) => i / 3);
    const d = polylinePath(xs, ys, sx, sy);
    const runs: number[] = [];
    let run = 0;
    for (const y of ys) {
      if (Number.isFinite(y)) run++;
      else {
        if (run > 0) runs.push(run);
        run = 0;
      }
    }
    if (run > 0) runs.push(run);
    expect((d.match(/M/g) ?? []).length).toBe(runs.length);
    expect((d.match(/Z/g) ?? []).length).toBe(runs.filter((r) => r === 1).length);
    expect((d.match(/L/g) ?? []).length).toBe(runs.reduce((a, r) => a + r - 1, 0));
    expect(d).toMatch(/^(?:M-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?(?:L-?\d+(?:\.\d+)? -?\d+(?:\.\d+)?)*Z?)*$/);
  });

  it('prints scaled, rounded coordinates', () => {
    expect(polylinePath([0, 5, 10], [0, 0.5, 1], sx, sy)).toBe('M0 100L50 50L100 0');
    expect(polylinePath([0], [1], sx, sy)).toBe('M0 0Z');
    expect(polylinePath([], [], sx, sy)).toBe('');
    expect(polylinePath([0, 5], [0, Number.NaN, 1], sx, sy)).toBe('M0 100Z');
  });
});

describe('points, functions, bars and stems', () => {
  it('draws dots as zero-length subpaths and skips non-finite points', () => {
    expect(pointsPath([0, 10, 5], [0, 1, Number.NaN], sx, sy)).toBe('M0 100ZM100 0Z');
  });

  it('samples a function at evenly spaced points (at least two)', () => {
    expect(functionPath((x) => x / 10, 0, 10, 3, sx, sy)).toBe('M0 100L50 50L100 0');
    expect(functionPath((x) => x / 10, 0, 10, 1, sx, sy)).toBe('M0 100L100 0');
  });

  it('draws bars as closed rectangles, skipping empty and non-finite ones', () => {
    expect(barsPath([0, 5, 10], [1, 0], sx, sy)).toBe('M0 100H50V0H0Z');
    expect(barsPath([0, 5, 10], [Number.NaN, 0.5], sx, sy)).toBe('M50 100H100V50H50Z');
    expect(barsPath([0, 5], [0.5, 0.5], sx, sy)).toBe('M0 100H50V50H0Z');
    expect(barsPath([0, Number.NaN, 10], [0.5, 0.5], sx, sy)).toBe('');
  });

  it('draws stems from the baseline and skips non-finite points', () => {
    expect(stemsPath([0, 10], [1, Number.NaN], sx, sy)).toBe('M0 100V0');
    expect(stemsPath([0], [0.5], sx, sy, 0.25)).toBe('M0 75V50');
  });

  it('builds the cobweb vertices of an orbit', () => {
    expect(cobwebPoints([])).toEqual({ xs: [], ys: [] });
    expect(cobwebPoints([0.2])).toEqual({ xs: [0.2], ys: [0.2] });
    expect(cobwebPoints([0.2, 0.5, 0.7])).toEqual({ xs: [0.2, 0.2, 0.5, 0.5, 0.7], ys: [0.2, 0.5, 0.5, 0.7, 0.7] });
  });
});
