/**
 * Machine-readable exports: JSON-LD (structural expansion check, round trip)
 * and the node-link graph JSON used by the client.
 */
import { describe, expect, it } from 'vitest';
import { LOCALES, type Locale } from '../../../src/core/domain/locale.ts';
import { STRATA } from '../../../src/core/domain/strata.ts';
import { buildGraph } from '../../../src/core/ontology/graph.ts';
import {
  decodeGraphJson,
  encodeGraphJson,
  searchConcepts,
  serializeGraphJson,
} from '../../../src/core/ontology/graphjson.ts';
import { fromJsonLd, toJsonLd, vocabularyProperties, type JsonLdDocument } from '../../../src/core/ontology/jsonld.ts';
import { CATEGORIES } from '../../../src/core/ontology/vocabulary.ts';
import type { Work } from '../../../src/core/ontology/works.ts';
import { cid, siteOntology } from './helpers.ts';
import { expandDocument } from './jsonld-expand.ts';

const o = siteOntology();
const DOC = 'https://example.org/base/ontology.jsonld';
const seg = (l: Locale): string => (l === 'pt-BR' ? 'pt' : 'en');
const pageIri = (id: string, l: Locale): string =>
  `https://example.org/base/${seg(l)}/c/${o.graph.concepts.get(cid(id))?.slug[l] ?? id}/`;
const works: readonly Work[] = [
  {
    key: 'essay:x',
    kind: 'essay',
    locale: 'pt-BR',
    title: 'Ensaio X',
    shortTitle: 'Ensaio X',
    stratum: 'theory',
    href: 'https://example.org/base/pt/ensaios/x/',
    concepts: [cid('entropy'), cid('channel')],
  },
  {
    key: 'essay:x',
    kind: 'essay',
    locale: 'en',
    title: 'Essay X',
    shortTitle: 'Essay X',
    stratum: 'theory',
    href: 'https://example.org/base/en/essays/x/',
    concepts: [cid('entropy'), cid('channel')],
  },
  {
    key: 'lab:y',
    kind: 'lab',
    locale: 'en',
    title: 'Lab Y',
    shortTitle: 'Lab Y',
    stratum: 'formal',
    href: 'https://example.org/base/en/lab/y/',
    concepts: [cid('logistic-map')],
  },
];
const per = <T>(f: (l: Locale) => T) => ({ 'pt-BR': f('pt-BR'), en: f('en') });

const doc: JsonLdDocument = toJsonLd(o.graph, {
  documentIri: DOC,
  pageIri,
  schemeTitle: per((l) => `title ${l}`),
  schemeDescription: per((l) => `description ${l}`),
  strataLabels: per((l) => Object.fromEntries(STRATA.map((s) => [s, `${s} ${l}`])) as never),
  categoryLabels: per((l) => Object.fromEntries(CATEGORIES.map((c) => [c, `${c} ${l}`])) as never),
  relationLabels: per((l) => Object.fromEntries(vocabularyProperties().map((p) => [p.name, `${p.name} ${l}`]))),
  stratumPropertyLabel: per((l) => `stratum ${l}`),
  works,
});

describe('JSON-LD export', () => {
  it('expands without errors: every key and @id is an absolute IRI, every literal well-formed', () => {
    const { errors, triples } = expandDocument(doc);
    expect(errors).toEqual([]);
    expect(triples).toBeGreaterThan(500);
  });

  it('declares the relation vocabulary with OWL characteristics and SKOS super-properties', () => {
    const byId = new Map(doc['@graph'].map((n) => [n['@id'], n]));
    const partOf = byId.get(`${DOC}#relation/partOf`);
    expect(partOf?.['@type']).toEqual(['owl:ObjectProperty', 'owl:TransitiveProperty']);
    expect(partOf?.['rdfs:subPropertyOf']).toEqual({ '@id': 'http://www.w3.org/2004/02/skos/core#related' });
    expect(partOf?.['owl:inverseOf']).toEqual({ '@id': `${DOC}#relation/hasPart` });
    expect(byId.get(`${DOC}#relation/contrastsWith`)?.['@type']).toContain('owl:SymmetricProperty');
    expect(byId.get(`${DOC}#category/measure`)?.['rdfs:subClassOf']).toEqual({
      '@id': 'http://www.w3.org/2004/02/skos/core#Concept',
    });
  });

  it('keeps the layers distinct: works are CreativeWorks about concepts, never skos:Concept', () => {
    const nodes = doc['@graph'];
    const workNodes = nodes.filter((n) => n['@id'] === works[0]!.href || n['@id'] === works[2]!.href);
    expect(workNodes.map((n) => n['@type'])).toEqual(['schema:LearningResource', 'schema:ScholarlyArticle']);
    for (const w of workNodes) expect(JSON.stringify(w['@type'])).not.toContain('skos:Concept');
    const essay = nodes.find((n) => n['@id'] === works[0]!.href);
    expect(essay?.['schema:about']).toEqual([{ '@id': `${DOC}#concept/channel` }, { '@id': `${DOC}#concept/entropy` }]);
    expect(essay?.['schema:workTranslation']).toEqual([{ '@id': works[1]!.href }]);
    const entropy = nodes.find((n) => n['@id'] === `${DOC}#concept/entropy`);
    expect(entropy?.['@type']).toEqual(['skos:Concept', 'schema:DefinedTerm', `${DOC}#category/measure`]);
    expect(entropy?.['ft:relation/formalizes']).toEqual([{ '@id': `${DOC}#concept/uncertainty` }]);
  });

  it('round-trips: the decoded entries build the same typed graph (law)', () => {
    const decoded = fromJsonLd(doc, {
      documentIri: DOC,
      slugOfPage: (iri, l) => {
        const m = new RegExp(`/${seg(l)}/c/([^/]+)/$`, 'u').exec(iri);
        return m?.[1] ?? null;
      },
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const rebuilt = buildGraph(decoded.value);
    expect(rebuilt.ok).toBe(true);
    if (!rebuilt.ok) return;
    expect(rebuilt.value.links).toEqual(o.graph.links);
    for (const id of o.graph.ids) {
      const a = o.graph.concepts.get(id)!;
      const b = rebuilt.value.concepts.get(id)!;
      expect({ ...b, relations: [] }).toEqual({ ...a, relations: [] });
    }
    expect(fromJsonLd({}, { documentIri: DOC, slugOfPage: () => null }).ok).toBe(false);
  });
});

describe('graph JSON (node-link)', () => {
  const href = (id: string, l: Locale): string => `/base/${seg(l)}/c/${id}/`;
  const encoded = encodeGraphJson(o, (id, l) => href(id, l));
  const parsed: unknown = JSON.parse(serializeGraphJson(encoded));

  for (const locale of LOCALES) {
    it(`decodes to the same taxonomy and IC as the build (${locale})`, () => {
      const model = decodeGraphJson(parsed, locale);
      expect(model.ok).toBe(true);
      if (!model.ok) return;
      expect(model.value.taxonomy.ids).toEqual(o.taxonomy.ids);
      for (const t of o.taxonomy.ids) {
        expect(model.value.ic.get(t)).toBeCloseTo(o.ic.get(t) ?? -1, 6);
        expect([...(model.value.taxonomy.ancestors.get(t) ?? [])].sort()).toEqual(
          [...(o.taxonomy.ancestors.get(t) ?? [])].sort(),
        );
      }
      expect(model.value.links).toEqual(o.graph.links);
      expect(model.value.concepts.get(cid('entropy'))?.href).toBe(href('entropy', locale));
    });
  }

  it('escapes "<" so the payload can be embedded safely', () => {
    expect(serializeGraphJson(encoded)).not.toContain('<');
  });

  it('searches accent- and case-insensitively', () => {
    const model = decodeGraphJson(parsed, 'pt-BR');
    if (!model.ok) throw new Error(model.error);
    expect(searchConcepts(model.value, 'informacao')).toEqual(
      expect.arrayContaining(['information', 'mutual-information']),
    );
    expect(searchConcepts(model.value, '   ')).toEqual([]);
  });

  it('rejects malformed payloads', () => {
    expect(decodeGraphJson(null, 'en').ok).toBe(false);
    expect(decodeGraphJson({ ...encoded, version: 99 }, 'en').ok).toBe(false);
    expect(decodeGraphJson({ ...encoded, nodes: [{ id: 'x' }] }, 'en').ok).toBe(false);
    expect(
      decodeGraphJson({ ...encoded, edges: [{ source: 'entropy', target: 'nope', type: 'broader' }] }, 'en').ok,
    ).toBe(false);
  });
});
