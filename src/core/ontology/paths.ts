/**
 * Paths through the typed concept graph.
 *
 * Learning path ("trilha"): for a target concept, every concept it
 * transitively presupposes through the prerequisite relations (broader ∪
 * dependsOn: the general before the specific, the prerequisite before what
 * depends on it), in a deterministic topological order — Kahn's algorithm
 * (Kahn, "Topological sorting of large networks", CACM 5(11), 1962) with a
 * stable tie-break among the concepts that are ready at each step: first the
 * stratum (the order of the bridge), then the label under the locale's
 * collation, then the id. The target comes last by construction.
 *
 * Typed shortest path: Dijkstra (1959) on the undirected projection, where
 * crossing an edge costs the weight of its relation type (relations with formal
 * semantics are cheaper than the weak `related`), traversable in either
 * direction (an inverse step is labelled as such). Ties are broken by id, so
 * the path is unique for given data.
 */
import type { ConceptId } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import { STRATUM_SPECS } from '../domain/strata.ts';
import type { ConceptGraph, Link } from './graph.ts';
import { PREREQUISITE_TYPES, RELATIONS, type RelationType } from './vocabulary.ts';

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Direct prerequisites of a concept (union over the given relation types, sorted). */
export const prerequisitesOf = (
  g: ConceptGraph,
  id: ConceptId,
  types: readonly RelationType[] = PREREQUISITE_TYPES,
): readonly ConceptId[] => [...new Set(types.flatMap((t) => g.forward[t].get(id) ?? []))].sort(byCodeUnit);

/** All transitive prerequisites of `target` (excluding it). */
export const prerequisiteClosure = (
  g: ConceptGraph,
  target: ConceptId,
  types: readonly RelationType[] = PREREQUISITE_TYPES,
): ReadonlySet<ConceptId> => {
  const seen = new Set<ConceptId>();
  const stack = [...prerequisitesOf(g, target, types)];
  while (stack.length > 0) {
    const id = stack.pop() as ConceptId;
    if (seen.has(id) || id === target) continue;
    seen.add(id);
    stack.push(...prerequisitesOf(g, id, types));
  }
  return seen;
};

/**
 * The learning path of `target`: its transitive prerequisites followed by the
 * target, topologically sorted (every concept appears after all of its
 * prerequisites). Total on any graph: on a cycle (rejected by the validator)
 * the remaining concepts are appended in tie-break order.
 */
export const learningPath = (
  g: ConceptGraph,
  target: ConceptId,
  locale: Locale,
  types: readonly RelationType[] = PREREQUISITE_TYPES,
): readonly ConceptId[] => {
  if (!g.concepts.has(target)) return [];
  const nodes = new Set([...prerequisiteClosure(g, target, types), target]);
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const key = (id: ConceptId) => {
    const e = g.concepts.get(id);
    return { ordinal: e === undefined ? 0 : STRATUM_SPECS[e.stratum].ordinal, label: e?.prefLabel[locale] ?? id };
  };
  const before = (a: ConceptId, b: ConceptId): number => {
    const ka = key(a);
    const kb = key(b);
    return ka.ordinal - kb.ordinal || collator.compare(ka.label, kb.label) || byCodeUnit(a, b);
  };
  // In-degree = number of prerequisites inside the subgraph; dependents = reverse edges.
  const pending = new Map<ConceptId, number>();
  const dependents = new Map<ConceptId, ConceptId[]>();
  for (const id of nodes) {
    const pre = prerequisitesOf(g, id, types).filter((p) => nodes.has(p));
    pending.set(id, pre.length);
    for (const p of pre) dependents.set(p, [...(dependents.get(p) ?? []), id]);
  }
  const order: ConceptId[] = [];
  const ready = [...nodes].filter((id) => pending.get(id) === 0);
  while (ready.length > 0) {
    ready.sort(before);
    const id = ready.shift() as ConceptId;
    order.push(id);
    for (const d of dependents.get(id) ?? []) {
      const left = (pending.get(d) ?? 0) - 1;
      pending.set(d, left);
      if (left === 0) ready.push(d);
    }
  }
  // Cycle guard: unreachable on a validated graph.
  const rest = [...nodes].filter((id) => !order.includes(id)).sort(before);
  return [...order, ...rest];
};

/** One step of a typed path: `from` → `to` along `type`, forward (as stored) or inverse. */
export interface PathStep {
  readonly from: ConceptId;
  readonly to: ConceptId;
  readonly type: RelationType;
  readonly direction: 'forward' | 'inverse';
}

export interface TypedPath {
  readonly steps: readonly PathStep[];
  readonly cost: number;
}

/** The part of a graph a typed path needs (a ConceptGraph, or the client's decoded node-link graph). */
export interface LinkGraph {
  readonly ids: readonly ConceptId[];
  readonly links: readonly Link[];
}

/** Adjacency of the undirected projection with typed, directed labels, built once per graph. */
const typedAdjacency = (g: LinkGraph): ReadonlyMap<ConceptId, readonly PathStep[]> => {
  const adj = new Map<ConceptId, PathStep[]>(g.ids.map((id) => [id, []]));
  for (const l of g.links) {
    adj.get(l.source)?.push({ from: l.source, to: l.target, type: l.type, direction: 'forward' });
    const back: PathStep['direction'] = RELATIONS[l.type].symmetric ? 'forward' : 'inverse';
    adj.get(l.target)?.push({ from: l.target, to: l.source, type: l.type, direction: back });
  }
  for (const steps of adj.values()) {
    steps.sort((a, b) => RELATIONS[a.type].weight - RELATIONS[b.type].weight || byCodeUnit(a.to, b.to));
  }
  return adj;
};

/** Cheapest typed path between two concepts (null when they are not connected). */
export const shortestPath = (g: LinkGraph, from: ConceptId, to: ConceptId): TypedPath | null => {
  if (!g.ids.includes(from) || !g.ids.includes(to)) return null;
  if (from === to) return { steps: [], cost: 0 };
  const adj = typedAdjacency(g);
  const dist = new Map<ConceptId, number>([[from, 0]]);
  const via = new Map<ConceptId, PathStep>();
  const done = new Set<ConceptId>();
  // |V| is small: a linear scan for the minimum keeps the tie-break explicit (cost, then id).
  for (;;) {
    let current: ConceptId | null = null;
    let best = Infinity;
    for (const [id, d] of dist) {
      if (done.has(id)) continue;
      if (d < best - 1e-12 || (Math.abs(d - best) <= 1e-12 && current !== null && id < current)) {
        current = id;
        best = d;
      }
    }
    if (current === null || current === to) break;
    done.add(current);
    for (const step of adj.get(current) ?? []) {
      if (done.has(step.to)) continue;
      const candidate = best + RELATIONS[step.type].weight;
      const known = dist.get(step.to);
      if (known === undefined || candidate < known - 1e-12) {
        dist.set(step.to, candidate);
        via.set(step.to, step);
      }
    }
  }
  const cost = dist.get(to);
  if (cost === undefined) return null;
  const steps: PathStep[] = [];
  for (let at: ConceptId = to; at !== from;) {
    const step = via.get(at);
    if (step === undefined) return null;
    steps.unshift(step);
    at = step.from;
  }
  return { steps, cost };
};
