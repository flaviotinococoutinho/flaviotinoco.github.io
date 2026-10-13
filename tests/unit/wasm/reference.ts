/**
 * Independent JavaScript reference implementations used to cross-check the kernels. They follow
 * the textbook definitions directly (no shared code with the Rust sources).
 */
import { at } from './helpers.ts';

/** Naive O(n²) DFT `X_k = Σ x_n e^{−2πikn/N}`. */
export function naiveDft(re: ArrayLike<number>, im: ArrayLike<number>): { re: Float64Array; im: Float64Array } {
  const n = re.length;
  const outRe = new Float64Array(n);
  const outIm = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let sr = 0;
    let si = 0;
    for (let t = 0; t < n; t++) {
      const angle = (-2 * Math.PI * ((k * t) % n)) / n;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      sr += at(re, t) * c - at(im, t) * s;
      si += at(re, t) * s + at(im, t) * c;
    }
    outRe[k] = sr;
    outIm[k] = si;
  }
  return { re: outRe, im: outIm };
}

/** Symmetric generalized-cosine window from its coefficients `[a0, a1, a2, a3]`. */
export function cosineWindow(coeffs: readonly [number, number, number, number], n: number): Float64Array {
  const [a0, a1, a2, a3] = coeffs;
  const w = new Float64Array(n);
  if (n === 1) return w.fill(1);
  for (let k = 0; k < n; k++) {
    const x = (2 * Math.PI * k) / (n - 1);
    w[k] = a0 - a1 * Math.cos(x) + a2 * Math.cos(2 * x) - a3 * Math.cos(3 * x);
  }
  return w;
}

/** Square-wave partial sum `4/π Σ_{i<H} sin((2i+1)x)/(2i+1)` evaluated directly. */
export function squarePartialSum(h: number, x: number): number {
  let s = 0;
  for (let i = 0; i < h; i++) {
    const k = 2 * i + 1;
    s += Math.sin(k * x) / k;
  }
  return (4 / Math.PI) * s;
}

/** Normalised sinc `sin(πu)/(πu)`. */
export function sinc(u: number): number {
  return u === 0 ? 1 : Math.sin(Math.PI * u) / (Math.PI * u);
}

/** Shannon entropy in bits of a count vector. */
export function entropyOfCounts(counts: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < counts.length; i++) total += at(counts, i);
  if (total === 0) return 0;
  let h = 0;
  for (let i = 0; i < counts.length; i++) {
    const c = at(counts, i);
    if (c > 0) h -= (c / total) * Math.log2(c / total);
  }
  return h;
}

/** Conditional entropy H(X_n | X_{n−1}) in bits from overlapping bigrams. */
export function conditionalEntropy(data: Uint8Array): number {
  if (data.length < 2) return 0;
  const pairs = new Map<number, number>();
  const firsts = new Map<number, number>();
  for (let i = 1; i < data.length; i++) {
    const a = at(data, i - 1);
    const key = a * 256 + at(data, i);
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
    firsts.set(a, (firsts.get(a) ?? 0) + 1);
  }
  const total = data.length - 1;
  let h = 0;
  for (const [key, c] of pairs) {
    const a = Math.floor(key / 256);
    h -= (c / total) * Math.log2(c / (firsts.get(a) ?? 1));
  }
  return h;
}

/** Expected length of an optimal prefix code (classic Huffman with a sorted array as queue). */
export function huffmanExpectedLength(counts: ArrayLike<number>): number {
  const weights: number[] = [];
  for (let i = 0; i < counts.length; i++) if (at(counts, i) > 0) weights.push(at(counts, i));
  if (weights.length === 0) return 0;
  if (weights.length === 1) return 1;
  const total = weights.reduce((a, b) => a + b, 0);
  // Σ c_i·l_i equals the sum of all internal-node weights.
  let cost = 0;
  const queue = [...weights].sort((a, b) => a - b);
  while (queue.length > 1) {
    const merged = (queue.shift() ?? 0) + (queue.shift() ?? 0);
    cost += merged;
    let i = queue.findIndex((w) => w >= merged);
    if (i < 0) i = queue.length;
    queue.splice(i, 0, merged);
  }
  return cost / total;
}

/** D(P‖Q) in bits with internal normalisation. */
export function klDivergence(p: ArrayLike<number>, q: ArrayLike<number>): number {
  let sp = 0;
  let sq = 0;
  for (let i = 0; i < p.length; i++) {
    sp += at(p, i);
    sq += at(q, i);
  }
  let d = 0;
  for (let i = 0; i < p.length; i++) {
    const pi = at(p, i) / sp;
    const qi = at(q, i) / sq;
    if (pi > 0) d += pi * Math.log2(pi / qi);
  }
  return d;
}

/** Jensen–Shannon divergence in bits. */
export function jsDivergence(p: ArrayLike<number>, q: ArrayLike<number>): number {
  let sp = 0;
  let sq = 0;
  for (let i = 0; i < p.length; i++) {
    sp += at(p, i);
    sq += at(q, i);
  }
  const P = Array.from(p, (v) => v / sp);
  const Q = Array.from(q, (v) => v / sq);
  const M = P.map((v, i) => (v + at(Q, i)) / 2);
  return 0.5 * klDivergence(P, M) + 0.5 * klDivergence(Q, M);
}

/** Mutual information in bits of a row-major joint matrix. */
export function mutualInformation(joint: ArrayLike<number>, rows: number, cols: number): number {
  let total = 0;
  for (let i = 0; i < joint.length; i++) total += at(joint, i);
  const px = new Float64Array(rows);
  const py = new Float64Array(cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = at(joint, r * cols + c) / total;
      px[r] = at(px, r) + v;
      py[c] = at(py, c) + v;
    }
  }
  let mi = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = at(joint, r * cols + c) / total;
      if (v > 0) mi += v * Math.log2(v / (at(px, r) * at(py, c)));
    }
  }
  return mi;
}

/** Logistic-map orbit with the same clamping as the kernel. */
export function logisticOrbit(r: number, x0: number, n: number): Float64Array {
  const out = new Float64Array(n);
  let x = x0;
  for (let i = 0; i < n; i++) {
    out[i] = x;
    x = Math.min(1, Math.max(0, r * x * (1 - x)));
  }
  return out;
}

/** Logistic-map Lyapunov exponent `(1/n) Σ ln max(|r(1 − 2x_k)|, 1e−300)` after `transient` iterates. */
export function logisticLyapunov(r: number, x0: number, transient: number, n: number): number {
  const step = (x: number): number => Math.min(1, Math.max(0, r * x * (1 - x)));
  let x = x0;
  for (let i = 0; i < transient; i++) x = step(x);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.log(Math.max(Math.abs(r * (1 - 2 * x)), 1e-300));
    x = step(x);
  }
  return sum / n;
}

/** Bifurcation density image: column `c` iterates `r = rMin + (rMax − rMin)(c + ½)/width` from `x = ½`. */
export function logisticBifurcation(
  rMin: number,
  rMax: number,
  width: number,
  height: number,
  transient: number,
  iterations: number,
): { counts: Uint32Array; max: number } {
  const counts = new Uint32Array(width * height);
  let max = 0;
  for (let c = 0; c < width; c++) {
    const r = rMin + (rMax - rMin) * ((c + 0.5) / width);
    const step = (x: number): number => Math.min(1, Math.max(0, r * x * (1 - x)));
    let x = 0.5;
    for (let i = 0; i < transient; i++) x = step(x);
    for (let i = 0; i < iterations; i++) {
      x = step(x);
      const row = Math.min(height - 1, Math.floor((1 - x) * height));
      const idx = row * width + c;
      counts[idx] = at(counts, idx) + 1;
      max = Math.max(max, at(counts, idx));
    }
  }
  return { counts, max };
}

/** Lorenz system integrated with classical RK4 in double precision. */
export function lorenzRk4(
  sigma: number,
  rho: number,
  beta: number,
  dt: number,
  steps: number,
  start: readonly [number, number, number],
): Float64Array {
  const f = (s: readonly number[]): number[] => {
    const [x = 0, y = 0, z = 0] = s;
    return [sigma * (y - x), x * (rho - z) - y, x * y - beta * z];
  };
  const out = new Float64Array(steps * 3);
  let s = [...start];
  for (let i = 0; i < steps; i++) {
    out.set(s, i * 3);
    const k1 = f(s);
    const k2 = f(s.map((v, j) => v + (dt / 2) * at(k1, j)));
    const k3 = f(s.map((v, j) => v + (dt / 2) * at(k2, j)));
    const k4 = f(s.map((v, j) => v + dt * at(k3, j)));
    s = s.map((v, j) => v + (dt / 6) * (at(k1, j) + 2 * at(k2, j) + 2 * at(k3, j) + at(k4, j)));
  }
  return out;
}

const MASK64 = (1n << 64n) - 1n;

/** PCG32 (O'Neill 2014), `pcg32_srandom_r(seed, stream)` seeding, with BigInt arithmetic. */
export function pcg32(seed: bigint, stream: bigint): () => number {
  let state = 0n;
  const inc = ((stream << 1n) | 1n) & MASK64;
  const next = (): number => {
    const old = state;
    state = (old * 6364136223846793005n + inc) & MASK64;
    const xorshifted = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn);
    const rot = Number(old >> 59n);
    return ((xorshifted >>> rot) | (xorshifted << (-rot & 31))) >>> 0;
  };
  next();
  state = (state + seed) & MASK64;
  next();
  return next;
}

/** Reference CLT histogram (same draws as the kernel: U = u32 / 2^32). */
export function cltHistogram(seed: bigint, terms: number, samples: number, bins: number): Uint32Array {
  const rng = pcg32(seed, 54n);
  const out = new Uint32Array(bins);
  const mean = terms / 2;
  const invSd = 1 / Math.sqrt(terms / 12);
  const scale = bins / 8;
  for (let s = 0; s < samples; s++) {
    let total = 0;
    for (let t = 0; t < terms; t++) total += rng() * (1 / 4294967296);
    const pos = ((total - mean) * invSd + 4) * scale;
    if (pos >= 0) {
      const bin = Math.floor(pos);
      if (bin < bins) out[bin] = at(out, bin) + 1;
    }
  }
  return out;
}

const PERM = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21,
  10, 23, 190, 6, 148, 247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149,
  56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229,
  122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209,
  76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217,
  226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42,
  223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98,
  108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179,
  162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50,
  45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
];
const GRAD3 = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

/** Chris Wellons' lowbias32 hash. */
export function lowbias32(seed: number): number {
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Gustavson (2005) 3D simplex noise with kernel r² = 0.5, seeded lattice hash and normalisation by
 * the worst-case amplitude, transcribed from the paper's Java code.
 */
export function simplexNoise3(xin: number, yin: number, zin: number, seed = 0): number {
  const h = lowbias32(seed);
  const s = [h & 255, (h >>> 8) & 255, (h >>> 16) & 255, h >>> 24] as const;
  const perm = (i: number): number => at(PERM, i & 255);
  const grad = (i: number, j: number, k: number): readonly number[] =>
    GRAD3[(perm(((i & 255) ^ s[0]) + perm(((j & 255) ^ s[1]) + perm((k & 255) ^ s[2]))) ^ s[3]) % 12] ?? [0, 0, 0];
  const F3 = 1 / 3;
  const G3 = 1 / 6;
  const sk = (xin + yin + zin) * F3;
  const i = Math.floor(xin + sk);
  const j = Math.floor(yin + sk);
  const k = Math.floor(zin + sk);
  const t = (i + j + k) * G3;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);
  const z0 = zin - (k - t);
  let o: [number, number, number, number, number, number];
  if (x0 >= y0) {
    if (y0 >= z0) o = [1, 0, 0, 1, 1, 0];
    else if (x0 >= z0) o = [1, 0, 0, 1, 0, 1];
    else o = [0, 0, 1, 1, 0, 1];
  } else if (y0 < z0) o = [0, 0, 1, 0, 1, 1];
  else if (x0 < z0) o = [0, 1, 0, 0, 1, 1];
  else o = [0, 1, 0, 1, 1, 0];
  const [i1, j1, k1, i2, j2, k2] = o;
  const corners: [number, number, number, number, number, number][] = [
    [0, 0, 0, x0, y0, z0],
    [i1, j1, k1, x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3],
    [i2, j2, k2, x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3],
    [1, 1, 1, x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3],
  ];
  let n = 0;
  for (const [di, dj, dk, x, y, z] of corners) {
    let tt = 0.5 - x * x - y * y - z * z;
    if (tt > 0) {
      const g = grad(i + di, j + dj, k + dk);
      tt *= tt;
      n += tt * tt * (at(g, 0) * x + at(g, 1) * y + at(g, 2) * z);
    }
  }
  return Math.min(1, Math.max(-1, n / 0.013007157182859354));
}
