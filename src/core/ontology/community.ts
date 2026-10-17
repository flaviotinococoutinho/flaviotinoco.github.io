/**
 * Thematic communities of the concept graph and their agreement with the
 * `domains` facet — information theory applied to the ontology itself.
 *
 * Partition: the Louvain method (Blondel, Guillaume, Lambiotte & Lefebvre,
 * "Fast unfolding of communities in large networks", J. Stat. Mech. 2008,
 * P10008), which greedily maximises Newman–Girvan modularity
 *
 *     Q = (1 / 2m) Σ_ij [A_ij − k_i k_j / 2m] δ(c_i, c_j)
 *
 * by repeating (1) local moves of single nodes to the neighbouring community
 * with the largest gain ΔQ = k_i,in / m − Σ_tot · k_i / 2m² and (2) aggregation
 * of communities into super-nodes, until no move improves Q. Determinism: nodes
 * are visited in a fixed (id) order and ties keep the current community, else
 * the smallest community index — no randomness is involved.
 *
 * Louvain may return internally disconnected communities (Traag, Waltman & van
 * Eck, "From Louvain to Leiden", Sci. Rep. 9, 2019). Instead of the full Leiden
 * refinement — unnecessary for a graph of tens of nodes — each community is
 * split into its connected components afterwards, which never decreases Q
 * (a disconnected part shares no edge with the rest, so separating it only
 * removes a negative expected-edges term). This yields Leiden's main guarantee
 * (connected communities) at no cost.
 *
 * Agreement: Normalized Mutual Information (Strehl & Ghosh, "Cluster
 * ensembles", JMLR 3, 2002), NMI(X, Y) = I(X; Y) / √(H(X) · H(Y)) ∈ [0, 1],
 * between the communities and the primary domain of each concept.
 */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Symmetric sparse weight matrix; A[i][i] holds twice the internal weight of a super-node. */
type Matrix = Map<number, Map<number, number>>;

const addWeight = (A: Matrix, i: number, j: number, w: number): void => {
  const row = A.get(i) ?? new Map<number, number>();
  row.set(j, (row.get(j) ?? 0) + w);
  A.set(i, row);
};

/** One level of local moves; returns the community of each node and whether anything moved. */
const localMoves = (n: number, A: Matrix, m2: number): { readonly community: readonly number[]; readonly moved: boolean } => {
  const community = Array.from({ length: n }, (_, i) => i);
  const k = Array.from({ length: n }, (_, i) => [...(A.get(i)?.values() ?? [])].reduce((s, w) => s + w, 0));
  const tot = [...k];
  let moved = false;
  for (let pass = 0; pass < 100; pass += 1) {
    let changed = false;
    for (let i = 0; i < n; i += 1) {
      const own = community[i] as number;
      const ki = k[i] as number;
      // Weights from i to each neighbouring community (self-loop excluded).
      const links = new Map<number, number>();
      for (const [j, w] of A.get(i) ?? []) {
        if (j === i) continue;
        const c = community[j] as number;
        links.set(c, (links.get(c) ?? 0) + w);
      }
      tot[own] = (tot[own] as number) - ki;
      const gain = (c: number): number => (links.get(c) ?? 0) - ((tot[c] as number) * ki) / m2;
      let best = own;
      let bestGain = gain(own);
      for (const c of [...links.keys()].sort((a, b) => a - b)) {
        const g = gain(c);
        if (g > bestGain + 1e-12) {
          best = c;
          bestGain = g;
        }
      }
      tot[best] = (tot[best] as number) + ki;
      if (best !== own) {
        community[i] = best;
        changed = true;
        moved = true;
      }
    }
    if (!changed) break;
  }
  return { community, moved };
};

/** Renumbers labels 0..k−1 in order of first appearance. */
const compact = (labels: readonly number[]): readonly number[] => {
  const map = new Map<number, number>();
  return labels.map((l) => {
    const known = map.get(l);
    if (known !== undefined) return known;
    map.set(l, map.size);
    return map.size - 1;
  });
};

/** Newman–Girvan modularity of a partition (community label per node) of an undirected weighted graph. */
export const modularity = <Id extends string>(
  ids: readonly Id[],
  edges: readonly (readonly [Id, Id, number])[],
  community: ReadonlyMap<Id, number>,
): number => {
  const degree = new Map<Id, number>(ids.map((id) => [id, 0]));
  let m = 0;
  const internal = new Map<number, number>();
  for (const [a, b, w] of edges) {
    m += w;
    degree.set(a, (degree.get(a) ?? 0) + w);
    degree.set(b, (degree.get(b) ?? 0) + w);
    const ca = community.get(a);
    if (ca !== undefined && ca === community.get(b)) internal.set(ca, (internal.get(ca) ?? 0) + w);
  }
  if (m === 0) return 0;
  const total = new Map<number, number>();
  for (const id of ids) {
    const c = community.get(id);
    if (c !== undefined) total.set(c, (total.get(c) ?? 0) + (degree.get(id) ?? 0));
  }
  let q = 0;
  for (const [c, d] of total) q += (internal.get(c) ?? 0) / m - (d / (2 * m)) ** 2;
  return q;
};

export interface Communities<Id extends string> {
  /** Community index of each node: 0 is the largest community (ties by smallest member id). */
  readonly of: ReadonlyMap<Id, number>;
  /** Members of each community, sorted by id. */
  readonly members: readonly (readonly Id[])[];
  readonly modularity: number;
}

/** Deterministic Louvain partition with connected communities. Edges are undirected [a, b, weight]. */
export const louvain = <Id extends string>(
  ids: readonly Id[],
  edges: readonly (readonly [Id, Id, number])[],
): Communities<Id> => {
  const nodes = [...new Set(ids)].sort(byCodeUnit);
  const index = new Map(nodes.map((id, i) => [id, i]));
  let A: Matrix = new Map();
  let m2 = 0;
  for (const [a, b, w] of edges) {
    const i = index.get(a);
    const j = index.get(b);
    if (i === undefined || j === undefined || w <= 0) continue;
    if (i === j) {
      addWeight(A, i, i, 2 * w);
    } else {
      addWeight(A, i, j, w);
      addWeight(A, j, i, w);
    }
    m2 += 2 * w;
  }
  // membership[original node] = current super-node
  let membership: readonly number[] = nodes.map((_, i) => i);
  let size = nodes.length;
  if (m2 > 0) {
    for (let level = 0; level < 32; level += 1) {
      const { community, moved } = localMoves(size, A, m2);
      if (!moved) break;
      const labels = compact(community);
      membership = membership.map((s) => labels[s] as number);
      const B: Matrix = new Map();
      for (const [i, row] of A) for (const [j, w] of row) addWeight(B, labels[i] as number, labels[j] as number, w);
      A = B;
      size = Math.max(...labels) + 1;
    }
  }

  // Split communities into connected components of the original graph.
  const adjacent = new Map<Id, Id[]>(nodes.map((id) => [id, []]));
  for (const [a, b] of edges) {
    if (a === b || !index.has(a) || !index.has(b)) continue;
    adjacent.get(a)?.push(b);
    adjacent.get(b)?.push(a);
  }
  const groups = new Map<number, Id[]>();
  nodes.forEach((id, i) => groups.set(membership[i] as number, [...(groups.get(membership[i] as number) ?? []), id]));
  const parts: Id[][] = [];
  for (const group of groups.values()) {
    const inside = new Set(group);
    const seen = new Set<Id>();
    for (const start of group) {
      if (seen.has(start)) continue;
      const part: Id[] = [];
      const stack = [start];
      seen.add(start);
      while (stack.length > 0) {
        const v = stack.pop() as Id;
        part.push(v);
        for (const w of adjacent.get(v) ?? []) {
          if (inside.has(w) && !seen.has(w)) {
            seen.add(w);
            stack.push(w);
          }
        }
      }
      parts.push(part.sort(byCodeUnit));
    }
  }
  const members = parts.sort((a, b) => b.length - a.length || byCodeUnit(a[0] ?? '', b[0] ?? ''));
  const of = new Map<Id, number>();
  members.forEach((part, c) => {
    for (const id of part) of.set(id, c);
  });
  return { of, members, modularity: modularity(nodes, edges, of) };
};

/** Shannon entropy (bits) of a labelling. */
const labelEntropy = (labels: readonly string[]): number => {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  const n = labels.length;
  let h = 0;
  for (const c of counts.values()) h -= (c / n) * Math.log2(c / n);
  return Math.max(0, h);
};

/**
 * Mutual information (bits) between two labellings of the same items:
 * I(X; Y) = Σ p(x, y) log₂ (p(x, y) / (p(x) p(y))).
 */
export const mutualInformation = (x: readonly string[], y: readonly string[]): number => {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  const joint = new Map<string, number>();
  const px = new Map<string, number>();
  const py = new Map<string, number>();
  for (let i = 0; i < n; i += 1) {
    const a = x[i] as string;
    const b = y[i] as string;
    joint.set(`${a}\u0000${b}`, (joint.get(`${a}\u0000${b}`) ?? 0) + 1);
    px.set(a, (px.get(a) ?? 0) + 1);
    py.set(b, (py.get(b) ?? 0) + 1);
  }
  let mi = 0;
  for (const [k, c] of joint) {
    const [a, b] = k.split('\u0000') as [string, string];
    mi += (c / n) * Math.log2((c * n) / ((px.get(a) ?? 1) * (py.get(b) ?? 1)));
  }
  return Math.max(0, mi);
};

/**
 * Normalized Mutual Information (Strehl & Ghosh, 2002). When one labelling is
 * constant (zero entropy) the ratio is undefined; it is taken as 1 when both
 * are constant (identical trivial partitions) and 0 otherwise.
 */
export const normalizedMutualInformation = (x: readonly string[], y: readonly string[]): number => {
  const hx = labelEntropy(x);
  const hy = labelEntropy(y);
  if (hx === 0 || hy === 0) return hx === hy ? 1 : 0;
  return Math.min(1, Math.max(0, mutualInformation(x, y) / Math.sqrt(hx * hy)));
};
