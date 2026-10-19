/**
 * Fourier partial sums and the Gibbs phenomenon (J. W. Gibbs, Nature 59, 1898–1899; H. Wilbraham, 1848),
 * as pure functions: the readout of the lab and the static thumbnails use them; the plotted curve comes
 * from `signal.wasm` (`fourier_series`), which implements the same series (docs/adr/0003-wasm-kernels.md §3).
 *
 *   square    q(x) = sign(sin x)          S_H = 4/π Σ_{j≤H} sin(kx)/k,               k = 2j − 1
 *   sawtooth  s(x) = x/π on (−π, π)       S_H = 2/π Σ_{k≤H} (−1)^{k+1} sin(kx)/k
 *   triangle  t(x) = (2/π)·asin(sin x)    S_H = 8/π² Σ_{j≤H} (−1)^{j+1} sin(kx)/k²,  k = 2j − 1
 *
 * Lanczos σ-factors (C. Lanczos, Applied Analysis, 1956) multiply term k by sinc(k/(M + 1)), M the highest
 * harmonic, sinc(u) = sin(πu)/(πu).
 *
 * Near a jump of height 2 the first crest of S_H tends to (2/π)·Si(π) = 1.17897974447216727… (value from
 * Wolfram|Alpha, `2/pi * SinIntegral(pi)`, consulted 2026-10-19; to be revalidated), an overshoot of
 * ≈ 8.949 % of the jump that does not shrink as H grows; with σ-factors it tends to ≈ 1.19 % (measured,
 * docs/adr/0003-wasm-kernels.md). The triangle wave is continuous: its series converges uniformly and has
 * no Gibbs overshoot.
 */
import { absurd } from '../algebra/match.ts';

export const WAVEFORMS = ['square', 'sawtooth', 'triangle'] as const;
export type Waveform = (typeof WAVEFORMS)[number];

/** lim S_H at the first crest next to a jump from −1 to 1: (2/π)·Si(π). */
export const GIBBS_PEAK = 1.1789797444721673;
/** The limiting overshoot as a fraction of the jump (height 2): (GIBBS_PEAK − 1)/2 ≈ 0.0894899. */
export const GIBBS_FRACTION = (GIBBS_PEAK - 1) / 2;

/** The harmonic numbers k summed by the partial sum with `h` terms. */
export const harmonics = (wave: Waveform, h: number): readonly number[] => {
  const n = Math.max(0, Math.trunc(h));
  switch (wave) {
    case 'square':
    case 'triangle':
      return Array.from({ length: n }, (_, j) => 2 * j + 1);
    case 'sawtooth':
      return Array.from({ length: n }, (_, j) => j + 1);
    default:
      return absurd(wave);
  }
};

/** Fourier sine coefficient b_k of the waveform (k a harmonic of {@link harmonics}). */
export const coefficient = (wave: Waveform, k: number): number => {
  switch (wave) {
    case 'square':
      return 4 / (Math.PI * k);
    case 'sawtooth':
      return ((k % 2 === 1 ? 1 : -1) * 2) / (Math.PI * k);
    case 'triangle':
      return ((((k - 1) / 2) % 2 === 0 ? 1 : -1) * 8) / (Math.PI * Math.PI * k * k);
    default:
      return absurd(wave);
  }
};

const sinc = (u: number): number => (u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u));

/** The partial sum with `h` terms at x, optionally with Lanczos σ-factors. */
export const partialSum = (wave: Waveform, h: number, sigma: boolean, x: number): number => {
  const ks = harmonics(wave, h);
  const highest = ks[ks.length - 1] ?? 0;
  let sum = 0;
  for (const k of ks) sum += coefficient(wave, k) * (sigma ? sinc(k / (highest + 1)) : 1) * Math.sin(k * x);
  return sum;
};

/** x reduced to (−π, π]. */
const wrap = (x: number): number => {
  const twoPi = 2 * Math.PI;
  const r = x - twoPi * Math.floor((x + Math.PI) / twoPi);
  return r === -Math.PI ? Math.PI : r;
};

/** The waveform itself (the limit of the series; the midpoint value at a jump). */
export const waveform = (wave: Waveform, x: number): number => {
  switch (wave) {
    case 'square': {
      const s = Math.sin(x);
      return Math.abs(s) < 1e-15 ? 0 : Math.sign(s);
    }
    case 'sawtooth': {
      const r = wrap(x);
      return r === Math.PI ? 0 : r / Math.PI;
    }
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.max(-1, Math.min(1, Math.sin(x))));
    default:
      return absurd(wave);
  }
};

export interface Crest {
  /** Where the first crest next to the jump lies (radians). */
  readonly x: number;
  /** Its height (the plateau is 1). */
  readonly peak: number;
  /** Overshoot as a fraction of the jump: (peak − 1)/2; ≤ 0 means the crest does not pass the plateau. */
  readonly fraction: number;
}

/**
 * The first crest of the partial sum next to the jump: x = 0⁺ for the square wave, x = π⁻ for the
 * sawtooth; null for the (continuous) triangle wave or h < 1. Found by a grid search over a window of a
 * few crest widths (the crest lies near π/(M + 1)), refined by golden-section search (J. Kiefer, 1953).
 */
export const firstCrest = (wave: Waveform, h: number, sigma: boolean): Crest | null => {
  if (wave === 'triangle' || h < 1) return null;
  const ks = harmonics(wave, h);
  const highest = ks[ks.length - 1] ?? 1;
  const window = Math.min(Math.PI / 2, (8 * Math.PI) / (highest + 1));
  // u is the distance from the jump; the square wave rises at 0, the sawtooth falls at π.
  const at = (u: number): number => (wave === 'square' ? u : Math.PI - u);
  const value = (u: number): number => partialSum(wave, h, sigma, at(u));
  const steps = 200;
  let best = 1;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (let i = 1; i <= steps; i++) {
    const v = value((window * i) / steps);
    if (v > bestValue) {
      bestValue = v;
      best = i;
    }
  }
  let a = (window * Math.max(0, best - 1)) / steps;
  let b = (window * Math.min(steps, best + 1)) / steps;
  const ratio = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 60 && b - a > 1e-12; i++) {
    const c = b - ratio * (b - a);
    const d = a + ratio * (b - a);
    if (value(c) >= value(d)) b = d;
    else a = c;
  }
  const u = (a + b) / 2;
  const peak = Math.max(value(u), bestValue);
  return { x: at(u), peak, fraction: (peak - 1) / 2 };
};
