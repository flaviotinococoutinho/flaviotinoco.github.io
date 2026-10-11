/**
 * Message catalogs — pure data with compile-time parity between locales.
 *
 * `defineMessages` infers the key set K from the pt-BR catalog and requires the
 * en catalog to be exactly Record<K, string> (missing keys and extra keys are
 * both type errors), so a translation can never silently fall back.
 * Interpolation uses `{name}` placeholders; plurals use Intl.PluralRules
 * (CLDR plural categories) through `plural`.
 */
import type { Locale } from '../domain/locale.ts';

export type Catalog<K extends string> = {
  readonly 'pt-BR': Readonly<Record<K, string>>;
  readonly en: Readonly<Record<K, string>>;
};

export const defineMessages = <const K extends string>(catalog: {
  readonly 'pt-BR': Readonly<Record<K, string>>;
  readonly en: Readonly<Record<NoInfer<K>, string>>;
}): Catalog<K> => catalog;

export type Params = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * Replaces `{name}` placeholders. Unknown placeholders are left verbatim
 * (visible, never silently dropped) so a missing parameter is noticed.
 */
export const format = (template: string, params: Params = {}): string =>
  template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });

/** Formats a number with the locale's conventions (pt-BR: 1.234,5). */
export const formatNumber = (locale: Locale, n: number, options?: Intl.NumberFormatOptions): string =>
  new Intl.NumberFormat(locale, options).format(n);

/** CLDR plural selection. `forms` must contain 'other'; other categories are optional. */
export const plural = (
  locale: Locale,
  n: number,
  forms: Readonly<Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }>,
): string => {
  const category = new Intl.PluralRules(locale).select(n);
  return format(forms[category] ?? forms.other, { n: formatNumber(locale, n) });
};

/** Builds a translator bound to one catalog and locale. */
export const translator =
  <K extends string>(catalog: Catalog<K>, locale: Locale) =>
  (key: K, params?: Params): string =>
    format(catalog[locale][key], params);
