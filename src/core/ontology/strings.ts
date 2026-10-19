/**
 * Localised text of the ontology drawings, assembled from the message catalogs
 * (pure: catalogs are data). Shared by the Markdown stage and the views, so a
 * map reads the same wherever it is drawn.
 */
import type { Locale } from '../domain/locale.ts';
import { STRATA, type Stratum } from '../domain/strata.ts';
import common from '../i18n/catalogs/common.ts';
import ontology from '../i18n/catalogs/ontology.ts';
import { translator } from '../i18n/messages.ts';
import type { MapText } from './scene.ts';
import { CATEGORIES, RELATION_TYPES, type Category, type RelationType } from './vocabulary.ts';

export const relationLabel = (locale: Locale, type: RelationType, direction: 'out' | 'in'): string =>
  translator(ontology, locale)(`rel.${type}.${direction}`);

export const stratumLabel = (locale: Locale, s: Stratum): string => translator(common, locale)(`strata.${s}`);

export const categoryLabel = (locale: Locale, c: Category): string => translator(ontology, locale)(`category.${c}`);

/**
 * Messages <ft-concept-map> announces at run time (aria-live), with the names of
 * strata, categories and relations it composes them with. Keys are the island's.
 */
export const mapIslandMessages = (locale: Locale): Readonly<Record<string, string>> => {
  const t = translator(ontology, locale);
  return {
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
    detailLinks: t('detail.links'),
    ...Object.fromEntries(STRATA.map((s) => [`stratum.${s}`, stratumLabel(locale, s)])),
    ...Object.fromEntries(CATEGORIES.map((c) => [`category.${c}`, categoryLabel(locale, c)])),
    ...Object.fromEntries(
      RELATION_TYPES.flatMap((r) => [
        [`rel.${r}.out`, relationLabel(locale, r, 'out')],
        [`rel.${r}.in`, relationLabel(locale, r, 'in')],
      ]),
    ),
  };
};

/** The text of a concept map in `locale`; `extra` adds a caption or the explorer controls. */
export const mapTextOf = (locale: Locale, title: string, extra: Partial<MapText> = {}): MapText => {
  const t = translator(ontology, locale);
  return {
    title,
    instructions: t('map.instructions'),
    toolbar: t('map.toolbar'),
    zoomIn: t('map.zoomIn'),
    zoomOut: t('map.zoomOut'),
    reset: t('map.reset'),
    legend: t('map.legend'),
    relationLegend: Object.fromEntries(RELATION_TYPES.map((r) => [r, t(`legend.${r}`)])) as Record<
      RelationType,
      string
    >,
    relations: t('map.relations'),
    relationSentence: (type, a, b) => t('rel.sentence', { a, b, rel: relationLabel(locale, type, 'out') }),
    strata: Object.fromEntries(STRATA.map((s) => [s, stratumLabel(locale, s)])) as Record<Stratum, string>,
    categories: Object.fromEntries(CATEGORIES.map((c) => [c, categoryLabel(locale, c)])) as Record<Category, string>,
    island: mapIslandMessages(locale),
    ...extra,
  };
};
