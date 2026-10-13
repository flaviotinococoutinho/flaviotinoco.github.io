/**
 * Typed wrapper for `dynamics.wasm`: the logistic map (orbits, Lyapunov exponent, bifurcation
 * diagram), the Lorenz system, a central-limit-theorem sampler, simplex noise and the curl-noise
 * flow field of the hero animation. Invalid arguments throw `RangeError`, kernel failures
 * {@link KernelError}.
 */
import { assertFinite, assertU32, check, type CoreExports, withArena } from './runtime.ts';

/** Raw exports of `dynamics.wasm` (ABI v1). Pointers are byte offsets. */
export interface DynamicsExports extends CoreExports {
  readonly logistic_orbit: (r: number, x0: number, n: number, out: number) => number;
  readonly logistic_lyapunov: (r: number, x0: number, transient: number, n: number) => number;
  readonly logistic_bifurcation: (
    rMin: number,
    rMax: number,
    width: number,
    height: number,
    transient: number,
    iterations: number,
    out: number,
  ) => number;
  readonly lyapunov_curve: (
    rMin: number,
    rMax: number,
    samples: number,
    transient: number,
    n: number,
    out: number,
  ) => number;
  readonly lorenz: (
    sigma: number,
    rho: number,
    beta: number,
    dt: number,
    steps: number,
    x0: number,
    y0: number,
    z0: number,
    out: number,
  ) => number;
  readonly clt_histogram: (
    seedLo: number,
    seedHi: number,
    terms: number,
    samples: number,
    bins: number,
    out: number,
  ) => number;
  readonly noise3: (x: number, y: number, z: number, seed: number) => number;
  readonly flow_init: (n: number, seed: number, width: number, height: number) => number;
  readonly flow_step: (t: number, dt: number, scale: number, speed: number) => number;
  readonly flow_segments_ptr: () => number;
  readonly flow_count: () => number;
}

/** Options of {@link DynamicsKernel.logisticBifurcation}. */
export interface BifurcationOptions {
  readonly rMin: number;
  readonly rMax: number;
  readonly width: number;
  readonly height: number;
  /** Iterates discarded before counting (default 500). */
  readonly transient?: number;
  /** Iterates counted per column (default 1000). */
  readonly iterations?: number;
}

/** Density image returned by {@link DynamicsKernel.logisticBifurcation}. */
export interface BifurcationImage {
  /** `width × height` counts, row-major, row 0 is `x = 1`. */
  readonly counts: Uint32Array;
  /** Largest count (for tone mapping). */
  readonly max: number;
}

/** Options of {@link DynamicsKernel.lyapunovCurve}. */
export interface LyapunovCurveOptions {
  readonly rMin: number;
  readonly rMax: number;
  readonly samples: number;
  /** Iterates discarded first (default 500). */
  readonly transient?: number;
  /** Iterates averaged (default 2000). */
  readonly n?: number;
}

/** Options of {@link DynamicsKernel.lorenz}; defaults are Lorenz's classic σ = 10, ρ = 28, β = 8/3. */
export interface LorenzOptions {
  readonly steps: number;
  readonly sigma?: number;
  readonly rho?: number;
  readonly beta?: number;
  /** RK4 step (default 0.01). */
  readonly dt?: number;
  readonly x0?: number;
  readonly y0?: number;
  readonly z0?: number;
}

/** Options of {@link DynamicsKernel.cltHistogram}. */
export interface CltOptions {
  /** PCG32 seed: a non-negative safe integer or a `bigint` below 2^64. */
  readonly seed: number | bigint;
  /** Uniform terms per sum (≥ 1). */
  readonly terms: number;
  /** Number of sums drawn. */
  readonly samples: number;
  /** Histogram bins over `z ∈ [−4, 4)`. */
  readonly bins: number;
}

/** Ergonomic interface to `dynamics.wasm`. */
export interface DynamicsKernel {
  /** The raw exports (for advanced, allocation-free use). */
  readonly exports: DynamicsExports;
  /** Orbit of the logistic map `x_{k+1} = r·x_k·(1 − x_k)` (May 1976), `n` points from `x0`; `r ∈ [0,4]`, `x0 ∈ [0,1]`. */
  readonly logisticOrbit: (r: number, x0: number, n: number) => Float64Array;
  /**
   * Lyapunov exponent `λ = (1/n) Σ ln|r(1 − 2x_k)|` in nats per iteration after `transient` iterates
   * (May 1976); `λ < 0` for stable cycles, `λ > 0` for chaos, `λ(4) = ln 2`.
   */
  readonly logisticLyapunov: (r: number, x0: number, transient: number, n: number) => number;
  /**
   * Bifurcation diagram of the logistic map (Feigenbaum 1978) as an attractor density image: one
   * column per `r` (pixel centres), iterated from the critical point `x = 1/2`.
   */
  readonly logisticBifurcation: (options: BifurcationOptions) => BifurcationImage;
  /** Lyapunov exponent at `samples` pixel-centre values of `r` (aligned with the bifurcation columns; May 1976). */
  readonly lyapunovCurve: (options: LyapunovCurveOptions) => Float64Array;
  /**
   * Lorenz (1963) trajectory `ẋ = σ(y − x)`, `ẏ = x(ρ − z) − y`, `ż = xy − βz` by classical RK4, as
   * `steps` interleaved `x, y, z` points (`Float32Array` of length `3·steps`; point 0 is the start).
   */
  readonly lorenz: (options: LorenzOptions) => Float32Array;
  /**
   * Central limit theorem demo (Laplace 1810): histogram over `z ∈ [−4, 4)` of
   * `z = (S − terms/2)/sqrt(terms/12)` for sums `S` of `terms` i.i.d. `U[0,1)` drawn from PCG32
   * (O'Neill 2014), seeded like `pcg32_srandom(seed, 54)`.
   */
  readonly cltHistogram: (options: CltOptions) => Uint32Array;
  /** 3D simplex noise (Perlin 2001; Gustavson 2005), deterministic per seed, in `[−1, 1]`. */
  readonly noise3: (x: number, y: number, z: number, seed?: number) => number;
  /**
   * Creates the curl-noise flow field (Bridson, Hourihan & Nordenstam 2007) with `n` particles in
   * `[0, width) × [0, height)` px. Releases every arena allocation; the particle state then persists
   * across `arena_reset` until the next `flowInit`.
   */
  readonly flowInit: (n: number, seed: number, width: number, height: number) => void;
  /**
   * Advances the particles by `dt` time units along `v = speed·(∂ψ/∂Y, −∂ψ/∂X)` with
   * `ψ = noise3(x·scale, y·scale, t)` (divergence-free; Bridson et al. 2007); `speed` in px per time unit.
   */
  readonly flowStep: (t: number, dt: number, scale: number, speed: number) => void;
  /** Number of particles (`0` before {@link DynamicsKernel.flowInit}). */
  readonly flowCount: () => number;
  /**
   * Copies the last step's segments `[x0, y0, x1, y1, alpha] × count` (px, alpha ∈ [0,1]) into
   * `target` (allocated when absent or too short) and returns the filled prefix.
   */
  readonly flowSegments: (target?: Float32Array) => Float32Array;
}

const TWO_32 = 0x1_0000_0000;

/** Splits a 64-bit seed into `[lo, hi]` 32-bit halves. */
export function splitSeed(seed: number | bigint): readonly [number, number] {
  if (typeof seed === 'bigint') {
    if (seed < 0n || seed >= 1n << 64n) throw new RangeError('seed must be in [0, 2^64)');
    return [Number(seed & 0xffff_ffffn), Number(seed >> 32n)];
  }
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('seed must be a non-negative safe integer');
  return [seed % TWO_32, Math.floor(seed / TWO_32)];
}

/** Wraps raw `dynamics.wasm` exports in the {@link DynamicsKernel} interface. Pure: performs no I/O. */
export function createDynamicsKernel(exports: DynamicsExports): DynamicsKernel {
  const k = exports;

  const flowCount = (): number => k.flow_count() >>> 0;

  return {
    exports: k,

    logisticOrbit: (r, x0, n) => {
      assertU32('n', n, 1);
      return withArena(k, (arena) => {
        const out = arena.alloc('f64', n);
        check('logistic_orbit', k.logistic_orbit(r, x0, n, out.ptr));
        return out.read();
      });
    },

    logisticLyapunov: (r, x0, transient, n) => {
      assertU32('transient', transient);
      assertU32('n', n, 1);
      return k.logistic_lyapunov(r, x0, transient, n);
    },

    logisticBifurcation: ({ rMin, rMax, width, height, transient = 500, iterations = 1000 }) => {
      assertU32('width', width, 1);
      assertU32('height', height, 1);
      assertU32('transient', transient);
      assertU32('iterations', iterations);
      if (!(rMin >= 0 && rMin <= rMax && rMax <= 4)) throw new RangeError('need 0 ≤ rMin ≤ rMax ≤ 4');
      return withArena(k, (arena) => {
        const out = arena.alloc('u32', width * height);
        const max = k.logistic_bifurcation(rMin, rMax, width, height, transient, iterations, out.ptr) >>> 0;
        return { counts: out.read(), max };
      });
    },

    lyapunovCurve: ({ rMin, rMax, samples, transient = 500, n = 2000 }) => {
      assertU32('samples', samples, 1);
      assertU32('transient', transient);
      assertU32('n', n, 1);
      return withArena(k, (arena) => {
        const out = arena.alloc('f64', samples);
        check('lyapunov_curve', k.lyapunov_curve(rMin, rMax, samples, transient, n, out.ptr));
        return out.read();
      });
    },

    lorenz: ({ steps, sigma = 10, rho = 28, beta = 8 / 3, dt = 0.01, x0 = 1, y0 = 1, z0 = 1 }) => {
      assertU32('steps', steps, 1);
      for (const [name, v] of Object.entries({ sigma, rho, beta, dt, x0, y0, z0 })) assertFinite(name, v);
      return withArena(k, (arena) => {
        const out = arena.alloc('f32', steps * 3);
        check('lorenz', k.lorenz(sigma, rho, beta, dt, steps, x0, y0, z0, out.ptr));
        return out.read();
      });
    },

    cltHistogram: ({ seed, terms, samples, bins }) => {
      const [lo, hi] = splitSeed(seed);
      assertU32('terms', terms, 1);
      assertU32('samples', samples);
      assertU32('bins', bins, 1);
      return withArena(k, (arena) => {
        const out = arena.alloc('u32', bins);
        check('clt_histogram', k.clt_histogram(lo, hi, terms, samples, bins, out.ptr));
        return out.read();
      });
    },

    noise3: (x, y, z, seed = 0) => {
      assertU32('seed', seed);
      return k.noise3(x, y, z, seed);
    },

    flowInit: (n, seed, width, height) => {
      assertU32('n', n, 1);
      assertU32('seed', seed);
      check('flow_init', k.flow_init(n, seed, width, height));
    },

    flowStep: (t, dt, scale, speed) => {
      check('flow_step', k.flow_step(t, dt, scale, speed));
    },

    flowCount,

    flowSegments: (target) => {
      const length = flowCount() * 5;
      const out = target !== undefined && target.length >= length ? target : new Float32Array(length);
      if (length > 0) {
        // A fresh view each time: memory may have grown since the last call.
        out.set(new Float32Array(k.memory.buffer, k.flow_segments_ptr() >>> 0, length));
      }
      return out.length === length ? out : out.subarray(0, length);
    },
  };
}

/** Lazily loads `dynamics.wasm` (one fetch per page, cached) and returns its {@link DynamicsKernel}. */
export async function loadDynamics(): Promise<DynamicsKernel> {
  const entry = await import('./load-dynamics.ts');
  return entry.loadDynamicsKernel();
}
