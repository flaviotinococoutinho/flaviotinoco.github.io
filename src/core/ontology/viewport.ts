/**
 * Pan and zoom of an SVG map as pure algebra on view boxes.
 *
 * The drawing keeps its user coordinates; navigation only changes the
 * `viewBox` (SVG 2, §8.2). Zoom is a scaling of the view box about an anchor
 * point that stays fixed on screen — the point under the pointer for the wheel,
 * the centre for buttons and keys — so zooming in and then out by the same
 * factor returns the same view (up to rounding):
 *
 *     zoomAt(zoomAt(v, f, p), 1/f, p) = v      while no clamp is hit.
 *
 * The scale is relative to the BASE view box (the whole drawing) and clamped to
 * [MIN_SCALE, MAX_SCALE]; the centre of the view is clamped to the base box, so
 * the drawing can never be panned out of sight. Pure; the island maps pointer
 * and keyboard events to these calls.
 */
import type { Point } from './layout.ts';

export interface ViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Zoom limits relative to the whole drawing (1 = all of it visible). */
export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
/** One zoom step (buttons, keys): √2, so two steps double the scale. */
export const ZOOM_STEP = Math.SQRT2;
/** Fraction of the visible width moved by one arrow-key pan step. */
export const PAN_STEP = 0.1;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Scale of a view relative to the base view (base width / view width). */
export const scaleOf = (base: ViewBox, view: ViewBox): number => (view.width > 0 ? base.width / view.width : 1);

/** Keeps the centre of `view` inside `base`. */
export const clampToBase = (base: ViewBox, view: ViewBox): ViewBox => {
  const cx = clamp(view.x + view.width / 2, base.x, base.x + base.width);
  const cy = clamp(view.y + view.height / 2, base.y, base.y + base.height);
  return { x: cx - view.width / 2, y: cy - view.height / 2, width: view.width, height: view.height };
};

/**
 * Multiplies the scale by `factor` keeping `anchor` (user coordinates) fixed on
 * screen. The resulting scale is clamped to [MIN_SCALE, MAX_SCALE].
 */
export const zoomAt = (base: ViewBox, view: ViewBox, factor: number, anchor: Point): ViewBox => {
  if (!(factor > 0) || !Number.isFinite(factor)) return view;
  const scale = clamp(scaleOf(base, view) * factor, MIN_SCALE, MAX_SCALE);
  const width = base.width / scale;
  const height = base.height / scale;
  // The anchor keeps its relative position inside the view: (anchor - x) / width is invariant.
  const rx = view.width > 0 ? (anchor.x - view.x) / view.width : 0.5;
  const ry = view.height > 0 ? (anchor.y - view.y) / view.height : 0.5;
  return clampToBase(base, { x: anchor.x - rx * width, y: anchor.y - ry * height, width, height });
};

/** Zoom about the centre of the view. */
export const zoomCentre = (base: ViewBox, view: ViewBox, factor: number): ViewBox =>
  zoomAt(base, view, factor, { x: view.x + view.width / 2, y: view.y + view.height / 2 });

/** Moves the view by (dx, dy) user units. */
export const panBy = (base: ViewBox, view: ViewBox, dx: number, dy: number): ViewBox =>
  clampToBase(base, { ...view, x: view.x + dx, y: view.y + dy });

/**
 * User coordinates of a client (screen) point, for an SVG laid out in `rect`
 * with preserveAspectRatio="xMidYMid meet" (the default): the view box is
 * scaled uniformly to fit and centred in the element's box.
 */
export const clientToUser = (
  view: ViewBox,
  rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  client: Point,
): Point => {
  if (rect.width <= 0 || rect.height <= 0 || view.width <= 0 || view.height <= 0) {
    return { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  }
  const s = Math.min(rect.width / view.width, rect.height / view.height);
  const ox = rect.left + (rect.width - view.width * s) / 2;
  const oy = rect.top + (rect.height - view.height * s) / 2;
  return { x: view.x + (client.x - ox) / s, y: view.y + (client.y - oy) / s };
};

/** Length of `pixels` screen pixels in user units (for drag panning). */
export const pixelsToUser = (
  view: ViewBox,
  rect: { readonly width: number; readonly height: number },
  pixels: number,
): number => {
  if (rect.width <= 0 || rect.height <= 0 || view.width <= 0 || view.height <= 0) return 0;
  return pixels / Math.min(rect.width / view.width, rect.height / view.height);
};

/** The smallest pan that brings `p` (with a margin) inside the view; the view itself when it already is. */
export const ensureVisible = (base: ViewBox, view: ViewBox, p: Point, margin: number): ViewBox => {
  const m = Math.min(margin, view.width / 4, view.height / 4);
  const dx =
    p.x < view.x + m ? p.x - (view.x + m) : p.x > view.x + view.width - m ? p.x - (view.x + view.width - m) : 0;
  const dy =
    p.y < view.y + m ? p.y - (view.y + m) : p.y > view.y + view.height - m ? p.y - (view.y + view.height - m) : 0;
  return dx === 0 && dy === 0 ? view : panBy(base, view, dx, dy);
};

const fmt = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** The `viewBox` attribute value of a view. */
export const viewBoxString = (v: ViewBox): string => `${fmt(v.x)} ${fmt(v.y)} ${fmt(v.width)} ${fmt(v.height)}`;

/** Parses a `viewBox` attribute ("min-x min-y width height", comma or space separated), or null. */
export const parseViewBox = (s: string | null | undefined): ViewBox | null => {
  if (typeof s !== 'string') return null;
  const parts = s
    .trim()
    .split(/[\s,]+/u)
    .map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return null;
  const [x = 0, y = 0, width = 0, height = 0] = parts;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
};

/** Parses the `translate(x y)` (or `translate(x, y)`) transform the scene writes on nodes, or null. */
export const parseTranslate = (s: string | null | undefined): Point | null => {
  if (typeof s !== 'string') return null;
  const m = /^\s*translate\(\s*(-?[\d.]+(?:e-?\d+)?)[\s,]+(-?[\d.]+(?:e-?\d+)?)\s*\)\s*$/u.exec(s);
  if (m === null) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};
