/**
 * Daypart — a coarse, decorative reading of the local clock.
 *
 * Only decorative layers (the ambient field behind the home hero) react to it;
 * text colours never do, so legibility is independent of the time of day.
 * The clock is injected (the hour is an argument), keeping this pure.
 *
 * The same piecewise-constant function is compiled into the pre-paint script
 * (daypartExpression), so the attribute set before first paint and any later
 * computation in islands agree by construction (pattern: compiler, Spec → Artefact).
 */

export const DAYPARTS = ['night', 'dawn', 'day', 'dusk'] as const;
export type Daypart = (typeof DAYPARTS)[number];

/**
 * Half-open intervals [previous bound, bound) of the local hour, in order.
 * Hours from the last bound to 24 wrap around to DAYPART_AFTER_LAST.
 */
export const DAYPART_BOUNDARIES: readonly (readonly [upperExclusive: number, daypart: Daypart])[] = [
  [6, 'night'],
  [10, 'dawn'],
  [17, 'day'],
  [21, 'dusk'],
];
export const DAYPART_AFTER_LAST: Daypart = 'night';

/** Reduces any real number to an hour in [0, 24); non-finite input maps to 0 (midnight). */
export const normaliseHour = (hour: number): number => {
  if (!Number.isFinite(hour)) return 0;
  const h = hour % 24;
  const r = h < 0 ? h + 24 : h;
  // A tiny negative remainder (e.g. −5e−324) rounds to exactly 24 when shifted; that is midnight.
  return r >= 24 ? 0 : r;
};

/** Total: every real hour (fractional, negative, > 24, NaN) yields a daypart. Period 24. */
export const daypartOf = (hour: number): Daypart => {
  const h = normaliseHour(hour);
  for (const [bound, part] of DAYPART_BOUNDARIES) if (h < bound) return part;
  return DAYPART_AFTER_LAST;
};

/**
 * The same function as an ES5 conditional expression over a variable holding
 * an integer hour in [0, 24) (Date#getHours), e.g. h<6?"night":…:"night".
 */
export const daypartExpression = (variable: string): string =>
  `${DAYPART_BOUNDARIES.map(([bound, part]) => `${variable}<${bound}?${JSON.stringify(part)}:`).join('')}${JSON.stringify(DAYPART_AFTER_LAST)}`;
