/**
 * Top-level vocabulary of the ontology — the closed sets every concept is
 * located by, declared as DATA so that validators, encoders and views read the
 * same table (single source of truth).
 *
 * Layered architecture (Guarino, "Formal Ontology and Information Systems",
 * FOIS 1998): a small TOP-LEVEL ontology with two orthogonal axes, under which
 * the DOMAIN concepts (src/content/concepts/*.json) are classified, and over
 * which the APPLICATION layer (the site's works) is built:
 *
 *   stratum   the epistemic mode (src/core/domain/strata.ts): a total order,
 *             philosophy ≺ theory ≺ formal ≺ value — the bridge;
 *   category  the ontological kind (below): a closed, small, decidable set
 *             inspired by DOLCE (Masolo et al., WonderWeb D18, 2003) and BFO
 *             (ISO/IEC 21838-2:2021). Categories are rigid sortals in the
 *             sense of OntoClean (Guarino & Welty, CACM 45(2), 2002): what is a
 *             measure is necessarily a measure, so subsumption (broader)
 *             preserves the category — the domain taxonomy hangs under exactly
 *             one top-level category per tree.
 *
 * Relations form a typed multigraph. Each relation type declares its algebraic
 * properties (symmetric, transitive, acyclic), the name of its DERIVED inverse
 * (never stored), a constraint on the strata of its ends (the bridge is a
 * filtration: no `formalizes` edge goes down the bridge, no `appliesTo` edge
 * goes up) and its SKOS super-property, so the JSON-LD export can declare it
 * (rdfs:subPropertyOf skos:related, owl:TransitiveProperty, owl:inverseOf…).
 */
import { absurd } from '../algebra/match.ts';
import { err, ok, type Result } from '../algebra/result.ts';
import { STRATUM_SPECS, type Stratum } from '../domain/strata.ts';

// ─── Categories (ontological kinds) ─────────────────────────────────────────

/**
 * In the order of the decision procedure (docs/ontologia.md §3): the first
 * question answered "yes" gives the category.
 */
export const CATEGORIES = [
  'proposition',
  'method',
  'operation',
  'measure',
  'process',
  'relation',
  'quality',
  'artifact',
  'entity',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const isCategory = (v: unknown): v is Category =>
  typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);

export const parseCategory = (v: unknown): Result<Category, string> =>
  isCategory(v) ? ok(v) : err(`unknown category "${String(v)}" (expected one of ${CATEGORIES.join(', ')})`);

/** Display order of categories (from the most concrete kind to the most abstract one, as in a top-level ontology). */
export const CATEGORY_DISPLAY_ORDER: readonly Category[] = [
  'entity',
  'quality',
  'measure',
  'relation',
  'process',
  'operation',
  'proposition',
  'method',
  'artifact',
];

// ─── Relation types ─────────────────────────────────────────────────────────

export const RELATION_TYPES = [
  'broader',
  'partOf',
  'dependsOn',
  'formalizes',
  'appliesTo',
  'measures',
  'contrastsWith',
  'related',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

/** Types authored in a concept's `relations` list (`broader` has its own field, as in SKOS). */
export const LINK_TYPES = [
  'partOf',
  'dependsOn',
  'formalizes',
  'appliesTo',
  'measures',
  'contrastsWith',
  'related',
] as const satisfies readonly RelationType[];
export type LinkType = (typeof LINK_TYPES)[number];

export const isRelationType = (v: unknown): v is RelationType =>
  typeof v === 'string' && (RELATION_TYPES as readonly string[]).includes(v);
export const isLinkType = (v: unknown): v is LinkType =>
  typeof v === 'string' && (LINK_TYPES as readonly string[]).includes(v);

export const parseLinkType = (v: unknown): Result<LinkType, string> => {
  if (isLinkType(v)) return ok(v);
  if (v === 'broader') return err('"broader" is not a relation type here: use the "broader" field of the concept');
  if (v === 'narrower' || v === 'hasPart' || v === 'prerequisiteOf' || v === 'formalizedBy' || v === 'appliedFrom') {
    return err(`"${v}" is a derived inverse and is never stored; write the relation on the other concept`);
  }
  return err(`unknown relation type "${String(v)}" (expected one of ${LINK_TYPES.join(', ')})`);
};

/**
 * Constraint on the ordinals of the strata of (source, target):
 *   'none'       — any;
 *   'descending' — ordinal(source) > ordinal(target)  (formalizes: the formal account comes later on the bridge);
 *   'ascending'  — ordinal(source) < ordinal(target)  (appliesTo: application comes later on the bridge).
 */
export type StratumConstraint = 'none' | 'descending' | 'ascending';

export interface RelationSpec {
  readonly id: RelationType;
  /** Stored once per unordered pair; the converse is the relation itself. */
  readonly symmetric: boolean;
  /** Its transitive closure is entailed (owl:TransitiveProperty). */
  readonly transitive: boolean;
  /** Validated acyclic (DFS, the offending cycle is reported). */
  readonly acyclic: boolean;
  /** Name of the derived inverse (null for symmetric relations). Never stored. */
  readonly inverse: string | null;
  readonly stratum: StratumConstraint;
  /** Allowed categories of the source, or null for any. */
  readonly sourceCategories: readonly Category[] | null;
  /** Allowed categories of the target, or null for any. */
  readonly targetCategories: readonly Category[] | null;
  /** Source and target must share the category (subsumption preserves rigid sortals, OntoClean). */
  readonly sameCategory: boolean;
  /** SKOS super-property: skos:broader for the hierarchy, skos:related for every associative relation. */
  readonly skos: 'broader' | 'related';
  /** Cost of traversing one edge in typed shortest paths: relations with formal semantics are cheaper. */
  readonly weight: number;
  /** Part of the prerequisite order used by learning paths (read the target before the source). */
  readonly prerequisite: boolean;
}

const spec = (s: RelationSpec): RelationSpec => s;

export const RELATIONS: Readonly<Record<RelationType, RelationSpec>> = {
  broader: spec({
    id: 'broader',
    symmetric: false,
    transitive: true,
    acyclic: true,
    inverse: 'narrower',
    stratum: 'none',
    sourceCategories: null,
    targetCategories: null,
    sameCategory: true,
    skos: 'broader',
    weight: 1,
    prerequisite: true,
  }),
  partOf: spec({
    id: 'partOf',
    symmetric: false,
    transitive: true,
    acyclic: true,
    inverse: 'hasPart',
    stratum: 'none',
    sourceCategories: null,
    targetCategories: null,
    sameCategory: false,
    skos: 'related',
    weight: 1,
    prerequisite: false,
  }),
  dependsOn: spec({
    id: 'dependsOn',
    symmetric: false,
    transitive: false,
    acyclic: true,
    inverse: 'prerequisiteOf',
    stratum: 'none',
    sourceCategories: null,
    targetCategories: null,
    sameCategory: false,
    skos: 'related',
    weight: 1.5,
    prerequisite: true,
  }),
  formalizes: spec({
    id: 'formalizes',
    symmetric: false,
    transitive: false,
    acyclic: true,
    inverse: 'formalizedBy',
    stratum: 'descending',
    sourceCategories: null,
    targetCategories: null,
    sameCategory: false,
    skos: 'related',
    weight: 1.25,
    prerequisite: false,
  }),
  appliesTo: spec({
    id: 'appliesTo',
    symmetric: false,
    transitive: false,
    acyclic: true,
    inverse: 'appliedFrom',
    stratum: 'ascending',
    sourceCategories: null,
    targetCategories: null,
    sameCategory: false,
    skos: 'related',
    weight: 1.5,
    prerequisite: false,
  }),
  measures: spec({
    id: 'measures',
    symmetric: false,
    transitive: false,
    acyclic: true,
    inverse: 'measuredBy',
    stratum: 'none',
    sourceCategories: ['measure'],
    targetCategories: ['quality', 'entity'],
    sameCategory: false,
    skos: 'related',
    weight: 1.25,
    prerequisite: false,
  }),
  contrastsWith: spec({
    id: 'contrastsWith',
    symmetric: true,
    transitive: false,
    acyclic: false,
    inverse: null,
    stratum: 'none',
    sourceCategories: null,
    targetCategories: null,
    sameCategory: false,
    skos: 'related',
    weight: 2,
    prerequisite: false,
  }),
  related: spec({
    id: 'related',
    symmetric: true,
    transitive: false,
    acyclic: false,
    inverse: null,
    stratum: 'none',
    sourceCategories: null,
    targetCategories: null,
    sameCategory: false,
    skos: 'related',
    weight: 3,
    prerequisite: false,
  }),
};

/** Relation types of the prerequisite order (broader ∪ dependsOn), in table order. */
export const PREREQUISITE_TYPES: readonly RelationType[] = RELATION_TYPES.filter((t) => RELATIONS[t].prerequisite);

/** Whether an edge source → target satisfies the stratum constraint of its type. */
export const satisfiesStratum = (constraint: StratumConstraint, source: Stratum, target: Stratum): boolean => {
  const d = STRATUM_SPECS[source].ordinal - STRATUM_SPECS[target].ordinal;
  switch (constraint) {
    case 'none':
      return true;
    case 'descending':
      return d > 0;
    case 'ascending':
      return d < 0;
    default:
      return absurd(constraint);
  }
};

// ─── Taxonomy ids (top level + domain) ──────────────────────────────────────

/**
 * Nodes of the extended taxonomy used by the information measures: the domain
 * concepts, one node per category (`@measure`…) and a single top (`@top`), as
 * WordNet's unique beginners sit under one root. Concept ids are slugs, so
 * they can never start with "@": the three kinds of id cannot collide.
 */
export type CategoryTaxon = `@${Category}`;
export const TOP_TAXON = '@top';
export type TopTaxon = typeof TOP_TAXON;

export const categoryTaxon = (c: Category): CategoryTaxon => `@${c}`;

/** The category of a category node, or null for any other taxon. */
export const categoryOfTaxon = (taxon: string): Category | null => {
  if (!taxon.startsWith('@')) return null;
  const c = taxon.slice(1);
  return isCategory(c) ? c : null;
};
