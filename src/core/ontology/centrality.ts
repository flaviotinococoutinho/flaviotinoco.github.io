/**
 * Betweenness centrality on the undirected projection of the concept graph.
 *
 * Exact algorithm of Brandes ("A faster algorithm for betweenness centrality",
 * J. Math. Sociol. 25(2), 2001): one breadth-first search per source counts
 * the shortest paths σ and accumulates the dependencies backwards,
 *
 *     δ_s(v) = Σ_{w : v ∈ P_s(w)} (σ_sv / σ_sw) · (ω(s, w) + δ_s(w)),
 *
 * in O(|V|·|E|). With ω ≡ 1 this is the classic betweenness; with a pair
 * weight ω(s, t) the same pass yields the variants of Brandes ("On variants of
 * shortest-path betweenness centrality and their generic computation", Social
 * Networks 30(2), 2008). Here ω(s, t) = [stratum(s) ≠ stratum(t)] counts only
 * the shortest paths that CROSS strata: the concepts with the highest such
 * score are the bridge concepts ("conceitos-ponte") of the site's bridge.
 *
 * Undirected graphs count every pair twice (s→t and t→s); the result is halved.
 * Normalised values divide by the number of pairs not involving v,
 * (n − 1)(n − 2) / 2, so they lie in [0, 1].
 */
import type { ConceptId } from '../domain/identifiers.ts';
import type { Adjacency, ConceptGraph } from './graph.ts';

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Raw (halved) betweenness of every node; `pairWeight` defaults to 1 for every ordered pair. */
export const betweenness = <Id extends string>(
  ids: readonly Id[],
  adjacent: ReadonlyMap<Id, readonly Id[]>,
  pairWeight: (s: Id, t: Id) => number = () => 1,
): ReadonlyMap<Id, number> => {
  const nodes = [...ids].sort(byCodeUnit);
  const score = new Map<Id, number>(nodes.map((id) => [id, 0]));
  for (const s of nodes) {
    const stack: Id[] = [];
    const preds = new Map<Id, Id[]>(nodes.map((id) => [id, []]));
    const sigma = new Map<Id, number>(nodes.map((id) => [id, 0]));
    const dist = new Map<Id, number>();
    sigma.set(s, 1);
    dist.set(s, 0);
    const queue: Id[] = [s];
    for (let head = 0; head < queue.length; head += 1) {
      const v = queue[head] as Id;
      stack.push(v);
      const dv = dist.get(v) ?? 0;
      for (const w of adjacent.get(v) ?? []) {
        if (!dist.has(w)) {
          dist.set(w, dv + 1);
          queue.push(w);
        }
        if (dist.get(w) === dv + 1) {
          sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0));
          preds.get(w)?.push(v);
        }
      }
    }
    const delta = new Map<Id, number>(nodes.map((id) => [id, 0]));
    while (stack.length > 0) {
      const w = stack.pop() as Id;
      const coefficient = (w === s ? 0 : pairWeight(s, w)) + (delta.get(w) ?? 0);
      for (const v of preds.get(w) ?? []) {
        const share = ((sigma.get(v) ?? 0) / (sigma.get(w) ?? 1)) * coefficient;
        delta.set(v, (delta.get(v) ?? 0) + share);
      }
      if (w !== s) score.set(w, (score.get(w) ?? 0) + (delta.get(w) ?? 0));
    }
  }
  return new Map(nodes.map((id) => [id, (score.get(id) ?? 0) / 2]));
};

/** Divides raw scores by (n − 1)(n − 2) / 2, the number of unordered pairs not involving the node. */
export const normalise = <Id extends string>(raw: ReadonlyMap<Id, number>): ReadonlyMap<Id, number> => {
  const n = raw.size;
  const pairs = ((n - 1) * (n - 2)) / 2;
  return new Map([...raw].map(([id, v]) => [id, pairs > 0 ? v / pairs : 0]));
};

export interface Centrality {
  /** Normalised betweenness over all pairs. */
  readonly betweenness: ReadonlyMap<ConceptId, number>;
  /** Normalised betweenness over the pairs of concepts in DIFFERENT strata. */
  readonly crossStrata: ReadonlyMap<ConceptId, number>;
}

export const centralityOf = (g: ConceptGraph): Centrality => {
  const adjacent: Adjacency = g.neighbours;
  const stratum = (id: ConceptId) => g.concepts.get(id)?.stratum;
  return {
    betweenness: normalise(betweenness(g.ids, adjacent)),
    crossStrata: normalise(betweenness(g.ids, adjacent, (s, t) => (stratum(s) === stratum(t) ? 0 : 1))),
  };
};

/** The k concepts with the highest cross-strata betweenness (> 0), ties broken by id. */
export const bridgeConcepts = (c: Centrality, k: number): readonly ConceptId[] =>
  [...c.crossStrata]
    .filter(([, v]) => v > 1e-12)
    .sort(([a, x], [b, y]) => y - x || byCodeUnit(a, b))
    .slice(0, Math.max(0, k))
    .map(([id]) => id);
