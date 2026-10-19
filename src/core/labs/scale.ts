/**
 * Scales: affine (linear) and logarithmic maps from a data domain to a screen range, with their inverses
 * (the d3-scale model: M. Bostock et al., d3-scale, BSD-3; reimplemented here as pure functions).
 *
 *   linear(x) = r0 + (x − d0)·(r1 − r0)/(d1 − d0)
 *   log(x)    = r0 + (log x − log d0)·(r1 − r0)/(log d1 − log d0),   d0, d1 > 0
 *
 * Laws (tests/unit/labs/scale.test.ts): invert ∘ scale = id on the domain (up to rounding); scales are
 * monotone; the domain bounds map to the range bounds. A degenerate domain (d0 = d1) maps every value to
 * the middle of the range, so a plot of a constant still draws.
 */
import { err, ok, type Result } from '../algebra/result.ts';

export interface Scale {
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  /** Domain → range. */
  readonly map: (x: number) => number;
  /** Range → domain. */
  readonly invert: (y: number) => number;
}

export const linearScale = (d0: number, d1: number, r0: number, r1: number): Scale => {
  const span = d1 - d0;
  const mid = (r0 + r1) / 2;
  if (span === 0 || !Number.isFinite(span)) {
    return { domain: [d0, d1], range: [r0, r1], map: () => mid, invert: () => d0 };
  }
  const k = (r1 - r0) / span;
  return {
    domain: [d0, d1],
    range: [r0, r1],
    map: (x) => r0 + (x - d0) * k,
    invert: (y) => (k === 0 ? d0 : d0 + (y - r0) / k),
  };
};

/** Logarithmic scale; the domain must be positive and finite. */
export const logScale = (d0: number, d1: number, r0: number, r1: number): Result<Scale, string> => {
  if (!(d0 > 0) || !(d1 > 0) || !Number.isFinite(d0) || !Number.isFinite(d1)) {
    return err(`a logarithmic scale needs a positive, finite domain, got [${d0}, ${d1}]`);
  }
  const inner = linearScale(Math.log(d0), Math.log(d1), r0, r1);
  return ok({
    domain: [d0, d1],
    range: [r0, r1],
    map: (x) => (x > 0 ? inner.map(Math.log(x)) : Number.NaN),
    invert: (y) => Math.exp(inner.invert(y)),
  });
};

/** Clamps `x` to [lo, hi] (NaN stays NaN). */
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
