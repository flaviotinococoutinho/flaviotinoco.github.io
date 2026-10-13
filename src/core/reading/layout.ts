/**
 * Layered drawing of a directed acyclic graph — the Sugiyama framework
 * (K. Sugiyama, S. Tagawa, M. Toda, "Methods for visual understanding of
 * hierarchical system structures", IEEE Trans. SMC 11(2), 1981), in its
 * simplest deterministic form, for the argument map of an essay:
 *
 *   1. layering    longest-path layering (every dependency strictly above what
 *                  rests on it: no edge points upward), then each source that
 *                  supports something is pulled down to just above its highest
 *                  dependent, shortening edges (G. Di Battista et al., *Graph
 *                  Drawing*, 1999, §9.1);
 *   2. dummies     an edge spanning k > 1 layers is split by k − 1 dummy
 *                  vertices, so every edge joins adjacent layers;
 *   3. ordering    barycentric crossing reduction (Sugiyama et al. 1981):
 *                  alternate downward and upward sweeps, each vertex placed at
 *                  the mean position of its neighbours in the reference layer,
 *                  ties broken by the current order (stable sort). The ordering
 *                  with the fewest crossings seen — the initial document order
 *                  included — is kept, so the result never has more crossings
 *                  than the naïve drawing;
 *   4. coordinates each layer is centred: x = position − (size − 1) / 2, y = layer.
 *
 * Pure and deterministic: same input ⇒ same output (no randomness, no Map
 * iteration-order dependence beyond insertion order, which is the input order).
 */
import { err, ok, type Result } from '../algebra/result.ts';

export interface LayoutEdgeInput {
  /** The dependency (drawn above). */
  readonly from: string;
  /** What rests on it (drawn below). */
  readonly to: string;
}
export interface LayoutInput {
  /** Vertices in document order (the order breaks every tie). */
  readonly nodes: readonly { readonly id: string }[];
  readonly edges: readonly LayoutEdgeInput[];
}

export interface Point {
  readonly x: number;
  readonly y: number;
}
export interface PlacedNode extends Point {
  readonly id: string;
  readonly layer: number;
  /** 0-based position inside its layer (dummy vertices included). */
  readonly order: number;
}
export interface RoutedEdge {
  readonly from: string;
  readonly to: string;
  /** Polyline from `from` to `to` through its dummy vertices; y strictly increases. */
  readonly points: readonly Point[];
}
export interface Layout {
  /** Number of layers (0 for an empty graph). */
  readonly layers: number;
  /** Largest layer size, dummy vertices included: the drawing spans x ∈ [−(width−1)/2, (width−1)/2]. */
  readonly width: number;
  /** Real vertices, in input order. */
  readonly nodes: readonly PlacedNode[];
  /** Edges, in input order. */
  readonly edges: readonly RoutedEdge[];
  /** Edge crossings of the chosen ordering (counted on the subdivided graph). */
  readonly crossings: number;
}

export interface LayoutOptions {
  /** Number of barycentric sweeps (each one downward then upward). Default 8. */
  readonly sweeps?: number;
}

interface Vertex {
  readonly key: string;
  /** Document index of the vertex, or of the target of the edge a dummy subdivides (plus a fraction). */
  readonly rank: number;
  readonly layer: number;
}

/** Longest-path layering by Kahn's topological sort; null when the graph has a cycle. */
const layering = (ids: readonly string[], edges: readonly LayoutEdgeInput[]): Map<string, number> | null => {
  const preds = new Map<string, string[]>(ids.map((id) => [id, []]));
  const succs = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of edges) {
    preds.get(e.to)?.push(e.from);
    succs.get(e.from)?.push(e.to);
    indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);
  }
  const layer = new Map<string, number>();
  const ready = ids.filter((id) => indegree.get(id) === 0);
  const topo: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() ?? '';
    topo.push(id);
    layer.set(id, Math.max(-1, ...(preds.get(id) ?? []).map((p) => layer.get(p) ?? 0)) + 1);
    for (const s of succs.get(id) ?? []) {
      const d = (indegree.get(s) ?? 0) - 1;
      indegree.set(s, d);
      if (d === 0) ready.push(s);
    }
  }
  if (topo.length !== ids.length) return null;
  // Pull each source that supports something down to just above its highest dependent.
  for (const id of topo) {
    const below = succs.get(id) ?? [];
    if ((preds.get(id) ?? []).length === 0 && below.length > 0) {
      layer.set(id, Math.min(...below.map((s) => layer.get(s) ?? 0)) - 1);
    }
  }
  return layer;
};

/** Crossings between two adjacent layers (pairwise test; the graphs drawn here are small). */
const crossingsBetween = (
  segments: readonly (readonly [string, string])[],
  pos: ReadonlyMap<string, number>,
): number => {
  let c = 0;
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const [a1, b1] = segments[i] ?? ['', ''];
      const [a2, b2] = segments[j] ?? ['', ''];
      const d = ((pos.get(a1) ?? 0) - (pos.get(a2) ?? 0)) * ((pos.get(b1) ?? 0) - (pos.get(b2) ?? 0));
      if (d < 0) c += 1;
    }
  }
  return c;
};

export const layoutDag = (input: LayoutInput, options: LayoutOptions = {}): Result<Layout, string> => {
  const ids = input.nodes.map((n) => n.id);
  const index = new Map<string, number>();
  for (const [i, id] of ids.entries()) {
    if (index.has(id)) return err(`duplicate vertex "${id}"`);
    index.set(id, i);
  }
  for (const e of input.edges) {
    if (!index.has(e.from) || !index.has(e.to)) return err(`edge ${e.from} → ${e.to} has an unknown endpoint`);
    if (e.from === e.to) return err(`self-loop on "${e.from}"`);
  }
  const edges = input.edges.filter(
    (e, i) => input.edges.findIndex((f) => f.from === e.from && f.to === e.to) === i,
  );
  const layerOf = layering(ids, edges);
  if (layerOf === null) return err('the graph has a cycle; a layered drawing needs a DAG');
  if (ids.length === 0) return ok({ layers: 0, width: 0, nodes: [], edges: [], crossings: 0 });

  // Vertices (real + dummies) and unit-length segments.
  const vertices: Vertex[] = ids.map((id, i) => ({ key: id, rank: i, layer: layerOf.get(id) ?? 0 }));
  const segments: (readonly [string, string])[] = [];
  const chains = new Map<string, readonly string[]>();
  for (const [ei, e] of edges.entries()) {
    const top = layerOf.get(e.from) ?? 0;
    const bottom = layerOf.get(e.to) ?? 0;
    const chain = [e.from];
    for (let l = top + 1; l < bottom; l += 1) {
      const key = `\u0000${ei}:${l}`;
      vertices.push({ key, rank: (index.get(e.to) ?? 0) + 0.5, layer: l });
      chain.push(key);
    }
    chain.push(e.to);
    for (let k = 0; k + 1 < chain.length; k += 1) segments.push([chain[k] ?? '', chain[k + 1] ?? '']);
    chains.set(`${e.from}\u0000${e.to}`, chain);
  }
  const layers = Math.max(...vertices.map((v) => v.layer)) + 1;
  const segmentsBelow: (readonly [string, string])[][] = Array.from({ length: layers }, () => []);
  for (const s of segments) {
    const l = vertices.find((v) => v.key === s[0])?.layer ?? 0;
    segmentsBelow[l]?.push(s);
  }
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const [a, b] of segments) {
    down.set(a, [...(down.get(a) ?? []), b]);
    up.set(b, [...(up.get(b) ?? []), a]);
  }

  // Initial order: document order (dummies next to the vertex their edge reaches).
  let order: string[][] = Array.from({ length: layers }, (_, l) =>
    vertices
      .filter((v) => v.layer === l)
      .sort((a, b) => a.rank - b.rank)
      .map((v) => v.key),
  );
  const positions = (o: readonly (readonly string[])[]): Map<string, number> =>
    new Map(o.flatMap((layer) => layer.map((key, i) => [key, i] as const)));
  const total = (o: readonly (readonly string[])[]): number => {
    const pos = positions(o);
    return segmentsBelow.reduce((acc, segs) => acc + crossingsBetween(segs, pos), 0);
  };
  const reorder = (layer: readonly string[], neighbours: ReadonlyMap<string, readonly string[]>, pos: ReadonlyMap<string, number>) =>
    layer
      .map((key, i) => {
        const ns = neighbours.get(key) ?? [];
        const bary = ns.length > 0 ? ns.reduce((acc, n) => acc + (pos.get(n) ?? 0), 0) / ns.length : i;
        return { key, bary, i };
      })
      .sort((a, b) => a.bary - b.bary || a.i - b.i)
      .map((x) => x.key);

  let best = order;
  let bestCrossings = total(order);
  const sweeps = Math.max(0, Math.floor(options.sweeps ?? 8));
  for (let s = 0; s < sweeps && bestCrossings > 0; s += 1) {
    const next = order.map((l) => [...l]);
    for (let l = 1; l < layers; l += 1) next[l] = reorder(next[l] ?? [], up, positions(next));
    for (let l = layers - 2; l >= 0; l -= 1) next[l] = reorder(next[l] ?? [], down, positions(next));
    order = next;
    const c = total(order);
    if (c < bestCrossings) {
      best = order;
      bestCrossings = c;
    }
  }

  // Coordinates: centred layers.
  const point = new Map<string, Point>();
  for (const [l, layer] of best.entries()) {
    for (const [i, key] of layer.entries()) point.set(key, { x: i - (layer.length - 1) / 2, y: l });
  }
  const pos = positions(best);
  return ok({
    layers,
    width: Math.max(...best.map((l) => l.length)),
    nodes: ids.map((id) => {
      const p = point.get(id) ?? { x: 0, y: 0 };
      return { id, layer: layerOf.get(id) ?? 0, order: pos.get(id) ?? 0, x: p.x, y: p.y };
    }),
    edges: input.edges.map((e) => ({
      from: e.from,
      to: e.to,
      points: (chains.get(`${e.from}\u0000${e.to}`) ?? [e.from, e.to]).map((k) => point.get(k) ?? { x: 0, y: 0 }),
    })),
    crossings: bestCrossings,
  });
};
