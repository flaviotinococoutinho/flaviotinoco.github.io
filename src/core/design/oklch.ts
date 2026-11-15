/**
 * OKLCH → sRGB, for renderers that do not read `oklch()` (the share cards: satori and resvg).
 *
 * OKLab is Björn Ottosson's perceptual space ("A perceptual color space for image processing", 2020):
 * OKLCH → OKLab (polar to Cartesian), OKLab → LMS′ (M₂⁻¹), cube, LMS → linear sRGB (M₁⁻¹), then the sRGB
 * transfer function (IEC 61966-2-1). The palette guardrail (scripts/verify-palette.ts) keeps every token
 * inside the sRGB gamut, so the final clamp only absorbs rounding.
 */
import type { Oklch } from './tokens.ts';

/** Linear sRGB component in [0, 1] → its sRGB-encoded value (IEC 61966-2-1). */
const encode = (x: number): number => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);

const clamp01 = (x: number): number => (Number.isNaN(x) ? 0 : Math.min(1, Math.max(0, x)));

/** sRGB components in [0, 1] of an OKLCH colour (L in [0, 1], C ≥ 0, h in degrees). */
export const oklchToSrgb = ([l, c, h]: Oklch): readonly [number, number, number] => {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const g = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  return [clamp01(encode(r)), clamp01(encode(g)), clamp01(encode(bl))];
};

/** `#rrggbb` of an OKLCH colour. */
export const hexOf = (color: Oklch): string =>
  `#${oklchToSrgb(color)
    .map((x) =>
      Math.round(x * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
