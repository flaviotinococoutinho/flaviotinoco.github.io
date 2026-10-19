/**
 * Structured data (schema.org JSON-LD): structural tests of the page graph —
 * shared @ids for the site and its author, the ScholarlyArticle of an essay,
 * translation direction, breadcrumbs — and the parser of untyped frontmatter.
 * No network: the vocabulary is checked by shape, not against schema.org.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  authorId,
  breadcrumbId,
  isOriginal,
  pageGraph,
  parseJsonLdList,
  parseJsonLdValue,
  scholarlyArticleNode,
  webPageNodes,
  websiteId,
  type ArticleData,
  type JsonLdNode,
  type SiteIdentity,
} from '../../../src/core/addons/structured-data.ts';
import { jsonLdGraph, serializeJsonLd, type JsonLdValue } from '../../../src/core/web/json-ld.ts';

const ROOT = 'https://example.org/site/';
const site: SiteIdentity = {
  root: ROOT,
  name: 'Flávio Tinoco',
  description: 'Ensaios.',
  locale: 'pt-BR',
  author: { given: 'Flávio', family: 'Tinoco' },
  authorUrl: `${ROOT}pt/sobre/`,
};

const article: ArticleData = {
  url: `${ROOT}pt/ensaios/a/`,
  headline: 'Título',
  alternativeHeadline: 'subtítulo',
  description: 'Descrição.',
  abstract: 'Resumo.',
  keywords: ['informação', 'signo'],
  published: new Date('2026-05-03T00:00:00Z'),
  modified: new Date('2026-06-01T00:00:00Z'),
  locale: 'pt-BR',
  about: [{ url: `${ROOT}pt/conceitos/entropia/`, name: 'Entropia' }],
  citation: [{ '@type': 'Book', name: 'Livro' }],
  wordCount: 1234,
  image: `${ROOT}og/pt/ensaios/a.png`,
  translation: { url: `${ROOT}en/essays/a/`, locale: 'en', published: new Date('2026-05-03T00:00:00Z') },
};

const field = (node: JsonLdNode, key: string): JsonLdValue | undefined => node[key];

describe('the graph of every page', () => {
  const graph = pageGraph(site, []);

  it('starts with the WebSite and the Person, linked by @id', () => {
    const [website, person] = graph;
    expect(website).toMatchObject({ '@type': 'WebSite', '@id': websiteId(ROOT), url: ROOT, name: 'Flávio Tinoco' });
    expect(website?.['publisher']).toEqual({ '@id': authorId(ROOT) });
    expect(website?.['inLanguage']).toEqual(['pt-BR', 'en']);
    expect(person).toMatchObject({
      '@type': 'Person',
      '@id': authorId(ROOT),
      name: 'Flávio Tinoco',
      givenName: 'Flávio',
      familyName: 'Tinoco',
      url: site.authorUrl,
    });
  });

  it('serialises to one JSON-LD document with @context and @graph that parses back', () => {
    const doc = jsonLdGraph(
      pageGraph(site, webPageNodes(site, { url: ROOT, name: 'x', description: 'y', locale: 'pt-BR' })),
    );
    const parsed = JSON.parse(serializeJsonLd(doc)) as Record<string, unknown>;
    expect(parsed['@context']).toBe('https://schema.org');
    expect(Array.isArray(parsed['@graph'])).toBe(true);
  });
});

describe('ScholarlyArticle', () => {
  const node = scholarlyArticleNode(site, article);

  it('carries the bibliographic fields of the essay', () => {
    expect(node).toMatchObject({
      '@type': 'ScholarlyArticle',
      '@id': article.url,
      headline: 'Título',
      alternativeHeadline: 'subtítulo',
      abstract: 'Resumo.',
      keywords: 'informação, signo',
      datePublished: '2026-05-03',
      dateModified: '2026-06-01',
      inLanguage: 'pt-BR',
      wordCount: 1234,
      image: article.image,
    });
    expect(field(node, 'author')).toEqual({ '@id': authorId(ROOT) });
    expect(field(node, 'isPartOf')).toEqual({ '@id': websiteId(ROOT) });
  });

  it('names its concepts as DefinedTerm nodes whose @id is the concept page', () => {
    expect(field(node, 'about')).toEqual([
      {
        '@type': 'DefinedTerm',
        '@id': `${ROOT}pt/conceitos/entropia/`,
        name: 'Entropia',
        url: `${ROOT}pt/conceitos/entropia/`,
      },
    ]);
  });

  it('cites the works of the citation stage unchanged', () => {
    expect(field(node, 'citation')).toEqual([{ '@type': 'Book', name: 'Livro' }]);
  });

  it('points from the original to the translation, and back', () => {
    expect(field(node, 'workTranslation')).toEqual({
      '@type': 'ScholarlyArticle',
      '@id': `${ROOT}en/essays/a/`,
      inLanguage: 'en',
    });
    expect(field(node, 'translationOfWork')).toBeUndefined();
    const en = scholarlyArticleNode(site, {
      ...article,
      url: `${ROOT}en/essays/a/`,
      locale: 'en',
      translation: { url: article.url, locale: 'pt-BR', published: article.published },
    });
    expect(field(en, 'translationOfWork')).toEqual({
      '@type': 'ScholarlyArticle',
      '@id': article.url,
      inLanguage: 'pt-BR',
    });
    expect(field(en, 'workTranslation')).toBeUndefined();
  });

  it('the earlier version is the original; on the same day, the default locale', () => {
    const d = (s: string) => new Date(`${s}T00:00:00Z`);
    expect(
      isOriginal({ locale: 'en', published: d('2026-01-01') }, { locale: 'pt-BR', published: d('2026-02-01') }),
    ).toBe(true);
    expect(
      isOriginal({ locale: 'pt-BR', published: d('2026-03-01') }, { locale: 'en', published: d('2026-02-01') }),
    ).toBe(false);
    expect(
      isOriginal({ locale: 'pt-BR', published: d('2026-01-01') }, { locale: 'en', published: d('2026-01-01') }),
    ).toBe(true);
    expect(
      isOriginal({ locale: 'en', published: d('2026-01-01') }, { locale: 'pt-BR', published: d('2026-01-01') }),
    ).toBe(false);
  });

  it('leaves out what the essay does not have (no empty lists, no undefined)', () => {
    const bare = scholarlyArticleNode(site, {
      url: article.url,
      headline: 'T',
      description: 'D',
      keywords: [],
      published: article.published,
      modified: article.published,
      locale: 'pt-BR',
      about: [],
      citation: [],
    });
    for (const key of [
      'about',
      'citation',
      'keywords',
      'abstract',
      'alternativeHeadline',
      'workTranslation',
      'translationOfWork',
      'wordCount',
      'image',
    ])
      expect(bare, key).not.toHaveProperty(key);
    expect(JSON.parse(JSON.stringify(bare))).toEqual(bare);
  });
});

describe('WebPage and BreadcrumbList', () => {
  it('numbers the crumbs from 1 and references the list from the page', () => {
    const url = `${ROOT}pt/estratos/formal/`;
    const [page, crumbs] = webPageNodes(site, {
      url,
      name: 'Formal',
      description: 'D',
      locale: 'pt-BR',
      crumbs: [
        { name: 'Início', url: `${ROOT}pt/` },
        { name: 'Formal', url },
      ],
    });
    expect(page).toMatchObject({
      '@type': 'WebPage',
      '@id': url,
      inLanguage: 'pt-BR',
      breadcrumb: { '@id': breadcrumbId(url) },
    });
    expect(crumbs).toEqual({
      '@type': 'BreadcrumbList',
      '@id': breadcrumbId(url),
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Início', item: `${ROOT}pt/` },
        { '@type': 'ListItem', position: 2, name: 'Formal', item: url },
      ],
    });
  });

  it('emits no breadcrumb without crumbs', () => {
    const nodes = webPageNodes(site, { url: ROOT, name: 'x', description: 'y', locale: 'en', type: 'AboutPage' });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ '@type': 'AboutPage' });
    expect(nodes[0]).not.toHaveProperty('breadcrumb');
  });
});

describe('parsing untyped frontmatter into JSON-LD', () => {
  test.prop([fc.jsonValue()])('accepts every JSON value unchanged', (v) => {
    expect(parseJsonLdValue(v)).toEqual({ ok: true, value: v });
  });

  it('rejects what JSON cannot represent', () => {
    expect(parseJsonLdValue(Number.NaN).ok).toBe(false);
    expect(parseJsonLdValue({ a: () => 1 }).ok).toBe(false);
    expect(parseJsonLdValue([new Date(0)]).ok).toBe(false);
    expect(parseJsonLdValue(undefined).ok).toBe(false);
  });

  it('reads a list, the absent list as empty, and refuses a non-list', () => {
    expect(parseJsonLdList(undefined)).toEqual({ ok: true, value: [] });
    expect(parseJsonLdList([{ a: 1 }])).toEqual({ ok: true, value: [{ a: 1 }] });
    expect(parseJsonLdList({ a: 1 }).ok).toBe(false);
    expect(parseJsonLdList([1, Number.POSITIVE_INFINITY]).ok).toBe(false);
  });
});
