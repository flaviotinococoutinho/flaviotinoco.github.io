/**
 * Scroll mappings of the reading islands (ft-scrolly, ft-reading-progress,
 * ft-reading-memory, and the reading room's clock). The islands only measure the page
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
 * bottom. Used for reading progress (the hairline, the memory, the room's clock).
 * A box that fits in the viewport is either not reached (0) or passed (1).
 */
export const pinnedProgress = (top: number, height: number, viewportHeight: number): number => {
  const travel = height - viewportHeight;
  if (travel <= 0) return top <= 0 ? 1 : 0;
  return clamp01(-top / travel);
};
