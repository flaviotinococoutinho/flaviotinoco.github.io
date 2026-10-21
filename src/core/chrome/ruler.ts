/**
 * Reading ruler — pure geometry of the band that <ft-reading-ruler> places over
 * the page (src/islands/elements/ft-reading-ruler.ts).
 *
 * A reading ruler keeps the eye on the current line; the British Dyslexia
 * Association's style guide lists it among the aids that help readers with
 * dyslexia track text. The band is `lines` lines tall, centred on the pointer
 * (or covering the focused element), and never leaves the viewport.
 */

export interface RulerBand {
  /** Distance from the top of the viewport, in CSS px (≥ 0). */
  readonly top: number;
  /** Height in CSS px (> 0, ≤ viewport height). */
  readonly height: number;
}

/** Minimum band height, so a tiny line height never yields an invisible band. */
export const MIN_BAND = 24;
/** Largest line height considered (px): keeps the arithmetic finite for absurd computed values. */
export const MAX_LINE = 1000;

const finite = (n: number, fallback: number): number => (Number.isFinite(n) ? n : fallback);

/** A band of `height` px starting at `top`, moved (and if needed shrunk) to fit a viewport of `viewportHeight` px. */
export const clampBand = (top: number, height: number, viewportHeight: number): RulerBand => {
  const vh = Math.max(0, finite(viewportHeight, 0));
  const h = Math.min(Math.max(MIN_BAND, finite(height, MIN_BAND)), Math.max(vh, 1));
  const t = Math.min(Math.max(0, finite(top, 0)), Math.max(0, vh - h));
  return { top: t, height: h };
};

/** The band of `lines` lines of `lineHeight` px centred on the pointer's y. */
export const bandAround = (y: number, lineHeight: number, viewportHeight: number, lines = 2): RulerBand => {
  const height = Math.max(MIN_BAND, finite(lineHeight, MIN_BAND) * Math.max(1, lines));
  return clampBand(finite(y, 0) - height / 2, height, viewportHeight);
};

/** The band covering a focused element's box (its viewport rect), at least one line tall. */
export const bandForRect = (
  rect: { readonly top: number; readonly height: number },
  lineHeight: number,
  viewportHeight: number,
): RulerBand => {
  const height = Math.max(finite(rect.height, 0), finite(lineHeight, MIN_BAND), MIN_BAND);
  return clampBand(finite(rect.top, 0), height, viewportHeight);
};

/**
 * Line height in px from a computed `line-height` value: "27px" → 27; "normal" → 1.2 × the
 * font size (the usual UA ratio); anything else → the font size × 1.5.
 */
export const lineHeightOf = (computed: string, fontSizePx: number): number => {
  const size = Math.min(MAX_LINE, Math.max(1, finite(fontSizePx, 16)));
  const value = computed.trim();
  if (value.endsWith('px')) {
    const px = Number.parseFloat(value);
    if (Number.isFinite(px) && px > 0) return Math.min(MAX_LINE, px);
  }
  if (value === 'normal') return size * 1.2;
  return size * 1.5;
};
