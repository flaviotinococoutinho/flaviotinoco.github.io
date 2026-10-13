/**
 * Typed wrapper for `signal.wasm`: Fourier analysis, windows, Fourier partial sums (Gibbs
 * phenomenon), sampling and reconstruction. Methods copy their inputs into the kernel arena and
 * return fresh arrays; invalid arguments throw `RangeError`, kernel failures {@link KernelError}.
 */
import {
  assertFinite,
  assertU32,
  check,
  type CoreExports,
  KernelError,
  Status,
  withArena,
} from './runtime.ts';

/** Raw exports of `signal.wasm` (ABI v1). All buffers are `f64`; pointers are byte offsets. */
export interface SignalExports extends CoreExports {
  readonly fft: (re: number, im: number, n: number) => number;
  readonly ifft: (re: number, im: number, n: number) => number;
  readonly magnitude: (re: number, im: number, out: number, n: number) => number;
  readonly power_db: (re: number, im: number, out: number, n: number, floorDb: number) => number;
  readonly window: (kind: number, out: number, n: number) => number;
  readonly multiply: (a: number, b: number, out: number, n: number) => number;
  readonly fourier_series: (
    kind: number,
    harmonics: number,
    sigma: number,
    out: number,
    n: number,
    cycles: number,
  ) => number;
  readonly synth: (
    freqs: number,
    amps: number,
    phases: number,
    m: number,
    sampleRate: number,
    out: number,
    n: number,
  ) => number;
  readonly sample_sinusoid: (
    freq: number,
    phase: number,
    fs: number,
    duration: number,
    outT: number,
    outX: number,
    maxN: number,
  ) => number;
  readonly reconstruct_sinc: (
    samples: number,
    nSamples: number,
    fs: number,
    t0: number,
    out: number,
    nOut: number,
    tEnd: number,
  ) => number;
  readonly alias_frequency: (f: number, fs: number) => number;
  readonly spectral_entropy: (mag: number, n: number) => number;
}

/** Window families (Harris 1978), all in their symmetric form. */
export type WindowKind = 'rectangular' | 'hann' | 'hamming' | 'blackman' | 'blackman-harris';

/** Waveforms with closed-form Fourier series. */
export type Waveform = 'square' | 'sawtooth' | 'triangle';

const WINDOW_IDS: Readonly<Record<WindowKind, number>> = {
  rectangular: 0,
  hann: 1,
  hamming: 2,
  blackman: 3,
  'blackman-harris': 4,
};

const WAVEFORM_IDS: Readonly<Record<Waveform, number>> = { square: 0, sawtooth: 1, triangle: 2 };

/** A complex signal or spectrum as two parallel arrays. */
export interface Complex {
  readonly re: Float64Array;
  readonly im: Float64Array;
}

/** One sinusoidal partial `amp · sin(2π·freq·t + phase)` (Hz, arbitrary units, radians). */
export interface Partial {
  readonly freq: number;
  readonly amp: number;
  readonly phase?: number;
}

/** Options of {@link SignalKernel.fourierSeries}. */
export interface FourierSeriesOptions {
  /** Apply Lanczos σ-factors (default `false`). */
  readonly sigma?: boolean;
  /** Number of periods spanned by the `n` samples (default `1`). */
  readonly cycles?: number;
}

/** Ergonomic interface to `signal.wasm`. */
export interface SignalKernel {
  /** The raw exports (for advanced, allocation-free use). */
  readonly exports: SignalExports;
  /**
   * Discrete Fourier transform by the radix-2 Cooley–Tukey FFT (Cooley & Tukey 1965), unnormalised:
   * `X_k = Σ_{n<N} x_n e^{−2πikn/N}`. `N` must be a power of two (`KernelError` code −2 otherwise);
   * `im` defaults to zeros.
   */
  readonly fft: (re: ArrayLike<number>, im?: ArrayLike<number>) => Complex;
  /** Inverse DFT `x_n = (1/N) Σ_k X_k e^{+2πikn/N}`, so `ifft(fft(x)) = x` (Cooley & Tukey 1965). */
  readonly ifft: (re: ArrayLike<number>, im: ArrayLike<number>) => Complex;
  /** Magnitude spectrum `|X_k| = sqrt(re_k² + im_k²)`. */
  readonly magnitude: (re: ArrayLike<number>, im: ArrayLike<number>) => Float64Array;
  /**
   * Power spectrum in dB relative to a full-scale sinusoid: `10·log10(|X_k|²/N²)`, clamped below at
   * `floorDb` (default −120 dB).
   */
  readonly powerDb: (re: ArrayLike<number>, im: ArrayLike<number>, floorDb?: number) => Float64Array;
  /**
   * Symmetric window `w[k]`, `k = 0..n−1`, denominator `n − 1` (Harris 1978): Hann `0.5 − 0.5cos`,
   * Hamming `0.54 − 0.46cos`, Blackman `0.42 − 0.5cos + 0.08cos2`, 4-term Blackman–Harris
   * `0.35875 − 0.48829cos + 0.14128cos2 − 0.01168cos3` of `2πk/(n−1)`; `n = 1` gives `[1]`.
   */
  readonly window: (kind: WindowKind, n: number) => Float64Array;
  /** Elementwise product `a[i]·b[i]` (e.g. applying a window). */
  readonly multiply: (a: ArrayLike<number>, b: ArrayLike<number>) => Float64Array;
  /**
   * Partial Fourier sum sampled at `x_j = 2π·cycles·j/n` (Fourier 1822; Gibbs 1899): square
   * `4/π Σ sin(kx)/k` over the first `harmonics` odd `k`; sawtooth `2/π Σ_{k≤H} (−1)^{k+1} sin(kx)/k`;
   * triangle `8/π² Σ (−1)^{(k−1)/2} sin(kx)/k²` over odd `k`. With `sigma`, each term is multiplied by
   * the Lanczos factor `sinc(k/(M+1))` (`M` = highest harmonic; Lanczos 1956), which reduces the Gibbs
   * overshoot from ≈ 8.95 % to ≈ 1.19 % of the jump.
   */
  readonly fourierSeries: (
    kind: Waveform,
    harmonics: number,
    n: number,
    options?: FourierSeriesOptions,
  ) => Float64Array;
  /** Additive synthesis `x[t] = Σ_j amp_j · sin(2π·freq_j·t/sampleRate + phase_j)`, `t = 0..n−1` (Fourier 1822). */
  readonly synth: (partials: readonly Partial[], sampleRate: number, n: number) => Float64Array;
  /**
   * Samples `x(t) = sin(2π·freq·t + phase)` at `t_k = k/fs` for all `t_k < duration` (seconds, Hz,
   * radians) — the sampling step of the Nyquist–Shannon theorem (Shannon 1949).
   */
  readonly sampleSinusoid: (
    freq: number,
    phase: number,
    fs: number,
    duration: number,
  ) => { readonly t: Float64Array; readonly x: Float64Array };
  /**
   * Whittaker–Shannon interpolation `x(t) = Σ_k samples[k] · sinc(fs·t − k)` with
   * `sinc(u) = sin(πu)/(πu)`, on `nOut` points spanning `[t0, tEnd]` inclusive (Whittaker 1915; Shannon 1949).
   */
  readonly reconstructSinc: (
    samples: ArrayLike<number>,
    fs: number,
    t0: number,
    tEnd: number,
    nOut: number,
  ) => Float64Array;
  /** Apparent frequency of `f` sampled at `fs`: `|f − fs·round(f/fs)|` ∈ `[0, fs/2]` (Nyquist 1928; Shannon 1949). */
  readonly aliasFrequency: (f: number, fs: number) => number;
  /**
   * Normalised spectral entropy `−Σ p_k ln p_k / ln N` of `p_k = |X_k|²/Σ|X|²`, in `[0, 1]`
   * (Shannon 1948); `0` for zero power or `N ≤ 1`.
   */
  readonly spectralEntropy: (magnitudes: ArrayLike<number>) => number;
}

function sameLength(what: string, a: ArrayLike<number>, b: ArrayLike<number>): void {
  if (a.length !== b.length) throw new RangeError(`${what}: lengths differ (${a.length} vs ${b.length})`);
}

/**
 * Wraps raw `signal.wasm` exports (from {@link instantiateFromBytes} or {@link instantiateFromUrl})
 * in the {@link SignalKernel} interface. Pure: performs no I/O.
 */
export function createSignalKernel(exports: SignalExports): SignalKernel {
  const k = exports;

  const transform = (fn: 'fft' | 'ifft', re: ArrayLike<number>, im: ArrayLike<number>): Complex => {
    sameLength(fn, re, im);
    return withArena(k, (arena) => {
      const r = arena.from('f64', re);
      const i = arena.from('f64', im);
      check(fn, k[fn](r.ptr, i.ptr, re.length));
      return { re: r.read(), im: i.read() };
    });
  };

  const binary = (
    fn: 'magnitude' | 'power_db' | 'multiply',
    a: ArrayLike<number>,
    b: ArrayLike<number>,
    floorDb = 0,
  ): Float64Array => {
    sameLength(fn, a, b);
    return withArena(k, (arena) => {
      const x = arena.from('f64', a);
      const y = arena.from('f64', b);
      const out = arena.alloc('f64', a.length);
      const status =
        fn === 'power_db'
          ? k.power_db(x.ptr, y.ptr, out.ptr, a.length, floorDb)
          : k[fn](x.ptr, y.ptr, out.ptr, a.length);
      check(fn, status);
      return out.read();
    });
  };

  return {
    exports: k,

    fft: (re, im) => transform('fft', re, im ?? new Float64Array(re.length)),

    ifft: (re, im) => transform('ifft', re, im),

    magnitude: (re, im) => binary('magnitude', re, im),

    powerDb: (re, im, floorDb = -120) => {
      assertFinite('floorDb', floorDb);
      return binary('power_db', re, im, floorDb);
    },

    window: (kind, n) => {
      assertU32('n', n, 1);
      return withArena(k, (arena) => {
        const out = arena.alloc('f64', n);
        check('window', k.window(WINDOW_IDS[kind], out.ptr, n));
        return out.read();
      });
    },

    multiply: (a, b) => binary('multiply', a, b),

    fourierSeries: (kind, harmonics, n, options = {}) => {
      const { sigma = false, cycles = 1 } = options;
      assertU32('harmonics', harmonics);
      assertU32('n', n, 1);
      assertFinite('cycles', cycles);
      return withArena(k, (arena) => {
        const out = arena.alloc('f64', n);
        check('fourier_series', k.fourier_series(WAVEFORM_IDS[kind], harmonics, sigma ? 1 : 0, out.ptr, n, cycles));
        return out.read();
      });
    },

    synth: (partials, sampleRate, n) => {
      assertU32('n', n, 1);
      if (!(sampleRate > 0) || !Number.isFinite(sampleRate)) throw new RangeError('sampleRate must be positive');
      return withArena(k, (arena) => {
        const freqs = arena.from(
          'f64',
          partials.map((p) => p.freq),
        );
        const amps = arena.from(
          'f64',
          partials.map((p) => p.amp),
        );
        const phases = arena.from(
          'f64',
          partials.map((p) => p.phase ?? 0),
        );
        const out = arena.alloc('f64', n);
        check('synth', k.synth(freqs.ptr, amps.ptr, phases.ptr, partials.length, sampleRate, out.ptr, n));
        return out.read();
      });
    },

    sampleSinusoid: (freq, phase, fs, duration) => {
      assertFinite('freq', freq);
      assertFinite('phase', phase);
      assertFinite('duration', duration);
      if (!(fs > 0) || !Number.isFinite(fs)) throw new RangeError('fs must be positive');
      // t_k = k/fs < duration ⇔ k < duration·fs; one extra slot absorbs rounding.
      const capacity = Math.max(1, Math.ceil(Math.max(0, duration) * fs) + 1);
      if (capacity > 0x1fff_ffff) throw new KernelError('sample_sinusoid', Status.OUT_OF_MEMORY);
      return withArena(k, (arena) => {
        const t = arena.alloc('f64', capacity);
        const x = arena.alloc('f64', capacity);
        const count = check('sample_sinusoid', k.sample_sinusoid(freq, phase, fs, duration, t.ptr, x.ptr, capacity));
        return { t: t.view().slice(0, count), x: x.view().slice(0, count) };
      });
    },

    reconstructSinc: (samples, fs, t0, tEnd, nOut) => {
      assertU32('nOut', nOut, 1);
      if (samples.length === 0) throw new RangeError('reconstructSinc needs at least one sample');
      return withArena(k, (arena) => {
        const s = arena.from('f64', samples);
        const out = arena.alloc('f64', nOut);
        check('reconstruct_sinc', k.reconstruct_sinc(s.ptr, samples.length, fs, t0, out.ptr, nOut, tEnd));
        return out.read();
      });
    },

    aliasFrequency: (f, fs) => k.alias_frequency(f, fs),

    spectralEntropy: (magnitudes) =>
      withArena(k, (arena) => {
        const m = arena.from('f64', magnitudes);
        return k.spectral_entropy(m.ptr, magnitudes.length);
      }),
  };
}

/**
 * Lazily loads `signal.wasm` (one fetch per page, cached) and returns its {@link SignalKernel}.
 * The module URL lives in `load-signal.ts`, which this dynamic import splits into its own chunk.
 */
export async function loadSignal(): Promise<SignalKernel> {
  const entry = await import('./load-signal.ts');
  return entry.loadSignalKernel();
}
