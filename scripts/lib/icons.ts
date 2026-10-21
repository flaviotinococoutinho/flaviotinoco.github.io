/**
 * Touch icon (pure): the favicon's drawing over an opaque paper square.
 *
 * iOS and Android composite the apple-touch-icon over their own background and
 * round its corners; the SVG favicon has no background and switches its ink
 * with prefers-color-scheme. The PNG therefore gets the light paper (the
 * page's theme-color) and the light ink whatever the device theme: the
 * favicon's `@media (prefers-color-scheme: dark)` rule is removed, nothing
 * else of its style changes.
 *
 * The function only edits the document; rendering is the shell's job
 * (scripts/icons.ts, resvg).
 */
import { err, ok, type Result } from '../../src/core/algebra/result.ts';

export interface TouchIconSpec {
  /** Edge of the PNG in pixels (Apple's reference size is 180). */
  readonly size: number;
  /** Opaque background (CSS colour). */
  readonly background: string;
  /** Fraction of the edge kept as margin on each side, so the mark is not clipped by rounded corners. */
  readonly margin: number;
}

export const TOUCH_ICON: TouchIconSpec = { size: 180, background: '#f9f6f2', margin: 0.12 };

const VIEW_BOX = /viewBox="\s*0\s+0\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*"/;
const DARK_RULE = /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;

/** The favicon content scaled into a square of `spec.size` over a filled rectangle. */
export const touchIconSvg = (favicon: string, spec: TouchIconSpec = TOUCH_ICON): Result<string, string> => {
  const box = VIEW_BOX.exec(favicon);
  const open = /<svg\b[^>]*>/.exec(favicon);
  const close = favicon.lastIndexOf('</svg>');
  if (box === null || open === null || close < 0) return err('favicon: expected an <svg> with viewBox="0 0 w h"');
  const width = Number(box[1]);
  const height = Number(box[2]);
  if (!(width > 0) || !(height > 0)) return err('favicon: the view box must be positive');
  if (!(spec.size > 0) || !(spec.margin >= 0) || !(spec.margin < 0.5)) return err('touch icon: invalid size or margin');
  const inner = favicon
    .slice(open.index + open[0].length, close)
    .replace(DARK_RULE, '')
    .trim();
  const side = Math.max(width, height);
  const round = (x: number): number => Number(x.toFixed(4));
  const scale = round(((1 - 2 * spec.margin) * spec.size) / side);
  const dx = round(spec.margin * spec.size + ((side - width) * scale) / 2);
  const dy = round(spec.margin * spec.size + ((side - height) * scale) / 2);
  return ok(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.size}" height="${spec.size}" viewBox="0 0 ${spec.size} ${spec.size}">` +
      `<rect width="${spec.size}" height="${spec.size}" fill="${spec.background}"/>` +
      `<g transform="translate(${dx} ${dy}) scale(${scale})">${inner}</g></svg>`,
  );
};
