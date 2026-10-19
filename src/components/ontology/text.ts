/**
 * Localised strings of the ontology views, assembled from the catalogs (shell
 * helper: no UI text is hard-coded in components), and build-time KaTeX.
 */
import katex from 'katex';
import type { Domain } from '../../core/domain/facets.ts';
import type { Locale } from '../../core/domain/locale.ts';
import { STRATA, type Stratum } from '../../core/domain/strata.ts';
import common from '../../core/i18n/catalogs/common.ts';
import ontology from '../../core/i18n/catalogs/ontology.ts';
import { formatNumber, plural, translator, type Params } from '../../core/i18n/messages.ts';
import { KATEX_OPTIONS, MACROS } from '../../core/latex/macros.ts';
import {
  CATEGORIES,
  RELATION_TYPES,
  RELATIONS,
  mapTextOf,
  type Category,
  type LatticeText,
  type MapText,
  type RelationType,
} from '../../core/ontology/index.ts';

export const ontologyText = (locale: Locale) => {
  const t = translator(ontology, locale);
  const c = translator(common, locale);
  const stratum = (s: Stratum): string => c(`strata.${s}`);
  const category = (k: Category): string => t(`category.${k}`);
  const domain = (d: Domain): string => t(`domain.${d}`);
  const relation = (type: RelationType, direction: 'out' | 'in'): string => t(`rel.${type}.${direction}`);
  const number = (n: number, digits = 3): string =>
    formatNumber(locale, n, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const count = (n: number): string => formatNumber(locale, n);
  const map = (title: string, extra: Partial<MapText> = {}): MapText => mapTextOf(locale, title, extra);
  const lattice = (n: number): LatticeText => ({
    title: t('fca.title'),
    description: t('fca.description'),
    listSummary: t('fca.listSummary', { n: count(n) }),
    extentLabel: t('fca.extent'),
    intentLabel: t('fca.intent'),
    emptyExtent: t('fca.emptyExtent'),
    emptyIntent: t('fca.emptyIntent'),
    more: (k) => t('fca.more', { n: count(k) }),
  });
  /** Names of strata, categories and relations, for islands (sent as a JSON data attribute). */
  const labelMessages = (): Readonly<Record<string, string>> => ({
    ...Object.fromEntries(STRATA.map((s) => [`stratum.${s}`, stratum(s)])),
    ...Object.fromEntries(CATEGORIES.map((k) => [`category.${k}`, category(k)])),
    ...Object.fromEntries(RELATION_TYPES.flatMap((r) => [[`rel.${r}.out`, relation(r, 'out')], [`rel.${r}.in`, relation(r, 'in')]])),
  });
  /** Strings the map island needs at run time. */
  const islandMessages = (): Readonly<Record<string, string>> => ({
    selected: t('map.selected'),
    neighboursOne: t('map.neighbours.one'),
    neighboursOther: t('map.neighbours.other'),
    cleared: t('map.cleared'),
    visibleOne: t('map.visible.one'),
    visibleOther: t('map.visible.other'),
    matchesOne: t('map.matches.one'),
    matchesOther: t('map.matches.other'),
    noMatch: t('map.noMatch'),
    layoutChanged: t('map.layoutChanged'),
    layoutForce: t('map.layoutForce'),
    layoutGrid: t('map.layoutGrid'),
    open: t('map.open'),
    detailEmpty: t('detail.empty'),
    ...labelMessages(),
  });
  const plurals = (key: 'map.neighbours' | 'works.sharedCount', n: number): string =>
    plural(locale, n, { one: t(`${key}.one`), other: t(`${key}.other`) });
  return { t, c, stratum, category, domain, relation, number, count, map, lattice, labelMessages, islandMessages, plurals };
};

export type OntologyText = ReturnType<typeof ontologyText>;

/** Localised names of every vocabulary property (the relation types and their derived inverses), for JSON-LD. */
export const relationNames = (locale: Locale): Readonly<Record<string, string>> => {
  const { relation } = ontologyText(locale);
  return Object.fromEntries(
    RELATION_TYPES.flatMap((r) => {
      const inverse = RELATIONS[r].inverse;
      return inverse === null ? [[r, relation(r, 'out')]] : [[r, relation(r, 'out')], [inverse, relation(r, 'in')]];
    }),
  );
};

/** TeX → HTML + MathML at build time, with the site macros; invalid TeX fails the build. */
export const renderTex = (tex: string, displayMode = false): string =>
  katex.renderToString(tex, { ...KATEX_OPTIONS, macros: { ...MACROS }, displayMode, throwOnError: true });

export type { Params };
