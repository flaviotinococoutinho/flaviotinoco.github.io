/**
 * Shell adapter over Astro content collections: typed queries, translation
 * alternates and route resolution. The only place where pages touch
 * getCollection(); views receive already-resolved data.
 */
import { getCollection, type CollectionEntry } from 'astro:content';
import { LOCALES, type Locale } from '../../core/domain/locale.ts';
import { parseSlug, type Slug } from '../../core/domain/identifiers.ts';
import { STRATA } from '../../core/domain/strata.ts';
import type { Route } from '../../core/i18n/routes.ts';
import { href } from './i18n.ts';

const PUBLISH_DRAFTS = import.meta.env.DEV;

const slugOf = (s: string): Slug => {
  const r = parseSlug(s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

export type Essay = CollectionEntry<'essays'>;
export type Lab = CollectionEntry<'labs'>;
export type Concept = CollectionEntry<'concepts'>;
export type StratumEntry = CollectionEntry<'strata'>;
export type PageEntry = CollectionEntry<'pages'>;

export const essays = async (locale?: Locale): Promise<Essay[]> =>
  (await getCollection('essays', (e) => (PUBLISH_DRAFTS || !e.data.draft) && (!locale || e.data.lang === locale))).sort(
    (a, b) => b.data.published.valueOf() - a.data.published.valueOf(),
  );

export const labs = async (locale?: Locale): Promise<Lab[]> =>
  (await getCollection('labs', (e) => (PUBLISH_DRAFTS || !e.data.draft) && (!locale || e.data.lang === locale))).sort(
    (a, b) => a.data.title.localeCompare(b.data.title, a.data.lang),
  );

export const concepts = async (): Promise<Concept[]> => getCollection('concepts');
export const strata = async (locale: Locale): Promise<StratumEntry[]> =>
  (await getCollection('strata', (e) => e.data.lang === locale)).sort(
    (a, b) => STRATA.indexOf(a.data.stratum) - STRATA.indexOf(b.data.stratum),
  );
export const pages = async (locale: Locale): Promise<PageEntry[]> =>
  getCollection('pages', (e) => e.data.lang === locale);

/** Route of an authored entry in its own locale. */
export const routeOfEssay = (e: Essay): Route => ({ kind: 'essay', slug: e.data.slug });
export const routeOfLab = (e: Lab): Route => ({ kind: 'lab', slug: e.data.slug });
export const routeOfConcept = (c: Concept, locale: Locale): Route => ({
  kind: 'concept',
  slug: slugOf(c.data.slug[locale]),
});

/** hreflang alternates for a translatable entry, linked by translationKey. */
export const alternatesByKey = async (
  collection: 'essays' | 'labs' | 'pages',
  translationKey: string,
  route: (slug: Slug) => Route,
): Promise<Partial<Record<Locale, string>>> => {
  const all = await getCollection(collection, (e) => e.data.translationKey === translationKey);
  const out: Partial<Record<Locale, string>> = {};
  for (const e of all) out[e.data.lang] = href(route(e.data.slug), e.data.lang);
  return out;
};

/** Alternates for routes that exist identically in every locale (indexes, strata, concepts). */
export const alternatesForAll = (route: (locale: Locale) => Route): Partial<Record<Locale, string>> =>
  Object.fromEntries(LOCALES.map((l) => [l, href(route(l), l)]));
