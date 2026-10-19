/**
 * The build clock — the ONE place where the site reads the current date
 * (imperative shell; the functional core receives dates as arguments).
 *
 * It honours SOURCE_DATE_EPOCH (reproducible builds,
 * https://reproducible-builds.org/specs/source-date-epoch/: a decimal count of
 * seconds since the Unix epoch, UTC), so two builds of the same commit with the
 * same epoch print the same "Acesso em" date; otherwise the wall clock at build
 * time. Calendar fields are read in UTC, as every date of the site is.
 *
 * Consumers: the access date of "how to cite" (src/components/addons/CiteBox.astro).
 */
import type { CalendarDate } from '../../core/bibliography/model/reference.ts';

/** Parses SOURCE_DATE_EPOCH; anything but a non-negative decimal integer is ignored (falls back to the clock). */
export const parseSourceDateEpoch = (raw: string | undefined): Date | undefined => {
  if (raw === undefined || !/^\d{1,12}$/u.test(raw.trim())) return undefined;
  const date = new Date(Number(raw.trim()) * 1000);
  return Number.isNaN(date.valueOf()) ? undefined : date;
};

const toCalendarDate = (d: Date): CalendarDate => ({
  year: d.getUTCFullYear(),
  month: (d.getUTCMonth() + 1) as CalendarDate['month'],
  day: d.getUTCDate(),
});

/** The instant of this build (read once per process, so every page agrees). */
export const BUILD_INSTANT: Date = parseSourceDateEpoch(process.env['SOURCE_DATE_EPOCH']) ?? new Date();

/** The calendar date of this build (UTC). */
export const BUILD_DATE: CalendarDate = toCalendarDate(BUILD_INSTANT);

/** The same date as a Date at 00:00 UTC (for Intl formatting with timeZone 'UTC'). */
export const BUILD_DAY: Date = new Date(Date.UTC(BUILD_DATE.year, BUILD_DATE.month - 1, BUILD_DATE.day));
