/**
 * JSON-LD codec for the concept scheme (JSON-LD 1.1, W3C 2020; SKOS, W3C 2009;
 * OWL 2, W3C 2012; schema.org).
 *
 *   encode : Ontology × Works × IRIs → JsonLdDocument
 *   decode : JsonLdDocument → Result<ConceptEntry[]>        (our canonical form only)
 *   law    : buildGraph(decode(encode(g))).links = g.links    (tests/unit/ontology/jsonld.test.ts)
 *
 * Layers, kept distinct in types (Guarino, 1998):
 *   top level    strata as skos:Collection (epistemic grouping, not kinds) and
 *                categories as owl:Class ⊑ skos:Concept (rigid kinds → classes);
 *   vocabulary   one owl:ObjectProperty per relation type, rdfs:subPropertyOf
 *                skos:related, with owl:TransitiveProperty / owl:SymmetricProperty
 *                and owl:inverseOf for the derived inverses;
 *   domain       skos:Concept + schema:DefinedTerm, in a skos:ConceptScheme that is
 *                also a schema:DefinedTermSet; skos:broader/narrower for the
 *                hierarchy, skos:related MATERIALISED for every associative pair
 *                (so plain SKOS consumers see them), typed properties alongside;
 *   application  the works as schema:ScholarlyArticle (essays) and
 *                schema:LearningResource (labs), identified by their page URL,
 *                with schema:about → concept IRIs. Works are never skos:Concept.
 *
 * IRIs are hash IRIs on the document (W3C, "Cool URIs for the Semantic Web",
 * 2008, §4.2), namespaced by kind so they cannot collide: #scheme,
 * #concept/<id>, #stratum/<s>, #category/<c>, #relation/<type>, #datatype/tex.
 * Output is deterministic (canonical ordering), so the file diffs cleanly.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { ConceptId } from '../domain/identifiers.ts';
import { LOCALES, type Locale } from '../domain/locale.ts';
import { STRATA, type Stratum } from '../domain/strata.ts';
import type { ConceptGraph } from './graph.ts';
import type { ConceptEntry, Localized, OntologyError, RawConcept } from './model.ts';
import { parseConceptEntry } from './parse.ts';
import {
  CATEGORIES,
  RELATION_TYPES,
  RELATIONS,
  isCategory,
  isLinkType,
  type Category,
  type RelationType,
} from './vocabulary.ts';
import type { Work } from './works.ts';

export const SKOS = 'http://www.w3.org/2004/02/skos/core#';
export const DCT = 'http://purl.org/dc/terms/';
export const FOAF = 'http://xmlns.com/foaf/0.1/';
export const OWL = 'http://www.w3.org/2002/07/owl#';
export const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
export const SCHEMA = 'https://schema.org/';

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
  readonly categoryLabels: Localized<Readonly<Record<Category, string>>>;
  /** Localised name of each relation type and of each derived inverse, keyed by property name. */
  readonly relationLabels: Localized<Readonly<Record<string, string>>>;
  /** Localised name of the property linking a concept to its stratum. */
  readonly stratumPropertyLabel: Localized<string>;
  /** The works (application layer), with absolute page IRIs in `href`. */
  readonly works?: readonly Work[];
}

export const schemeIri = (doc: string): string => `${doc}#scheme`;
export const conceptIri = (doc: string, id: ConceptId): string => `${doc}#concept/${id}`;
export const stratumIri = (doc: string, s: Stratum): string => `${doc}#stratum/${s}`;
export const categoryIri = (doc: string, c: Category): string => `${doc}#category/${c}`;
export const relationIri = (doc: string, name: string): string => `${doc}#relation/${name}`;
export const texDatatypeIri = (doc: string): string => `${doc}#datatype/tex`;

const langValues = (values: Localized<string>): JsonValue =>
  LOCALES.map((l) => ({ '@value': values[l], '@language': l }));
const langLists = (values: Localized<readonly string[]>): JsonValue =>
  LOCALES.flatMap((l) => values[l].map((v) => ({ '@value': v, '@language': l })));
const refs = (iris: readonly string[]): JsonValue => iris.map((iri) => ({ '@id': iri }));
const per = <T>(f: (l: Locale) => T): Record<Locale, T> => ({ 'pt-BR': f('pt-BR'), en: f('en') });

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Property names of the vocabulary: every associative type and the inverse of each asymmetric one. */
export const vocabularyProperties = (): readonly {
  readonly name: string;
  readonly type: RelationType;
  readonly inverse: boolean;
}[] =>
  RELATION_TYPES.filter((t) => t !== 'broader').flatMap((t) => {
    const spec = RELATIONS[t];
    const own = { name: t, type: t, inverse: false };
    return spec.inverse === null ? [own] : [own, { name: spec.inverse, type: t, inverse: true }];
  });

/** Encodes a validated graph (and the works) as a JSON-LD document. */
export const toJsonLd = (graph: ConceptGraph, o: JsonLdOptions): JsonLdDocument => {
  const doc = o.documentIri;
  const scheme = schemeIri(doc);
  const c = (id: ConceptId): string => conceptIri(doc, id);
  const roots = new Set(graph.hierarchy.roots);

  const schemeNode: JsonLdNode = {
    '@id': scheme,
    '@type': ['skos:ConceptScheme', 'schema:DefinedTermSet'],
    'dct:title': langValues(o.schemeTitle),
    'schema:name': langValues(o.schemeTitle),
    'dct:description': langValues(o.schemeDescription),
    'skos:hasTopConcept': refs(graph.hierarchy.roots.map(c)),
    'schema:hasDefinedTerm': refs(graph.ids.map(c)),
  };

  const properties: readonly JsonLdNode[] = vocabularyProperties().map((p) => {
    const spec = RELATIONS[p.type];
    const types = [
      'owl:ObjectProperty',
      ...(spec.transitive ? ['owl:TransitiveProperty'] : []),
      ...(spec.symmetric ? ['owl:SymmetricProperty'] : []),
    ];
    const other = p.inverse ? p.type : spec.inverse;
    return {
      '@id': relationIri(doc, p.name),
      '@type': types,
      'rdfs:label': langValues(per((l) => o.relationLabels[l][p.name] ?? p.name)),
      'rdfs:subPropertyOf': { '@id': `${SKOS}related` },
      ...(other === null ? {} : { 'owl:inverseOf': { '@id': relationIri(doc, other) } }),
    };
  });

  const stratumProperty: JsonLdNode = {
    '@id': `${doc}#stratum`,
    '@type': ['owl:ObjectProperty', 'owl:FunctionalProperty'],
    'rdfs:label': langValues(o.stratumPropertyLabel),
    'rdfs:range': { '@id': `${SKOS}Collection` },
  };

  const classes: readonly JsonLdNode[] = CATEGORIES.map((cat) => ({
    '@id': categoryIri(doc, cat),
    '@type': 'owl:Class',
    'rdfs:subClassOf': { '@id': `${SKOS}Concept` },
    'rdfs:label': langValues(per((l) => o.categoryLabels[l][cat])),
  }));

  const collections: readonly JsonLdNode[] = STRATA.map((s) => ({
    '@id': stratumIri(doc, s),
    '@type': 'skos:Collection',
    'skos:prefLabel': langValues(per((l) => o.strataLabels[l][s])),
    'skos:member': refs(graph.ids.filter((id) => graph.concepts.get(id)?.stratum === s).map(c)),
  }));

  const concepts: readonly JsonLdNode[] = graph.ids.flatMap((id) => {
    const e = graph.concepts.get(id);
    if (e === undefined) return [];
    const associative = [
      ...new Set(
        RELATION_TYPES.filter((t) => t !== 'broader').flatMap((t) => [
          ...(graph.forward[t].get(id) ?? []),
          ...(graph.inverse[t].get(id) ?? []),
        ]),
      ),
    ].sort(byCodeUnit);
    const node: Record<string, JsonValue> = {
      '@id': c(id),
      '@type': ['skos:Concept', 'schema:DefinedTerm', categoryIri(doc, e.category)],
      'skos:inScheme': { '@id': scheme },
      'schema:inDefinedTermSet': { '@id': scheme },
      'ft:stratum': { '@id': stratumIri(doc, e.stratum) },
      'skos:prefLabel': langValues(e.prefLabel),
      'schema:name': langValues(e.prefLabel),
      'skos:altLabel': langLists(e.altLabel),
      'skos:definition': langValues(e.definition),
      'schema:description': langValues(e.definition),
      'skos:broader': refs((graph.hierarchy.broader.get(id) ?? []).map(c)),
      'skos:narrower': refs((graph.hierarchy.narrower.get(id) ?? []).map(c)),
      'skos:related': refs(associative.map(c)),
      'skos:exactMatch': refs(e.exactMatch),
      'dct:subject': [...e.domains],
      'dct:source': [...e.sources],
      'foaf:page': refs(LOCALES.map((l) => o.pageIri(id, l))),
    };
    for (const p of vocabularyProperties()) {
      const targets = (p.inverse ? graph.inverse[p.type] : graph.forward[p.type]).get(id) ?? [];
      if (targets.length > 0) node[`ft:relation/${p.name}`] = refs(targets.map(c));
    }
    if (e.notation !== null) node['skos:notation'] = { '@value': e.notation, '@type': texDatatypeIri(doc) };
    if (roots.has(id)) node['skos:topConceptOf'] = { '@id': scheme };
    return [node];
  });

  const works = o.works ?? [];
  const workNodes: readonly JsonLdNode[] = [...works]
    .sort((a, b) => byCodeUnit(a.href, b.href))
    .map((w) => ({
      '@id': w.href,
      '@type': w.kind === 'essay' ? 'schema:ScholarlyArticle' : 'schema:LearningResource',
      'schema:name': { '@value': w.title, '@language': w.locale },
      'schema:inLanguage': w.locale,
      'schema:url': { '@id': w.href },
      'schema:about': refs([...new Set(w.concepts)].sort(byCodeUnit).map(c)),
      'schema:workTranslation': refs(
        works
          .filter((x) => x.key === w.key && x.locale !== w.locale)
          .map((x) => x.href)
          .sort(byCodeUnit),
      ),
    }));

  return {
    '@context': { skos: SKOS, dct: DCT, foaf: FOAF, owl: OWL, rdfs: RDFS, schema: SCHEMA, ft: `${doc}#` },
    '@graph': [schemeNode, ...properties, stratumProperty, ...classes, ...collections, ...concepts, ...workNodes],
  };
};

// ─── Decoder (canonical form only: the inverse of toJsonLd, not a general JSON-LD processor) ───

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const asArray = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const idsOf = (v: unknown): readonly string[] =>
  asArray(v).flatMap((x) => (isRecord(x) && typeof x['@id'] === 'string' ? [x['@id']] : []));
const literals = (v: unknown, locale: Locale): readonly string[] =>
  asArray(v).flatMap((x) =>
    isRecord(x) && x['@language'] === locale && typeof x['@value'] === 'string' ? [x['@value']] : [],
  );
const strings = (v: unknown): readonly string[] => asArray(v).flatMap((x) => (typeof x === 'string' ? [x] : []));

export interface JsonLdDecodeOptions {
  readonly documentIri: string;
  /** Inverse of pageIri: the slug of a concept page IRI in a locale, or null. */
  readonly slugOfPage: (iri: string, locale: Locale) => string | null;
}

/**
 * Decodes a document produced by `toJsonLd` back into concept entries.
 * Asymmetric relations come back as stored; symmetric ones on their canonical
 * end (the smaller id), so the decoded entries build the same graph.
 */
export const fromJsonLd = (
  doc: unknown,
  o: JsonLdDecodeOptions,
): Result<readonly ConceptEntry[], readonly OntologyError[]> => {
  if (!isRecord(doc) || !Array.isArray(doc['@graph'])) {
    return err([{ kind: 'malformed', id: '', path: '@graph', message: 'not a JSON-LD document with @graph' }]);
  }
  const conceptPrefix = `${o.documentIri}#concept/`;
  const categoryPrefix = `${o.documentIri}#category/`;
  const stratumPrefix = `${o.documentIri}#stratum/`;
  const local = (iri: string): string | null =>
    iri.startsWith(conceptPrefix) ? iri.slice(conceptPrefix.length) : null;
  const nodes = (doc['@graph'] as readonly unknown[]).filter(isRecord);
  const raws: RawConcept[] = nodes
    .filter((n) => asArray(n['@type']).includes('skos:Concept') && typeof n['@id'] === 'string')
    .map((n) => {
      const iri = n['@id'] as string;
      const id = local(iri) ?? iri;
      const pages = idsOf(n['foaf:page']);
      const category = asArray(n['@type'])
        .flatMap((t) => (typeof t === 'string' && t.startsWith(categoryPrefix) ? [t.slice(categoryPrefix.length)] : []))
        .find(isCategory);
      const stratum = idsOf(n['ft:stratum'])
        .map((s) => (s.startsWith(stratumPrefix) ? s.slice(stratumPrefix.length) : ''))
        .find((s) => (STRATA as readonly string[]).includes(s));
      const relations = RELATION_TYPES.filter(isLinkType).flatMap((type) =>
        idsOf(n[`ft:relation/${type}`])
          .map(local)
          .filter((t): t is string => t !== null && (!RELATIONS[type].symmetric || id < t))
          .map((target) => ({ type, target })),
      );
      const altLabel = per((l) => literals(n['skos:altLabel'], l));
      const notation = isRecord(n['skos:notation']) ? n['skos:notation']['@value'] : undefined;
      const data: Record<string, unknown> = {
        slug: per((l) => pages.map((p) => o.slugOfPage(p, l)).find((s) => s !== null) ?? ''),
        prefLabel: per((l) => literals(n['skos:prefLabel'], l)[0] ?? ''),
        definition: per((l) => literals(n['skos:definition'], l)[0] ?? ''),
        stratum: stratum ?? '',
        category: category ?? '',
        domains: strings(n['dct:subject']),
        broader: idsOf(n['skos:broader']).map((b) => local(b) ?? b),
        relations,
        exactMatch: idsOf(n['skos:exactMatch']),
        sources: strings(n['dct:source']),
      };
      if (altLabel['pt-BR'].length > 0 || altLabel.en.length > 0) data['altLabel'] = altLabel;
      if (typeof notation === 'string') data['notation'] = notation;
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
