/**
 * Hierarchy algebra over skos:broader (a DAG; polyhierarchy allowed).
 *
 *   narrower    = converse of broader                      (derived, never stored)
 *   ancestors   = transitive closure of broader            (skos:broaderTransitive, strict)
 *   descendants = transitive closure of narrower           (= converse of ancestors; Seco's "hyponyms")
 *   depth       = length of the LONGEST broader chain to a top concept, so that
 *                 depth strictly increases along every broader edge
 *   roots       = top concepts (no broader); leaves = no narrower
 *
 * Everything is generic over the id type and total: on cyclic input (which the
 * validator rejects first) closures still terminate and depth treats a back
 * edge as absent. Closures are computed by a depth-first traversal from each
 * node — O(V·(V+E)), ample for a hand-curated scheme of tens of concepts.
 */

export interface Hierarchy<Id extends string> {
  /** All ids, in a canonical order (sorted by code unit). */
  readonly ids: readonly Id[];
  readonly broader: ReadonlyMap<Id, readonly Id[]>;
  readonly narrower: ReadonlyMap<Id, readonly Id[]>;
  /** Strict ancestors (never contains the concept itself on a DAG). */
  readonly ancestors: ReadonlyMap<Id, ReadonlySet<Id>>;
  /** Strict descendants (hyponyms). */
  readonly descendants: ReadonlyMap<Id, ReadonlySet<Id>>;
  readonly depth: ReadonlyMap<Id, number>;
  readonly roots: readonly Id[];
  readonly leaves: readonly Id[];
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Reflexive-free reachability from `start` following `next`. */
const reach = <Id extends string>(start: Id, next: (id: Id) => readonly Id[]): ReadonlySet<Id> => {
  const seen = new Set<Id>();
  const stack: Id[] = [...next(start)];
  while (stack.length > 0) {
    const id = stack.pop() as Id;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...next(id));
  }
  return seen;
};

/**
 * Derives the full hierarchy from the authored broader relation. Targets not
 * present in `ids` are ignored (the validator reports them).
 */
export const deriveHierarchy = <Id extends string>(
  ids: readonly Id[],
  broaderOf: (id: Id) => readonly Id[],
): Hierarchy<Id> => {
  const sorted = [...new Set(ids)].sort(byCodeUnit);
  const known = new Set(sorted);
  const broader = new Map<Id, readonly Id[]>();
  const narrowerLists = new Map<Id, Id[]>(sorted.map((id) => [id, []]));
  for (const id of sorted) {
    const parents = [...new Set(broaderOf(id))].filter((p) => known.has(p)).sort(byCodeUnit);
    broader.set(id, parents);
    for (const p of parents) narrowerLists.get(p)?.push(id);
  }
  const narrower = new Map<Id, readonly Id[]>(
    sorted.map((id) => [id, [...(narrowerLists.get(id) ?? [])].sort(byCodeUnit)]),
  );
  const up = (id: Id): readonly Id[] => broader.get(id) ?? [];
  const down = (id: Id): readonly Id[] => narrower.get(id) ?? [];

  const ancestors = new Map<Id, ReadonlySet<Id>>(sorted.map((id) => [id, reach(id, up)]));
  const descendants = new Map<Id, ReadonlySet<Id>>(sorted.map((id) => [id, reach(id, down)]));

  // Longest path to a root, memoised; nodes on the current path are skipped (cycle guard).
  const depth = new Map<Id, number>();
  const onPath = new Set<Id>();
  const depthOf = (id: Id): number => {
    const memo = depth.get(id);
    if (memo !== undefined) return memo;
    onPath.add(id);
    let d = 0;
    for (const p of up(id)) if (!onPath.has(p)) d = Math.max(d, depthOf(p) + 1);
    onPath.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const id of sorted) depthOf(id);

  return {
    ids: sorted,
    broader,
    narrower,
    ancestors,
    descendants,
    depth,
    roots: sorted.filter((id) => up(id).length === 0),
    leaves: sorted.filter((id) => down(id).length === 0),
  };
};

/** Ancestors-or-self (reflexive closure), the set of subsumers of `id`. */
export const subsumers = <Id extends string>(h: Hierarchy<Id>, id: Id): ReadonlySet<Id> =>
  new Set([id, ...(h.ancestors.get(id) ?? [])]);

/** Maximum depth of the hierarchy (0 for an empty or flat scheme). */
export const maxDepth = <Id extends string>(h: Hierarchy<Id>): number =>
  h.ids.reduce((m, id) => Math.max(m, h.depth.get(id) ?? 0), 0);

/**
 * Finds broader cycles by depth-first search with three colours (Tarjan, 1972;
 * CLRS §22.3: an edge to a GREY vertex is a back edge, i.e. closes a cycle).
 * Each back edge yields the cycle read off the DFS stack, rotated so it starts
 * at its smallest id and closed by repeating it: [a, b, c, a]. Duplicates are
 * removed; the result is deterministic.
 */
export const findCycles = <Id extends string>(
  ids: readonly Id[],
  broaderOf: (id: Id) => readonly Id[],
): readonly (readonly Id[])[] => {
  const sorted = [...new Set(ids)].sort(byCodeUnit);
  const known = new Set(sorted);
  const colour = new Map<Id, 'grey' | 'black'>();
  const stack: Id[] = [];
  const found = new Map<string, readonly Id[]>();

  const canonical = (cycle: readonly Id[]): readonly Id[] => {
    const min = cycle.reduce((m, id) => (id < m ? id : m), cycle[0] as Id);
    const at = cycle.indexOf(min);
    const rotated = [...cycle.slice(at), ...cycle.slice(0, at)];
    return [...rotated, min];
  };

  const visit = (id: Id): void => {
    colour.set(id, 'grey');
    stack.push(id);
    for (const next of [...broaderOf(id)].filter((t) => known.has(t)).sort(byCodeUnit)) {
      const c = colour.get(next);
      if (c === 'grey') {
        const cycle = canonical(stack.slice(stack.lastIndexOf(next)));
        found.set(cycle.join('\u0000'), cycle);
      } else if (c === undefined) {
        visit(next);
      }
    }
    stack.pop();
    colour.set(id, 'black');
  };
  for (const id of sorted) if (!colour.has(id)) visit(id);
  return [...found.values()].sort((a, b) => byCodeUnit(a.join(' '), b.join(' ')));
};

/** Shortest path (breadth-first, ties by id) from `from` to `to` following `next`; null when unreachable. Includes both ends. */
export const pathBetween = <Id extends string>(
  from: Id,
  to: Id,
  next: (id: Id) => readonly Id[],
): readonly Id[] | null => {
  const previous = new Map<Id, Id | null>([[from, null]]);
  let frontier: readonly Id[] = [from];
  while (frontier.length > 0 && !previous.has(to)) {
    const following: Id[] = [];
    for (const id of frontier) {
      for (const n of [...next(id)].sort(byCodeUnit)) {
        if (previous.has(n)) continue;
        previous.set(n, id);
        following.push(n);
      }
    }
    frontier = following;
  }
  if (!previous.has(to)) return null;
  const path: Id[] = [];
  for (let at: Id | null = to; at !== null; at = previous.get(at) ?? null) path.unshift(at);
  return path;
};

export interface RedundantEdge<Id extends string> {
  readonly source: Id;
  readonly target: Id;
  /** Intermediate nodes of a longer path source → … → target that implies the edge. */
  readonly via: readonly Id[];
}

/**
 * Edges of a DAG that are NOT in its transitive reduction (Aho, Garey &
 * Ullman, "The transitive reduction of a directed graph", SIAM J. Comput.
 * 1(2), 1972): u → v is redundant iff v is reachable from u through another
 * successor w ≠ v. For a DAG the reduction is unique (it is the Hasse diagram
 * of the partial order), so "no redundant edge" means the stored relation IS
 * the Hasse diagram. On cyclic input the result is still total (cycles are
 * reported elsewhere).
 */
export const redundantEdges = <Id extends string>(
  ids: readonly Id[],
  next: (id: Id) => readonly Id[],
): readonly RedundantEdge<Id>[] => {
  const sorted = [...new Set(ids)].sort(byCodeUnit);
  const out: RedundantEdge<Id>[] = [];
  for (const u of sorted) {
    const successors = [...new Set(next(u))].filter((v) => v !== u).sort(byCodeUnit);
    for (const v of successors) {
      for (const w of successors) {
        if (w === v) continue;
        const path = pathBetween(w, v, (x) => next(x).filter((y) => y !== u));
        if (path !== null) {
          out.push({ source: u, target: v, via: path.slice(0, -1) });
          break;
        }
      }
    }
  }
  return out;
};

/** The transitive reduction of a DAG given by `next` (redundant edges removed), as an adjacency map. */
export const transitiveReduction = <Id extends string>(
  ids: readonly Id[],
  next: (id: Id) => readonly Id[],
): ReadonlyMap<Id, readonly Id[]> => {
  const redundant = new Set(redundantEdges(ids, next).map((e) => `${e.source}\u0000${e.target}`));
  return new Map(
    [...new Set(ids)]
      .sort(byCodeUnit)
      .map((u) => [u, [...new Set(next(u))].filter((v) => !redundant.has(`${u}\u0000${v}`)).sort(byCodeUnit)] as const),
  );
};
