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
    relationLegend: Object.fromEntries(RELATION_TYPES.map((r) => [r, t(`legend.${r}`)])) as Record<RelationType, string>,
    relations: t('map.relations'),
    relationSentence: (type, a, b) => t('rel.sentence', { a, b, rel: relationLabel(locale, type, 'out') }),
    strata: Object.fromEntries(STRATA.map((s) => [s, stratumLabel(locale, s)])) as Record<Stratum, string>,
    categories: Object.fromEntries(CATEGORIES.map((c) => [c, categoryLabel(locale, c)])) as Record<Category, string>,
    ...extra,
  };
};
