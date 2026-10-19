/**
 * Scroll mappings of the non-linear reading islands (ft-scrolly,
 * ft-horizontal, ft-reading-progress). The islands only measure the page
 * (IntersectionObserver entries, bounding boxes); every mapping from those
 * measurements to narrative state lives here, pure and tested.
 *
 * Non-linear scroll — scroll distance ≠ narrative time. Inside a scrollytelling
 * step the linear progress λ ∈ [0, 1] of the step across the reading line is
 * mapped through the cubic Hermite smoothstep
 *
 *     s(λ) = λ² (3 − 2λ),      s(0) = 0, s(1) = 1, s′(0) = s′(1) = 0,
 *
 * (the GLSL `smoothstep`; Perlin & Hoffert, "Hypertexture", SIGGRAPH 1989):
 * the narrative lingers at the beginning and at the end of a step, where the
 * text is being read, and moves fastest midway, between paragraphs. The map is
 * a monotone bijection of [0, 1] (s′(λ) = 6λ(1 − λ) ≥ 0, vanishing only at the
 * ends), symmetric about its midpoint (s(1 − λ) = 1 − s(λ)), so nothing the
 * reader can reach is skipped and scrolling back retraces the same states.
 */

/** Clamps to [0, 1]; NaN (a degenerate measurement) maps to 0. */
export const clamp01 = (x: number): number => (Number.isNaN(x) ? 0 : Math.min(1, Math.max(0, x)));

/** Cubic smoothstep on [0, 1], clamped outside. */
export const smoothstep = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/**
 * Linear progress of a box (a step) across a horizontal reading line placed at
 * `line` × viewport height: 0 while its top is below the line, 1 once its
 * bottom has passed it. Inputs are viewport coordinates (getBoundingClientRect).
 */
export const crossingProgress = (top: number, height: number, viewportHeight: number, line = 0.5): number => {
  const y = line * viewportHeight;
  if (height <= 0) return top <= y ? 1 : 0;
  return clamp01((y - top) / height);
};

/** Narrative time inside a step: the smoothstep of its crossing progress. */
export const narrativeTime = (top: number, height: number, viewportHeight: number, line = 0.5): number =>
  smoothstep(crossingProgress(top, height, viewportHeight, line));

/**
 * The active step, given the indices of the steps that currently cross the
 * reading line (IntersectionObserver with a one-line root margin). When two
 * cross it (adjacent edges), the later one wins; when none does (between
 * steps, above or below the scrolly), the previous choice is kept.
 */
export const activeStep = (crossing: Iterable<number>, previous: number | null): number | null => {
  let best: number | null = null;
  for (const i of crossing) if (best === null || i > best) best = i;
  return best ?? previous;
};

/**
 * Progress through a box taller than the viewport while it is pinned: 0 when
 * its top reaches the top of the viewport, 1 when its bottom reaches the
 * bottom. Used for the pinned horizontal passage and for reading progress.
 * A box that fits in the viewport is either not reached (0) or passed (1).
 */
export const pinnedProgress = (top: number, height: number, viewportHeight: number): number => {
  const travel = height - viewportHeight;
  if (travel <= 0) return top <= 0 ? 1 : 0;
  return clamp01(-top / travel);
};

/** Pinned progress at which panel i (0-based) of n is fully in view. */
export const progressOfPanel = (i: number, panels: number): number => (panels <= 1 ? 0 : clamp01(i / (panels - 1)));

/** Panel shown at a given pinned progress (nearest). */
export const panelAt = (progress: number, panels: number): number =>
  panels <= 1 ? 0 : Math.round(clamp01(progress) * (panels - 1));

/**
 * Document scroll offset that shows panel i of a pinned horizontal passage
 * whose box starts at `boxTop` (document coordinate) — the inverse of
 * pinnedProgress, used to bring a focused panel into view.
 */
export const scrollOffsetForPanel = (
  i: number,
  panels: number,
  boxTop: number,
  boxHeight: number,
  viewportHeight: number,
): number => boxTop + progressOfPanel(i, panels) * Math.max(0, boxHeight - viewportHeight);

/** Where a section heading is relative to the reading band (the top part of the viewport). */
export type BandPosition = 'above' | 'in' | 'below';

/**
 * Current section for a scroll-spy (argument map, table of contents): the last
 * heading inside the reading band; when none is inside, the last heading that
 * has already scrolled above it; null before the first heading. Positions come
 * from IntersectionObserver entries (no scroll handlers), indexed in document order.
 */
export const currentSection = (positions: ReadonlyMap<number, BandPosition>): number | null => {
  let inside: number | null = null;
  let above: number | null = null;
  for (const [i, p] of positions) {
    if (p === 'in' && (inside === null || i > inside)) inside = i;
    if (p === 'above' && (above === null || i > above)) above = i;
  }
  return inside ?? above;
};

/** Band position of a box from an IntersectionObserver entry's geometry (viewport coordinates). */
export const bandPosition = (isIntersecting: boolean, top: number, bandTop: number): BandPosition =>
  isIntersecting ? 'in' : top < bandTop ? 'above' : 'below';
