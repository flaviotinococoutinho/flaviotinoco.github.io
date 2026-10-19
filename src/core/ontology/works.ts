/**
 * Application layer (Guarino, 1998): the site's works — essays and labs —
 * are INSTANCES that discuss concepts; they are not concepts. They are kept in
 * a separate type (never a ConceptEntry) and exported as schema:CreativeWork
 * nodes with schema:about → concept IRIs, never as skos:Concept.
 *
 *   backlinks         concept → works that list it in their `concepts` frontmatter;
 *   sharedConcepts    work → other works sharing at least `min` concepts;
 *   relatedWorks      work → the k most similar works by the best-match average
 *                     (BMA) of Lin similarities between their concept sets.
 *
 * Why BMA of Lin rather than Jaccard: Jaccard only counts identical concepts,
 * so an essay on Huffman coding and a lab on prefix codes would score 0;
 * BMA (Pesquita et al., "Semantic similarity in biomedical ontologies", PLoS
 * Comput. Biol. 5(7), 2009; after Lord et al. and Pedersen's WordNet
 * measures) credits each concept of one work with its closest concept in the
 * other, so the score reflects the structure of the ontology:
 *
 *     BMA(A, B) = ½ · ( mean_{a∈A} max_{b∈B} sim(a, b) + mean_{b∈B} max_{a∈A} sim(a, b) ).
 */
import type { ConceptId } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import type { Stratum } from '../domain/strata.ts';
import type { Hierarchy } from './hierarchy.ts';
import { lin, type InformationContent } from './measures.ts';
import type { TaxonId } from './taxonomy.ts';

export type WorkKind = 'essay' | 'lab';

export interface Work {
  /** Stable, language-neutral key: `${kind}:${translationKey}`. */
  readonly key: string;
  readonly kind: WorkKind;
  readonly locale: Locale;
  readonly title: string;
  /** Short title for diagrams (the part before a colon). */
  readonly shortTitle: string;
  readonly stratum: Stratum;
  /** Base-aware URL of the work in its locale. */
  readonly href: string;
  readonly concepts: readonly ConceptId[];
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The part of a title before the first colon or em dash, trimmed (or the whole title). */
export const shortTitleOf = (title: string): string => {
  const cut = title.split(/\s*[:—]\s+/u)[0]?.trim() ?? title;
  return cut.length > 0 ? cut : title;
};

/** concept → works that discuss it (in the order of `works`). Concepts no work discusses are absent. */
export const backlinks = (works: readonly Work[]): ReadonlyMap<ConceptId, readonly Work[]> => {
  const out = new Map<ConceptId, Work[]>();
  for (const w of works) for (const c of new Set(w.concepts)) out.set(c, [...(out.get(c) ?? []), w]);
  return out;
};

export interface SharedWork {
  readonly work: Work;
  readonly shared: readonly ConceptId[];
}

/** Other works sharing at least `min` concepts with `target`, by number shared (desc), then key. */
export const sharedConcepts = (target: Work, works: readonly Work[], min = 2): readonly SharedWork[] => {
  const mine = new Set(target.concepts);
  return works
    .filter((w) => w.key !== target.key)
    .map((w) => ({ work: w, shared: [...new Set(w.concepts)].filter((c) => mine.has(c)).sort(byCodeUnit) }))
    .filter((s) => s.shared.length >= min)
    .sort((a, b) => b.shared.length - a.shared.length || byCodeUnit(a.work.key, b.work.key));
};

/** Best-match average of Lin similarity between two concept sets (0 when either is empty). */
export const bestMatchAverage = (
  taxonomy: Hierarchy<TaxonId>,
  ic: InformationContent<TaxonId>,
  a: readonly ConceptId[],
  b: readonly ConceptId[],
): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const side = (xs: readonly ConceptId[], ys: readonly ConceptId[]): number =>
    xs.reduce((s, x) => s + Math.max(...ys.map((y) => lin(taxonomy, ic, x, y))), 0) / xs.length;
  return (side(a, b) + side(b, a)) / 2;
};

export interface RelatedWork {
  readonly work: Work;
  readonly score: number;
}

/** The k works most similar to `target` (BMA of Lin), excluding itself and zero scores; ties by key. */
export const relatedWorks = (
  taxonomy: Hierarchy<TaxonId>,
  ic: InformationContent<TaxonId>,
  target: Work,
  works: readonly Work[],
  k = 3,
): readonly RelatedWork[] =>
  works
    .filter((w) => w.key !== target.key)
    .map((w) => ({ work: w, score: bestMatchAverage(taxonomy, ic, target.concepts, w.concepts) }))
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score || byCodeUnit(x.work.key, y.work.key))
    .slice(0, Math.max(0, k));

/**
 * Why two works are related, in one line: the concepts they share (most
 * specific first: higher IC, then id) or, when they share none, the closest
 * pair of concepts by Lin similarity — the pair that contributed most to the
 * best-match average.
 */
export type RelationReason =
  | { readonly kind: 'shared'; readonly concepts: readonly ConceptId[] }
  | { readonly kind: 'closest'; readonly a: ConceptId; readonly b: ConceptId; readonly lin: number }
  | { readonly kind: 'none' };

export const relationReason = (
  taxonomy: Hierarchy<TaxonId>,
  ic: InformationContent<TaxonId>,
  from: Work,
  to: Work,
): RelationReason => {
  const theirs = new Set(to.concepts);
  const shared = [...new Set(from.concepts)]
    .filter((c) => theirs.has(c))
    .sort((x, y) => (ic.get(y) ?? 0) - (ic.get(x) ?? 0) || byCodeUnit(x, y));
  if (shared.length > 0) return { kind: 'shared', concepts: shared };
  let best: { a: ConceptId; b: ConceptId; lin: number } | null = null;
  for (const a of [...new Set(from.concepts)].sort(byCodeUnit)) {
    for (const b of [...theirs].sort(byCodeUnit)) {
      const s = lin(taxonomy, ic, a, b);
      if (s > 0 && (best === null || s > best.lin)) best = { a, b, lin: s };
    }
  }
  return best === null ? { kind: 'none' } : { kind: 'closest', ...best };
};
