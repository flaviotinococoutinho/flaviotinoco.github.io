/**
 * ConceptGraph — a validated concept scheme: a typed multigraph whose
 * TOPOLOGY is the set of typed relations plus the guarantees below.
 *
 * `buildGraph` is a parser from a list of entries to a graph: it accumulates
 * EVERY violation (applicative validation) and only returns a graph when there
 * are none, so downstream code (measures, layout, views) may assume:
 *
 *   identity      ids are unique, every reference resolves, no self-relations;
 *   acyclicity    broader, partOf, dependsOn, formalizes, appliesTo, measures are
 *                 each acyclic, and so is the prerequisite order broader ∪ dependsOn
 *                 (learning paths are topological sorts of it);
 *   filtration    stratum constraints hold (no `formalizes` edge down the bridge,
 *                 no `appliesTo` edge up it);
 *   kinds         category constraints hold (broader preserves the category;
 *                 `measures` goes from a measure to a quality or an entity);
 *   economy       symmetric relations stored once; an unordered pair is linked
 *                 under one type only; associative pairs (and the partOf closure)
 *                 are disjoint from skos:broaderTransitive (SKOS S27);
 *   connectedness every concept has an edge and the undirected projection is
 *                 connected (one component);
 *   sources       propositions cite at least one source;
 *   labels        slugs unique per locale and derived from that locale's labels;
 *                 prefLabels unique per locale and disjoint from altLabels (S13/S14).
 *
 * Warnings (not errors): broader edges outside the transitive reduction
 * (the stored broader must be the Hasse diagram) and more than two parents.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { ConceptId, Slug } from '../domain/identifiers.ts';
import { LOCALES, type Locale } from '../domain/locale.ts';
import { deriveHierarchy, findCycles, redundantEdges, type Hierarchy } from './hierarchy.ts';
import type { ConceptEntry, OntologyError, OntologyWarning } from './model.ts';
import { labelKey, slugify } from './text.ts';
import { PREREQUISITE_TYPES, RELATION_TYPES, RELATIONS, satisfiesStratum, type RelationType } from './vocabulary.ts';

/** A stored edge. For symmetric types the pair is oriented so that source < target. */
export interface Link {
  readonly type: RelationType;
  readonly source: ConceptId;
  readonly target: ConceptId;
}

export type Adjacency = ReadonlyMap<ConceptId, readonly ConceptId[]>;

export interface ConceptGraph {
  /** Concept ids sorted by code unit (canonical order). */
  readonly ids: readonly ConceptId[];
  readonly concepts: ReadonlyMap<ConceptId, ConceptEntry>;
  /** The SKOS hierarchy (broader/narrower, closures, depth, top concepts). */
  readonly hierarchy: Hierarchy<ConceptId>;
  /** Every stored edge, broader included, in canonical order (type in table order, then source, then target). */
  readonly links: readonly Link[];
  /** Forward adjacency per type; for symmetric types it holds both directions. */
  readonly forward: Readonly<Record<RelationType, Adjacency>>;
  /** Inverse adjacency per type (the derived inverse relation); equals `forward` for symmetric types. */
  readonly inverse: Readonly<Record<RelationType, Adjacency>>;
  /** Undirected projection over every type, sorted. */
  readonly neighbours: Adjacency;
  /** Locale → slug → id (the inverse used by routing). */
  readonly bySlug: Readonly<Record<Locale, ReadonlyMap<Slug, ConceptId>>>;
  readonly warnings: readonly OntologyWarning[];
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const groupDuplicates = <K, V>(pairs: readonly (readonly [K, V])[]): ReadonlyMap<K, readonly V[]> => {
  const groups = new Map<K, V[]>();
  for (const [k, v] of pairs) groups.set(k, [...(groups.get(k) ?? []), v]);
  return new Map([...groups].filter(([, vs]) => vs.length > 1));
};

const pairKey = (a: string, b: string): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

/** Stored targets of `e` for one relation type, as authored (duplicates and unknown ids included). */
export const storedTargets = (e: ConceptEntry, type: RelationType): readonly ConceptId[] =>
  type === 'broader' ? e.broader : e.relations.filter((r) => r.type === type).map((r) => r.target);

const adjacencyOf = (ids: readonly ConceptId[], pairs: readonly (readonly [ConceptId, ConceptId])[]): Adjacency => {
  const lists = new Map<ConceptId, Set<ConceptId>>(ids.map((id) => [id, new Set()]));
  for (const [a, b] of pairs) lists.get(a)?.add(b);
  return new Map(ids.map((id) => [id, [...(lists.get(id) ?? [])].sort(byCodeUnit)]));
};

/** Connected components of an undirected adjacency, each sorted, largest first (ties by first id). */
export const components = (ids: readonly ConceptId[], adjacent: Adjacency): readonly (readonly ConceptId[])[] => {
  const seen = new Set<ConceptId>();
  const out: ConceptId[][] = [];
  for (const start of ids) {
    if (seen.has(start)) continue;
    const component: ConceptId[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const id = stack.pop() as ConceptId;
      component.push(id);
      for (const n of adjacent.get(id) ?? []) {
        if (seen.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    out.push(component.sort(byCodeUnit));
  }
  return out.sort((a, b) => b.length - a.length || byCodeUnit(a[0] ?? '', b[0] ?? ''));
};

/** Validates entries and builds the graph, or returns every violation found. */
export const buildGraph = (entries: readonly ConceptEntry[]): Result<ConceptGraph, readonly OntologyError[]> => {
  const errors: OntologyError[] = [];
  const warnings: OntologyWarning[] = [];

  // Identity.
  const concepts = new Map<ConceptId, ConceptEntry>();
  for (const e of entries) {
    if (concepts.has(e.id)) errors.push({ kind: 'duplicate-id', id: e.id });
    else concepts.set(e.id, e);
  }
  const ids = [...concepts.keys()].sort(byCodeUnit);
  const entry = (id: ConceptId): ConceptEntry => concepts.get(id) as ConceptEntry;

  // References: existence, reflexivity, repetition; then the constraints of each type.
  const valid: Link[] = [];
  for (const type of RELATION_TYPES) {
    const spec = RELATIONS[type];
    for (const id of ids) {
      const e = entry(id);
      const seen = new Set<ConceptId>();
      for (const t of storedTargets(e, type)) {
        if (seen.has(t)) {
          errors.push({ kind: 'repeated-relation', id, relation: type, target: t });
          continue;
        }
        seen.add(t);
        if (t === id) {
          errors.push({ kind: 'self-relation', id, relation: type });
          continue;
        }
        const target = concepts.get(t);
        if (target === undefined) {
          errors.push({ kind: 'unknown-reference', id, relation: type, target: t });
          continue;
        }
        if (!satisfiesStratum(spec.stratum, e.stratum, target.stratum)) {
          errors.push({
            kind: 'stratum-constraint',
            id,
            relation: type,
            target: t,
            source: e.stratum,
            targetStratum: target.stratum,
          });
        }
        const categoryOk =
          (spec.sourceCategories === null || spec.sourceCategories.includes(e.category)) &&
          (spec.targetCategories === null || spec.targetCategories.includes(target.category)) &&
          (!spec.sameCategory || e.category === target.category);
        if (!categoryOk) {
          errors.push({
            kind: 'category-constraint',
            id,
            relation: type,
            target: t,
            source: e.category,
            targetCategory: target.category,
          });
        }
        valid.push({ type, source: id, target: t });
      }
    }
  }

  // Symmetric relations stored once.
  for (const type of RELATION_TYPES.filter((t) => RELATIONS[t].symmetric)) {
    const stored = new Set(valid.filter((l) => l.type === type).map((l) => `${l.source}\u0000${l.target}`));
    for (const l of valid) {
      if (l.type === type && l.source < l.target && stored.has(`${l.target}\u0000${l.source}`)) {
        errors.push({ kind: 'symmetric-stored-twice', relation: type, a: l.source, b: l.target });
      }
    }
  }

  // Canonical links: symmetric edges oriented source < target, deduplicated.
  const canonical = new Map<string, Link>();
  for (const l of valid) {
    const oriented =
      RELATIONS[l.type].symmetric && l.target < l.source ? { ...l, source: l.target, target: l.source } : l;
    canonical.set(`${oriented.type}\u0000${oriented.source}\u0000${oriented.target}`, oriented);
  }
  const typeOrder = new Map(RELATION_TYPES.map((t, i) => [t, i]));
  const links = [...canonical.values()].sort(
    (a, b) =>
      (typeOrder.get(a.type) ?? 0) - (typeOrder.get(b.type) ?? 0) ||
      byCodeUnit(a.source, b.source) ||
      byCodeUnit(a.target, b.target),
  );

  // One type per unordered pair.
  const typesOfPair = new Map<string, Set<RelationType>>();
  for (const l of links) {
    const k = pairKey(l.source, l.target);
    typesOfPair.set(k, new Set([...(typesOfPair.get(k) ?? []), l.type]));
  }
  for (const [k, types] of [...typesOfPair].sort(([a], [b]) => byCodeUnit(a, b))) {
    // Two directed edges of the same type between a pair form a 2-cycle, reported below.
    if (types.size < 2) continue;
    const [a, b] = k.split('\u0000') as [ConceptId, ConceptId];
    errors.push({ kind: 'pair-under-two-types', a, b, relations: RELATION_TYPES.filter((t) => types.has(t)) });
  }

  // Adjacency per type.
  const forward = {} as Record<RelationType, Adjacency>;
  const inverse = {} as Record<RelationType, Adjacency>;
  for (const type of RELATION_TYPES) {
    const ofType = links.filter((l) => l.type === type);
    const pairs = ofType.map((l) => [l.source, l.target] as const);
    const converse = ofType.map((l) => [l.target, l.source] as const);
    if (RELATIONS[type].symmetric) {
      const both = adjacencyOf(ids, [...pairs, ...converse]);
      forward[type] = both;
      inverse[type] = both;
    } else {
      forward[type] = adjacencyOf(ids, pairs);
      inverse[type] = adjacencyOf(ids, converse);
    }
  }
  const out =
    (type: RelationType) =>
    (id: ConceptId): readonly ConceptId[] =>
      forward[type].get(id) ?? [];

  // Acyclicity of each acyclic type and of the prerequisite order.
  for (const type of RELATION_TYPES.filter((t) => RELATIONS[t].acyclic)) {
    for (const cycle of findCycles(ids, out(type))) errors.push({ kind: 'cycle', scope: type, cycle });
  }
  const prerequisite = (id: ConceptId): readonly ConceptId[] => PREREQUISITE_TYPES.flatMap((t) => out(t)(id));
  const singleTypeCycles = new Set(errors.flatMap((e) => (e.kind === 'cycle' ? [e.cycle.join(' ')] : [])));
  for (const cycle of findCycles(ids, prerequisite)) {
    if (!singleTypeCycles.has(cycle.join(' '))) errors.push({ kind: 'cycle', scope: 'prerequisite', cycle });
  }

  const hierarchy = deriveHierarchy(ids, out('broader'));

  // SKOS S27 extended: associative pairs (and the entailed partOf closure) vs broaderTransitive.
  const hierarchical = (a: ConceptId, b: ConceptId): boolean =>
    hierarchy.ancestors.get(a)?.has(b) === true || hierarchy.descendants.get(a)?.has(b) === true;
  for (const l of links) {
    if (l.type !== 'broader' && hierarchical(l.source, l.target)) {
      errors.push({ kind: 'associative-hierarchical', id: l.source, relation: l.type, target: l.target });
    }
  }
  const partClosure = deriveHierarchy(ids, out('partOf'));
  for (const id of ids) {
    for (const whole of [...(partClosure.ancestors.get(id) ?? [])].sort(byCodeUnit)) {
      const direct = (forward.partOf.get(id) ?? []).includes(whole);
      if (!direct && hierarchical(id, whole)) {
        errors.push({ kind: 'associative-hierarchical', id, relation: 'partOf', target: whole });
      }
    }
  }

  // The stored broader relation must be its own transitive reduction (Hasse diagram).
  for (const r of redundantEdges(ids, out('broader'))) {
    warnings.push({ kind: 'redundant-broader', id: r.source, target: r.target, via: r.via });
  }
  for (const id of ids) {
    const parents = hierarchy.broader.get(id) ?? [];
    if (parents.length > 2) warnings.push({ kind: 'polyhierarchy-excess', id, parents });
  }

  // Connectedness of the undirected projection.
  const neighbours = adjacencyOf(
    ids,
    links.flatMap((l) => [[l.source, l.target] as const, [l.target, l.source] as const]),
  );
  for (const id of ids)
    if ((neighbours.get(id)?.length ?? 0) === 0 && ids.length > 1) errors.push({ kind: 'isolated', id });
  for (const component of components(ids, neighbours).slice(1)) {
    if (component.length > 1) errors.push({ kind: 'disconnected', component });
  }

  // Sources of propositions.
  for (const id of ids) {
    const e = entry(id);
    if (e.category === 'proposition' && e.sources.length === 0) errors.push({ kind: 'proposition-without-source', id });
  }

  // Slugs and labels, per locale.
  const bySlug = {} as Record<Locale, ReadonlyMap<Slug, ConceptId>>;
  for (const locale of LOCALES) {
    const slugPairs = ids.map((id) => [entry(id).slug[locale], id] as const);
    for (const [slug, dupIds] of groupDuplicates(slugPairs)) {
      errors.push({ kind: 'duplicate-slug', locale, slug, ids: [...dupIds].sort(byCodeUnit) });
    }
    bySlug[locale] = new Map(slugPairs);

    const labelPairs = ids.map((id) => [labelKey(entry(id).prefLabel[locale], locale), id] as const);
    for (const [label, dupIds] of groupDuplicates(labelPairs)) {
      errors.push({ kind: 'duplicate-pref-label', locale, label, ids: [...dupIds].sort(byCodeUnit) });
    }

    for (const id of ids) {
      const e = entry(id);
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

  return errors.length > 0
    ? err(errors)
    : ok({ ids, concepts, hierarchy, links, forward, inverse, neighbours, bySlug, warnings });
};

/** The concept entry of an id, if it is in the graph. */
export const conceptOf = (g: ConceptGraph, id: ConceptId): ConceptEntry | undefined => g.concepts.get(id);

/** Typed neighbours of a concept in one direction: 'out' follows the stored relation, 'in' its derived inverse. */
export const linked = (
  g: ConceptGraph,
  id: ConceptId,
  type: RelationType,
  direction: 'out' | 'in',
): readonly ConceptId[] => (direction === 'out' ? g.forward[type] : g.inverse[type]).get(id) ?? [];

/** Stored edges with both ends in `within` (all edges when omitted), canonical order. */
export const edgesOf = (g: ConceptGraph, within?: ReadonlySet<ConceptId>): readonly Link[] =>
  within === undefined ? g.links : g.links.filter((l) => within.has(l.source) && within.has(l.target));

/** Number of distinct neighbours of each concept in the undirected projection. */
export const degreeOf = (g: ConceptGraph, id: ConceptId): number => g.neighbours.get(id)?.length ?? 0;

/**
 * Neighbourhood of `focus` within `depth` steps over every relation type, in
 * either direction (breadth-first). Includes the focus; BFS order, ties by id.
 */
export const neighbourhood = (g: ConceptGraph, focus: ConceptId, depth: number): readonly ConceptId[] => {
  if (!g.concepts.has(focus)) return [];
  const order: ConceptId[] = [focus];
  const seen = new Set<ConceptId>(order);
  let frontier: readonly ConceptId[] = order;
  for (let d = 0; d < depth; d += 1) {
    const next: ConceptId[] = [];
    for (const id of frontier) {
      for (const n of g.neighbours.get(id) ?? []) {
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

/** Distance in edges from `focus` for each node within `depth` steps (0 for the focus). */
export const distancesFrom = (g: ConceptGraph, focus: ConceptId, depth: number): ReadonlyMap<ConceptId, number> => {
  const result = new Map<ConceptId, number>();
  if (!g.concepts.has(focus)) return result;
  result.set(focus, 0);
  let frontier: readonly ConceptId[] = [focus];
  for (let d = 1; d <= depth; d += 1) {
    const next: ConceptId[] = [];
    for (const id of frontier) {
      for (const n of g.neighbours.get(id) ?? []) {
        if (result.has(n)) continue;
        result.set(n, d);
        next.push(n);
      }
    }
    frontier = next;
  }
  return result;
};
