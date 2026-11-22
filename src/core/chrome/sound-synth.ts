/**
 * Samples of the room's sound, computed from a seed (no recording, no file): the beds the layers loop and the
 * short sounds their events play. Pure and deterministic — same seed and sample rate, same samples — so they are
 * tested here and only played by the shell (src/islands/scenes/room-sound.ts).
 *
 * Every sample lies in [−1, 1], starts and ends at rest (no click where it is cut or looped), and has its peak
 * normalised so the mixing levels of sound.ts alone set loudness.
 *
 *   pink noise    Paul Kellet's "economy" filter of white noise (three one-pole sections, ±0.5 dB of −3 dB/oct
 *                 from 40 Hz to the Nyquist frequency; Kellet, music-dsp mailing list, 1999)
 *   brown noise   leaky integration of white noise (−6 dB/oct)
 *   drop          a short rising sine with an exponential decay and a click of noise: a drop meeting the glass
 *   crackle       an impulse of noise with a few-millisecond decay, sometimes with a smaller second pop
 *   stroke        a burst of noise with a grainy envelope: the nib dragging on paper (the shell filters it high)
 *   page          pink noise shaped as lift, flip and settle, with a low thump as the leaf lands
 */
import { mulberry32, type PrngState } from '../ontology/prng.ts';

export type Samples = Float32Array<ArrayBuffer>;

const white = (state: PrngState): readonly [number, PrngState] => {
  const [u, next] = mulberry32(state);
  return [u * 2 - 1, next];
};

/** The samples scaled so that their largest magnitude is `peak` (silence stays silence). */
const normalise = (x: Samples, peak: number): Samples => {
  let max = 0;
  for (const v of x) max = Math.max(max, Math.abs(v));
  const scale = max > 0 ? peak / max : 1;
  return x.map((v) => v * scale);
};

/**
 * Makes a noise loop seamless: the last `fade` samples are crossfaded (equal power) into the first ones and then
 * dropped, so the loop's end runs into its start without a step.
 */
export const loopable = (x: Samples, fade: number): Samples => {
  const f = Math.max(0, Math.min(Math.floor(fade), Math.floor(x.length / 2)));
  const out = new Float32Array(x.length - f);
  out.set(x.subarray(0, x.length - f));
  for (let i = 0; i < f; i += 1) {
    const w = (i + 0.5) / f;
    out[i] = (x[i] ?? 0) * Math.sin((w * Math.PI) / 2) + (x[x.length - f + i] ?? 0) * Math.cos((w * Math.PI) / 2);
  }
  return out;
};

/** `seconds` of pink noise at `rate` samples per second, seamless as a loop. */
export const pinkNoise = (seconds: number, rate: number, seed: PrngState): Samples => {
  const n = Math.max(1, Math.round(seconds * rate));
  const x = new Float32Array(n);
  let s = seed;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < n; i += 1) {
    const [w, next] = white(s);
    s = next;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    x[i] = b0 + b1 + b2 + w * 0.1848;
  }
  return normalise(loopable(x, rate * 0.05), 0.9);
};

/** `seconds` of brown noise, seamless as a loop. */
export const brownNoise = (seconds: number, rate: number, seed: PrngState): Samples => {
  const n = Math.max(1, Math.round(seconds * rate));
  const x = new Float32Array(n);
  let s = seed;
  let last = 0;
  for (let i = 0; i < n; i += 1) {
    const [w, next] = white(s);
    s = next;
    last = (last + 0.02 * w) / 1.02;
    x[i] = last;
  }
  return normalise(loopable(x, rate * 0.05), 0.9);
};

/** A drop meeting the glass. */
export const drop = (rate: number, seed: PrngState): Samples => {
  const [[a = 0, b = 0], s0] = pair(seed);
  const n = Math.round(rate * 0.045);
  const x = new Float32Array(n);
  const f0 = 1800 + 3400 * a;
  const tau = 0.004 + 0.006 * b;
  let s = s0;
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const [w, next] = white(s);
    s = next;
    phase += (2 * Math.PI * f0 * (1 + (0.6 * i) / n)) / rate;
    const attack = 1 - Math.exp(-t / 0.0004);
    x[i] = attack * (Math.sin(phase) * Math.exp(-t / tau) + 0.25 * w * Math.exp(-t / 0.002));
  }
  return normalise(fadeOut(x, Math.round(rate * 0.004)), 0.9);
};

/** A crackle of the fire. */
export const crackle = (rate: number, seed: PrngState): Samples => {
  const [[a = 0, b = 0, c = 0], s0] = triple(seed);
  const n = Math.round(rate * 0.035);
  const x = new Float32Array(n);
  const tau = 0.0008 + 0.0022 * a;
  const second = b < 0.5 ? Math.round(rate * (0.003 + 0.009 * c)) : -1;
  let s = s0;
  for (let i = 0; i < n; i += 1) {
    const [w, next] = white(s);
    s = next;
    const first = Math.exp(-i / (rate * tau));
    const pop = second >= 0 && i >= second ? 0.5 * Math.exp(-(i - second) / (rate * tau * 0.7)) : 0;
    x[i] = w * (first + pop);
  }
  return normalise(fadeOut(x, Math.round(rate * 0.003)), 0.9);
};

/** A stroke of the quill. */
export const stroke = (rate: number, seed: PrngState): Samples => {
  const [[a = 0, b = 0], s0] = pair(seed);
  const length = 0.07 + 0.09 * a;
  const n = Math.round(rate * length);
  const x = new Float32Array(n);
  const grain = 30 + 30 * b;
  let s = s0;
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const [w, next] = white(s);
    s = next;
    const attack = Math.min(1, t / 0.006);
    const release = Math.min(1, (length - t) / 0.015);
    const rough = 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * grain * t));
    x[i] = w * attack * release * rough;
  }
  return normalise(x, 0.8);
};

/** A page turning: the leaf lifts, flips and settles. */
export const page = (rate: number, seed: PrngState): Samples => {
  const [[a = 0], s0] = mulberry32Pair(seed);
  const length = 0.6;
  const n = Math.round(rate * length);
  const noise = pinkNoise(length, rate, s0);
  const x = new Float32Array(n);
  const flip = 0.15 + 0.04 * a;
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const lift = 0.25 * Math.min(1, t / flip);
    const swish = Math.exp(-(((t - flip - 0.05) / 0.035) ** 2));
    const settle = t > flip + 0.08 ? Math.exp(-(t - flip - 0.08) / 0.09) * 0.35 : 0;
    const env = Math.max(lift * (t < flip + 0.08 ? 1 : 0), swish, settle);
    const thumpT = t - (flip + 0.12);
    const thump = thumpT > 0 ? 0.5 * Math.sin(2 * Math.PI * 80 * thumpT) * Math.exp(-thumpT / 0.03) : 0;
    x[i] = (noise[i] ?? 0) * env + thump;
  }
  return normalise(fadeOut(x, Math.round(rate * 0.02)), 0.9);
};

/** The samples with the last `n` faded to zero (a cut sound ends at rest). */
const fadeOut = (x: Samples, n: number): Samples => {
  const m = Math.min(n, x.length);
  const from = x.length - m;
  return x.map((v, k) => (k < from ? v : v * (1 - (k - from + 1) / m)));
};

const mulberry32Pair = (seed: PrngState): readonly [readonly number[], PrngState] => {
  const [a, s] = mulberry32(seed);
  return [[a], s];
};
const pair = (seed: PrngState): readonly [readonly number[], PrngState] => {
  const [a, s1] = mulberry32(seed);
  const [b, s2] = mulberry32(s1);
  return [[a, b], s2];
};
const triple = (seed: PrngState): readonly [readonly number[], PrngState] => {
  const [[a = 0, b = 0], s2] = pair(seed);
  const [c, s3] = mulberry32(s2);
  return [[a, b, c], s3];
};
