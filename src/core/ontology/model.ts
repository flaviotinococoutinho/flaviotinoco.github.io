/**
 * Ontology model — SKOS (W3C Simple Knowledge Organization System, 2009) as
 * plain immutable data.
 *
 *   ConceptEntry  — one authored concept, exactly as written (after parsing);
 *   OntologyError — every way a set of entries can fail to be a concept scheme
 *                   (a closed sum type, so each error is reported precisely).
 *
 * Only `broader` and one direction of `related` are authored; `narrower` and
 * the inverse of `related` are derived (single source of truth: the data can
 * never contradict itself).
 */
import type { CitationKey, ConceptId, Slug } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import type { Stratum } from '../domain/strata.ts';
import type { Domain } from '../domain/facets.ts';
import { absurd } from '../algebra/match.ts';

/** One value per site locale (total: both locales are always present). */
export type Localized<T> = Readonly<Record<Locale, T>>;

/** Hierarchical relation authored in the data (skos:broader) or associative (skos:related). */
export type Relation = 'broader' | 'related';

/** One undecoded concept: its id (the file name without extension) and its decoded JSON value. */
export interface RawConcept {
  readonly id: string;
  readonly data: unknown;
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
  readonly stratum: Stratum;
  readonly domains: readonly Domain[];
  /** skos:broader — direct generalisations (polyhierarchy allowed). */
  readonly broader: readonly ConceptId[];
  /** skos:related as stored (one direction only; the inverse is derived). */
  readonly related: readonly ConceptId[];
  /** skos:exactMatch — absolute IRIs in external vocabularies. */
  readonly exactMatch: readonly string[];
  /** BibTeX keys of the sources of the definition (dct:source). */
  readonly sources: readonly CitationKey[];
}

export type OntologyError =
  /** A field does not have the expected shape (JSON path relative to the entry). */
  | { readonly kind: 'malformed'; readonly id: string; readonly path: string; readonly message: string }
  | { readonly kind: 'duplicate-id'; readonly id: ConceptId }
  | { readonly kind: 'unknown-reference'; readonly id: ConceptId; readonly relation: Relation; readonly target: ConceptId }
  | { readonly kind: 'self-relation'; readonly id: ConceptId; readonly relation: Relation }
  | { readonly kind: 'repeated-relation'; readonly id: ConceptId; readonly relation: Relation; readonly target: ConceptId }
  /** skos:broader must be acyclic; `cycle` lists the path, first element repeated at the end. */
  | { readonly kind: 'broader-cycle'; readonly cycle: readonly ConceptId[] }
  /** SKOS integrity condition S27: skos:related is disjoint with skos:broaderTransitive. */
  | { readonly kind: 'related-hierarchical'; readonly id: ConceptId; readonly target: ConceptId }
  /** `related` is symmetric and stored once: the same pair written in both files. */
  | { readonly kind: 'related-stored-twice'; readonly id: ConceptId; readonly target: ConceptId }
  | { readonly kind: 'duplicate-slug'; readonly locale: Locale; readonly slug: Slug; readonly ids: readonly ConceptId[] }
  /** SKOS S14 (one prefLabel per language) extended to the scheme: no two concepts share a prefLabel. */
  | { readonly kind: 'duplicate-pref-label'; readonly locale: Locale; readonly label: string; readonly ids: readonly ConceptId[] }
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
      return `${e.id}: a concept cannot be ${e.relation} to itself`;
    case 'repeated-relation':
      return `${e.id}: "${e.target}" is listed more than once in ${e.relation}`;
    case 'broader-cycle':
      return `broader cycle: ${e.cycle.join(' → ')}`;
    case 'related-hierarchical':
      return `${e.id}: related to "${e.target}", which is also a broader/narrower (transitive) concept (SKOS S27)`;
    case 'related-stored-twice':
      return `${e.id}: related to "${e.target}" is stored in both files; keep it in one (the inverse is derived)`;
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
