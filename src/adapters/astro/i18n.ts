/**
 * Shell adapter: binds the pure i18n core to Astro's runtime (BASE_URL,
 * route params). Components import from here, never compose URLs by hand.
 */
import { LOCALES, localeCodec, type Locale, type LocaleSegment } from '../../core/domain/locale.ts';
import { encodeRoute, type Route } from '../../core/i18n/routes.ts';
import { translator, type Catalog } from '../../core/i18n/messages.ts';

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** Base-aware, trailing-slash URL for a typed route. */
export const href = (route: Route, locale: Locale): string => `${BASE}${encodeRoute(route, locale).slice(1)}`;

/** Base-aware URL for a static asset or file in /public (path without leading slash). */
export const asset = (path: string): string => `${BASE}${path.replace(/^\//, '')}`;

/** Decodes the [lang] route parameter; unknown values are a build error, never a silent default. */
export const localeFromParam = (lang: string | undefined): Locale => {
  const r = localeCodec.decode(lang ?? '');
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

/** getStaticPaths entries for one page per locale. */
export const localeStaticPaths = (): { params: { lang: LocaleSegment }; props: { locale: Locale } }[] =>
  LOCALES.map((locale) => ({ params: { lang: localeCodec.encode(locale) }, props: { locale } }));

export const useTranslations = <K extends string>(catalog: Catalog<K>, locale: Locale) => translator(catalog, locale);

/** Long date in the reader's locale, e.g. "11 de outubro de 2026" / "October 11, 2026". */
export const formatDate = (locale: Locale, date: Date): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
