/** Sampling a sinusoid: the alias frequency (min(r, fs − r)), the regime and the observation window. */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { aliasFrequency, samplingRegime, sinusoid, windowSeconds } from '../../../src/core/labs/sampling.ts';

const freq = fc.double({ min: 0, max: 20000, noNaN: true });
const rate = fc.double({ min: 1, max: 48000, noNaN: true });

describe('alias frequency', () => {
  test.prop([freq, rate])('lies in [0, fs/2], is even in f and periodic in f with period fs', (f, fs) => {
    const a = aliasFrequency(f, fs);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(fs / 2 + 1e-9);
    expect(aliasFrequency(-f, fs)).toBe(a);
    expect(aliasFrequency(f + fs, fs)).toBeCloseTo(a, 6);
  });

  it('matches the textbook cases and refuses a non-positive rate', () => {
    expect(aliasFrequency(3000, 12000)).toBe(3000);
    expect(aliasFrequency(7000, 12000)).toBe(5000);
    expect(aliasFrequency(12000, 12000)).toBe(0);
    expect(Number.isNaN(aliasFrequency(100, 0))).toBe(true);
    expect(Number.isNaN(aliasFrequency(Number.NaN, 100))).toBe(true);
    expect(Number.isNaN(aliasFrequency(100, Number.POSITIVE_INFINITY))).toBe(true);
  });
});

describe('regime and window', () => {
  it('names the regime relative to 2f, with a tolerance at the critical rate', () => {
    expect(samplingRegime(3000, 12000)).toBe('faithful');
    expect(samplingRegime(3000, 6000)).toBe('critical');
    expect(samplingRegime(3000, 6000 + 1e-7)).toBe('critical');
    expect(samplingRegime(3000, 5000)).toBe('aliased');
    expect(samplingRegime(-3000, 12000)).toBe('faithful');
  });

  it('observes a fixed number of periods and evaluates the sinusoid', () => {
    expect(windowSeconds(2)).toBe(3);
    expect(windowSeconds(2, 10)).toBe(5);
    expect(windowSeconds(0)).toBe(6 / 1e-9);
    expect(sinusoid(1, 90)(0)).toBeCloseTo(1, 12);
    expect(sinusoid(1, 0)(0.25)).toBeCloseTo(1, 12);
  });
});
