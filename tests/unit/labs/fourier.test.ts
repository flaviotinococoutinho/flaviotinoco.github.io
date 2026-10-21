/**
 * Fourier partial sums and the Gibbs phenomenon: harmonics and coefficients, convergence away from the
 * jumps, the Gibbs crest of the square and sawtooth waves, no crest for the triangle wave.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  GIBBS_FRACTION,
  GIBBS_PEAK,
  WAVEFORMS,
  coefficient,
  firstCrest,
  harmonics,
  partialSum,
  waveform,
} from '../../../src/core/labs/fourier.ts';

describe('series', () => {
  it('lists odd harmonics for square and triangle waves, every harmonic for the sawtooth', () => {
    expect(harmonics('square', 3)).toEqual([1, 3, 5]);
    expect(harmonics('triangle', 2)).toEqual([1, 3]);
    expect(harmonics('sawtooth', 3)).toEqual([1, 2, 3]);
    expect(harmonics('square', 0)).toEqual([]);
    expect(harmonics('sawtooth', -2)).toEqual([]);
  });

  it('has the textbook coefficients', () => {
    expect(coefficient('square', 1)).toBeCloseTo(4 / Math.PI, 12);
    expect(coefficient('sawtooth', 2)).toBeCloseTo(-1 / Math.PI, 12);
    expect(coefficient('triangle', 3)).toBeCloseTo(-8 / (9 * Math.PI * Math.PI), 12);
  });

  test.prop([fc.constantFrom(...WAVEFORMS), fc.double({ min: 0.3, max: Math.PI - 0.3, noNaN: true })])(
    'converges to the waveform away from the jumps',
    (wave, x) => {
      expect(Math.abs(partialSum(wave, 400, false, x) - waveform(wave, x))).toBeLessThan(0.02);
    },
  );

  it('evaluates the waveforms, with the midpoint value at a jump', () => {
    expect(waveform('square', 1)).toBe(1);
    expect(waveform('square', -1)).toBe(-1);
    expect(waveform('square', 0)).toBe(0);
    expect(waveform('square', Math.PI)).toBe(0);
    expect(waveform('sawtooth', Math.PI / 2)).toBeCloseTo(0.5, 12);
    expect(waveform('sawtooth', Math.PI)).toBe(0);
    expect(waveform('sawtooth', 3 * Math.PI)).toBe(0);
    expect(waveform('sawtooth', -Math.PI / 2)).toBeCloseTo(-0.5, 12);
    expect(waveform('triangle', Math.PI / 2)).toBeCloseTo(1, 12);
    expect(waveform('triangle', 0)).toBe(0);
    expect(partialSum('square', 0, false, 1)).toBe(0);
  });
});

describe('Gibbs crest', () => {
  it('tends to (2/π)·Si(π) ≈ 1.179 next to a jump, and the σ-factors tame it', () => {
    expect(GIBBS_FRACTION).toBeCloseTo((GIBBS_PEAK - 1) / 2, 15);
    const crest = firstCrest('square', 60, false);
    expect(crest).not.toBeNull();
    expect(crest?.peak).toBeCloseTo(GIBBS_PEAK, 2);
    expect(crest?.fraction).toBeCloseTo(GIBBS_FRACTION, 2);
    expect(crest?.x).toBeGreaterThan(0);
    // The sawtooth (every harmonic) approaches the limit from below, with an error of order 1/N.
    const saw200 = firstCrest('sawtooth', 200, false);
    const saw2000 = firstCrest('sawtooth', 2000, false);
    expect(saw200?.peak).toBeLessThan(saw2000?.peak ?? 0);
    expect(saw2000?.peak).toBeCloseTo(GIBBS_PEAK, 2);
    expect(saw2000?.x).toBeLessThan(Math.PI);
    expect(saw2000?.x).toBeGreaterThan(Math.PI - 0.01);
    const smooth = firstCrest('square', 60, true);
    expect(smooth?.fraction).toBeLessThan(0.02);
    expect(smooth?.fraction).toBeGreaterThan(0.005);
  });

  it('has no crest for the triangle wave or without harmonics', () => {
    expect(firstCrest('triangle', 50, false)).toBeNull();
    expect(firstCrest('square', 0, false)).toBeNull();
  });
});
