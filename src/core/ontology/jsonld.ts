/**
 * JSON-LD codec for the concept scheme (JSON-LD 1.1, W3C 2020; SKOS, W3C 2009).
 *
 *   encode : ConceptGraph × IRIs → JsonLdDocument
 *   decode : JsonLdDocument → Result<ConceptEntry[]>       (our own canonical form)
 *   law    : buildGraph(decode(encode(g))) ≅ g               (tests/unit/ontology/jsonld.test.ts)
 *
 * Vocabulary:
 *   skos:ConceptScheme (#scheme)   dct:title, dct:description, skos:hasTopConcept
 *   skos:Collection (#stratum-…)   one per stratum (the top ontology), skos:member
 *   skos:Concept (#<id>)           skos:prefLabel / altLabel / definition (one value per
 *                                  @language), skos:notation (TeX), skos:broader, skos:narrower
 *                                  (derived), skos:related (symmetric), skos:exactMatch,
 *                                  skos:inScheme, skos:topConceptOf, dct:source (BibTeX keys),
 *                                  dct:subject (domain facet), foaf:page (HTML page per locale)
 *
 * Concept IRIs are hash IRIs on the document itself (W3C, "Cool URIs for the
 * Semantic Web", 2008, §4.2): stable, language-neutral, dereferenceable.
 * Output is deterministic (canonical ordering), so the file diffs cleanly.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { ConceptId } from '../domain/identifiers.ts';
import { LOCALES, type Locale } from '../domain/locale.ts';
import { STRATA, type Stratum } from '../domain/strata.ts';
import type { ConceptGraph } from './graph.ts';
import type { ConceptEntry, Localized, OntologyError, RawConcept } from './model.ts';
import { parseConceptEntry } from './parse.ts';

export const SKOS = 'http://www.w3.org/2004/02/skos/core#';
export const DCT = 'http://purl.org/dc/terms/';
export const FOAF = 'http://xmlns.com/foaf/0.1/';

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonLdNode = { readonly [key: string]: JsonValue };
export interface JsonLdDocument {
  readonly '@context': Readonly<Record<string, string>>;
  readonly '@graph': readonly JsonLdNode[];
}

export interface JsonLdOptions {
  /** Absolute IRI of the JSON-LD document (e.g. https://host/base/ontology.jsonld). */
  readonly documentIri: string;
  /** Absolute IRI of the HTML page of a concept in a locale. */
  readonly pageIri: (id: ConceptId, locale: Locale) => string;
  readonly schemeTitle: Localized<string>;
  readonly schemeDescription: Localized<string>;
  readonly strataLabels: Localized<Readonly<Record<Stratum, string>>>;
}

export const schemeIri = (documentIri: string): string => `${documentIri}#scheme`;
export const conceptIri = (documentIri: string, id: ConceptId): string => `${documentIri}#${id}`;
export const stratumIri = (documentIri: string, s: Stratum): string => `${documentIri}#stratum-${s}`;

const langValues = (values: Localized<string>): JsonValue => LOCALES.map((l) => ({ '@value': values[l], '@language': l }));
const langLists = (values: Localized<readonly string[]>): JsonValue =>
  LOCALES.flatMap((l) => values[l].map((v) => ({ '@value': v, '@language': l })));
const refs = (iris: readonly string[]): JsonValue => iris.map((iri) => ({ '@id': iri }));

/** Encodes a validated graph as a JSON-LD document (expanded property IRIs via prefixes). */
export const toJsonLd = (graph: ConceptGraph, o: JsonLdOptions): JsonLdDocument => {
  const scheme = schemeIri(o.documentIri);
  const c = (id: ConceptId): string => conceptIri(o.documentIri, id);
  const roots = new Set(graph.hierarchy.roots);

  const schemeNode: JsonLdNode = {
    '@id': scheme,
    '@type': 'skos:ConceptScheme',
    'dct:title': langValues(o.schemeTitle),
    'dct:description': langValues(o.schemeDescription),
    'skos:hasTopConcept': refs(graph.hierarchy.roots.map(c)),
  };

  const collections: readonly JsonLdNode[] = STRATA.map((s) => ({
    '@id': stratumIri(o.documentIri, s),
    '@type': 'skos:Collection',
    'skos:prefLabel': langValues({ 'pt-BR': o.strataLabels['pt-BR'][s], en: o.strataLabels.en[s] }),
    'skos:member': refs(graph.ids.filter((id) => graph.concepts.get(id)?.stratum === s).map(c)),
  }));

  const concepts: readonly JsonLdNode[] = graph.ids.flatMap((id) => {
    const e = graph.concepts.get(id);
    if (e === undefined) return [];
    const node: Record<string, JsonValue> = {
      '@id': c(id),
      '@type': 'skos:Concept',
      'skos:inScheme': { '@id': scheme },
      'skos:prefLabel': langValues(e.prefLabel),
      'skos:altLabel': langLists(e.altLabel),
      'skos:definition': langValues(e.definition),
      'skos:broader': refs((graph.hierarchy.broader.get(id) ?? []).map(c)),
      'skos:narrower': refs((graph.hierarchy.narrower.get(id) ?? []).map(c)),
      'skos:related': refs((graph.related.get(id) ?? []).map(c)),
      'skos:exactMatch': refs(e.exactMatch),
      'dct:subject': [...e.domains],
      'dct:source': [...e.sources],
      'foaf:page': refs(LOCALES.map((l) => o.pageIri(id, l))),
    };
    if (e.notation !== null) node['skos:notation'] = e.notation;
    if (roots.has(id)) node['skos:topConceptOf'] = { '@id': scheme };
    return [node];
  });

  return {
    '@context': { skos: SKOS, dct: DCT, foaf: FOAF },
    '@graph': [schemeNode, ...collections, ...concepts],
  };
};

// ─── Decoder (canonical form only: the inverse of toJsonLd, not a general JSON-LD processor) ───

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asArray = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const idsOf = (v: unknown): readonly string[] =>
  asArray(v).flatMap((x) => (isRecord(x) && typeof x['@id'] === 'string' ? [x['@id']] : []));
const literals = (v: unknown, locale: Locale): readonly string[] =>
  asArray(v).flatMap((x) => (isRecord(x) && x['@language'] === locale && typeof x['@value'] === 'string' ? [x['@value']] : []));
const strings = (v: unknown): readonly string[] => asArray(v).flatMap((x) => (typeof x === 'string' ? [x] : []));

export interface JsonLdDecodeOptions {
  readonly documentIri: string;
  /** Inverse of pageIri: the slug of a concept page IRI in a locale, or null. */
  readonly slugOfPage: (iri: string, locale: Locale) => string | null;
}

/**
 * Decodes a document produced by `toJsonLd` back into concept entries (related
 * is returned in the stored form: once per pair, on the smaller id).
 */
export const fromJsonLd = (doc: unknown, o: JsonLdDecodeOptions): Result<readonly ConceptEntry[], readonly OntologyError[]> => {
  if (!isRecord(doc) || !Array.isArray(doc['@graph'])) {
    return err([{ kind: 'malformed', id: '', path: '@graph', message: 'not a JSON-LD document with @graph' }]);
  }
  const prefix = `${o.documentIri}#`;
  const local = (iri: string): string | null => (iri.startsWith(prefix) ? iri.slice(prefix.length) : null);
  const nodes = (doc['@graph'] as readonly unknown[]).filter(isRecord);
  const stratumOf = new Map<string, Stratum>();
  for (const s of STRATA) {
    const coll = nodes.find((n) => n['@id'] === stratumIri(o.documentIri, s));
    for (const m of idsOf(coll?.['skos:member'])) stratumOf.set(m, s);
  }
  const raws: RawConcept[] = nodes
    .filter((n) => n['@type'] === 'skos:Concept' && typeof n['@id'] === 'string')
    .map((n) => {
      const iri = n['@id'] as string;
      const id = local(iri) ?? iri;
      const per = <T>(f: (l: Locale) => T): Record<Locale, T> => ({ 'pt-BR': f('pt-BR'), en: f('en') });
      const pages = idsOf(n['foaf:page']);
      const related = idsOf(n['skos:related'])
        .map(local)
        .filter((r): r is string => r !== null && id < r);
      const data: Record<string, unknown> = {
        slug: per((l) => pages.map((p) => o.slugOfPage(p, l)).find((s) => s !== null) ?? ''),
        prefLabel: per((l) => literals(n['skos:prefLabel'], l)[0] ?? ''),
        altLabel: per((l) => literals(n['skos:altLabel'], l)),
        definition: per((l) => literals(n['skos:definition'], l)[0] ?? ''),
        stratum: stratumOf.get(iri) ?? '',
        domains: strings(n['dct:subject']),
        broader: idsOf(n['skos:broader']).map((b) => local(b) ?? b),
        related,
        exactMatch: idsOf(n['skos:exactMatch']),
        sources: strings(n['dct:source']),
      };
      if (typeof n['skos:notation'] === 'string') data['notation'] = n['skos:notation'];
      return { id, data };
    });
  const entries: ConceptEntry[] = [];
  const errors: OntologyError[] = [];
  for (const r of raws) {
    const parsed = parseConceptEntry(r.id, r.data);
    if (parsed.ok) entries.push(parsed.value);
    else errors.push(...parsed.error);
  }
  return errors.length > 0 ? err(errors) : ok(entries);
};
