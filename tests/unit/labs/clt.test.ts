/**
 * Central limit lab helpers: φ, erfc, Φ, bins, densities, the edge-wise Kolmogorov–Smirnov distance and
 * the Irwin–Hall density (checked against the uniform and triangular cases and by integration).
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  CLT_RANGE,
  binEdges,
  erfc,
  histogramDensity,
  irwinHallDensity,
  ksDistance,
  normalCdf,
  normalPdf,
  supportBound,
} from '../../../src/core/labs/clt.ts';

describe('normal functions', () => {
  it('φ(0) = 1/√(2π); erfc(0) = 1, erfc(1) = 0.1572992…; Φ(0) = ½, Φ(1.96) ≈ 0.975', () => {
    expect(normalPdf(0)).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 12);
    expect(erfc(0)).toBeCloseTo(1, 6);
    expect(erfc(1)).toBeCloseTo(0.157299207, 6);
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  test.prop([fc.double({ min: -6, max: 6, noNaN: true })])('erfc(x) + erfc(−x) = 2 and Φ is monotone', (x) => {
    expect(erfc(x) + erfc(-x)).toBeCloseTo(2, 6);
    expect(normalCdf(x)).toBeGreaterThanOrEqual(0);
    expect(normalCdf(x)).toBeLessThanOrEqual(1);
    expect(normalCdf(x + 0.5)).toBeGreaterThanOrEqual(normalCdf(x));
  });
});

describe('bins and densities', () => {
  it('splits [−4, 4] into equal bins with bins + 1 edges (at least one bin)', () => {
    expect(binEdges(4)).toEqual([-4, -2, 0, 2, 4]);
    expect(binEdges(0)).toEqual([CLT_RANGE.min, CLT_RANGE.max]);
    expect(binEdges(2, 0, 1)).toEqual([0, 0.5, 1]);
  });

  it('density integrates to one over the histogram; zero without samples or width', () => {
    const counts = [1, 2, 3, 4];
    const density = histogramDensity(counts, 10, 0.5);
    expect(density.reduce((a, b) => a + b * 0.5, 0)).toBeCloseTo(1, 12);
    expect(histogramDensity(counts, 0, 0.5)).toEqual([0, 0, 0, 0]);
    expect(histogramDensity(counts, 10, 0)).toEqual([0, 0, 0, 0]);
  });
});

describe('Kolmogorov–Smirnov distance at the edges', () => {
  it('is 0 without samples and small for a histogram that follows Φ', () => {
    expect(ksDistance([1, 2], 0, binEdges(2))).toBe(0);
    const edges = binEdges(80);
    const samples = 1_000_000;
    const counts = edges.slice(0, -1).map((e, k) => (normalCdf(edges[k + 1] ?? 4) - normalCdf(e)) * samples);
    expect(ksDistance(counts, samples, edges)).toBeLessThan(1e-4);
  });

  it('is large for a histogram concentrated in one bin', () => {
    const edges = binEdges(8);
    const counts = [0, 0, 0, 0, 0, 0, 0, 100];
    expect(ksDistance(counts, 100, edges)).toBeGreaterThan(0.9);
  });
});

describe('Irwin–Hall', () => {
  it('bounds the support by √(3n)', () => {
    expect(supportBound(1)).toBeCloseTo(Math.sqrt(3), 12);
    expect(supportBound(12)).toBe(6);
    expect(supportBound(-2)).toBe(0);
  });

  it('is the uniform density for n = 1 and vanishes outside the support', () => {
    const sigma = Math.sqrt(1 / 12);
    expect(irwinHallDensity(1, 0)).toBeCloseTo(sigma, 12);
    expect(irwinHallDensity(1, 1.5)).toBeCloseTo(sigma, 12);
    expect(irwinHallDensity(1, 2)).toBe(0);
    expect(irwinHallDensity(1, -2)).toBe(0);
  });

  test.prop([fc.integer({ min: 1, max: 8 })])('integrates to one and is symmetric', (n) => {
    const b = supportBound(n);
    const steps = 4000;
    let mass = 0;
    for (let i = 0; i < steps; i++) {
      const z = -b + (2 * b * (i + 0.5)) / steps;
      mass += (irwinHallDensity(n, z) * 2 * b) / steps;
    }
    expect(mass).toBeCloseTo(1, 2);
    expect(irwinHallDensity(n, 0.7)).toBeCloseTo(irwinHallDensity(n, -0.7), 9);
  });
});
