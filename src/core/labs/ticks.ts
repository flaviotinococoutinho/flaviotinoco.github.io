/**
 * Axis ticks with "nice numbers" (P. S. Heckbert, "Nice numbers for graph labels", in A. S. Glassner (ed.),
 * Graphics Gems, Academic Press, 1990, pp. 61–63, 657–659).
 *
 * A nice number is 1, 2 or 5 times a power of ten. `niceNumber(x, round)` finds the nice number closest to
 * `x` (round = true) or the smallest one ≥ `x` (round = false); `looseTicks` is Heckbert's "loose labeling":
 * the range is widened to multiples of a nice step, so the first and last ticks enclose the data.
 * `ticksWithin` keeps the nice step but only the ticks inside a fixed domain (axes whose bounds are part of
 * the mathematics, such as p ∈ [0, 1]).
 *
 * Ticks are computed as integer multiples k·step and rounded to the step's decimals, so 0.1 + 0.2 never
 * shows up as 0.30000000000000004.
 *
 * Laws (tests/unit/labs/ticks.test.ts): step/10^⌊log10 step⌋ ∈ {1, 2, 5}; ticks are evenly spaced and
 * increasing; loose ticks enclose [min, max]; ticks within lie in [min, max].
 */
import { err, ok, type Result } from '../algebra/result.ts';

export interface Ticks {
  /** First tick (loose labeling: ≤ min). */
  readonly min: number;
  /** Last tick (loose labeling: ≥ max). */
  readonly max: number;
  /** Distance between ticks: a nice number. */
  readonly step: number;
  /** Fraction digits needed to print every tick exactly (Heckbert's `nfrac`). */
  readonly decimals: number;
  readonly values: readonly number[];
}

/** Heckbert's nice number: the 1–2–5 × 10^k value nearest to x (round) or at least x (ceiling). */
export const niceNumber = (x: number, round: boolean): number => {
  if (!(x > 0) || !Number.isFinite(x)) return 1;
  const exponent = Math.floor(Math.log10(x));
  const power = 10 ** exponent;
  const fraction = x / power;
  const nice = round
    ? fraction < 1.5
      ? 1
      : fraction < 3
        ? 2
        : fraction < 7
          ? 5
          : 10
    : fraction <= 1
      ? 1
      : fraction <= 2
        ? 2
        : fraction <= 5
          ? 5
          : 10;
  return nice * power;
};

/**
 * Narrowest range an axis can label. `roundTo` prints at most 100 decimals, so a step below 1e-100 prints
 * as zero and two ticks collide; a step is at least range / (1.5 · (count − 1)), so the floor leaves room
 * for thousands of ticks before a step reaches that limit.
 */
const TINY = 1e-96;

/** Decimals needed to print multiples of `step` (0 for integer steps). */
export const stepDecimals = (step: number): number => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

const roundTo = (x: number, decimals: number): number => {
  const r = Number(x.toFixed(Math.min(decimals, 100)));
  return Object.is(r, -0) ? 0 : r;
};

const checkRange = (min: number, max: number, count: number): Result<readonly [number, number], string> => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return err(`axis range must be finite, got [${min}, ${max}]`);
  if (!Number.isInteger(count) || count < 2) return err(`at least two ticks are needed, got ${count}`);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  // A degenerate range is widened around its value, so that the axis still shows a scale. Two more cases
  // count as degenerate: a range thinner than one part in 10^9 of its magnitude (the tolerance ticks are
  // compared with below), whose multiples k·step would reach |k| > 2^53, where k + 1 = k and the
  // enumeration would never end; and a range thinner than TINY, whose step could not be printed by
  // `roundTo` and underflows to zero in `niceNumber` well before that. The padding has the same floor,
  // so the widened range never falls back into either case.
  const scale = Math.max(Math.abs(lo), Math.abs(hi));
  if (hi - lo <= 1e-9 * scale || hi - lo < TINY) {
    const pad = scale < TINY ? 1 : Math.max(Math.abs(lo) / 2, TINY);
    return ok([lo - pad, hi + pad]);
  }
  return ok([lo, hi]);
};

const multiples = (first: number, last: number, step: number, decimals: number): readonly number[] => {
  // Unreachable for a nice step over a checked range (at most a few dozen multiples); the guard keeps the
  // function total should either ever be violated, instead of enumerating until memory runs out.
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > 10_000) return [];
  const out: number[] = [];
  for (let k = first; k <= last; k++) out.push(roundTo(k * step, decimals));
  return out;
};

/** The nice step for about `count` ticks over [lo, hi] (Heckbert: nice(range) / (count − 1), rounded). */
const niceStep = (lo: number, hi: number, count: number): number =>
  niceNumber(niceNumber(hi - lo, false) / (count - 1), true);

/** Heckbert's loose labeling with about `count` ticks; the first and last tick enclose [min, max]. */
export const looseTicks = (min: number, max: number, count = 5): Result<Ticks, string> => {
  const range = checkRange(min, max, count);
  if (!range.ok) return range;
  const [lo, hi] = range.value;
  const step = niceStep(lo, hi, count);
  const decimals = stepDecimals(step);
  const first = Math.floor(lo / step);
  const last = Math.ceil(hi / step);
  const values = multiples(first, last, step, decimals);
  return ok({ min: values[0] ?? lo, max: values[values.length - 1] ?? hi, step, decimals, values });
};

/** Nice ticks (about `count`) that lie inside the fixed domain [min, max]. */
export const ticksWithin = (min: number, max: number, count = 5): Result<Ticks, string> => {
  const range = checkRange(min, max, count);
  if (!range.ok) return range;
  const [lo, hi] = range.value;
  const step = niceStep(lo, hi, count);
  const decimals = stepDecimals(step);
  // A relative tolerance keeps a bound that is itself a multiple (0.3 = 3 × 0.1) despite rounding.
  const eps = 1e-9;
  const values = multiples(Math.ceil(lo / step - eps), Math.floor(hi / step + eps), step, decimals);
  return ok({ min: lo, max: hi, step, decimals, values });
};
