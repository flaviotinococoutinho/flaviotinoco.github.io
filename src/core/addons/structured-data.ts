/**
 * Structured data of the pages (schema.org in JSON-LD 1.1; pure builders).
 *
 * Every page carries one graph (src/layouts/BaseLayout.astro → <JsonLd>):
 *
 *   WebSite  @id <site>#website   name, url, inLanguage [pt-BR, en], publisher → Person
 *   Person   @id <site>#author    the author (givenName/familyName), url = the "about" page
 *   + the page's own node:
 *     essays          ScholarlyArticle (headline, alternativeHeadline, author, datePublished,
 *                     dateModified, inLanguage, isPartOf → WebSite, abstract, keywords,
 *                     about → DefinedTerm nodes whose @id is the concept page URL,
 *                     citation → the works cited (frontmatter.citationJsonLd of the
 *                     citation stage), workTranslation / translationOfWork, wordCount, image)
 *     other pages     WebPage (name, description, inLanguage, isPartOf, image)
 *                     + BreadcrumbList (home → … → page), referenced by `breadcrumb`
 *
 * @ids are absolute URLs (W3C JSON-LD 1.1 §3.3 node identifiers), so nodes of
 * different pages that describe the same thing (the site, its author, a concept)
 * merge in a consumer's graph. Translation direction: the version published first
 * is the original (`workTranslation` points from it to the other one,
 * `translationOfWork` back); on the same date the default locale (pt-BR) is the
 * original — the site's working language.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../domain/locale.ts';
import type { JsonLdValue } from '../web/json-ld.ts';

export type JsonLdNode = { readonly [key: string]: JsonLdValue };

/** Drops undefined members and empty arrays (JSON has no undefined; an empty list says nothing). */
const compact = (props: Readonly<Record<string, JsonLdValue | undefined>>): JsonLdNode => {
  const out: Record<string, JsonLdValue> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out;
};

export type SiteIdentity = {
  /** Absolute URL of the site root (the base path), ending with "/". */
  readonly root: string;
  readonly name: string;
  readonly description: string;
  readonly locale: Locale;
  readonly author: { readonly given: string; readonly family: string };
  /** Absolute URL of the author's page (the "about" page of the current locale). */
  readonly authorUrl: string;
};

export const websiteId = (root: string): string => `${root}#website`;
export const authorId = (root: string): string => `${root}#author`;

const ref = (id: string): JsonLdNode => ({ '@id': id });

/** ISO 8601 calendar date of a Date read as UTC ("2026-05-03"). */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export const websiteNode = (site: SiteIdentity): JsonLdNode => ({
  '@type': 'WebSite',
  '@id': websiteId(site.root),
  url: site.root,
  name: site.name,
  description: site.description,
  inLanguage: [...LOCALES],
  publisher: ref(authorId(site.root)),
});

export const personNode = (site: SiteIdentity): JsonLdNode => ({
  '@type': 'Person',
  '@id': authorId(site.root),
  name: `${site.author.given} ${site.author.family}`,
  givenName: site.author.given,
  familyName: site.author.family,
  url: site.authorUrl,
});

export type ConceptRef = { readonly url: string; readonly name: string };

export type ArticleData = {
  readonly url: string;
  readonly headline: string;
  readonly alternativeHeadline?: string;
  readonly description: string;
  readonly abstract?: string;
  readonly keywords: readonly string[];
  readonly published: Date;
  readonly modified: Date;
  readonly locale: Locale;
  readonly about: readonly ConceptRef[];
  readonly citation: readonly JsonLdValue[];
  readonly wordCount?: number;
  readonly image?: string;
  /** The other language version of the same work, if any. */
  readonly translation?: { readonly url: string; readonly locale: Locale; readonly published: Date };
};

/** Whether `a` (this version) is the original of the pair (published first; ties → the default locale). */
export const isOriginal = (
  self: { readonly locale: Locale; readonly published: Date },
  other: { readonly locale: Locale; readonly published: Date },
): boolean => {
  const d = self.published.valueOf() - other.published.valueOf();
  return d !== 0 ? d < 0 : self.locale === DEFAULT_LOCALE;
};

export const scholarlyArticleNode = (site: SiteIdentity, a: ArticleData): JsonLdNode => {
  const translation =
    a.translation === undefined
      ? {}
      : isOriginal({ locale: a.locale, published: a.published }, a.translation)
        ? {
            workTranslation: {
              '@type': 'ScholarlyArticle',
              '@id': a.translation.url,
              inLanguage: a.translation.locale,
            },
          }
        : {
            translationOfWork: {
              '@type': 'ScholarlyArticle',
              '@id': a.translation.url,
              inLanguage: a.translation.locale,
            },
          };
  return compact({
    '@type': 'ScholarlyArticle',
    '@id': a.url,
    url: a.url,
    mainEntityOfPage: a.url,
    headline: a.headline,
    alternativeHeadline: a.alternativeHeadline,
    description: a.description,
    abstract: a.abstract,
    keywords: a.keywords.length === 0 ? undefined : a.keywords.join(', '),
    author: ref(authorId(site.root)),
    publisher: ref(authorId(site.root)),
    datePublished: isoDay(a.published),
    dateModified: isoDay(a.modified),
    inLanguage: a.locale,
    isPartOf: ref(websiteId(site.root)),
    about: a.about.map((c) => ({ '@type': 'DefinedTerm', '@id': c.url, name: c.name, url: c.url })),
    citation: [...a.citation],
    wordCount: a.wordCount,
    image: a.image,
    ...translation,
  });
};

export type Crumb = { readonly name: string; readonly url: string };

export const breadcrumbId = (url: string): string => `${url}#breadcrumb`;

/** BreadcrumbList (https://schema.org/BreadcrumbList): positions start at 1. */
export const breadcrumbNode = (pageUrl: string, crumbs: readonly Crumb[]): JsonLdNode => ({
  '@type': 'BreadcrumbList',
  '@id': breadcrumbId(pageUrl),
  itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
});

export type WebPageData = {
  readonly url: string;
  readonly name: string;
  readonly description: string;
  readonly locale: Locale;
  readonly image?: string;
  /** Home → … → this page; when present a BreadcrumbList is emitted and referenced. */
  readonly crumbs?: readonly Crumb[];
  /** A more specific WebPage type (AboutPage, CollectionPage…). */
  readonly type?: 'WebPage' | 'AboutPage' | 'CollectionPage';
};

/** WebPage (+ its BreadcrumbList when crumbs are given). */
export const webPageNodes = (site: SiteIdentity, p: WebPageData): readonly JsonLdNode[] => {
  const crumbs = p.crumbs ?? [];
  const page = compact({
    '@type': p.type ?? 'WebPage',
    '@id': p.url,
    url: p.url,
    name: p.name,
    description: p.description,
    inLanguage: p.locale,
    isPartOf: ref(websiteId(site.root)),
    image: p.image,
    breadcrumb: crumbs.length > 0 ? ref(breadcrumbId(p.url)) : undefined,
  });
  return crumbs.length > 0 ? [page, breadcrumbNode(p.url, crumbs)] : [page];
};

/** The graph of a page: the site and its author, then the page's own nodes. */
export const pageGraph = (site: SiteIdentity, own: readonly JsonLdNode[]): readonly JsonLdNode[] => [
  websiteNode(site),
  personNode(site),
  ...own,
];

/**
 * Parses an untyped value (frontmatter exported by a Markdown stage) into a JSON
 * value: plain objects, arrays, strings, finite numbers, booleans and null only.
 */
export const parseJsonLdValue = (v: unknown, path = '$'): Result<JsonLdValue, string> => {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return ok(v);
  if (typeof v === 'number') return Number.isFinite(v) ? ok(v) : err(`${path}: ${show(v)} is not a finite number`);
  if (Array.isArray(v)) {
    const out: JsonLdValue[] = [];
    for (const [i, x] of (v as readonly unknown[]).entries()) {
      const r = parseJsonLdValue(x, `${path}[${i}]`);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return ok(out);
  }
  const proto: unknown = typeof v === 'object' ? Object.getPrototypeOf(v) : undefined;
  if (typeof v === 'object' && (proto === Object.prototype || proto === null)) {
    const out: Record<string, JsonLdValue> = {};
    for (const [k, x] of Object.entries(v)) {
      const r = parseJsonLdValue(x, `${path}.${k}`);
      if (!r.ok) return r;
      out[k] = r.value;
    }
    return ok(out);
  }
  return err(`${path}: ${show(v)} is not a JSON value`);
};

/** A list of JSON values (e.g. frontmatter.citationJsonLd); absence is the empty list. */
export const parseJsonLdList = (v: unknown): Result<readonly JsonLdValue[], string> => {
  if (v === undefined) return ok([]);
  if (!Array.isArray(v)) return err(`expected a list of JSON-LD nodes, got ${show(v)}`);
  const out: JsonLdValue[] = [];
  for (const [i, x] of (v as readonly unknown[]).entries()) {
    const r = parseJsonLdValue(x, `$[${i}]`);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return ok(out);
};
