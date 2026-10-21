/**
 * The binary symmetric channel: H2 and C (Cover & Thomas §7.1.4), the seeded Mulberry32 stream and the
 * simulated transmission (same bits, p and seed → same word; p only adds flips).
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { binaryEntropy, bscCapacity, mulberry32, transmit } from '../../../src/core/labs/channel.ts';

const probability = fc.double({ min: 0, max: 1, noNaN: true });
const bits = fc.stringMatching(/^[01]{0,40}$/);
const seed = fc.integer({ min: 0, max: 0xffffffff });

describe('binary entropy and capacity', () => {
  it('is 0 at the ends, 1 bit at p = ½, and C(0.11) ≈ ½', () => {
    expect(binaryEntropy(0)).toBe(0);
    expect(binaryEntropy(1)).toBe(0);
    expect(binaryEntropy(0.5)).toBeCloseTo(1, 12);
    expect(bscCapacity(0.11)).toBeCloseTo(0.5, 2);
    expect(bscCapacity(0)).toBe(1);
    expect(Number.isNaN(binaryEntropy(Number.NaN))).toBe(true);
  });

  test.prop([probability])('is symmetric about ½ and bounded by [0, 1]; out-of-range p is clamped', (p) => {
    expect(binaryEntropy(p)).toBeCloseTo(binaryEntropy(1 - p), 12);
    expect(binaryEntropy(p)).toBeGreaterThanOrEqual(0);
    expect(binaryEntropy(p)).toBeLessThanOrEqual(1 + 1e-12);
    expect(binaryEntropy(p + 2)).toBe(0);
    expect(binaryEntropy(-p - 1)).toBe(0);
  });
});

describe('mulberry32', () => {
  test.prop([seed])('is deterministic and uniform in [0, 1)', (s) => {
    const a = mulberry32(s);
    const b = mulberry32(s);
    for (let i = 0; i < 20; i++) {
      const u = a();
      expect(u).toBe(b());
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });

  it('gives different streams for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });
});

describe('transmission', () => {
  test.prop([bits, probability, seed])('is reproducible, preserves length and counts its flips', (word, p, s) => {
    const t = transmit(word, p, s);
    expect(transmit(word, p, s)).toEqual(t);
    expect(t.sent).toBe(word);
    expect(t.received).toHaveLength(word.length);
    expect(t.flips).toHaveLength(word.length);
    expect(t.flipCount).toBe(t.flips.filter(Boolean).length);
    for (let i = 0; i < word.length; i++) {
      expect(t.received[i] !== word[i]).toBe(t.flips[i]);
    }
  });

  it('never flips at p = 0, always flips at p = 1, and leaves other characters alone', () => {
    expect(transmit('0110', 0, 7).received).toBe('0110');
    expect(transmit('0110', 1, 7)).toMatchObject({ received: '1001', flipCount: 4 });
    expect(transmit('0 1x', 1, 7).received).toBe('1 0x');
    expect(transmit('', 0.5, 1)).toEqual({ sent: '', received: '', flips: [], flipCount: 0 });
  });

  test.prop([bits, probability, probability, seed])('raising p only adds flips (coupling)', (word, p1, p2, s) => {
    const [lo, hi] = p1 <= p2 ? [p1, p2] : [p2, p1];
    const a = transmit(word, lo, s);
    const b = transmit(word, hi, s);
    for (let i = 0; i < word.length; i++) if (a.flips[i]) expect(b.flips[i]).toBe(true);
  });
});
