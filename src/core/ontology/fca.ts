/**
 * Formal Concept Analysis (Ganter & Wille, "Formal Concept Analysis:
 * Mathematical Foundations", Springer 1999) of how the CONTENT covers the
 * ontology.
 *
 *   formal context  K = (G, M, I): G = works (essays, labs), M = concepts,
 *                   g I m ⇔ work g discusses concept m (its `concepts` frontmatter);
 *   derivation      A′ = { m | ∀g ∈ A: g I m },  B′ = { g | ∀m ∈ B: g I m };
 *   formal concept  (A, B) with A′ = B and B′ = A (extent, intent);
 *   order           (A₁, B₁) ≤ (A₂, B₂) ⇔ A₁ ⊆ A₂ (⇔ B₂ ⊆ B₁): a complete lattice.
 *
 * All intents are enumerated by NextClosure (Ganter, "Two basic algorithms in
 * concept analysis", 1984; reprinted LNCS 5986, 2010) in lectic order of the
 * attribute list, closing each candidate with X ↦ X″. The lattice's Hasse
 * diagram is the cover relation of the extents; reduced labelling attaches
 * each object to its object concept γ(g) = (g″, g′) and each attribute to its
 * attribute concept μ(m) = (m′, m″).
 */

export interface FormalContext<G extends string, M extends string> {
  readonly objects: readonly G[];
  readonly attributes: readonly M[];
  /** incidence[g] = set of attributes of object g. */
  readonly incidence: ReadonlyMap<G, ReadonlySet<M>>;
}

export interface FormalConcept<G extends string, M extends string> {
  readonly extent: readonly G[];
  readonly intent: readonly M[];
}

export interface ConceptLattice<G extends string, M extends string> {
  /** Formal concepts in the lectic order of their intents (the top concept, intent ∅″, first). */
  readonly concepts: readonly FormalConcept<G, M>[];
  /** Cover relation as pairs [lower, upper] of indices into `concepts` (Hasse diagram). */
  readonly covers: readonly (readonly [number, number])[];
  /** Index of γ(g) for every object. */
  readonly objectConcept: ReadonlyMap<G, number>;
  /** Index of μ(m) for every attribute. */
  readonly attributeConcept: ReadonlyMap<M, number>;
}

/** Builds a context from objects and their attribute lists; attributes are those occurring at least once, sorted. */
export const contextOf = <G extends string, M extends string>(
  rows: readonly (readonly [G, readonly M[]])[],
): FormalContext<G, M> => {
  const objects = [...new Set(rows.map(([g]) => g))].sort();
  const incidence = new Map<G, Set<M>>(objects.map((g) => [g, new Set()]));
  for (const [g, ms] of rows) for (const m of ms) incidence.get(g)?.add(m);
  const attributes = [...new Set(rows.flatMap(([, ms]) => ms))].sort();
  return { objects, attributes, incidence };
};

/** B′: the objects having every attribute of B, in context order. */
export const extentOf = <G extends string, M extends string>(
  k: FormalContext<G, M>,
  intent: Iterable<M>,
): readonly G[] => {
  const b = [...intent];
  return k.objects.filter((g) => b.every((m) => k.incidence.get(g)?.has(m) === true));
};

/** A′: the attributes shared by every object of A, in context order (all attributes when A = ∅). */
export const intentOf = <G extends string, M extends string>(
  k: FormalContext<G, M>,
  extent: Iterable<G>,
): readonly M[] => {
  const a = [...extent];
  return k.attributes.filter((m) => a.every((g) => k.incidence.get(g)?.has(m) === true));
};

/** X″, the closure of an attribute set. */
export const closeIntent = <G extends string, M extends string>(
  k: FormalContext<G, M>,
  intent: Iterable<M>,
): readonly M[] => intentOf(k, extentOf(k, intent));

/** Every formal concept, by NextClosure in the lectic order of `k.attributes`. */
export const formalConcepts = <G extends string, M extends string>(
  k: FormalContext<G, M>,
): readonly FormalConcept<G, M>[] => {
  const m = k.attributes;
  const position = new Map(m.map((a, i) => [a, i]));
  const asSet = (xs: readonly M[]): ReadonlySet<M> => new Set(xs);
  const out: FormalConcept<G, M>[] = [];
  let current = asSet(closeIntent(k, []));
  out.push({ extent: extentOf(k, current), intent: m.filter((a) => current.has(a)) });
  // NextClosure: find the largest i such that a_i ∉ A and (A ∩ {a_0..a_{i−1}}) ∪ {a_i} closes to a set
  // whose new elements are all ≥ i; that closure is the lectically next closed set.
  for (let guard = 0; guard < 1 << 20; guard += 1) {
    let next: ReadonlySet<M> | null = null;
    for (let i = m.length - 1; i >= 0; i -= 1) {
      const ai = m[i] as M;
      if (current.has(ai)) continue;
      const prefix = m.slice(0, i).filter((a) => current.has(a));
      const candidate = asSet(closeIntent(k, [...prefix, ai]));
      const ok = [...candidate].every((a) => (position.get(a) ?? 0) >= i || current.has(a));
      if (ok) {
        next = candidate;
        break;
      }
    }
    if (next === null) break;
    current = next;
    out.push({ extent: extentOf(k, current), intent: m.filter((a) => current.has(a)) });
  }
  return out;
};

const isSubset = <T>(a: readonly T[], b: ReadonlySet<T>): boolean => a.every((x) => b.has(x));

/** The concept lattice: concepts, Hasse diagram (covers) and reduced labelling. */
export const conceptLattice = <G extends string, M extends string>(k: FormalContext<G, M>): ConceptLattice<G, M> => {
  const concepts = formalConcepts(k);
  const extents = concepts.map((c) => new Set(c.extent));
  const below = (i: number, j: number): boolean =>
    i !== j && extents[i]!.size < extents[j]!.size && isSubset(concepts[i]!.extent, extents[j]!);
  const covers: (readonly [number, number])[] = [];
  for (let i = 0; i < concepts.length; i += 1) {
    for (let j = 0; j < concepts.length; j += 1) {
      if (!below(i, j)) continue;
      let direct = true;
      for (let h = 0; h < concepts.length && direct; h += 1) if (below(i, h) && below(h, j)) direct = false;
      if (direct) covers.push([i, j]);
    }
  }
  // γ(g): the concept whose extent is g″ — the smallest extent containing g.
  const objectConcept = new Map<G, number>();
  for (const g of k.objects) {
    let best = -1;
    concepts.forEach((c, i) => {
      if (extents[i]!.has(g) && (best < 0 || c.extent.length < concepts[best]!.extent.length)) best = i;
    });
    if (best >= 0) objectConcept.set(g, best);
  }
  // μ(m): the concept whose extent is m′ — the largest extent whose intent contains m.
  const attributeConcept = new Map<M, number>();
  for (const a of k.attributes) {
    let best = -1;
    concepts.forEach((c, i) => {
      if (c.intent.includes(a) && (best < 0 || c.extent.length > concepts[best]!.extent.length)) best = i;
    });
    if (best >= 0) attributeConcept.set(a, best);
  }
  return { concepts, covers, objectConcept, attributeConcept };
};
