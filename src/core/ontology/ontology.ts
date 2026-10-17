/**
 * Ontology facade — from raw entries to everything the shells need, in one
 * pure call: parse → validate (topology) → derive (hierarchy, taxonomy,
 * inverses) → measure (intrinsic IC, centrality, communities, entropies).
 *
 *   buildOntology : readonly RawConcept[] → Result<Ontology, readonly OntologyError[]>
 *
 * The shells (build-time loader, views, endpoints) only read files or
 * collections and report errors; no rule lives outside this module tree.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { ConceptId } from '../domain/identifiers.ts';
import { DOMAINS, type Domain } from '../domain/facets.ts';
import { STRATA, type Stratum } from '../domain/strata.ts';
import { bridgeConcepts, centralityOf, type Centrality } from './centrality.ts';
import { louvain, normalizedMutualInformation, type Communities } from './community.ts';
import { buildGraph, degreeOf, type ConceptGraph } from './graph.ts';
import { maxDepth, type Hierarchy } from './hierarchy.ts';
import { buildLabelIndex, type LabelIndex } from './labels.ts';
import { degreeEntropy, intrinsicInformationContent, shannonEntropy, tally, type InformationContent } from './measures.ts';
import type { ConceptEntry, OntologyError, RawConcept } from './model.ts';
import { parseConceptEntry } from './parse.ts';
import { taxonomyOf, type TaxonId } from './taxonomy.ts';
import { CATEGORIES, RELATION_TYPES, type Category, type RelationType } from './vocabulary.ts';

export type { RawConcept } from './model.ts';

/** How many bridge concepts are labelled as such. */
export const BRIDGE_COUNT = 5;

export interface EntropyStat {
  /** Shannon entropy in bits. */
  readonly bits: number;
  /** log₂ of the number of categories (the maximum attainable). */
  readonly maxBits: number;
  readonly counts: ReadonlyMap<string, number>;
}

export interface OntologyStats {
  readonly concepts: number;
  /** skos:hasTopConcept — concepts without broader. */
  readonly topConcepts: number;
  readonly links: number;
  readonly relations: Readonly<Record<RelationType, number>>;
  /** Longest broader chain (SKOS). */
  readonly maxDepth: number;
  /** Longest chain of the extended taxonomy (top → category → … → leaf). */
  readonly taxonomyDepth: number;
  /** Distribution of concepts over the four strata. */
  readonly strata: EntropyStat;
  /** Distribution of concepts over the categories. */
  readonly categories: EntropyStat;
  /** Distribution of domain assignments (a concept with two domains counts once in each). */
  readonly domains: EntropyStat;
  readonly degree: { readonly mean: number; readonly max: number; readonly entropy: number };
  readonly communities: { readonly count: number; readonly modularity: number; readonly nmiDomains: number };
}

export interface Ontology {
  readonly graph: ConceptGraph;
  /** Extended taxonomy (top → categories → domain is-a forest), the basis of the IC measures. */
  readonly taxonomy: Hierarchy<TaxonId>;
  readonly ic: InformationContent<TaxonId>;
  readonly labels: LabelIndex;
  readonly centrality: Centrality;
  /** The BRIDGE_COUNT concepts of highest cross-strata betweenness. */
  readonly bridges: readonly ConceptId[];
  readonly communities: Communities<ConceptId>;
  readonly stats: OntologyStats;
}

const entropyStat = <K extends string>(categories: readonly K[], sample: readonly K[]): EntropyStat => {
  const counts = tally(categories, sample);
  return { bits: shannonEntropy([...counts.values()]), maxBits: Math.log2(categories.length), counts };
};

/** The primary domain (first listed) of a concept, the label used to compare with communities. */
export const primaryDomain = (e: ConceptEntry): Domain => e.domains[0] ?? 'ontology';

export const ontologyStats = (
  graph: ConceptGraph,
  taxonomy: Hierarchy<TaxonId>,
  communities: Communities<ConceptId>,
): OntologyStats => {
  const entries = graph.ids.map((id) => graph.concepts.get(id)).filter((e): e is ConceptEntry => e !== undefined);
  const strata: readonly Stratum[] = entries.map((e) => e.stratum);
  const categories: readonly Category[] = entries.map((e) => e.category);
  const domains: readonly Domain[] = entries.flatMap((e) => e.domains);
  const relations = Object.fromEntries(
    RELATION_TYPES.map((t) => [t, graph.links.filter((l) => l.type === t).length]),
  ) as Record<RelationType, number>;
  const degrees = graph.ids.map((id) => degreeOf(graph, id));
  const n = Math.max(1, graph.ids.length);
  return {
    concepts: graph.ids.length,
    topConcepts: graph.hierarchy.roots.length,
    links: graph.links.length,
    relations,
    maxDepth: maxDepth(graph.hierarchy),
    taxonomyDepth: maxDepth(taxonomy),
    strata: entropyStat(STRATA, strata),
    categories: entropyStat(CATEGORIES, categories),
    domains: entropyStat(DOMAINS, domains),
    degree: {
      mean: degrees.reduce((s, d) => s + d, 0) / n,
      max: degrees.reduce((m, d) => Math.max(m, d), 0),
      entropy: degreeEntropy(degrees),
    },
    communities: {
      count: communities.members.length,
      modularity: communities.modularity,
      nmiDomains: normalizedMutualInformation(
        entries.map((e) => String(communities.of.get(e.id) ?? -1)),
        entries.map(primaryDomain),
      ),
    },
  };
};

/** Derived data of an already-validated graph. */
export const ontologyOf = (graph: ConceptGraph): Ontology => {
  const taxonomy = taxonomyOf(graph);
  const centrality = centralityOf(graph);
  const pairs = new Set<string>();
  const edges: (readonly [ConceptId, ConceptId, number])[] = [];
  for (const l of graph.links) {
    const [a, b] = l.source < l.target ? [l.source, l.target] : [l.target, l.source];
    const key = `${a}\u0000${b}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    edges.push([a, b, 1]);
  }
  const communities = louvain(graph.ids, edges);
  return {
    graph,
    taxonomy,
    ic: intrinsicInformationContent(taxonomy),
    labels: buildLabelIndex(graph),
    centrality,
    bridges: bridgeConcepts(centrality, BRIDGE_COUNT),
    communities,
    stats: ontologyStats(graph, taxonomy, communities),
  };
};

/** Parses and validates every entry, accumulating all errors of all entries. */
export const buildOntology = (raws: readonly RawConcept[]): Result<Ontology, readonly OntologyError[]> => {
  const entries: ConceptEntry[] = [];
  const errors: OntologyError[] = [];
  const unparsed = new Set<string>();
  for (const raw of [...raws].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const r = parseConceptEntry(raw.id, raw.data);
    if (r.ok) entries.push(r.value);
    else {
      errors.push(...r.error);
      unparsed.add(raw.id);
    }
  }
  const graph = buildGraph(entries);
  // Entries that failed to parse are missing from the graph: references to them, and the connectivity
  // of the rest, are consequences of the parse errors already reported, not independent problems.
  const consequential = (e: OntologyError): boolean =>
    unparsed.size > 0 &&
    ((e.kind === 'unknown-reference' && unparsed.has(e.target)) || e.kind === 'isolated' || e.kind === 'disconnected');
  if (!graph.ok) errors.push(...graph.error.filter((e) => !consequential(e)));
  if (errors.length > 0 || !graph.ok) return err(errors);
  return ok(ontologyOf(graph.value));
};
