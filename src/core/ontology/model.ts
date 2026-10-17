/**
 * Ontology model — SKOS (W3C Simple Knowledge Organization System, 2009)
 * extended with a typed relation vocabulary (./vocabulary.ts), as plain
 * immutable data.
 *
 *   ConceptEntry     — one authored concept, exactly as written (after parsing);
 *   OntologyError    — every way a set of entries can fail to be a concept scheme
 *                      (a closed sum type, so each error is reported precisely);
 *   OntologyWarning  — topological smells that do not break any law but signal a
 *                      modelling problem (redundant broader edges, excessive
 *                      polyhierarchy).
 *
 * Only one direction of each relation is authored; inverses (narrower, hasPart,
 * prerequisiteOf, formalizedBy, appliedFrom, measuredBy) and the converse of the
 * symmetric relations are DERIVED, so the data can never contradict itself.
 */
import type { CitationKey, ConceptId, Slug } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import type { Stratum } from '../domain/strata.ts';
import type { Domain } from '../domain/facets.ts';
import { absurd } from '../algebra/match.ts';
import type { Category, LinkType, RelationType } from './vocabulary.ts';

/** One value per site locale (total: both locales are always present). */
export type Localized<T> = Readonly<Record<Locale, T>>;

/** One undecoded concept: its id (the file name without extension) and its decoded JSON value. */
export interface RawConcept {
  readonly id: string;
  readonly data: unknown;
}

/** An authored typed relation (`relations` list of a concept file). */
export interface AuthoredLink {
  readonly type: LinkType;
  readonly target: ConceptId;
}

/** A concept as authored in src/content/concepts/<id>.json, parsed into refined types. */
export interface ConceptEntry {
  readonly id: ConceptId;
  readonly slug: Localized<Slug>;
  readonly prefLabel: Localized<string>;
  readonly altLabel: Localized<readonly string[]>;
  readonly definition: Localized<string>;
  /** TeX source (KaTeX subset), or null when the concept has no standard notation. */
  readonly notation: string | null;
  /** Epistemic mode (top-level axis 1). */
  readonly stratum: Stratum;
  /** Ontological kind (top-level axis 2). */
  readonly category: Category;
  /** Ranganathan facet; the first domain is the primary one. */
  readonly domains: readonly Domain[];
  /** skos:broader — direct generalisations (is-a; polyhierarchy allowed), stored as a transitive reduction. */
  readonly broader: readonly ConceptId[];
  /** Typed associative relations, as stored (one direction only). */
  readonly relations: readonly AuthoredLink[];
  /** skos:exactMatch — absolute IRIs in external vocabularies (Wikidata, verified). */
  readonly exactMatch: readonly string[];
  /** BibTeX keys of the sources of the definition (dct:source). */
  readonly sources: readonly CitationKey[];
}

/** Which relation set a cycle was found in: one type, or the prerequisite order (broader ∪ dependsOn). */
export type CycleScope = RelationType | 'prerequisite';

export type OntologyError =
  /** A field does not have the expected shape (JSON path relative to the entry). */
  | { readonly kind: 'malformed'; readonly id: string; readonly path: string; readonly message: string }
  | { readonly kind: 'duplicate-id'; readonly id: ConceptId }
  | {
      readonly kind: 'unknown-reference';
      readonly id: ConceptId;
      readonly relation: RelationType;
      readonly target: ConceptId;
    }
  | { readonly kind: 'self-relation'; readonly id: ConceptId; readonly relation: RelationType }
  | {
      readonly kind: 'repeated-relation';
      readonly id: ConceptId;
      readonly relation: RelationType;
      readonly target: ConceptId;
    }
  /** An acyclic relation (or the prerequisite order) has a cycle; first element repeated at the end. */
  | { readonly kind: 'cycle'; readonly scope: CycleScope; readonly cycle: readonly ConceptId[] }
  /** The edge violates the stratum constraint of its type (the bridge is a filtration). */
  | {
      readonly kind: 'stratum-constraint';
      readonly id: ConceptId;
      readonly relation: RelationType;
      readonly target: ConceptId;
      readonly source: Stratum;
      readonly targetStratum: Stratum;
    }
  /** The edge violates the category constraint of its type (e.g. `measures` from a non-measure). */
  | {
      readonly kind: 'category-constraint';
      readonly id: ConceptId;
      readonly relation: RelationType;
      readonly target: ConceptId;
      readonly source: Category;
      readonly targetCategory: Category;
    }
  /** A symmetric relation written in both files. */
  | { readonly kind: 'symmetric-stored-twice'; readonly relation: RelationType; readonly a: ConceptId; readonly b: ConceptId }
  /** The same unordered pair is linked under two relation types. */
  | {
      readonly kind: 'pair-under-two-types';
      readonly a: ConceptId;
      readonly b: ConceptId;
      readonly relations: readonly RelationType[];
    }
  /**
   * SKOS integrity condition S27 extended to the sub-properties of skos:related:
   * associative pairs (including the entailed partOf closure) are disjoint
   * from skos:broaderTransitive.
   */
  | { readonly kind: 'associative-hierarchical'; readonly id: ConceptId; readonly relation: RelationType; readonly target: ConceptId }
  /** A concept with no edge at all. */
  | { readonly kind: 'isolated'; readonly id: ConceptId }
  /** The undirected projection is not connected: `component` is cut off from the main component. */
  | { readonly kind: 'disconnected'; readonly component: readonly ConceptId[] }
  /** A proposition (theorem, law) must cite at least one source. */
  | { readonly kind: 'proposition-without-source'; readonly id: ConceptId }
  | { readonly kind: 'duplicate-slug'; readonly locale: Locale; readonly slug: Slug; readonly ids: readonly ConceptId[] }
  /** SKOS S14 (one prefLabel per language) extended to the scheme: no two concepts share a prefLabel. */
  | {
      readonly kind: 'duplicate-pref-label';
      readonly locale: Locale;
      readonly label: string;
      readonly ids: readonly ConceptId[];
    }
  /** SKOS S13: prefLabel and altLabel are pairwise disjoint. */
  | { readonly kind: 'pref-alt-overlap'; readonly id: ConceptId; readonly locale: Locale; readonly label: string }
  /** The slug of a locale must be the slug of one of that locale's labels (catches copy-paste across locales). */
  | {
      readonly kind: 'slug-locale-mismatch';
      readonly id: ConceptId;
      readonly locale: Locale;
      readonly slug: Slug;
      readonly expected: readonly string[];
    };

export type OntologyWarning =
  /** A stored broader edge implied by a longer path: the data should be the Hasse diagram (transitive reduction). */
  | { readonly kind: 'redundant-broader'; readonly id: ConceptId; readonly target: ConceptId; readonly via: readonly ConceptId[] }
  /** More than two broader parents: a classification smell. */
  | { readonly kind: 'polyhierarchy-excess'; readonly id: ConceptId; readonly parents: readonly ConceptId[] };

/** Human-readable (English) description of an error, for build logs. */
export const describeError = (e: OntologyError): string => {
  switch (e.kind) {
    case 'malformed':
      return `${e.id}: ${e.path === '' ? '' : `${e.path}: `}${e.message}`;
    case 'duplicate-id':
      return `${e.id}: duplicate concept id`;
    case 'unknown-reference':
      return `${e.id}: ${e.relation} refers to unknown concept "${e.target}"`;
    case 'self-relation':
      return `${e.id}: a concept cannot be ${e.relation} itself`;
    case 'repeated-relation':
      return `${e.id}: "${e.target}" is listed more than once in ${e.relation}`;
    case 'cycle':
      return `${e.scope} cycle: ${e.cycle.join(' → ')}`;
    case 'stratum-constraint':
      return `${e.id}: ${e.relation} "${e.target}" goes from ${e.source} to ${e.targetStratum}, against the direction the bridge allows for ${e.relation}`;
    case 'category-constraint':
      return `${e.id}: ${e.relation} "${e.target}" is not allowed from a ${e.source} to a ${e.targetCategory}`;
    case 'symmetric-stored-twice':
      return `${e.a} ↔ ${e.b}: ${e.relation} is symmetric and is stored in both files; keep it in one (the converse is derived)`;
    case 'pair-under-two-types':
      return `${e.a} — ${e.b}: the pair is linked under several relation types (${e.relations.join(', ')}); keep the most specific one`;
    case 'associative-hierarchical':
      return `${e.id}: ${e.relation} "${e.target}", which is also a broader/narrower (transitive) concept (SKOS S27)`;
    case 'isolated':
      return `${e.id}: the concept has no relation to any other concept`;
    case 'disconnected':
      return `disconnected from the rest of the scheme: ${e.component.join(', ')}`;
    case 'proposition-without-source':
      return `${e.id}: a proposition (theorem, law) must cite at least one source`;
    case 'duplicate-slug':
      return `${e.locale}: slug "${e.slug}" is used by ${e.ids.join(', ')}`;
    case 'duplicate-pref-label':
      return `${e.locale}: prefLabel "${e.label}" is used by ${e.ids.join(', ')}`;
    case 'pref-alt-overlap':
      return `${e.id}: "${e.label}" is both prefLabel and altLabel in ${e.locale} (SKOS S13)`;
    case 'slug-locale-mismatch':
      return `${e.id}: ${e.locale} slug "${e.slug}" does not match any ${e.locale} label (expected one of: ${e.expected.join(', ')})`;
    default:
      return absurd(e);
  }
};

export const describeWarning = (w: OntologyWarning): string => {
  switch (w.kind) {
    case 'redundant-broader':
      return `${w.id}: broader "${w.target}" is implied by ${[w.id, ...w.via, w.target].join(' → ')}; store the transitive reduction`;
    case 'polyhierarchy-excess':
      return `${w.id}: ${String(w.parents.length)} broader concepts (${w.parents.join(', ')}); more than two is a classification smell`;
    default:
      return absurd(w);
  }
};
