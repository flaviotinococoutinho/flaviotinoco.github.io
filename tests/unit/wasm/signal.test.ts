/** signal.wasm against analytic results and independent JS references (tests/unit/wasm/reference.ts). */
import { beforeAll, describe, expect, it } from 'vitest';
import { KernelError, Status, withArena } from '../../../src/lib/wasm/runtime.ts';
import { createSignalKernel, type SignalExports, type SignalKernel } from '../../../src/lib/wasm/signal.ts';
import { at, instantiate, maxAbsDiff, mulberry32, sum } from './helpers.ts';
import { cosineWindow, naiveDft, sinc, squarePartialSum } from './reference.ts';

let kernel: SignalKernel;
let raw: SignalExports;

beforeAll(async () => {
  raw = await instantiate<SignalExports>('signal');
  kernel = createSignalKernel(raw);
});

const randomSignal = (n: number, seed: number): { re: Float64Array; im: Float64Array } => {
  const r = mulberry32(seed);
  return { re: Float64Array.from({ length: n }, () => 2 * r() - 1), im: Float64Array.from({ length: n }, () => 2 * r() - 1) };
};

describe('fft (Cooley & Tukey 1965)', () => {
  it.each([1, 2, 8, 1024])('matches the naive O(n²) DFT for n = %i', (n) => {
    const x = randomSignal(n, n);
    const got = kernel.fft(x.re, x.im);
    const want = naiveDft(x.re, x.im);
    expect(maxAbsDiff(got.re, want.re)).toBeLessThan(1e-9 * n);
    expect(maxAbsDiff(got.im, want.im)).toBeLessThan(1e-9 * n);
  });

  it('transforms an impulse into a flat spectrum and a pure tone into one bin', () => {
    const impulse = new Float64Array(16);
    impulse[0] = 1;
    expect(Array.from(kernel.fft(impulse).re)).toEqual(new Array<number>(16).fill(1));
    const n = 64;
    const tone = Float64Array.from({ length: n }, (_, t) => Math.cos((2 * Math.PI * 5 * t) / n));
    const spectrum = kernel.magnitude(...Object.values(kernel.fft(tone)) as [Float64Array, Float64Array]);
    expect(at(spectrum, 5)).toBeCloseTo(n / 2, 9);
    expect(at(spectrum, n - 5)).toBeCloseTo(n / 2, 9);
    expect(sum(spectrum) - at(spectrum, 5) - at(spectrum, n - 5)).toBeLessThan(1e-9);
  });

  it('ifft ∘ fft is the identity', () => {
    const x = randomSignal(512, 7);
    const X = kernel.fft(x.re, x.im);
    const y = kernel.ifft(X.re, X.im);
    expect(maxAbsDiff(y.re, x.re)).toBeLessThan(1e-12);
    expect(maxAbsDiff(y.im, x.im)).toBeLessThan(1e-12);
  });

  it('satisfies Parseval: Σ|x|² = (1/N) Σ|X|²', () => {
    const n = 2048;
    const x = randomSignal(n, 11);
    const X = kernel.fft(x.re, x.im);
    let et = 0;
    let ef = 0;
    for (let i = 0; i < n; i++) {
      et += at(x.re, i) ** 2 + at(x.im, i) ** 2;
      ef += at(X.re, i) ** 2 + at(X.im, i) ** 2;
    }
    expect(Math.abs(et - ef / n) / et).toBeLessThan(1e-12);
  });

  it('returns -2 for n = 12 (not a power of two) and -1 for n = 0', () => {
    withArena(raw, (arena) => {
      const re = arena.alloc('f64', 12);
      const im = arena.alloc('f64', 12);
      expect(raw.fft(re.ptr, im.ptr, 12)).toBe(Status.NOT_POWER_OF_TWO);
      expect(raw.ifft(re.ptr, im.ptr, 12)).toBe(Status.NOT_POWER_OF_TWO);
      expect(raw.fft(re.ptr, im.ptr, 0)).toBe(Status.INVALID_LENGTH);
      expect(raw.fft(re.ptr, im.ptr, 1)).toBe(Status.OK);
    });
    expect(() => kernel.fft(new Float64Array(12))).toThrow(KernelError);
    expect(() => kernel.fft(new Float64Array(12))).toThrow(/not a power of two/);
  });

  it('rejects invalid, misaligned or aliased pointers with -4', () => {
    withArena(raw, (arena) => {
      const a = arena.alloc('f64', 8);
      expect(raw.fft(a.ptr, a.ptr, 8)).toBe(Status.INVALID_PARAMETER); // re and im alias
      expect(raw.fft(a.ptr + 4, a.ptr + 4 + 64, 2)).toBe(Status.INVALID_PARAMETER); // misaligned
      expect(raw.fft(a.ptr, a.ptr + 1 << 20, 8)).toBe(Status.INVALID_PARAMETER); // outside the arena
      expect(raw.fft(0, a.ptr, 1)).toBe(Status.INVALID_PARAMETER); // null
    });
  });
});

describe('spectra', () => {
  it('magnitude and powerDb follow their definitions', () => {
    const re = [3, 0, -4, 1e-200];
    const im = [4, 0, 3, 0];
    expect(Array.from(kernel.magnitude(re, im))).toEqual([5, 0, 5, 1e-200]);
    const db = kernel.powerDb(re, im, -150);
    expect(at(db, 0)).toBeCloseTo(10 * Math.log10(25 / 16), 12);
    expect(at(db, 1)).toBe(-150);
    expect(at(db, 3)).toBe(-150);
  });

  it('spectral entropy is 1 for white spectra and 0 for a single line', () => {
    expect(kernel.spectralEntropy(new Float64Array(64).fill(3))).toBeCloseTo(1, 12);
    const line = new Float64Array(64);
    line[9] = 2;
    expect(kernel.spectralEntropy(line)).toBe(0);
    expect(kernel.spectralEntropy(new Float64Array(8))).toBe(0);
    expect(kernel.spectralEntropy([])).toBe(0);
    const p = [1, 2, 3, 4].map((v) => (v * v) / 30);
    const h = -p.reduce((acc, v) => acc + v * Math.log(v), 0) / Math.log(4);
    expect(kernel.spectralEntropy([1, 2, 3, 4])).toBeCloseTo(h, 12);
  });
});

describe('windows (Harris 1978)', () => {
  const coeffs = {
    rectangular: [1, 0, 0, 0],
    hann: [0.5, 0.5, 0, 0],
    hamming: [0.54, 0.46, 0, 0],
    blackman: [0.42, 0.5, 0.08, 0],
    'blackman-harris': [0.35875, 0.48829, 0.14128, 0.01168],
  } as const;

  it.each(Object.keys(coeffs) as (keyof typeof coeffs)[])('%s: definition, symmetry and endpoints', (kind) => {
    for (const n of [2, 7, 64, 255]) {
      const w = kernel.window(kind, n);
      expect(maxAbsDiff(w, cosineWindow(coeffs[kind], n))).toBeLessThan(1e-15);
      for (let i = 0; i < n; i++) expect(at(w, i)).toBe(at(w, n - 1 - i));
      const [a0, a1, a2, a3] = coeffs[kind];
      expect(at(w, 0)).toBeCloseTo(a0 - a1 + a2 - a3, 15);
    }
    expect(Array.from(kernel.window(kind, 1))).toEqual([1]);
  });

  it('Hann has a unit midpoint and zero endpoints', () => {
    const w = kernel.window('hann', 101);
    expect(at(w, 50)).toBe(1);
    expect(at(w, 0)).toBe(0);
    expect(at(w, 100)).toBe(0);
  });

  it('multiply applies a window, also in place', () => {
    const w = kernel.window('hann', 8);
    const ones = new Float64Array(8).fill(2);
    expect(maxAbsDiff(kernel.multiply(ones, w), w.map((v) => 2 * v))).toBe(0);
    withArena(raw, (arena) => {
      const a = arena.from('f64', [1, 2, 3]);
      const b = arena.from('f64', [4, 5, 6]);
      expect(raw.multiply(a.ptr, b.ptr, a.ptr, 3)).toBe(Status.OK);
      expect(Array.from(a.read())).toEqual([4, 10, 18]);
      expect(raw.multiply(b.ptr, b.ptr, b.ptr, 3)).toBe(Status.OK);
      expect(Array.from(b.read())).toEqual([16, 25, 36]);
      expect(raw.multiply(a.ptr, b.ptr, a.ptr + 8, 2)).toBe(Status.INVALID_PARAMETER); // partial overlap
    });
    expect(() => kernel.window('hann', 0)).toThrow(RangeError);
    withArena(raw, (arena) => expect(raw.window(9, arena.alloc('f64', 4).ptr, 4)).toBe(Status.INVALID_PARAMETER));
  });
});

describe('Fourier partial sums and the Gibbs phenomenon', () => {
  it('matches direct summation for every waveform', () => {
    const n = 256;
    const square = kernel.fourierSeries('square', 37, n);
    for (let j = 0; j < n; j++) expect(at(square, j)).toBeCloseTo(squarePartialSum(37, (2 * Math.PI * j) / n), 12);
    const saw = kernel.fourierSeries('sawtooth', 50, n, { cycles: 2 });
    const tri = kernel.fourierSeries('triangle', 50, n);
    for (let j = 0; j < n; j += 17) {
      const x = (4 * Math.PI * j) / n;
      let s = 0;
      for (let k = 1; k <= 50; k++) s += ((k % 2 === 1 ? 1 : -1) * Math.sin(k * x)) / k;
      expect(at(saw, j)).toBeCloseTo((2 / Math.PI) * s, 12);
      const y = (2 * Math.PI * j) / n;
      let t = 0;
      for (let i = 0; i < 50; i++) t += ((i % 2 === 0 ? 1 : -1) * Math.sin((2 * i + 1) * y)) / (2 * i + 1) ** 2;
      expect(at(tri, j)).toBeCloseTo((8 / Math.PI ** 2) * t, 12);
    }
  });

  it('converges to 1 at x = π/2 as H grows', () => {
    const errors = [5, 50, 500, 5000].map((h) => Math.abs(at(kernel.fourierSeries('square', h, 4), 1) - 1));
    for (let i = 1; i < errors.length; i++) expect(at(errors, i)).toBeLessThan(at(errors, i - 1));
    expect(at(errors, errors.length - 1)).toBeLessThan(1e-3);
  });

  it('overshoots by the Wilbraham–Gibbs constant (2/π)·Si(π) ≈ 1.17898 for H = 200', () => {
    const peak = Math.max(...kernel.fourierSeries('square', 200, 1 << 14));
    expect(Math.abs(peak - 1.178979744)).toBeLessThan(1e-2);
    expect(Math.abs(peak - 1.178979744)).toBeLessThan(2e-3);
  });

  it('Lanczos σ-factors suppress the overshoot to ≈ 1.0237 (1.19 % of the jump)', () => {
    const peak = Math.max(...kernel.fourierSeries('square', 200, 1 << 14, { sigma: true }));
    // Asymptotically max_u (G(u+π) − G(u−π))/π² with G(s) = s·Si(s) + cos s, i.e. 1.023740…; the
    // spec's "< 1.02" is below what σ-factors can reach, see docs/adr/0003-wasm-kernels.md.
    expect(peak).toBeLessThan(1.025);
    expect(Math.abs(peak - 1.02374)).toBeLessThan(2e-3);
  });

  it('zero harmonics is silence; invalid kinds and counts are rejected', () => {
    expect(Array.from(kernel.fourierSeries('triangle', 0, 4))).toEqual([0, 0, 0, 0]);
    expect(() => kernel.fourierSeries('square', 70_000, 4)).toThrow(KernelError);
    withArena(raw, (arena) => {
      const out = arena.alloc('f64', 4);
      expect(raw.fourier_series(3, 1, 0, out.ptr, 4, 1)).toBe(Status.INVALID_PARAMETER);
      expect(raw.fourier_series(0, 1, 2, out.ptr, 4, 1)).toBe(Status.INVALID_PARAMETER);
      expect(raw.fourier_series(0, 1, 0, out.ptr, 4, NaN)).toBe(Status.INVALID_PARAMETER);
    });
  });

  it('synth sums the partials', () => {
    const partials = [
      { freq: 3, amp: 1 },
      { freq: 11.5, amp: 0.3, phase: 0.7 },
    ];
    const x = kernel.synth(partials, 64, 128);
    for (let t = 0; t < 128; t++) {
      const want = Math.sin((2 * Math.PI * 3 * t) / 64) + 0.3 * Math.sin((2 * Math.PI * 11.5 * t) / 64 + 0.7);
      expect(at(x, t)).toBeCloseTo(want, 12);
    }
    expect(Array.from(kernel.synth([], 10, 3))).toEqual([0, 0, 0]);
  });
});

describe('sampling and reconstruction (Whittaker 1915; Shannon 1949)', () => {
  it('folds frequencies into the Nyquist band', () => {
    expect(kernel.aliasFrequency(7, 10)).toBe(3);
    expect(kernel.aliasFrequency(3, 10)).toBe(3);
    expect(kernel.aliasFrequency(13, 10)).toBe(3);
    expect(kernel.aliasFrequency(0.7, 1)).toBeCloseTo(0.3, 15);
    expect(kernel.aliasFrequency(1, 0)).toBeNaN();
  });

  it('samples t_k = k/fs < duration', () => {
    const { t, x } = kernel.sampleSinusoid(2, 0.5, 16, 1);
    expect(t.length).toBe(16);
    expect(at(t, 15)).toBe(15 / 16);
    for (let k = 0; k < 16; k++) expect(at(x, k)).toBeCloseTo(Math.sin(2 * Math.PI * 2 * (k / 16) + 0.5), 14);
    expect(kernel.sampleSinusoid(1, 0, 10, 0).t.length).toBe(0);
    withArena(raw, (arena) => {
      const a = arena.alloc('f64', 4);
      const b = arena.alloc('f64', 4);
      expect(raw.sample_sinusoid(1, 0, 10, 100, a.ptr, b.ptr, 4)).toBe(4); // truncated to max_n
      expect(raw.sample_sinusoid(1, 0, 0, 1, a.ptr, b.ptr, 4)).toBe(Status.INVALID_PARAMETER);
      expect(raw.sample_sinusoid(1, 0, 10, 1, a.ptr, b.ptr, 0)).toBe(Status.INVALID_LENGTH);
    });
  });

  const reconstructionRms = (f: number, fs: number): number => {
    const duration = 40;
    const { x } = kernel.sampleSinusoid(f, 0.3, fs, duration);
    // Interior: the middle half, far from the truncation edges.
    const t0 = duration / 4;
    const tEnd = (3 * duration) / 4;
    const nOut = 2001;
    const y = kernel.reconstructSinc(x, fs, t0, tEnd, nOut);
    let err = 0;
    for (let i = 0; i < nOut; i++) {
      const t = t0 + ((tEnd - t0) * i) / (nOut - 1);
      err += (at(y, i) - Math.sin(2 * Math.PI * f * t + 0.3)) ** 2;
    }
    return Math.sqrt(err / nOut);
  };

  it('reconstructs a band-limited tone (f = 0.3·fs) with small error', () => {
    expect(reconstructionRms(3, 10)).toBeLessThan(1e-2);
  });

  it('fails above Nyquist (f = 0.7·fs): the samples describe the alias at 0.3·fs', () => {
    const fs = 10;
    expect(reconstructionRms(7, fs)).toBeGreaterThan(0.5);
    // The reconstruction is the alias: sin(2π·7t + φ) sampled at 10 Hz equals −sin(2π·3t − φ).
    const { x } = kernel.sampleSinusoid(7, 0.3, fs, 40);
    const y = kernel.reconstructSinc(x, fs, 10, 30, 801);
    let err = 0;
    for (let i = 0; i < 801; i++) {
      const t = 10 + (20 * i) / 800;
      err += (at(y, i) + Math.sin(2 * Math.PI * 3 * t - 0.3)) ** 2;
    }
    expect(Math.sqrt(err / 801)).toBeLessThan(1e-2);
  });

  it('matches the direct Whittaker–Shannon sum and interpolates the samples exactly', () => {
    const r = mulberry32(5);
    const samples = Float64Array.from({ length: 50 }, () => 2 * r() - 1);
    const fs = 8;
    const y = kernel.reconstructSinc(samples, fs, -0.3, 7.1, 300);
    for (let i = 0; i < 300; i += 7) {
      const t = -0.3 + (7.4 * i) / 299;
      let want = 0;
      for (let k = 0; k < samples.length; k++) want += at(samples, k) * sinc(fs * t - k);
      expect(at(y, i)).toBeCloseTo(want, 10);
    }
    const exact = kernel.reconstructSinc(samples, fs, 0, 49 / fs, 50);
    expect(maxAbsDiff(exact, samples)).toBeLessThan(1e-15);
  });
});
