/**
 * Route algebra — a bijective codec between typed routes and URL paths.
 *
 *   encode : Route × Locale → Path
 *   decode : Path → Result<Route × Locale>
 *   law    : decode(encode(r, l)) = (r, l)          (tests/unit/core/routes.test.ts)
 *
 * Path segments are localised (ensaios/essays…) while route kinds are
 * language-neutral, so switching language is a pure function of the route.
 * Paths are base-relative and always end with "/" (trailingSlash: 'always');
 * the shell prefixes import.meta.env.BASE_URL.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { absurd } from '../algebra/match.ts';
import { type Locale, localeCodec } from '../domain/locale.ts';
import { STRATA, type Stratum } from '../domain/strata.ts';
import { parseSlug, type Slug } from '../domain/identifiers.ts';

export type Route =
  | { readonly kind: 'home' }
  | { readonly kind: 'essays' }
  | { readonly kind: 'essay'; readonly slug: Slug }
  | { readonly kind: 'labs' }
  | { readonly kind: 'lab'; readonly slug: Slug }
  | { readonly kind: 'stratum'; readonly stratum: Stratum }
  | { readonly kind: 'ontology' }
  | { readonly kind: 'ontology-page'; readonly page: OntologyPage }
  | { readonly kind: 'concept'; readonly slug: Slug }
  | { readonly kind: 'glossary' }
  | { readonly kind: 'about' }
  | { readonly kind: 'colophon' };

export type RouteKind = Route['kind'];

/**
 * Pages of the ontology section besides its overview (ADR 0009): the overview
 * keeps the explorer (map and tree); the structure (top level and relation
 * vocabulary), the comparison tools and measures, and the lattice of the works
 * each have a page, so no page grows past the HTML budget with the ontology.
 */
export const ONTOLOGY_PAGES = ['structure', 'comparison', 'lattice'] as const;
export type OntologyPage = (typeof ONTOLOGY_PAGES)[number];

/** Localised slugs of the ontology pages, under the ontology segment. */
export const ONTOLOGY_PAGE_SLUGS: Readonly<Record<OntologyPage, Readonly<Record<Locale, string>>>> = {
  structure: { 'pt-BR': 'estrutura', en: 'structure' },
  comparison: { 'pt-BR': 'comparacao', en: 'comparison' },
  lattice: { 'pt-BR': 'reticulado', en: 'lattice' },
};

/** Localised collection segments. */
export const SEGMENTS = {
  essays: { 'pt-BR': 'ensaios', en: 'essays' },
  labs: { 'pt-BR': 'laboratorio', en: 'lab' },
  strata: { 'pt-BR': 'estratos', en: 'strata' },
  ontology: { 'pt-BR': 'ontologia', en: 'ontology' },
  concepts: { 'pt-BR': 'conceitos', en: 'concepts' },
  glossary: { 'pt-BR': 'glossario', en: 'glossary' },
  about: { 'pt-BR': 'sobre', en: 'about' },
  colophon: { 'pt-BR': 'colofao', en: 'colophon' },
} as const satisfies Record<string, Record<Locale, string>>;

/** Localised stratum slugs. */
export const STRATUM_SLUGS: Readonly<Record<Stratum, Readonly<Record<Locale, string>>>> = {
  philosophy: { 'pt-BR': 'filosofia', en: 'philosophy' },
  theory: { 'pt-BR': 'teoria', en: 'theory' },
  formal: { 'pt-BR': 'formal', en: 'formal' },
  value: { 'pt-BR': 'valor', en: 'value' },
};

const join = (...parts: readonly string[]): string => `/${parts.filter((p) => p.length > 0).join('/')}/`;

export const encodeRoute = (route: Route, locale: Locale): string => {
  const l = localeCodec.encode(locale);
  switch (route.kind) {
    case 'home':
      return join(l);
    case 'essays':
      return join(l, SEGMENTS.essays[locale]);
    case 'essay':
      return join(l, SEGMENTS.essays[locale], route.slug);
    case 'labs':
      return join(l, SEGMENTS.labs[locale]);
    case 'lab':
      return join(l, SEGMENTS.labs[locale], route.slug);
    case 'stratum':
      return join(l, SEGMENTS.strata[locale], STRATUM_SLUGS[route.stratum][locale]);
    case 'ontology':
      return join(l, SEGMENTS.ontology[locale]);
    case 'ontology-page':
      return join(l, SEGMENTS.ontology[locale], ONTOLOGY_PAGE_SLUGS[route.page][locale]);
    case 'concept':
      return join(l, SEGMENTS.concepts[locale], route.slug);
    case 'glossary':
      return join(l, SEGMENTS.glossary[locale]);
    case 'about':
      return join(l, SEGMENTS.about[locale]);
    case 'colophon':
      return join(l, SEGMENTS.colophon[locale]);
    default:
      return absurd(route);
  }
};

export interface Located {
  readonly route: Route;
  readonly locale: Locale;
}

const segmentKey = (segment: string, locale: Locale): keyof typeof SEGMENTS | null => {
  for (const key of Object.keys(SEGMENTS) as (keyof typeof SEGMENTS)[]) {
    if (SEGMENTS[key][locale] === segment) return key;
  }
  return null;
};

const stratumFromSlug = (slug: string, locale: Locale): Stratum | null =>
  STRATA.find((s) => STRATUM_SLUGS[s][locale] === slug) ?? null;

const ontologyPageFromSlug = (slug: string, locale: Locale): OntologyPage | null =>
  ONTOLOGY_PAGES.find((p) => ONTOLOGY_PAGE_SLUGS[p][locale] === slug) ?? null;

/** Inverse of encodeRoute. Accepts paths with or without the trailing slash. */
export const decodeRoute = (path: string): Result<Located, string> => {
  const parts = path.split('/').filter((p) => p.length > 0);
  const [first, collection, item, ...rest] = parts;
  if (first === undefined) return err('empty path has no locale');
  if (rest.length > 0) return err(`path "${path}" is deeper than any route`);
  const decoded = localeCodec.decode(first);
  if (!decoded.ok) return decoded;
  const locale = decoded.value;
  if (collection === undefined) return ok({ route: { kind: 'home' }, locale });

  const key = segmentKey(collection, locale);
  if (key === null) return err(`unknown segment "${collection}" for ${locale}`);

  const withSlug = (kind: 'essay' | 'lab' | 'concept'): Result<Located, string> => {
    const slug = parseSlug(item);
    return slug.ok ? ok({ route: { kind, slug: slug.value }, locale }) : slug;
  };

  switch (key) {
    case 'essays':
      return item === undefined ? ok({ route: { kind: 'essays' }, locale }) : withSlug('essay');
    case 'labs':
      return item === undefined ? ok({ route: { kind: 'labs' }, locale }) : withSlug('lab');
    case 'concepts':
      return item === undefined ? err('concept index is the ontology route') : withSlug('concept');
    case 'strata': {
      if (item === undefined) return err('strata index is not a route');
      const stratum = stratumFromSlug(item, locale);
      return stratum === null
        ? err(`unknown stratum slug "${item}"`)
        : ok({ route: { kind: 'stratum', stratum }, locale });
    }
    case 'ontology': {
      if (item === undefined) return ok({ route: { kind: 'ontology' }, locale });
      const page = ontologyPageFromSlug(item, locale);
      return page === null
        ? err(`unknown ontology page "${item}" for ${locale}`)
        : ok({ route: { kind: 'ontology-page', page }, locale });
    }
    case 'glossary':
    case 'about':
    case 'colophon':
      return item === undefined ? ok({ route: { kind: key }, locale }) : err(`"${key}" takes no parameter`);
    default:
      return absurd(key);
  }
};
