/**
 * The binary symmetric channel (C. E. Shannon, 1948, §§12–14): each bit is flipped independently with
 * crossover probability p. Its capacity is C(p) = 1 − H2(p) bits per use, with
 * H2(p) = −p log2 p − (1 − p) log2(1 − p) (T. M. Cover & J. A. Thomas, Elements of Information Theory,
 * 2nd ed., 2006, §7.1.4). The island computes C with `information.wasm` (`bsc_capacity`); the pure copy
 * here draws the thumbnail and checks the island in tests.
 *
 * The simulated transmission uses Mulberry32 (T. Ettinger, 2017, public domain), a 32-bit generator with a
 * full 2^32 period, seeded explicitly: the same bits, p and seed always give the same received word, so a
 * permalink reproduces what the reader saw. It illustrates the channel, it is not a statistical test.
 */

/** H2(p) in bits, p clamped to [0, 1]; H2(0) = H2(1) = 0. */
export const binaryEntropy = (p: number): number => {
  if (Number.isNaN(p)) return Number.NaN;
  const q = Math.min(1, Math.max(0, p));
  if (q === 0 || q === 1) return 0;
  return -q * Math.log2(q) - (1 - q) * Math.log2(1 - q);
};

/** Capacity of the binary symmetric channel, 1 − H2(p) bits per channel use. */
export const bscCapacity = (p: number): number => 1 - binaryEntropy(p);

/** Mulberry32: a deterministic stream of uniforms in [0, 1) from a 32-bit seed. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export interface Transmission {
  readonly sent: string;
  readonly received: string;
  /** flips[i] is true when bit i was inverted by the channel. */
  readonly flips: readonly boolean[];
  readonly flipCount: number;
}

/** Sends a string of '0'/'1' through a BSC(p) driven by `seed` (other characters are left unchanged). */
export const transmit = (bits: string, p: number, seed: number): Transmission => {
  const next = mulberry32(seed);
  const flips: boolean[] = [];
  let received = '';
  for (const bit of bits) {
    // One uniform per position keeps the noise of a position independent of p (a coupling): raising p
    // only adds flips, it never moves them, so the reader sees the error count grow monotonically.
    const u = next();
    const flip = (bit === '0' || bit === '1') && u < p;
    flips.push(flip);
    received += flip ? (bit === '0' ? '1' : '0') : bit;
  }
  return { sent: bits, received, flips, flipCount: flips.filter(Boolean).length };
};
