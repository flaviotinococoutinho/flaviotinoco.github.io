/**
 * Information-theoretic measures over a concept hierarchy.
 *
 * Intrinsic information content (Seco, Veale & Hayes, 2004):
 *
 *     IC(c) = 1 − ln(hypo(c) + 1) / ln(N)
 *
 * where hypo(c) is the number of (strict) descendants of c and N the number of
 * concepts. It needs no corpus: a concept is as informative as it is specific.
 * Leaves get 1; a root subsuming everything gets 0. Because a strict ancestor
 * has at least one more hyponym than any of its descendants, IC strictly
 * DECREASES from leaves to roots (a law checked by property tests).
 *
 * Similarity, given the most informative common subsumer (MICA):
 *
 *     Resnik (1995):  sim(a, b) = IC(mica(a, b))                ∈ [0, 1] here
 *     Lin (1998):     sim(a, b) = 2·IC(mica) / (IC(a) + IC(b))  ∈ [0, 1], sim(a, a) = 1
 *
 * In a polyhierarchy the lowest common subsumers form a SET (minimal elements
 * of the common subsumers under the hierarchy order); the MICA is the member of
 * highest IC (ties broken by id, so the result is deterministic). When two
 * concepts share no subsumer (different trees of the forest), both similarities
 * are 0, as if an uninformative virtual top (IC 0) joined the trees.
 *
 * Shannon entropy (Shannon, 1948) of a categorical distribution, in bits:
 *     H = −Σ p·log₂ p   (0·log 0 := 0)
 */
import { type Hierarchy, subsumers } from './hierarchy.ts';

export type InformationContent<Id extends string> = ReadonlyMap<Id, number>;

/** Intrinsic IC of every concept (Seco, Veale & Hayes, 2004). N ≤ 1 ⇒ IC = 1 (a single concept is a leaf). */
export const intrinsicInformationContent = <Id extends string>(h: Hierarchy<Id>): InformationContent<Id> => {
  const n = h.ids.length;
  const ic = (hypo: number): number => (n <= 1 ? 1 : Math.min(1, Math.max(0, 1 - Math.log(hypo + 1) / Math.log(n))));
  return new Map(h.ids.map((id) => [id, ic(h.descendants.get(id)?.size ?? 0)]));
};

/** Common subsumers: ancestors-or-self of both concepts. */
export const commonSubsumers = <Id extends string>(h: Hierarchy<Id>, a: Id, b: Id): ReadonlySet<Id> => {
  const sb = subsumers(h, b);
  return new Set([...subsumers(h, a)].filter((c) => sb.has(c)));
};

/**
 * Lowest common subsumers (polyhierarchy-aware): the common subsumers that have
 * no strict descendant among the common subsumers. Sorted by id.
 */
export const lowestCommonSubsumers = <Id extends string>(h: Hierarchy<Id>, a: Id, b: Id): readonly Id[] => {
  const common = commonSubsumers(h, a, b);
  return [...common]
    .filter((c) => ![...(h.descendants.get(c) ?? [])].some((d) => common.has(d)))
    .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
};

/** Most informative common subsumer, or null when the concepts share none. */
export const mostInformativeSubsumer = <Id extends string>(
  h: Hierarchy<Id>,
  ic: InformationContent<Id>,
  a: Id,
  b: Id,
): Id | null => {
  let best: Id | null = null;
  let bestIc = -Infinity;
  for (const c of lowestCommonSubsumers(h, a, b)) {
    const v = ic.get(c) ?? 0;
    if (v > bestIc) {
      best = c;
      bestIc = v;
    }
  }
  return best;
};

/** Resnik (1995) similarity with intrinsic IC. */
export const resnik = <Id extends string>(h: Hierarchy<Id>, ic: InformationContent<Id>, a: Id, b: Id): number => {
  const m = mostInformativeSubsumer(h, ic, a, b);
  return m === null ? 0 : (ic.get(m) ?? 0);
};

/** Lin (1998) similarity. Symmetric, in [0, 1], and 1 exactly on identical concepts. */
export const lin = <Id extends string>(h: Hierarchy<Id>, ic: InformationContent<Id>, a: Id, b: Id): number => {
  if (a === b) return 1;
  const denominator = (ic.get(a) ?? 0) + (ic.get(b) ?? 0);
  if (denominator <= 0) return 0;
  return Math.min(1, Math.max(0, (2 * resnik(h, ic, a, b)) / denominator));
};

export interface Comparison<Id extends string> {
  readonly a: Id;
  readonly b: Id;
  readonly lcs: readonly Id[];
  readonly mica: Id | null;
  readonly icA: number;
  readonly icB: number;
  readonly icMica: number;
  readonly lin: number;
  readonly resnik: number;
}

/** Everything the "compare two concepts" tool shows, in one pure call. */
export const compare = <Id extends string>(h: Hierarchy<Id>, ic: InformationContent<Id>, a: Id, b: Id): Comparison<Id> => {
  const mica = mostInformativeSubsumer(h, ic, a, b);
  return {
    a,
    b,
    lcs: lowestCommonSubsumers(h, a, b),
    mica,
    icA: ic.get(a) ?? 0,
    icB: ic.get(b) ?? 0,
    icMica: mica === null ? 0 : (ic.get(mica) ?? 0),
    lin: lin(h, ic, a, b),
    resnik: resnik(h, ic, a, b),
  };
};

export interface Neighbour<Id extends string> {
  readonly id: Id;
  readonly lin: number;
  readonly mica: Id | null;
}

/** The k concepts most similar to `a` by Lin (excluding a), ties broken by id. */
export const closestByLin = <Id extends string>(
  h: Hierarchy<Id>,
  ic: InformationContent<Id>,
  a: Id,
  k: number,
): readonly Neighbour<Id>[] =>
  h.ids
    .filter((b) => b !== a)
    .map((b) => ({ id: b, lin: lin(h, ic, a, b), mica: mostInformativeSubsumer(h, ic, a, b) }))
    .filter((n) => n.lin > 0)
    .sort((x, y) => y.lin - x.lin || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .slice(0, Math.max(0, k));

/** Shannon entropy in bits of the distribution proportional to `counts` (non-positive counts ignored). */
export const shannonEntropy = (counts: readonly number[]): number => {
  const positive = counts.filter((c) => c > 0 && Number.isFinite(c));
  const total = positive.reduce((s, c) => s + c, 0);
  if (total <= 0) return 0;
  const h = positive.reduce((s, c) => {
    const p = c / total;
    return s - p * Math.log2(p);
  }, 0);
  return Math.max(0, h);
};

/** Frequency table of a categorical sample, keyed in the order of `categories`. */
export const tally = <K extends string>(categories: readonly K[], sample: readonly K[]): ReadonlyMap<K, number> => {
  const counts = new Map<K, number>(categories.map((c) => [c, 0]));
  for (const s of sample) counts.set(s, (counts.get(s) ?? 0) + 1);
  return counts;
};
