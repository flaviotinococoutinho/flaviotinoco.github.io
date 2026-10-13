/**
 * ConceptGraph — a validated SKOS concept scheme with its derived relations.
 *
 * `buildGraph` is a parser from a list of entries to a graph: it accumulates
 * EVERY integrity violation (applicative validation) and only returns a graph
 * when there are none, so downstream code (measures, layout, views) may assume:
 *
 *   - ids are unique and every reference resolves;
 *   - broader is acyclic (a DAG; polyhierarchy allowed) and irreflexive;
 *   - related is irreflexive, stored once per pair, and disjoint from the
 *     transitive hierarchy (SKOS integrity condition S27);
 *   - slugs are unique per locale and derived from that locale's labels;
 *   - prefLabels are unique per locale and disjoint from altLabels (S13/S14).
 *
 * Derived (never stored): narrower = converse(broader); related = symmetric
 * closure of the stored direction.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { ConceptId, Slug } from '../domain/identifiers.ts';
import { LOCALES, type Locale } from '../domain/locale.ts';
import { deriveHierarchy, findCycles, type Hierarchy } from './hierarchy.ts';
import type { ConceptEntry, OntologyError, Relation } from './model.ts';
import { labelKey, slugify } from './text.ts';

export interface ConceptGraph {
  /** Concept ids sorted by code unit (canonical order). */
  readonly ids: readonly ConceptId[];
  readonly concepts: ReadonlyMap<ConceptId, ConceptEntry>;
  readonly hierarchy: Hierarchy<ConceptId>;
  /** Symmetric closure of the stored related relation, sorted. */
  readonly related: ReadonlyMap<ConceptId, readonly ConceptId[]>;
  /** Locale → slug → id (the inverse used by routing). */
  readonly bySlug: Readonly<Record<Locale, ReadonlyMap<Slug, ConceptId>>>;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const groupDuplicates = <K, V>(pairs: readonly (readonly [K, V])[]): ReadonlyMap<K, readonly V[]> => {
  const groups = new Map<K, V[]>();
  for (const [k, v] of pairs) groups.set(k, [...(groups.get(k) ?? []), v]);
  return new Map([...groups].filter(([, vs]) => vs.length > 1));
};

/** Validates entries and builds the graph, or returns every violation found. */
export const buildGraph = (entries: readonly ConceptEntry[]): Result<ConceptGraph, readonly OntologyError[]> => {
  const errors: OntologyError[] = [];

  // Identity.
  const concepts = new Map<ConceptId, ConceptEntry>();
  for (const e of entries) {
    if (concepts.has(e.id)) errors.push({ kind: 'duplicate-id', id: e.id });
    else concepts.set(e.id, e);
  }
  const ids = [...concepts.keys()].sort(byCodeUnit);

  // References: existence, reflexivity, repetition.
  const checkRefs = (e: ConceptEntry, relation: Relation, targets: readonly ConceptId[]): void => {
    const seen = new Set<ConceptId>();
    for (const t of targets) {
      if (t === e.id) errors.push({ kind: 'self-relation', id: e.id, relation });
      else if (!concepts.has(t)) errors.push({ kind: 'unknown-reference', id: e.id, relation, target: t });
      if (seen.has(t)) errors.push({ kind: 'repeated-relation', id: e.id, relation, target: t });
      seen.add(t);
    }
  };
  for (const id of ids) {
    const e = concepts.get(id) as ConceptEntry;
    checkRefs(e, 'broader', e.broader);
    checkRefs(e, 'related', e.related);
  }

  const broaderOf = (id: ConceptId): readonly ConceptId[] =>
    (concepts.get(id)?.broader ?? []).filter((t) => t !== id && concepts.has(t));

  // Acyclicity of broader (reported with the cycle itself).
  for (const cycle of findCycles(ids, broaderOf)) errors.push({ kind: 'broader-cycle', cycle });

  const hierarchy = deriveHierarchy(ids, broaderOf);

  // related: stored once, irreflexive (above), disjoint from the transitive hierarchy (S27).
  const relatedSets = new Map<ConceptId, Set<ConceptId>>(ids.map((id) => [id, new Set()]));
  for (const id of ids) {
    const e = concepts.get(id) as ConceptEntry;
    for (const t of new Set(e.related)) {
      if (t === id || !concepts.has(t)) continue;
      if (id < t && (concepts.get(t)?.related ?? []).includes(id)) {
        errors.push({ kind: 'related-stored-twice', id, target: t });
      }
      const hierarchical = hierarchy.ancestors.get(id)?.has(t) === true || hierarchy.descendants.get(id)?.has(t) === true;
      if (hierarchical) errors.push({ kind: 'related-hierarchical', id, target: t });
      relatedSets.get(id)?.add(t);
      relatedSets.get(t)?.add(id);
    }
  }
  const related = new Map<ConceptId, readonly ConceptId[]>(
    ids.map((id) => [id, [...(relatedSets.get(id) ?? [])].sort(byCodeUnit)]),
  );

  // Slugs and labels, per locale.
  const bySlug = {} as Record<Locale, ReadonlyMap<Slug, ConceptId>>;
  for (const locale of LOCALES) {
    const slugPairs = ids.map((id) => [(concepts.get(id) as ConceptEntry).slug[locale], id] as const);
    for (const [slug, dupIds] of groupDuplicates(slugPairs)) {
      errors.push({ kind: 'duplicate-slug', locale, slug, ids: [...dupIds].sort(byCodeUnit) });
    }
    bySlug[locale] = new Map(slugPairs);

    const labelPairs = ids.map((id) => [labelKey((concepts.get(id) as ConceptEntry).prefLabel[locale], locale), id] as const);
    for (const [label, dupIds] of groupDuplicates(labelPairs)) {
      errors.push({ kind: 'duplicate-pref-label', locale, label, ids: [...dupIds].sort(byCodeUnit) });
    }

    for (const id of ids) {
      const e = concepts.get(id) as ConceptEntry;
      const pref = labelKey(e.prefLabel[locale], locale);
      for (const alt of e.altLabel[locale]) {
        if (labelKey(alt, locale) === pref) errors.push({ kind: 'pref-alt-overlap', id, locale, label: alt });
      }
      const expected = [...new Set([e.prefLabel[locale], ...e.altLabel[locale]].map(slugify))];
      if (!expected.includes(e.slug[locale])) {
        errors.push({ kind: 'slug-locale-mismatch', id, locale, slug: e.slug[locale], expected });
      }
    }
  }

  return errors.length > 0 ? err(errors) : ok({ ids, concepts, hierarchy, related, bySlug });
};

/** The concept entry of an id known to be in the graph. */
export const conceptOf = (g: ConceptGraph, id: ConceptId): ConceptEntry | undefined => g.concepts.get(id);

/** Undirected edge of the concept graph, as drawn on maps. */
export interface Edge {
  readonly kind: 'broader' | 'related';
  /** For broader edges: the narrower concept. For related: the smaller id. */
  readonly source: ConceptId;
  /** For broader edges: the broader concept. For related: the larger id. */
  readonly target: ConceptId;
}

/** All edges (broader child→parent, then related once per pair), canonical order. */
export const edgesOf = (g: ConceptGraph, within?: ReadonlySet<ConceptId>): readonly Edge[] => {
  const inside = (id: ConceptId): boolean => within === undefined || within.has(id);
  const out: Edge[] = [];
  for (const id of g.ids) {
    if (!inside(id)) continue;
    for (const p of g.hierarchy.broader.get(id) ?? []) if (inside(p)) out.push({ kind: 'broader', source: id, target: p });
  }
  for (const id of g.ids) {
    if (!inside(id)) continue;
    for (const r of g.related.get(id) ?? []) if (id < r && inside(r)) out.push({ kind: 'related', source: id, target: r });
  }
  return out;
};

/**
 * Neighbourhood of `focus` within `depth` steps, following broader, narrower
 * and related edges in either direction (breadth-first). Includes the focus.
 * Returned in BFS order (focus first), ties by id.
 */
export const neighbourhood = (g: ConceptGraph, focus: ConceptId, depth: number): readonly ConceptId[] => {
  if (!g.concepts.has(focus)) return [];
  const adjacent = (id: ConceptId): readonly ConceptId[] =>
    [...new Set([...(g.hierarchy.broader.get(id) ?? []), ...(g.hierarchy.narrower.get(id) ?? []), ...(g.related.get(id) ?? [])])].sort(
      byCodeUnit,
    );
  const order: ConceptId[] = [focus];
  const seen = new Set<ConceptId>(order);
  let frontier: readonly ConceptId[] = order;
  for (let d = 0; d < depth; d += 1) {
    const next: ConceptId[] = [];
    for (const id of frontier) {
      for (const n of adjacent(id)) {
        if (seen.has(n)) continue;
        seen.add(n);
        next.push(n);
      }
    }
    order.push(...next);
    frontier = next;
  }
  return order;
};

/** Distance in edges from `focus` for each node of its neighbourhood (0 for the focus). */
export const distancesFrom = (g: ConceptGraph, focus: ConceptId, depth: number): ReadonlyMap<ConceptId, number> => {
  const result = new Map<ConceptId, number>();
  if (!g.concepts.has(focus)) return result;
  result.set(focus, 0);
  let frontier: readonly ConceptId[] = [focus];
  for (let d = 1; d <= depth; d += 1) {
    const next: ConceptId[] = [];
    for (const id of frontier) {
      const adj = [...(g.hierarchy.broader.get(id) ?? []), ...(g.hierarchy.narrower.get(id) ?? []), ...(g.related.get(id) ?? [])];
      for (const n of adj) {
        if (result.has(n)) continue;
        result.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return result;
};
