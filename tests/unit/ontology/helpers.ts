/**
 * Test helpers: compact constructors for concept entries and random DAGs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import type { ConceptId } from '../../../src/core/domain/identifiers.ts';
import type { Stratum } from '../../../src/core/domain/strata.ts';
import { buildOntology, type Ontology } from '../../../src/core/ontology/ontology.ts';
import type { RawConcept } from '../../../src/core/ontology/model.ts';
import type { Category, LinkType } from '../../../src/core/ontology/vocabulary.ts';

export const cid = (s: string): ConceptId => s as ConceptId;

export interface Spec {
  readonly stratum?: Stratum;
  readonly category?: Category;
  readonly broader?: readonly string[];
  readonly relations?: readonly (readonly [LinkType, string])[];
  readonly sources?: readonly string[];
  readonly pt?: string;
  readonly en?: string;
  readonly alt?: { readonly pt?: readonly string[]; readonly en?: readonly string[] };
}

const slugOf = (label: string): string =>
  label
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** A raw concept with sensible defaults (labels derived from the id). */
export const raw = (id: string, spec: Spec = {}): RawConcept => {
  const pt = spec.pt ?? `pt ${id}`;
  const en = spec.en ?? `en ${id}`;
  const data: Record<string, unknown> = {
    slug: { 'pt-BR': slugOf(pt), en: slugOf(en) },
    prefLabel: { 'pt-BR': pt, en },
    definition: { 'pt-BR': `Definição de ${id}.`, en: `Definition of ${id}.` },
    stratum: spec.stratum ?? 'theory',
    category: spec.category ?? 'entity',
    domains: ['information-theory'],
  };
  if (spec.alt !== undefined) data['altLabel'] = { 'pt-BR': spec.alt.pt ?? [], en: spec.alt.en ?? [] };
  if (spec.broader !== undefined) data['broader'] = spec.broader;
  if (spec.relations !== undefined) data['relations'] = spec.relations.map(([type, target]) => ({ type, target }));
  if (spec.sources !== undefined) data['sources'] = spec.sources;
  return { id, data };
};

/** Builds an ontology that must be valid (throws with the errors otherwise). */
export const ontologyOf = (raws: readonly RawConcept[]): Ontology => {
  const r = buildOntology(raws);
  if (!r.ok) throw new Error(JSON.stringify(r.error, null, 2));
  return r.value;
};

const CONCEPTS = new URL('../../../src/content/concepts/', import.meta.url);

/** The real concept files of the site. */
export const siteRaws = (): readonly RawConcept[] =>
  readdirSync(fileURLToPath(CONCEPTS))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ id: f.slice(0, -5), data: JSON.parse(readFileSync(new URL(f, CONCEPTS), 'utf8')) as unknown }));

export const siteOntology = (): Ontology => ontologyOf(siteRaws());

/** Node names n0, n1, … */
export const nodeName = (i: number): string => `n${String(i)}`;

/**
 * Arbitrary DAG on n nodes: edges only go from a higher to a lower index
 * (child → parent), which makes acyclicity hold by construction.
 */
export const dagArb = (
  maxNodes = 9,
): fc.Arbitrary<{ readonly n: number; readonly edges: readonly (readonly [number, number])[] }> =>
  fc.integer({ min: 1, max: maxNodes }).chain((n) =>
    fc
      .array(fc.tuple(fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 0, max: n - 1 })), { maxLength: n * 2 })
      .map((pairs) => {
        // Orient every pair from the higher to the lower index; drop loops and duplicates.
        const oriented = pairs
          .filter(([a, b]) => a !== b)
          .map(([a, b]) => (a > b ? ([a, b] as const) : ([b, a] as const)));
        return { n, edges: [...new Map(oriented.map((p) => [`${String(p[0])}-${String(p[1])}`, p])).values()] };
      }),
  );

/** Adjacency function (child → parents) of a DAG over node names. */
export const parentsFn =
  (edges: readonly (readonly [number, number])[]) =>
  (id: string): readonly string[] =>
    edges.filter(([a]) => nodeName(a) === id).map(([, b]) => nodeName(b));
