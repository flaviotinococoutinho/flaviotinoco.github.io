/**
 * Colour-vision-deficiency simulation (pure functions on linear sRGB).
 *
 * Model: Machado, Oliveira & Fernandes (2009), "A Physiologically-based Model
 * for Simulation of Color Vision Deficiency", IEEE TVCG 15(6):1291–1298.
 * Matrices for severity 1.0 (dichromacy), applied to LINEAR RGB.
 * Achromatopsia (rod monochromacy) is approximated by relative luminance Y
 * (ITU-R BT.709 coefficients), which is what remains of the signal.
 */

export type Vec3 = readonly [number, number, number];
type Mat3 = readonly [Vec3, Vec3, Vec3];

export const CVD_TYPES = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const;
export type CvdType = (typeof CVD_TYPES)[number];

export const MACHADO_2009: Readonly<Record<Exclude<CvdType, 'achromatopsia'>, Mat3>> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const mul = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

/** Simulates how a linear-sRGB colour is perceived under the given deficiency. */
export const simulateLinear = (rgb: Vec3, type: CvdType): Vec3 => {
  const v: Vec3 = [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
  if (type === 'achromatopsia') {
    const y = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    return [y, y, y];
  }
  const out = mul(MACHADO_2009[type], v);
  return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])];
};

/**
 * The same matrices as an SVG <feColorMatrix type="matrix"> value (4×5, row-major),
 * used by the in-browser simulation filters. Note: SVG filters operate in
 * linearRGB by default (color-interpolation-filters), matching the model.
 */
export const feColorMatrixValues = (type: CvdType): string => {
  const m: Mat3 =
    type === 'achromatopsia'
      ? [
          [0.2126, 0.7152, 0.0722],
          [0.2126, 0.7152, 0.0722],
          [0.2126, 0.7152, 0.0722],
        ]
      : MACHADO_2009[type];
  return [...m.map((r) => `${r[0]} ${r[1]} ${r[2]} 0 0`), '0 0 0 1 0'].join(' ');
};
