/**
 * OKLCH → sRGB, for consumers that cannot read the CSS custom properties: the
 * `theme-color` meta element (a hex value is the form every browser accepts)
 * and the Open Graph card, which is rasterised outside any browser.
 *
 * Method: B. Ottosson, "A perceptual color space for image processing" (2020),
 * https://bottosson.github.io/posts/oklab/ — OKLCH is OKLab in polar form
 * (a = C·cos h, b = C·sin h); OKLab → LMS′ → LMS (cube) → linear sRGB with the
 * published matrices; then the sRGB transfer function (IEC 61966-2-1). Values
 * outside the sRGB gamut are clipped per channel; the site's palette is checked
 * to be inside the gamut by scripts/verify-palette.ts, so clipping does not occur
 * for the design tokens. Cross-checked against colorjs.io in the unit tests.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { ColorScheme, Oklch, Tokens } from '../design/tokens.ts';

export type Rgb = readonly [r: number, g: number, b: number];

/** OKLCH (L in 0–1, C, h in degrees) → linear-light sRGB, unclipped. */
export const oklchToLinearSrgb = ([l, c, h]: Oklch): Rgb => {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l1 = l + 0.3963377774 * a + 0.2158037573 * b;
  const m1 = l - 0.1055613458 * a - 0.0638541728 * b;
  const s1 = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l1 ** 3;
  const M = m1 ** 3;
  const S = s1 ** 3;
  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
};

/** sRGB transfer function (IEC 61966-2-1), on a clipped linear value. */
const encode = (x: number): number => {
  const v = Math.min(1, Math.max(0, x));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

/** OKLCH → 8-bit sRGB channels (0–255), clipped to the gamut. */
export const oklchToSrgb8 = (color: Oklch): Rgb => {
  const [r, g, b] = oklchToLinearSrgb(color);
  return [Math.round(encode(r) * 255), Math.round(encode(g) * 255), Math.round(encode(b) * 255)];
};

const hex2 = (n: number): string => n.toString(16).padStart(2, '0');

/** OKLCH → "#rrggbb" (lower case). */
export const oklchToHex = (color: Oklch): string => {
  const [r, g, b] = oklchToSrgb8(color);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
};

/** A colour token of one scheme as "#rrggbb"; an error names the missing token. */
export const tokenHex = (tokens: Tokens, scheme: ColorScheme, name: string): Result<string, string> => {
  const color = Object.hasOwn(tokens.colors[scheme], name) ? tokens.colors[scheme][name] : undefined;
  return color === undefined ? err(`color.${scheme}.${name} is not a design token`) : ok(oklchToHex(color));
};

/**
 * The two `theme-color` values (HTML Living Standard §4.2.5.4): the paper of the
 * light and of the dark scheme, so the browser chrome continues the page.
 */
export const themeColors = (tokens: Tokens): Result<{ readonly light: string; readonly dark: string }, string> => {
  const light = tokenHex(tokens, 'light', 'paper');
  const dark = tokenHex(tokens, 'dark', 'paper');
  if (!light.ok) return light;
  if (!dark.ok) return dark;
  return ok({ light: light.value, dark: dark.value });
};
