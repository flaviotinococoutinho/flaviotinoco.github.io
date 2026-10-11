/**
 * Proportional systems, as pure functions of the token data.
 *
 * Fluid type follows the Utopia method (Gilyead & Mudford, utopia.fyi): each
 * step n interpolates linearly, between two viewport widths, from
 * base_min · r_min^n to base_max · r_max^n, expressed as a CSS clamp(). With
 * r_max = √φ every even step at large viewports is an exact power of φ.
 */

export const PHI = (1 + Math.sqrt(5)) / 2;

export interface FluidScaleSpec {
  readonly baseMinPx: number;
  readonly baseMaxPx: number;
  readonly ratioMin: number;
  readonly ratioMax: number;
  readonly viewportMinPx: number;
  readonly viewportMaxPx: number;
}

const round = (x: number, digits = 4): number => Number(x.toFixed(digits));
const REM = 16;

/** CSS clamp() for step n of the fluid scale, in rem/vw (respects the reader's root font size). */
export const fluidStep = (spec: FluidScaleSpec, n: number): string => {
  const minPx = spec.baseMinPx * spec.ratioMin ** n;
  const maxPx = spec.baseMaxPx * spec.ratioMax ** n;
  const slope = (maxPx - minPx) / (spec.viewportMaxPx - spec.viewportMinPx);
  const interceptPx = minPx - slope * spec.viewportMinPx;
  const lo = Math.min(minPx, maxPx) / REM;
  const hi = Math.max(minPx, maxPx) / REM;
  return `clamp(${round(lo)}rem, ${round(interceptPx / REM)}rem + ${round(slope * 100)}vw, ${round(hi)}rem)`;
};

/** Spacing step: φ^n rem. */
export const phiSpace = (n: number): string => `${round(PHI ** n)}rem`;

/** Name of a step for CSS custom properties: -2 → "-2", 3 → "3" (kept signed and explicit). */
export const stepName = (n: number): string => (n < 0 ? `n${-n}` : String(n));
