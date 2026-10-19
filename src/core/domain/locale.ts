/**
 * Locale — the closed set of languages the site is written in.
 *
 * Two representations coexist and must never be confused:
 *   - the BCP 47 language tag (RFC 5646) used in `lang`, `hreflang`, Intl APIs;
 *   - the URL path segment used for routing.
 * `localeCodec` is a bijection between them (round-trip law tested in
 * tests/unit/core/locale.test.ts), so no information is lost in either direction.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';

export const LOCALES = ['pt-BR', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pt-BR';

export type LocaleSegment = 'pt' | 'en';

const toSegment: Readonly<Record<Locale, LocaleSegment>> = { 'pt-BR': 'pt', en: 'en' };
const fromSegment: Readonly<Record<LocaleSegment, Locale>> = { pt: 'pt-BR', en: 'en' };

export const localeCodec = {
  encode: (locale: Locale): LocaleSegment => toSegment[locale],
  decode: (segment: string): Result<Locale, string> =>
    Object.hasOwn(fromSegment, segment)
      ? ok(fromSegment[segment as LocaleSegment])
      : err(`unknown locale segment "${segment}"`),
} as const;

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);

export const parseLocale = (value: unknown): Result<Locale, string> =>
  isLocale(value) ? ok(value) : err(`unknown locale "${show(value)}"`);

/** The other locale; total because the set has exactly two members. */
export const alternateLocales = (locale: Locale): readonly Locale[] => LOCALES.filter((l) => l !== locale);

/** Text direction (all current locales are LTR; kept explicit for future RTL locales). */
export const direction = (_locale: Locale): 'ltr' | 'rtl' => 'ltr';

/** Open Graph locale format (ll_CC). */
export const ogLocale: Readonly<Record<Locale, string>> = { 'pt-BR': 'pt_BR', en: 'en_US' };

/**
 * Negotiates the best locale from an ordered list of BCP 47 tags (e.g. navigator.languages),
 * using RFC 4647 "lookup" on the primary subtag. Pure: the shell passes the list in.
 */
export const negotiate = (preferred: readonly string[]): Locale => {
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0];
    if (primary === 'pt') return 'pt-BR';
    if (primary === 'en') return 'en';
  }
  return DEFAULT_LOCALE;
};
