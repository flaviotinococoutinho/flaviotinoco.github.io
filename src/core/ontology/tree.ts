/**
 * The taxonomy as an ordered forest — the accessible, linear view of the map.
 *
 * Top level: the categories of the top-level ontology (display order, only
 * those with members); under each, the domain concepts of that category,
 * unfolded along skos:narrower. A polyhierarchy is unfolded in the usual
 * thesaurus way: a concept appears under EACH of its broader concepts
 * (ANSI/NISO Z39.19-2005 on polyhierarchical relationships), so every broader
 * edge is visible; occurrences after the first carry `repeat: true`. Domain
 * roots are ordered by stratum (the bridge order) and then by label; siblings
 * by label, with the locale's collation.
 */
import type { ConceptId } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import { STRATUM_SPECS } from '../domain/strata.ts';
import type { ConceptGraph } from './graph.ts';
import { CATEGORY_DISPLAY_ORDER, type Category } from './vocabulary.ts';

export type TreeNode =
  | {
      readonly kind: 'category';
      readonly category: Category;
      readonly children: readonly TreeNode[];
      /** 1-based level (aria-level). */
      readonly level: number;
    }
  | {
      readonly kind: 'concept';
      readonly id: ConceptId;
      readonly children: readonly TreeNode[];
      /** True when the concept already appeared earlier in document order. */
      readonly repeat: boolean;
      readonly level: number;
    };

export const taxonomyTree = (graph: ConceptGraph, locale: Locale): readonly TreeNode[] => {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const label = (id: ConceptId): string => graph.concepts.get(id)?.prefLabel[locale] ?? id;
  const byLabel = (a: ConceptId, b: ConceptId): number => collator.compare(label(a), label(b)) || (a < b ? -1 : a > b ? 1 : 0);
  const ordinal = (id: ConceptId): number => {
    const e = graph.concepts.get(id);
    return e === undefined ? 0 : STRATUM_SPECS[e.stratum].ordinal;
  };
  const seen = new Set<ConceptId>();
  const build = (id: ConceptId, level: number, path: ReadonlySet<ConceptId>): TreeNode => {
    const repeat = seen.has(id);
    seen.add(id);
    const next = new Set([...path, id]);
    const children = [...(graph.hierarchy.narrower.get(id) ?? [])]
      .filter((c) => !next.has(c)) // cycle guard (unreachable on a validated graph)
      .sort(byLabel)
      .map((c) => build(c, level + 1, next));
    return { kind: 'concept', id, children, repeat, level };
  };
  return CATEGORY_DISPLAY_ORDER.flatMap((category): TreeNode[] => {
    const roots = graph.hierarchy.roots
      .filter((id) => graph.concepts.get(id)?.category === category)
      .sort((a, b) => ordinal(a) - ordinal(b) || byLabel(a, b));
    if (roots.length === 0) return [];
    return [{ kind: 'category', category, level: 1, children: roots.map((id) => build(id, 2, new Set())) }];
  });
};

/** Pre-order flattening (document order of the tree). */
export const flattenTree = (forest: readonly TreeNode[]): readonly TreeNode[] =>
  forest.flatMap((n) => [n, ...flattenTree(n.children)]);
