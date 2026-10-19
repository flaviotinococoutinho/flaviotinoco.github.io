/**
 * SVG path data (SVG 2, §9.3 "Path data") built from numbers by pure functions: polylines with gaps,
 * histograms, stems, cobweb diagrams. Coordinates are rounded to a fixed number of decimals and printed
 * without trailing zeros, so paths are compact and deterministic (identical inputs, identical strings).
 *
 * Non-finite points (NaN, ±∞) break a polyline into separate subpaths instead of drawing a wrong segment;
 * an isolated finite point becomes a zero-length subpath ("M x y Z"), which round line caps render as a dot.
 *
 * Laws (tests/unit/labs/path.test.ts): one subpath per maximal run of finite points; every coordinate
 * printed is the scaled value rounded to `decimals`.
 */
import type { Scale } from './scale.ts';

/** `x` rounded to `decimals` (0–6) and printed without trailing zeros; `-0` prints as `0`. */
export const formatCoordinate = (x: number, decimals = 2): string => {
  const d = Math.min(6, Math.max(0, Math.trunc(decimals)));
  const r = Number(x.toFixed(d));
  return Object.is(r, -0) ? '0' : String(r);
};

export interface PathOptions {
  readonly decimals?: number;
}

/** A polyline through (xs[i], ys[i]) mapped by the scales; breaks at non-finite points. */
export const polylinePath = (
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  sx: Scale,
  sy: Scale,
  options: PathOptions = {},
): string => {
  const d = options.decimals ?? 2;
  const n = Math.min(xs.length, ys.length);
  const parts: string[] = [];
  let run = 0;
  for (let i = 0; i < n; i++) {
    const x = sx.map(xs[i] ?? Number.NaN);
    const y = sy.map(ys[i] ?? Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (run === 1) parts.push('Z');
      run = 0;
      continue;
    }
    parts.push(`${run === 0 ? 'M' : 'L'}${formatCoordinate(x, d)} ${formatCoordinate(y, d)}`);
    run++;
  }
  if (run === 1) parts.push('Z');
  return parts.join('');
};

/** Dots: one zero-length subpath per finite point ("M x y Z"), drawn by round line caps. */
export const pointsPath = (
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  sx: Scale,
  sy: Scale,
  options: PathOptions = {},
): string => {
  const d = options.decimals ?? 2;
  const parts: string[] = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const x = sx.map(xs[i] ?? Number.NaN);
    const y = sy.map(ys[i] ?? Number.NaN);
    if (Number.isFinite(x) && Number.isFinite(y)) parts.push(`M${formatCoordinate(x, d)} ${formatCoordinate(y, d)}Z`);
  }
  return parts.join('');
};

/** A function y = f(x) sampled at `count` evenly spaced points of [x0, x1] (count ≥ 2). */
export const functionPath = (
  f: (x: number) => number,
  x0: number,
  x1: number,
  count: number,
  sx: Scale,
  sy: Scale,
  options: PathOptions = {},
): string => {
  const n = Math.max(2, Math.trunc(count));
  const xs = Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * i) / (n - 1));
  return polylinePath(
    xs,
    xs.map((x) => f(x)),
    sx,
    sy,
    options,
  );
};

/**
 * Histogram bars: bar i spans [edges[i], edges[i+1]] horizontally and [baseline, heights[i]] vertically,
 * drawn as closed rectangles in one path. Zero-height and non-finite bars are skipped.
 */
export const barsPath = (
  edges: ArrayLike<number>,
  heights: ArrayLike<number>,
  sx: Scale,
  sy: Scale,
  baseline = 0,
  options: PathOptions = {},
): string => {
  const d = options.decimals ?? 2;
  const f = (v: number): string => formatCoordinate(v, d);
  const parts: string[] = [];
  const y0 = sy.map(baseline);
  for (let i = 0; i < heights.length && i + 1 < edges.length; i++) {
    const h = heights[i] ?? Number.NaN;
    if (!Number.isFinite(h) || h === baseline) continue;
    const xa = sx.map(edges[i] ?? Number.NaN);
    const xb = sx.map(edges[i + 1] ?? Number.NaN);
    const y = sy.map(h);
    if (![xa, xb, y, y0].every(Number.isFinite)) continue;
    parts.push(`M${f(xa)} ${f(y0)}H${f(xb)}V${f(y)}H${f(xa)}Z`);
  }
  return parts.join('');
};

/** Vertical stems from the baseline to each point (sample plots, "lollipops"). */
export const stemsPath = (
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  sx: Scale,
  sy: Scale,
  baseline = 0,
  options: PathOptions = {},
): string => {
  const d = options.decimals ?? 2;
  const y0 = sy.map(baseline);
  const parts: string[] = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const x = sx.map(xs[i] ?? Number.NaN);
    const y = sy.map(ys[i] ?? Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(y0)) continue;
    parts.push(`M${formatCoordinate(x, d)} ${formatCoordinate(y0, d)}V${formatCoordinate(y, d)}`);
  }
  return parts.join('');
};

/**
 * The vertices of a cobweb (Verhulst/Lémeray) diagram of an orbit x0, x1, …: starting on the diagonal
 * (x0, x0), each iterate goes vertically to the graph (x_k, x_{k+1}) and horizontally back to the
 * diagonal (x_{k+1}, x_{k+1}).
 */
export const cobwebPoints = (orbit: ArrayLike<number>): { readonly xs: number[]; readonly ys: number[] } => {
  const xs: number[] = [];
  const ys: number[] = [];
  const first = orbit[0];
  if (first === undefined) return { xs, ys };
  xs.push(first);
  ys.push(first);
  for (let k = 0; k + 1 < orbit.length; k++) {
    const a = orbit[k] ?? Number.NaN;
    const b = orbit[k + 1] ?? Number.NaN;
    xs.push(a, b);
    ys.push(b, b);
  }
  return { xs, ys };
};
