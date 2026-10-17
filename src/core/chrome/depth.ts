/**
 * Depth (parallax) mappings — pure geometry shared by CSS and the JS fallback.
 *
 * Layers declare data-depth ∈ {-3 … 3}: positive values recede (move with the
 * page more slowly), negative values approach. The CSS in src/styles/motion.css
 * translates each layer by
 *
 *     (progress − ½) · unit · depth · motion
 *
 * where progress is the CSS `view()` timeline progress with
 * `animation-range: cover` (CSS Scroll-driven Animations Level 1, §3.2/§4):
 * 0 when the subject's start edge meets the end of the viewport, 1 when its end
 * edge leaves the start of the viewport. Where scroll-driven animations are not
 * available, <ft-depth-scene> computes the same progress from geometry with
 * viewProgress() and writes it as --scroll-progress.
 */

export const DEPTHS = [-3, -2, -1, 0, 1, 2, 3] as const;
export type Depth = (typeof DEPTHS)[number];

/** Parses a data-depth attribute; anything outside the closed set is rejected (null). */
export const parseDepth = (value: string | null | undefined): Depth | null => {
  if (value === null || value === undefined || !/^-?[0-3]$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return (DEPTHS as readonly number[]).includes(n) ? (n as Depth) : null;
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * `view()` progress over the `cover` range, along the block axis.
 *
 * @param top      distance from the viewport's top edge to the subject's top edge (px; negative when scrolled past)
 * @param height   subject height (px, ≥ 0)
 * @param viewport viewport height (px, > 0)
 * @returns progress in [0, 1]; ½ when the subject is centred in the viewport.
 *          Degenerate input (non-finite or empty range) yields the resting value ½.
 */
export const viewProgress = (top: number, height: number, viewport: number): number => {
  const range = viewport + Math.max(0, height);
  if (!Number.isFinite(top) || !Number.isFinite(range) || range <= 0) return 0.5;
  return clamp01((viewport - top) / range);
};

/**
 * Translation along the block axis (same unit as `unit`) of a layer at the
 * given depth, mirroring the CSS formula; motion ∈ {0, 1} multiplies it out.
 */
export const depthOffset = (progress: number, depth: Depth, unit: number, motion: 0 | 1): number =>
  (clamp01(progress) - 0.5) * unit * depth * motion;

/** Rounds a progress value for writing into a custom property (stable strings, fewer style invalidations). */
export const progressToken = (progress: number): string => clamp01(progress).toFixed(3);
