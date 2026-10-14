/**
 * Non-breaking groups — detectors for spans that must not be split across lines.
 *
 * Instead of replacing a space with U+00A0 (which would change the author's
 * characters and break exact-text search), the group is WRAPPED in
 * <span class="nowrap"> and CSS `white-space: nowrap` does the typography:
 * the characters stay exactly as written (injective by construction).
 *
 * Sources:
 *  - value + unit symbol: "a space separates the number and the unit"
 *    (BIPM SI Brochure, 9th ed., §5.4.3; Inmetro QGUM 3.4.1) — and the two must
 *    stay on one line (R. Bringhurst, The Elements of Typographic Style, §2.4
 *    "Etiquette of Hyphenation & Pagination": short numerical expressions are
 *    kept together with hard spaces);
 *  - locators "p. 12", "v. 27", "n. 3", "§ 5": ABNT NBR 10520:2023 §6.2.4 and
 *    §7.1.3 (locator forms) and NBR 6023:2025 (abbreviations of volume, number,
 *    page); kept together for the same typographic reason;
 *  - dates "3 maio 2024", "7 abr. 2023", "3 de maio de 2024": ABNT NBR 5892:2019
 *    §3.1 and NBR 6023:2025 §8.6.3 / Annex A (month abbreviations; "maio" is
 *    never abbreviated);
 *  - initials + surname "C. E. Shannon", "J.-P. Sartre": abbreviated forenames
 *    as in NBR 6023:2025 §8.1.1; an initial stranded at a line end reads as a
 *    sentence end;
 *  - currency "R$ 5,00": symbol before the value, separated by a space
 *    (Embrapa, Manual de Produção Editorial — docs/research/abnt.md TYP-16).
 *
 * Every pattern starts and ends at a Unicode word boundary and its look-arounds
 * test only word-ness (\p{L}\p{N}\p{M}), so the result on a substring delimited
 * by non-word characters equals the restriction of the result on the whole text
 * — the property that makes the stage idempotent.
 */
import type { Locale } from '../domain/locale.ts';
import { BOUNDARY_AFTER, BOUNDARY_BEFORE } from '../lexicon/text.ts';

export interface Detection {
  readonly start: number;
  readonly end: number;
}

/** One inter-word space (no line break inside a group; NBSP and thin spaces count). */
const SP = '[ \\u00a0\\u2009\\u202f]';
/** A number: digits with optional grouping (".", ",", thin/no-break space) and decimal part. */
const NUMBER = '\\d+(?:[.,\\u00a0\\u2009\\u202f]\\d+)*';

const alternation = (items: readonly string[]): string =>
  [...items]
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))
    .map((s) => s.replace(/[\\^$.*+?()[\]{}|/]/gu, '\\$&'))
    .join('|');

/**
 * Unit symbols (SI and accepted units, BIPM SI Brochure 9th ed. Tables 2–4 and 8;
 * IEC 80000-13 for bit/byte and binary prefixes; common data rates).
 */
// prettier-ignore
export const UNIT_SYMBOLS: readonly string[] = [
  'Hz', 'kHz', 'MHz', 'GHz', 'THz',
  's', 'ms', 'µs', 'μs', 'ns', 'ps', 'min', 'h',
  'm', 'km', 'cm', 'mm', 'µm', 'μm', 'nm',
  'g', 'kg', 'mg', 'µg', 'μg',
  'L', 'mL', 'µL',
  'A', 'mA', 'kA', 'V', 'mV', 'kV', 'W', 'mW', 'kW', 'MW', 'GW',
  'J', 'kJ', 'MJ', 'N', 'kN', 'Pa', 'kPa', 'MPa', 'hPa',
  'K', '°C', 'mol', 'cd', 'lm', 'lx', 'rad', 'sr',
  'Ω', 'kΩ', 'MΩ', 'F', 'µF', 'μF', 'nF', 'pF', 'H', 'mH', 'T', 'C', 'S',
  'Bq', 'Gy', 'Sv', 'Wb', 'eV', 'keV', 'MeV', 'GeV',
  'dB', 'dBm', 'dBFS', 'Np',
  'bit', 'bits', 'kbit', 'Mbit', 'Gbit', 'B', 'kB', 'MB', 'GB', 'TB', 'KiB', 'MiB', 'GiB', 'TiB',
  'bit/s', 'kbit/s', 'Mbit/s', 'Gbit/s', 'B/s', 'kB/s', 'MB/s', 'GB/s', 'Bd',
  '%', '‰', 'ppm', 'px',
];

const UNIT = new RegExp(`${BOUNDARY_BEFORE}${NUMBER}${SP}(?:${alternation(UNIT_SYMBOLS)})${BOUNDARY_AFTER}`, 'gu');

const CURRENCY = new RegExp(`${BOUNDARY_BEFORE}(?:R\\$|US\\$|€|£|\\$)${SP}${NUMBER}${BOUNDARY_AFTER}`, 'gu');

/** Locator abbreviations (written forms; first letter may be capitalised at sentence start). */
const LOCATORS: Readonly<Record<Locale, readonly string[]>> = {
  'pt-BR': ['p', 'f', 'v', 'n', 't', 'cap', 'art', 'inc', 'fig', 'eq', 'vol', 'seç', 'sec'],
  en: ['p', 'pp', 'vol', 'no', 'ch', 'sec', 'fig', 'eq', 'para'],
};

const locatorPattern = (abbreviations: readonly string[]): RegExp => {
  const forms = abbreviations.flatMap((a) => [a, a.charAt(0).toUpperCase() + a.slice(1)]);
  const target = '(?:\\d+(?:[-–]\\d+)?|[IVXLCDM]+)';
  return new RegExp(
    `${BOUNDARY_BEFORE}(?:(?:${alternation(forms)})\\.${SP}${target}|§§?${SP}?\\d+(?:[-–]\\d+)?|[Nn]\\.?º${SP}?\\d+)${BOUNDARY_AFTER}`,
    'gu',
  );
};

const LOCATOR: Readonly<Record<Locale, RegExp>> = {
  'pt-BR': locatorPattern(LOCATORS['pt-BR']),
  en: locatorPattern(LOCATORS.en),
};

/** Month names and NBR 6023 Annex A abbreviations ("maio" is never abbreviated). */
// prettier-ignore
const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro',
  'dezembro', 'jan.', 'fev.', 'mar.', 'abr.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
];
// prettier-ignore
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November',
  'December', 'Jan.', 'Feb.', 'Mar.', 'Apr.', 'Aug.', 'Sept.', 'Sep.', 'Oct.', 'Nov.', 'Dec.',
];

/** A date ending in an abbreviated month ends with "." — a non-word character — so no trailing look-ahead there. */
const DATE: Readonly<Record<Locale, RegExp>> = {
  'pt-BR': new RegExp(
    `${BOUNDARY_BEFORE}\\d{1,2}º?${SP}(?:de${SP})?(?:${alternation(MONTHS_PT)})(?:${SP}(?:de${SP})?\\d{4}${BOUNDARY_AFTER})?(?![\\p{L}\\p{M}])`,
    'gu',
  ),
  en: new RegExp(
    `${BOUNDARY_BEFORE}(?:\\d{1,2}${SP}(?:${alternation(MONTHS_EN)})(?:${SP}\\d{4}${BOUNDARY_AFTER})?|(?:${alternation(MONTHS_EN)})${SP}\\d{1,2}(?:,${SP}\\d{4})?${BOUNDARY_AFTER})(?![\\p{L}\\p{M}])`,
    'gu',
  ),
};

/** Initials (with optional hyphenated pair) followed by an optional particle and a capitalised surname. */
const INITIALS = new RegExp(
  `${BOUNDARY_BEFORE}(?:\\p{Lu}\\.(?:-\\p{Lu}\\.)?${SP}){1,3}(?:(?:de|da|do|dos|das|van|von|der|den|di|del|du|le|la)${SP})?\\p{Lu}[\\p{L}\\p{M}’'-]*\\p{Ll}${BOUNDARY_AFTER}`,
  'gu',
);

const scan = (pattern: RegExp, text: string): readonly Detection[] => {
  const re = new RegExp(pattern.source, pattern.flags);
  const out: Detection[] = [];
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
};

export const detectUnits = (text: string): readonly Detection[] => [...scan(UNIT, text), ...scan(CURRENCY, text)];
export const detectLocators = (text: string, locale: Locale): readonly Detection[] => scan(LOCATOR[locale], text);
export const detectDates = (text: string, locale: Locale): readonly Detection[] => scan(DATE[locale], text);
export const detectInitials = (text: string): readonly Detection[] => scan(INITIALS, text);
