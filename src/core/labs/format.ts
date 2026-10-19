/**
 * Locale-aware formatting of the quantities the labs display (Intl.NumberFormat, ECMA-402): fixed decimals
 * for readouts that change under the reader's hand (stable width, no jumping digits), hertz switching to
 * kilohertz from 1 kHz, percentages with the locale's spacing ("8,95 %" / "8.95%", from the catalog).
 */
import type { Locale } from '../domain/locale.ts';
import catalog from '../i18n/catalogs/labs.ts';
import { translator } from '../i18n/messages.ts';

/** `n` with exactly `digits` fraction digits; "—" for a non-finite value. */
export const fixed = (locale: Locale, n: number, digits: number): string =>
  Number.isFinite(n)
    ? new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
        Object.is(n, -0) ? 0 : n,
      )
    : catalog[locale]['unit.none'];

/** `n` with at most `digits` fraction digits (trailing zeros dropped). */
export const upTo = (locale: Locale, n: number, digits: number): string =>
  Number.isFinite(n)
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(Object.is(n, -0) ? 0 : n)
    : catalog[locale]['unit.none'];

/** A frequency in Hz, printed in kHz from 1000 Hz on: "3 kHz", "2,5 kHz", "440 Hz". */
export const frequency = (locale: Locale, hz: number): string => {
  const t = translator(catalog, locale);
  if (!Number.isFinite(hz)) return t('unit.none');
  return Math.abs(hz) >= 1000
    ? t('unit.khz', { value: upTo(locale, hz / 1000, 3) })
    : t('unit.hz', { value: upTo(locale, hz, 1) });
};

/** A fraction as a percentage with `digits` decimals: 0.0895 → "8,95 %". */
export const percent = (locale: Locale, fraction: number, digits = 1): string =>
  Number.isFinite(fraction)
    ? translator(catalog, locale)('unit.percent', { value: fixed(locale, fraction * 100, digits) })
    : catalog[locale]['unit.none'];

/** A list of numbers in the locale's conjunction style ("3, 7 e 19" / "3, 7, and 19"). */
export const list = (locale: Locale, items: readonly string[]): string =>
  new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);

/** Upper-cases the first letter (templates that start with an interpolated word). */
export const capitalize = (s: string): string => s.charAt(0).toLocaleUpperCase() + s.slice(1);
