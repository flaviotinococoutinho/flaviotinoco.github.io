/**
 * The central limit theorem for sums of uniforms (P.-S. Laplace, 1810; the Irwin–Hall distribution:
 * J. O. Irwin, Biometrika 19, 1927; P. Hall, Biometrika 19, 1927).
 *
 * `dynamics.wasm` (`clt_histogram`) draws `samples` sums S_n of n i.i.d. U[0, 1) and histograms
 * Z_n = (S_n − n/2)/√(n/12) over [−4, 4). Here: the standard normal pdf φ and cdf Φ, the density of a
 * histogram, and a Kolmogorov–Smirnov–type distance between the histogram and Φ (A. N. Kolmogorov, 1933;
 * N. V. Smirnov, 1939), evaluated at the bin edges: D = max_k |F_n(e_k) − Φ(e_k)|, F_n the empirical
 * cdf. Evaluated only at edges, D is a lower bound of the KS statistic of the raw sums; mass below −4
 * (P < 3.2·10⁻⁵ under the normal) is taken as zero.
 *
 * Φ uses the complementary error function erfc by Chebyshev fitting of W. H. Press et al., Numerical
 * Recipes in C, 2nd ed., 1992, §6.2 (`erfcc`), fractional error below 1.2·10⁻⁷ everywhere.
 */

/** Standard normal density φ(z). */
export const normalPdf = (z: number): number => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/** erfc(x) (Numerical Recipes `erfcc`). */
export const erfc = (x: number): number => {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
};

/** Standard normal cdf Φ(z) = erfc(−z/√2)/2. */
export const normalCdf = (z: number): number => 0.5 * erfc(-z / Math.SQRT2);

/** The histogram window of `clt_histogram`. */
export const CLT_RANGE = { min: -4, max: 4 } as const;

/** Bin edges e_0 … e_bins of `bins` equal bins over [min, max]. */
export const binEdges = (bins: number, min: number = CLT_RANGE.min, max: number = CLT_RANGE.max): readonly number[] =>
  Array.from({ length: Math.max(1, bins) + 1 }, (_, k) => min + ((max - min) * k) / Math.max(1, bins));

/** Density estimate counts_k / (samples · width) of each bin. */
export const histogramDensity = (counts: ArrayLike<number>, samples: number, width: number): readonly number[] =>
  Array.from({ length: counts.length }, (_, k) => (samples > 0 && width > 0 ? (counts[k] ?? 0) / (samples * width) : 0));

/** max_k |F_n(e_k) − Φ(e_k)| over the bin edges (see the module comment); 0 for no samples. */
export const ksDistance = (counts: ArrayLike<number>, samples: number, edges: readonly number[]): number => {
  if (!(samples > 0)) return 0;
  let cumulative = 0;
  let d = Math.abs(normalCdf(edges[0] ?? CLT_RANGE.min));
  for (let k = 0; k < counts.length; k++) {
    cumulative += counts[k] ?? 0;
    d = Math.max(d, Math.abs(cumulative / samples - normalCdf(edges[k + 1] ?? CLT_RANGE.max)));
  }
  return d;
};

/** |Z_n| ≤ √(3n): the standardised sum of n uniforms never leaves this interval. */
export const supportBound = (n: number): number => Math.sqrt(3 * Math.max(0, n));

const factorial = (n: number): number => {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
};
const binomial = (n: number, k: number): number => factorial(n) / (factorial(k) * factorial(n - k));

/**
 * Density of Z_n (the standardised Irwin–Hall distribution):
 * f_S(s) = (1/(n−1)!) Σ_{k=0}^{⌊s⌋} (−1)^k C(n, k) (s − k)^{n−1} on [0, n], f_Z(z) = σ·f_S(n/2 + σz),
 * σ = √(n/12). Exact for small n (used by the thumbnail; cancellation grows with n).
 */
export const irwinHallDensity = (n: number, z: number): number => {
  const m = Math.max(1, Math.trunc(n));
  const sigma = Math.sqrt(m / 12);
  const s = m / 2 + sigma * z;
  if (s < 0 || s > m) return 0;
  let sum = 0;
  for (let k = 0; k <= Math.floor(s); k++) sum += (k % 2 === 0 ? 1 : -1) * binomial(m, k) * (s - k) ** (m - 1);
  return Math.max(0, (sigma * sum) / factorial(m - 1));
};
