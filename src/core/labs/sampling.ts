/**
 * Sampling a sinusoid: the regime relative to the Nyquist rate and the apparent (alias) frequency
 * (H. Nyquist, 1928; C. E. Shannon, "Communication in the presence of noise", Proc. IRE 37(1), 1949).
 *
 *   f_a = |f − f_s·round(f/f_s)| ∈ [0, f_s/2],  evaluated exactly as min(r, f_s − r), r = |f| mod f_s
 *
 * which is the formula of `signal.wasm`'s `alias_frequency` (docs/adr/0003-wasm-kernels.md §3); the pure
 * copy here serves the text summaries and the tests of the island.
 */

/** The apparent frequency of a sinusoid of frequency f sampled at fs (NaN unless fs > 0 and f finite). */
export const aliasFrequency = (f: number, fs: number): number => {
  if (!(fs > 0) || !Number.isFinite(fs) || !Number.isFinite(f)) return Number.NaN;
  const r = Math.abs(f) % fs;
  return Math.min(r, fs - r);
};

/**
 * How the sampling rate compares with twice the frequency:
 *   'faithful' f_s > 2f (the theorem's condition), 'critical' f_s = 2f (the result depends on the phase),
 *   'aliased'  f_s < 2f (the tone folds onto f_a).
 */
export type SamplingRegime = 'faithful' | 'critical' | 'aliased';

export const samplingRegime = (f: number, fs: number): SamplingRegime => {
  const twice = 2 * Math.abs(f);
  const tolerance = 1e-9 * Math.max(1, twice);
  if (Math.abs(fs - twice) <= tolerance) return 'critical';
  return fs > twice ? 'faithful' : 'aliased';
};

/** Length of the observation window: `periods` periods of the tone, in seconds. */
export const windowSeconds = (f: number, periods = 6): number => periods / Math.max(1e-9, Math.abs(f));

/** x(t) = sin(2π f t + φ), φ in degrees. */
export const sinusoid =
  (f: number, phaseDegrees: number) =>
  (t: number): number =>
    Math.sin(2 * Math.PI * f * t + (phaseDegrees * Math.PI) / 180);
