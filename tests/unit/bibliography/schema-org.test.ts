/**
 * schema.org `citation` objects (src/core/bibliography/schema-org.ts), DOI link
 * targets, and the JSON-LD the citations stage exports in frontmatter.
 */
import { describe, expect, it } from 'vitest';
import { schemaCitations, toSchemaOrg, type SchemaNode } from '../../../src/core/bibliography/schema-org.ts';
import { toHtml } from '../../../src/core/bibliography/render/inline.ts';
import { abnt } from '../../../src/core/bibliography/style/abnt.ts';
import { apa } from '../../../src/core/bibliography/style/apa.ts';
import { doiHref } from '../../../src/core/bibliography/style/shared.ts';
import { MAIN_BIB_PATH, loadIndex, ref, render } from './helpers.ts';

const main = loadIndex(MAIN_BIB_PATH, 'main.bib');

describe('toSchemaOrg', () => {
  it('describes an article as a ScholarlyArticle inside issue → volume → periodical', () => {
    expect(toSchemaOrg(ref('shannon1949', main))).toEqual({
      '@type': 'ScholarlyArticle',
      '@id': 'https://doi.org/10.1109/JRPROC.1949.232969',
      name: 'Communication in the presence of noise',
      author: [{ '@type': 'Person', name: 'Claude Elwood Shannon', givenName: 'Claude Elwood', familyName: 'Shannon' }],
      datePublished: '1949-01',
      inLanguage: 'en',
      identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: '10.1109/JRPROC.1949.232969' },
      url: 'https://doi.org/10.1109/JRPROC.1949.232969',
      isPartOf: {
        '@type': 'PublicationIssue',
        issueNumber: '1',
        isPartOf: {
          '@type': 'PublicationVolume',
          volumeNumber: '37',
          isPartOf: { '@type': 'Periodical', name: 'Proceedings of the IRE' },
        },
      },
      pageStart: '10',
      pageEnd: '21',
    });
  });

  it('keeps two page ranges as pagination and skips missing levels of the periodical chain', () => {
    expect(toSchemaOrg(ref('shannon1948', main))).toMatchObject({ pagination: '379-423, 623-656' });
    const whittaker = toSchemaOrg(ref('whittaker1915', main));
    expect(whittaker['isPartOf']).toEqual({
      '@type': 'PublicationVolume',
      volumeNumber: '35',
      isPartOf: { '@type': 'Periodical', name: 'Proceedings of the Royal Society of Edinburgh' },
    });
  });

  it('describes books, chapters, papers, theses, reports, web pages and software', () => {
    const types = (keys: readonly string[]): readonly string[] => keys.map((k) => toSchemaOrg(ref(k, main))['@type']);
    expect(types(['cover2006', 'weaver1949', 'lin1998', 'liang1983', 'king2019'])).toEqual([
      'Book',
      'Chapter',
      'ScholarlyArticle',
      'Thesis',
      'WebPage',
    ]);
    expect(toSchemaOrg(ref('knuth1977'))).toMatchObject({
      '@type': 'Report',
      reportNumber: 'STAN-CS-77-000',
      publisher: {
        '@type': 'Organization',
        name: 'Stanford University',
        location: { '@type': 'Place', name: 'Stanford' },
      },
    });
    expect(toSchemaOrg(ref('tool2020'))).toMatchObject({ '@type': 'SoftwareApplication', softwareVersion: '1.2' });
    expect(toSchemaOrg(ref('cover2006', main))).toMatchObject({
      bookEdition: '2',
      publisher: { name: 'Wiley-Interscience', location: { name: 'Hoboken, NJ' } },
    });
    expect(toSchemaOrg(ref('weaver1949', main))).toMatchObject({
      isPartOf: {
        '@type': 'Book',
        name: 'The mathematical theory of communication',
        author: [{ familyName: 'Shannon' }, { familyName: 'Weaver' }],
      },
      pageStart: '95',
      pageEnd: '117',
    });
    expect(toSchemaOrg(ref('liang1983', main))).toMatchObject({
      inSupportOf: 'PhD',
      publisher: { name: 'Stanford University' },
    });
  });

  it('describes corporate authors as organisations and particles as part of the family name', () => {
    expect(toSchemaOrg(ref('w3c2023', main))['author']).toEqual([
      { '@type': 'Organization', name: 'World Wide Web Consortium' },
    ]);
    expect(toSchemaOrg(ref('saussure1916', main))['author']).toEqual([
      { '@type': 'Person', name: 'Ferdinand de Saussure', givenName: 'Ferdinand', familyName: 'de Saussure' },
    ]);
  });

  it('emits JSON only (no undefined, no empty arrays)', () => {
    const walk = (v: unknown): void => {
      expect(v).not.toBeUndefined();
      if (Array.isArray(v)) {
        expect(v.length).toBeGreaterThan(0);
        v.forEach(walk);
      } else if (typeof v === 'object' && v !== null) Object.values(v).forEach(walk);
    };
    for (const key of main.keys) {
      const n: SchemaNode = toSchemaOrg(ref(key, main));
      walk(n);
      expect(JSON.parse(JSON.stringify(n))).toEqual(n);
    }
    expect(schemaCitations([ref('shannon1948', main), ref('may1976', main)]).map((n) => n['name'])).toEqual([
      'A mathematical theory of communication',
      'Simple mathematical models with very complicated dynamics',
    ]);
  });
});

describe('DOI link targets (DOI Handbook §2.5.2.4)', () => {
  it('percent-encodes characters that are not URL code points, but prints the DOI as registered', () => {
    const doi = '10.1175/1520-0469(1963)020<0130:DNF>2.0.CO;2';
    expect(doiHref(doi)).toBe('https://doi.org/10.1175/1520-0469(1963)020%3C0130:DNF%3E2.0.CO;2');
    expect(doiHref('10.1000/a#b?c')).toBe('https://doi.org/10.1000/a%23b%3Fc');
    const lorenz = ref('lorenz1963', main);
    for (const html of [toHtml(abnt.reference(lorenz, '')), toHtml(apa.reference(lorenz, ''))]) {
      expect(html).toContain(
        '<a href="https://doi.org/10.1175/1520-0469(1963)020%3C0130:DNF%3E2.0.CO;2">https://doi.org/10.1175/1520-0469(1963)020&lt;0130:DNF&gt;2.0.CO;2</a>',
      );
    }
  });
});

describe('frontmatter.citationJsonLd (citations stage)', () => {
  it('exports the cited works as schema.org nodes, in order of first use', () => {
    const r = render('[@shannon1949] e [@shannon1948; @shannon1949].', 'pt-BR', main);
    expect(r.frontmatter['citations']).toEqual(['shannon1949', 'shannon1948']);
    expect(r.frontmatter['citationJsonLd']).toEqual([
      toSchemaOrg(ref('shannon1949', main)),
      toSchemaOrg(ref('shannon1948', main)),
    ]);
  });

  it('exports an empty list when nothing is cited', () => {
    expect(render('Sem citações.').frontmatter['citationJsonLd']).toEqual([]);
  });
});
