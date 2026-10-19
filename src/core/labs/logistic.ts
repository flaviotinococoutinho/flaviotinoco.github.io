/**
 * The logistic map x ↦ r·x·(1 − x) (R. M. May, "Simple mathematical models with very complicated
 * dynamics", Nature 261, 1976): reference values, period detection and the tone mapping of the
 * bifurcation density image computed by `dynamics.wasm`.
 *
 * Period-doubling points r_n (onset of the 2^n-cycle) and their accumulation point r_∞, as tabulated in
 * E. W. Weisstein, "Logistic Map", CRC Concise Encyclopedia of Mathematics (archive.lib.msu.edu/crcmath,
 * consulted 2026-10-19; to be revalidated): 3, 1 + √6 = 3.449490…, 3.544090, 3.564407, r_∞ = 3.569945672.
 * The ratios of successive intervals tend to Feigenbaum's δ = 4.669201… (M. J. Feigenbaum, J. Stat. Phys.
 * 19, 1978). The period-3 window opens at r = 1 + √8 = 3.828427… (T.-Y. Li & J. A. Yorke, "Period three
 * implies chaos", Amer. Math. Monthly 82, 1975, for its significance).
 */

export interface PeriodDoubling {
  readonly r: number;
  /** The period of the cycle that appears at r. */
  readonly period: number;
}

export const PERIOD_DOUBLINGS: readonly PeriodDoubling[] = [
  { r: 3, period: 2 },
  { r: 1 + Math.sqrt(6), period: 4 },
  { r: 3.54409, period: 8 },
  { r: 3.564407, period: 16 },
];

/** Accumulation point of the period-doubling cascade (onset of chaos). */
export const R_INFINITY = 3.569945672;
/** Onset of the period-3 window. */
export const PERIOD_THREE = 1 + Math.sqrt(8);

/** One step of the map. */
export const logisticStep = (r: number, x: number): number => r * x * (1 - x);

/** Orbit x_0 … x_{n−1} (pure copy of `logistic_orbit`, for thumbnails and tests); clamped to [0, 1]. */
export const logisticOrbit = (r: number, x0: number, n: number): readonly number[] => {
  const out: number[] = [];
  let x = x0;
  for (let k = 0; k < n; k++) {
    out.push(x);
    x = Math.min(1, Math.max(0, logisticStep(r, x)));
  }
  return out;
};

/**
 * The smallest period p ≤ maxPeriod such that the last `2p` (at least 8) iterates repeat with period p
 * within `tolerance`; null when none does (chaos, or a transient still decaying).
 */
export const detectPeriod = (orbit: ArrayLike<number>, maxPeriod = 64, tolerance = 1e-6): number | null => {
  const n = orbit.length;
  for (let p = 1; p <= maxPeriod; p++) {
    const span = Math.max(8, 2 * p);
    if (n < span + p) return null;
    let periodic = true;
    for (let i = n - span; i < n && periodic; i++) {
      if (Math.abs((orbit[i] ?? Number.NaN) - (orbit[i - p] ?? Number.NaN)) > tolerance) periodic = false;
    }
    if (periodic) return p;
  }
  return null;
};

export type ExponentSign = 'negative' | 'zero' | 'positive';

/** Sign of a Lyapunov exponent, with a band of ±tolerance read as zero (bifurcation points). */
export const exponentSign = (lambda: number, tolerance = 5e-3): ExponentSign =>
  lambda > tolerance ? 'positive' : lambda < -tolerance ? 'negative' : 'zero';

/**
 * Tone mapping of a density image: alpha = 255·(ln(1 + c)/ln(1 + max))^γ. The logarithm compresses the
 * huge dynamic range of attractor densities (fixed points collect every iterate of a column); γ < 1 lifts
 * the faint chaotic bands.
 */
export const toneMap = (counts: ArrayLike<number>, max: number, gamma = 0.6): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(counts.length);
  if (!(max > 0)) return out;
  const scale = 1 / Math.log1p(max);
  for (let i = 0; i < counts.length; i++) {
    const c = counts[i] ?? 0;
    out[i] = c > 0 ? Math.round(255 * Math.pow(Math.log1p(c) * scale, gamma)) : 0;
  }
  return out;
};
