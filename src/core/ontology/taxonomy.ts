/**
 * The extended taxonomy: the domain is-a hierarchy (skos:broader) grounded in
 * the top-level categories, under a single top.
 *
 *            @top
 *       ┌──────┼───────── … ─┐
 *   @entity  @measure      @method          top level (one node per category)
 *     │        │
 *    sign   information                     domain roots of each category
 *   ┌─┴─┐   ┌──┴──┐
 *  model … entropy  mutual-information      domain concepts (broader edges)
 *
 * This is the structure the information measures (Seco IC, Resnik, Lin) are
 * computed on, exactly as WordNet-based measures use the noun hierarchy under
 * its unique beginners: without the top level, every domain tree would be an
 * island and every cross-tree similarity would be 0. Because `broader`
 * preserves the category (validated in graph.ts), every domain tree lies under
 * exactly one category node, so the result is a DAG with one root.
 *
 * The strata are deliberately NOT part of it: a stratum is an epistemic mode,
 * not a kind (entropy is not "a kind of theory").
 */
import type { ConceptId } from '../domain/identifiers.ts';
import type { ConceptGraph } from './graph.ts';
import { deriveHierarchy, type Hierarchy } from './hierarchy.ts';
import {
  CATEGORIES,
  TOP_TAXON,
  categoryOfTaxon,
  categoryTaxon,
  type Category,
  type CategoryTaxon,
  type TopTaxon,
} from './vocabulary.ts';

export type TaxonId = ConceptId | CategoryTaxon | TopTaxon;

export const isConceptTaxon = (t: TaxonId): t is ConceptId => !t.startsWith('@');

/**
 * Builds the extended taxonomy from concept ids, their broader concepts and
 * their categories: a concept without broader hangs under its category node,
 * every category node under the top.
 */
export const buildTaxonomy = (
  ids: readonly ConceptId[],
  broaderOf: (id: ConceptId) => readonly ConceptId[],
  categoryOf: (id: ConceptId) => Category | undefined,
): Hierarchy<TaxonId> => {
  const known = new Set(ids);
  const parentsOf = (t: TaxonId): readonly TaxonId[] => {
    if (t === TOP_TAXON) return [];
    if (categoryOfTaxon(t) !== null) return [TOP_TAXON];
    const id = t as ConceptId;
    const parents = broaderOf(id).filter((p) => known.has(p));
    if (parents.length > 0) return parents;
    const c = categoryOf(id);
    return c === undefined ? [] : [categoryTaxon(c)];
  };
  return deriveHierarchy<TaxonId>([TOP_TAXON, ...CATEGORIES.map(categoryTaxon), ...ids], parentsOf);
};

/** The extended taxonomy of a validated graph. */
export const taxonomyOf = (g: ConceptGraph): Hierarchy<TaxonId> =>
  buildTaxonomy(g.ids, (id) => g.hierarchy.broader.get(id) ?? [], (id) => g.concepts.get(id)?.category);
