/**
 * Ontology facade — from raw entries to everything the shells need, in one
 * pure call: parse → validate → derive (hierarchy, related closure) → measure
 * (intrinsic IC, entropy of the facets).
 *
 *   buildOntology : readonly RawConcept[] → Result<Ontology, readonly OntologyError[]>
 *
 * The shells (build-time loader, views, JSON-LD endpoint) only read files or
 * collections and report errors; no rule lives outside this module tree.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { ConceptId } from '../domain/identifiers.ts';
import { DOMAINS, type Domain } from '../domain/facets.ts';
import { STRATA, type Stratum } from '../domain/strata.ts';
import { buildGraph, type ConceptGraph } from './graph.ts';
import { maxDepth } from './hierarchy.ts';
import { buildLabelIndex, type LabelIndex } from './labels.ts';
import { intrinsicInformationContent, shannonEntropy, tally, type InformationContent } from './measures.ts';
import type { ConceptEntry, OntologyError, RawConcept } from './model.ts';
import { parseConceptEntry } from './parse.ts';

export type { RawConcept } from './model.ts';

export interface EntropyStat {
  /** Shannon entropy in bits. */
  readonly bits: number;
  /** log₂ of the number of categories (the maximum attainable). */
  readonly maxBits: number;
  readonly counts: ReadonlyMap<string, number>;
}

export interface OntologyStats {
  readonly concepts: number;
  readonly topConcepts: number;
  readonly broaderLinks: number;
  readonly relatedLinks: number;
  readonly maxDepth: number;
  /** Distribution of concepts over the four strata. */
  readonly strata: EntropyStat;
  /** Distribution of domain assignments (a concept with two domains counts once in each). */
  readonly domains: EntropyStat;
}

export interface Ontology {
  readonly graph: ConceptGraph;
  readonly ic: InformationContent<ConceptId>;
  readonly labels: LabelIndex;
  readonly stats: OntologyStats;
}

const entropyStat = <K extends string>(categories: readonly K[], sample: readonly K[]): EntropyStat => {
  const counts = tally(categories, sample);
  return { bits: shannonEntropy([...counts.values()]), maxBits: Math.log2(categories.length), counts };
};

export const ontologyStats = (graph: ConceptGraph): OntologyStats => {
  const entries = graph.ids.map((id) => graph.concepts.get(id)).filter((e): e is ConceptEntry => e !== undefined);
  const strata: readonly Stratum[] = entries.map((e) => e.stratum);
  const domains: readonly Domain[] = entries.flatMap((e) => e.domains);
  return {
    concepts: graph.ids.length,
    topConcepts: graph.hierarchy.roots.length,
    broaderLinks: entries.reduce((s, e) => s + (graph.hierarchy.broader.get(e.id)?.length ?? 0), 0),
    relatedLinks: entries.reduce((s, e) => s + (graph.related.get(e.id)?.length ?? 0), 0) / 2,
    maxDepth: maxDepth(graph.hierarchy),
    strata: entropyStat(STRATA, strata),
    domains: entropyStat(DOMAINS, domains),
  };
};

/** Derived data of an already-validated graph. */
export const ontologyOf = (graph: ConceptGraph): Ontology => ({
  graph,
  ic: intrinsicInformationContent(graph.hierarchy),
  labels: buildLabelIndex(graph),
  stats: ontologyStats(graph),
});

/** Parses and validates every entry, accumulating all errors of all entries. */
export const buildOntology = (raws: readonly RawConcept[]): Result<Ontology, readonly OntologyError[]> => {
  const entries: ConceptEntry[] = [];
  const errors: OntologyError[] = [];
  for (const raw of [...raws].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const r = parseConceptEntry(raw.id, raw.data);
    if (r.ok) entries.push(r.value);
    else errors.push(...r.error);
  }
  const graph = buildGraph(entries);
  if (!graph.ok) errors.push(...graph.error);
  if (errors.length > 0 || !graph.ok) return err(errors);
  return ok(ontologyOf(graph.value));
};
