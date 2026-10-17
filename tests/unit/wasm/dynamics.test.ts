/** dynamics.wasm against analytic results and independent JS references (tests/unit/wasm/reference.ts). */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createDynamicsKernel,
  type DynamicsExports,
  type DynamicsKernel,
  splitSeed,
} from '../../../src/adapters/wasm/dynamics.ts';
import { KernelError, Status, withArena } from '../../../src/adapters/wasm/runtime.ts';
import { at, instantiate, mulberry32, sum } from './helpers.ts';
import {
  cltHistogram,
  logisticBifurcation,
  logisticLyapunov,
  logisticOrbit,
  lorenzRk4,
  pcg32,
  simplexNoise3,
} from './reference.ts';

let kernel: DynamicsKernel;
let raw: DynamicsExports;

beforeAll(async () => {
  raw = await instantiate<DynamicsExports>('dynamics');
  kernel = createDynamicsKernel(raw);
});

/** A fresh, independent module instance (the flow field is per instance). */
const fresh = async (): Promise<DynamicsKernel> => createDynamicsKernel(await instantiate<DynamicsExports>('dynamics'));

describe('logistic map (May 1976)', () => {
  it('orbits match the reference bit for bit; r = 2.8 converges to the fixed point 1 − 1/r', () => {
    for (const [r, x0] of [
      [2.8, 0.2],
      [3.5, 0.1],
      [3.9, 0.123],
      [4, 0.3],
    ] as const) {
      expect(Array.from(kernel.logisticOrbit(r, x0, 500))).toEqual(Array.from(logisticOrbit(r, x0, 500)));
    }
    const orbit = kernel.logisticOrbit(2.8, 0.2, 2000);
    expect(at(orbit, 0)).toBe(0.2);
    expect(Math.abs(at(orbit, 1999) - (1 - 1 / 2.8))).toBeLessThan(1e-12);
    // r = 3.2: a stable 2-cycle.
    const two = kernel.logisticOrbit(3.2, 0.3, 4001);
    expect(Math.abs(at(two, 4000) - at(two, 3998))).toBeLessThan(1e-12);
    expect(Math.abs(at(two, 4000) - at(two, 3999))).toBeGreaterThan(0.1);
  });

  it('rejects parameters outside r ∈ [0, 4], x0 ∈ [0, 1]', () => {
    expect(() => kernel.logisticOrbit(4.5, 0.5, 10)).toThrow(KernelError);
    expect(() => kernel.logisticOrbit(3, -0.1, 10)).toThrow(KernelError);
    expect(() => kernel.logisticOrbit(3, 0.5, 0)).toThrow(RangeError);
    expect(kernel.logisticLyapunov(5, 0.5, 0, 10)).toBeNaN();
  });

  it('Lyapunov exponent: λ(4) = ln 2, λ(3.2) < 0, λ(3.9) > 0, λ = ln|2 − r| at a stable fixed point', () => {
    expect(Math.abs(kernel.logisticLyapunov(4, 0.3, 1000, 1_000_000) - Math.LN2)).toBeLessThan(0.01);
    expect(kernel.logisticLyapunov(3.2, 0.3, 1000, 10_000)).toBeLessThan(0);
    expect(kernel.logisticLyapunov(3.9, 0.3, 1000, 100_000)).toBeGreaterThan(0);
    expect(kernel.logisticLyapunov(2.8, 0.3, 5000, 1000)).toBeCloseTo(Math.log(0.8), 9);
    expect(kernel.logisticLyapunov(3.7, 0.4, 100, 5000)).toBeCloseTo(logisticLyapunov(3.7, 0.4, 100, 5000), 12);
    // The superstable point x = 1/2 (r = 2) hits the ln(1e−300) floor instead of −∞.
    expect(kernel.logisticLyapunov(2, 0.5, 0, 10)).toBeCloseTo(Math.log(1e-300), 9);
  });

  it('the Lyapunov curve is aligned with the bifurcation columns (pixel centres)', () => {
    const curve = kernel.lyapunovCurve({ rMin: 2.5, rMax: 4, samples: 30, transient: 200, n: 3000 });
    for (let i = 0; i < 30; i++) {
      const r = 2.5 + 1.5 * ((i + 0.5) / 30);
      expect(at(curve, i)).toBeCloseTo(logisticLyapunov(r, 0.5, 200, 3000), 12);
    }
    expect(at(curve, 0)).toBeLessThan(0); // r ≈ 2.525: stable fixed point
    expect(at(curve, 29)).toBeGreaterThan(0); // r ≈ 3.975: chaos
    expect(() => kernel.lyapunovCurve({ rMin: 3, rMax: 2, samples: 4 })).toThrow(KernelError);
  });

  it('bifurcation diagram (Feigenbaum 1978): matches the reference and counts every iterate', () => {
    const [w, h, transient, iterations] = [120, 80, 300, 400];
    const img = kernel.logisticBifurcation({ rMin: 2.8, rMax: 4, width: w, height: h, transient, iterations });
    const want = logisticBifurcation(2.8, 4, w, h, transient, iterations);
    expect(img.max).toBeGreaterThan(0);
    expect(img.max).toBe(want.max);
    expect(Array.from(img.counts)).toEqual(Array.from(want.counts));
    expect(sum(img.counts)).toBe(w * iterations);
    expect(Math.max(...img.counts)).toBe(img.max);
    // Row 0 is x = 1 (top): the first column (r ≈ 2.805) sits at x* = 1 − 1/r ≈ 0.6435, i.e. row ⌊(1 − x*)·h⌋.
    const row = Math.floor((1 - (1 - 1 / (2.8 + 1.2 * (0.5 / w)))) * h);
    expect(at(img.counts, row * w)).toBe(iterations);
  });

  it('bifurcation returns 0 on invalid input', () => {
    withArena(raw, (arena) => {
      const out = arena.alloc('u32', 16);
      expect(raw.logistic_bifurcation(3, 2, 4, 4, 1, 1, out.ptr)).toBe(0);
      expect(raw.logistic_bifurcation(2, 3, 0, 4, 1, 1, out.ptr)).toBe(0);
      expect(raw.logistic_bifurcation(2, 3, 8, 4, 1, 1, out.ptr)).toBe(0); // 32 cells do not fit
      expect(raw.logistic_bifurcation(2, 3, 4, 4, 1, 1, out.ptr)).toBeGreaterThan(0);
    });
  });
});

describe('Lorenz system (Lorenz 1963), RK4', () => {
  it('matches a double-precision RK4 reference exactly (rounded to f32)', () => {
    const steps = 3000;
    const got = kernel.lorenz({ steps, x0: 1, y0: 1, z0: 1 });
    const want = lorenzRk4(10, 28, 8 / 3, 0.01, steps, [1, 1, 1]);
    expect(got.length).toBe(steps * 3);
    expect(Array.from(got)).toEqual(Array.from(want, (v) => Math.fround(v)));
  });

  it('stays on the bounded attractor for σ = 10, ρ = 28, β = 8/3, dt = 0.01', () => {
    const traj = kernel.lorenz({ steps: 20_000, x0: 0.1, y0: 0, z0: 0 });
    for (let i = 1000; i < 20_000; i++) {
      const [x, y, z] = [at(traj, 3 * i), at(traj, 3 * i + 1), at(traj, 3 * i + 2)];
      expect(Math.abs(x) < 30 && Math.abs(y) < 30 && z > 0 && z < 60).toBe(true);
    }
    // Both lobes are visited (sign changes of x).
    let flips = 0;
    for (let i = 1001; i < 20_000; i++) if (Math.sign(at(traj, 3 * i)) !== Math.sign(at(traj, 3 * i - 3))) flips++;
    expect(flips).toBeGreaterThan(10);
  });

  it('reports divergence (−4) but leaves finite output', () => {
    expect(() => kernel.lorenz({ steps: 200, dt: 10 })).toThrow(KernelError);
    withArena(raw, (arena) => {
      const out = arena.alloc('f32', 600);
      expect(raw.lorenz(10, 28, 8 / 3, 10, 200, 1, 1, 1, out.ptr)).toBe(Status.INVALID_PARAMETER);
      expect(out.view().every((v) => Number.isFinite(v))).toBe(true);
    });
    expect(() => kernel.lorenz({ steps: 10, dt: 0 })).toThrow(RangeError);
  });
});

describe('central limit theorem sampler (PCG32, O’Neill 2014)', () => {
  it('the JS PCG32 reference reproduces the pcg32-demo vector', () => {
    const next = pcg32(42n, 54n);
    expect(Array.from({ length: 6 }, next)).toEqual([
      0xa15c02b7, 0x7b47f409, 0xba1d3330, 0x83d2f293, 0xbfa4784b, 0xcbed606e,
    ]);
  });

  it('matches the reference histogram exactly for 64-bit seeds', () => {
    for (const seed of [0n, 42n, 0x1234_5678_9abc_def0n]) {
      const got = kernel.cltHistogram({ seed, terms: 5, samples: 20_000, bins: 64 });
      expect(Array.from(got)).toEqual(Array.from(cltHistogram(seed, 5, 20_000, 64)));
    }
    expect(Array.from(kernel.cltHistogram({ seed: 2 ** 40 + 3, terms: 2, samples: 5000, bins: 16 }))).toEqual(
      Array.from(cltHistogram(2n ** 40n + 3n, 2, 5000, 16)),
    );
  });

  it('twelve uniforms look Gaussian: mean ≈ 0 and ≈ 68 % of the mass within |z| < 1', () => {
    const bins = 80; // width 0.1
    const h = kernel.cltHistogram({ seed: 2024, terms: 12, samples: 200_000, bins });
    const total = sum(h);
    expect(total).toBeGreaterThan(199_000); // |z| ≥ 4 is rare (|z| ≤ 6 always for 12 terms)
    let mean = 0;
    for (let i = 0; i < bins; i++) mean += ((i + 0.5) * 0.1 - 4) * at(h, i);
    expect(Math.abs(mean / total)).toBeLessThan(0.02);
    const within = sum(h.subarray(30, 50));
    expect(Math.abs(within / total - 0.6827)).toBeLessThan(0.03);
  });

  it('is deterministic per seed and validates its arguments', () => {
    const a = kernel.cltHistogram({ seed: 7, terms: 3, samples: 1000, bins: 10 });
    expect(kernel.cltHistogram({ seed: 7, terms: 3, samples: 1000, bins: 10 })).toEqual(a);
    expect(kernel.cltHistogram({ seed: 8, terms: 3, samples: 1000, bins: 10 })).not.toEqual(a);
    expect(() => kernel.cltHistogram({ seed: -1, terms: 3, samples: 10, bins: 10 })).toThrow(RangeError);
    expect(() => kernel.cltHistogram({ seed: 1n << 64n, terms: 3, samples: 10, bins: 10 })).toThrow(RangeError);
    expect(() => kernel.cltHistogram({ seed: 1, terms: 0, samples: 10, bins: 10 })).toThrow(RangeError);
    withArena(raw, (arena) => {
      const out = arena.alloc('u32', 4);
      expect(raw.clt_histogram(1, 0, 0, 10, 4, out.ptr)).toBe(Status.INVALID_PARAMETER);
      expect(raw.clt_histogram(1, 0, 1, 10, 0, out.ptr)).toBe(Status.INVALID_LENGTH);
    });
  });

  it('splits 64-bit seeds into lo/hi halves', () => {
    expect(splitSeed(5)).toEqual([5, 0]);
    expect(splitSeed(2 ** 32 + 7)).toEqual([7, 1]);
    expect(splitSeed(0xffff_ffff_ffff_ffffn)).toEqual([0xffff_ffff, 0xffff_ffff]);
  });
});

describe('simplex noise (Gustavson 2005)', () => {
  it('matches the JS transcription, is deterministic and stays in [−1, 1]', () => {
    const r = mulberry32(3);
    let extreme = 0;
    for (let i = 0; i < 5000; i++) {
      const [x, y, z] = [(r() - 0.5) * 200, (r() - 0.5) * 200, (r() - 0.5) * 20];
      const seed = i % 7;
      const v = kernel.noise3(x, y, z, seed);
      expect(v).toBe(simplexNoise3(x, y, z, seed));
      expect(v).toBe(kernel.noise3(x, y, z, seed));
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      extreme = Math.max(extreme, Math.abs(v));
    }
    expect(extreme).toBeGreaterThan(0.5); // the normalisation uses most of the range
  });

  it('is 0 at simplex-lattice vertices, depends on the seed and is NaN for non-finite input', () => {
    // Integer points with i + j + k ≡ 0 (mod 3) are vertices of the skewed lattice (offset 0 from a corner).
    for (const [x, y, z, seed] of [
      [0, 0, 0, 0],
      [5, -3, 1, 99],
      [2, 2, 2, 7],
      [-4, 1, 0, 0xffff_ffff],
    ] as const) {
      expect(kernel.noise3(x, y, z, seed)).toBe(0);
    }
    expect(kernel.noise3(0.3, 0.6, 0.9, 1)).not.toBe(kernel.noise3(0.3, 0.6, 0.9, 2));
    expect(kernel.noise3(NaN, 0, 0)).toBeNaN();
    expect(kernel.noise3(Infinity, 0, 0)).toBeNaN();
  });

  it('is continuous: small steps give small changes (including across simplex faces)', () => {
    const h = 1e-6;
    let worst = 0;
    let prev = kernel.noise3(0.1, 0.2, 0.3, 4);
    for (let s = 1; s <= 200_000; s++) {
      const t = s * h * 10;
      const v = kernel.noise3(0.1 + 0.83 * t, 0.2 + 0.41 * t, 0.3 + 0.37 * t, 4);
      worst = Math.max(worst, Math.abs(v - prev));
      prev = v;
    }
    // A Lipschitz bound: |∇n| is a few units, the step is 1e−5 · |(0.83, 0.41, 0.37)| ≈ 1e−5.
    expect(worst).toBeLessThan(1e-4);
  });
});

describe('curl-noise flow field (Bridson, Hourihan & Nordenstam 2007)', () => {
  const [W, H] = [640, 360];
  const run = (k: DynamicsKernel, seed: number, steps: number): Float32Array => {
    k.flowInit(500, seed, W, H);
    for (let i = 0; i < steps; i++) k.flowStep(i / 60, 1 / 60, 0.004, 40);
    return k.flowSegments();
  };

  it('is deterministic for a seed and differs between seeds', async () => {
    const a = run(await fresh(), 11, 90);
    const b = run(await fresh(), 11, 90);
    const c = run(await fresh(), 12, 90);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it('keeps every segment finite, inside the field, with alpha in [0, 1]', async () => {
    const k = await fresh();
    expect(k.flowCount()).toBe(0);
    expect(k.flowSegments().length).toBe(0);
    k.flowInit(800, 3, W, H);
    expect(k.flowCount()).toBe(800);
    for (let step = 0; step < 400; step++) {
      k.flowStep(step / 60, 1 / 60, 0.004, 60);
      if (step % 50 !== 49) continue;
      const seg = k.flowSegments();
      expect(seg.length).toBe(800 * 5);
      for (let i = 0; i < seg.length; i += 5) {
        const [x0, y0, x1, y1, alpha] = [at(seg, i), at(seg, i + 1), at(seg, i + 2), at(seg, i + 3), at(seg, i + 4)];
        expect([x0, y0, x1, y1, alpha].every(Number.isFinite)).toBe(true);
        expect(x0 >= 0 && x0 < W && x1 >= 0 && x1 < W && y0 >= 0 && y0 < H && y1 >= 0 && y1 < H).toBe(true);
        expect(alpha >= 0 && alpha <= 1).toBe(true);
      }
    }
  });

  it('moves particles along v = speed·(∂ψ/∂Y, −∂ψ/∂X) of ψ = noise3(x·s, y·s, t)', async () => {
    const k = await fresh();
    const [seed, scale, speed, dt, t] = [21, 0.005, 50, 1 / 30, 0.75];
    k.flowInit(300, seed, W, H);
    const before = k.flowSegments().slice();
    k.flowStep(t, dt, scale, speed);
    const after = k.flowSegments();
    const eps = 1e-4;
    let moved = 0;
    for (let i = 0; i < 300; i++) {
      const alpha = at(after, 5 * i + 4);
      if (alpha === 0) continue; // respawned (left the field or outlived its lifetime)
      moved++;
      // Segments start where the particle was (the end of the previous segment).
      const [x, y] = [at(before, 5 * i + 2), at(before, 5 * i + 3)];
      expect([at(after, 5 * i), at(after, 5 * i + 1)]).toEqual([x, y]);
      const [nx, ny] = [x * scale, y * scale];
      const dPsiDy = (k.noise3(nx, ny + eps, t, seed) - k.noise3(nx, ny - eps, t, seed)) / (2 * eps);
      const dPsiDx = (k.noise3(nx + eps, ny, t, seed) - k.noise3(nx - eps, ny, t, seed)) / (2 * eps);
      expect(at(after, 5 * i + 2)).toBe(Math.fround(x + speed * dPsiDy * dt));
      expect(at(after, 5 * i + 3)).toBe(Math.fround(y - speed * dPsiDx * dt));
    }
    expect(moved).toBeGreaterThan(250);
  });

  it('the curl field is divergence-free (numerically)', async () => {
    const k = await fresh();
    const [scale, seed, t, h, eps] = [0.01, 5, 0.4, 1e-3, 1e-4];
    const v = (x: number, y: number): readonly [number, number] => {
      const [nx, ny] = [x * scale, y * scale];
      return [
        (k.noise3(nx, ny + eps, t, seed) - k.noise3(nx, ny - eps, t, seed)) / (2 * eps),
        -(k.noise3(nx + eps, ny, t, seed) - k.noise3(nx - eps, ny, t, seed)) / (2 * eps),
      ];
    };
    for (let i = 0; i < 40; i++) {
      const [x, y] = [13.7 * i + 0.3, 7.9 * i + 0.1];
      const div = (v(x + h, y)[0] - v(x - h, y)[0]) / (2 * h) + (v(x, y + h)[1] - v(x, y - h)[1]) / (2 * h);
      expect(Math.abs(div)).toBeLessThan(1e-3);
    }
  });

  it('survives arena_reset, and flowInit releases the arena and refuses to run inside withArena', async () => {
    const k = await fresh();
    k.flowInit(64, 1, 100, 100);
    k.flowStep(0, 0.1, 0.02, 10);
    const ptr = k.exports.flow_segments_ptr();
    const snapshot = k.flowSegments().slice();
    const pinned = k.exports.arena_used();
    expect(pinned).toBeGreaterThanOrEqual(64 * 9 * 4);
    // Transient allocations come and go above the pinned field.
    withArena(k.exports, (arena) => {
      arena.alloc('f64', 1000);
      expect(() => k.flowInit(10, 1, 10, 10)).toThrow(/outside withArena/);
    });
    expect(k.exports.arena_used()).toBe(pinned);
    expect(k.exports.flow_segments_ptr()).toBe(ptr);
    expect(Array.from(k.flowSegments())).toEqual(Array.from(snapshot));
    // Other kernels still work next to the field.
    expect(k.logisticOrbit(3, 0.5, 3).length).toBe(3);
    expect(Array.from(k.flowSegments())).toEqual(Array.from(snapshot));
    // Re-initialising frees the previous field.
    k.flowInit(32, 2, 50, 50);
    expect(k.flowCount()).toBe(32);
    expect(k.exports.arena_used()).toBeLessThan(pinned);
    // flowSegments reuses a large enough target.
    const target = new Float32Array(1000);
    expect(k.flowSegments(target).buffer).toBe(target.buffer);
    expect(k.flowSegments(target).length).toBe(32 * 5);
  });

  it('validates its arguments', async () => {
    const k = await fresh();
    expect(() => k.flowStep(0, 0.1, 0.01, 1)).toThrow(KernelError); // before flowInit
    expect(() => k.flowInit(0, 1, 10, 10)).toThrow(RangeError);
    expect(() => k.flowInit(70_000, 1, 10, 10)).toThrow(KernelError);
    expect(() => k.flowInit(10, 1, 0, 10)).toThrow(KernelError);
    expect(() => k.flowInit(10, 1, NaN, 10)).toThrow(KernelError);
    k.flowInit(10, 1, 10, 10);
    expect(() => k.flowStep(0, -1, 0.01, 1)).toThrow(KernelError);
    expect(() => k.flowStep(0, 0.1, 0, 1)).toThrow(KernelError);
    expect(() => k.flowStep(NaN, 0.1, 0.01, 1)).toThrow(KernelError);
    k.flowStep(0, 0, 0.01, 1); // dt = 0 is a no-op step
  });
});
