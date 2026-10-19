/**
 * Seeded pseudo-random numbers as a PURE state transition.
 *
 * A generator is a function `state → [value ∈ [0, 1), nextState]`: the caller
 * threads the state explicitly, so the same seed always yields the same stream
 * and no hidden mutable state escapes (the functional core forbids
 * Math.random()). Default algorithm: Mulberry32 (T. Ettinger, 2017), a 32-bit
 * generator with period 2³² — plenty for initial layout positions.
 */

export type PrngState = number;
export type Prng = (state: PrngState) => readonly [number, PrngState];

/** Mulberry32 step. Integer arithmetic via Math.imul keeps it exact and portable across engines. */
export const mulberry32: Prng = (state) => {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
};

/** Normalises any finite number into a 32-bit unsigned seed. */
export const seedOf = (seed: number): PrngState => (Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0);

/** Draws `n` values, returning them with the final state. */
export const draw = (prng: Prng, state: PrngState, n: number): readonly [readonly number[], PrngState] => {
  const out: number[] = [];
  let s = state;
  for (let i = 0; i < n; i += 1) {
    const [v, next] = prng(s);
    out.push(v);
    s = next;
  }
  return [out, s];
};
