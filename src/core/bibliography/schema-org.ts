/**
 * References → schema.org `citation` objects (pure; JSON-LD, W3C JSON-LD 1.1).
 *
 * A page that cites works can describe them for machines as the `citation`
 * property of its own CreativeWork (https://schema.org/citation). Each
 * reference type maps onto the closest schema.org type:
 *
 *   article        → ScholarlyArticle, isPartOf PublicationIssue → PublicationVolume
 *                    → Periodical (the nesting recommended by schema.org's
 *                    "periodicals" extension, https://schema.org/PublicationIssue)
 *   inproceedings  → ScholarlyArticle, isPartOf the proceedings (Book)
 *   chapter        → Chapter, isPartOf the host Book
 *   book           → Book (bookEdition, publisher, series as BookSeries)
 *   thesis         → Thesis (inSupportOf the degree, publisher = institution)
 *   report         → Report (reportNumber, publisher = institution)
 *   online         → WebPage, isPartOf WebSite (the site name)
 *   software       → SoftwareApplication (softwareVersion)
 *
 * Common properties: name (title and subtitle joined by ": "), author, editor,
 * translator (Person with givenName/familyName, or Organization), datePublished
 * (ISO 8601, reduced precision allowed: "1948-07"), inLanguage (BCP 47),
 * identifier (PropertyValue propertyID "DOI"), url, and @id = the DOI resolver
 * URL when there is a DOI. Only data present in the reference is emitted;
 * nothing is guessed.
 */
import type { MarkedText } from './bibtex/latex.ts';
import type { Name, NameList } from './bibtex/names.ts';
import type { Edition, Imprint, Interval, Reference, Series, Title } from './model/reference.ts';
import { absurd } from '../algebra/match.ts';
import { doiHref, issuedIso } from './style/shared.ts';

export type JsonValue = string | number | boolean | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** A JSON-LD node object of a schema.org type. */
export type SchemaNode = { readonly '@type': string; readonly [key: string]: JsonValue };

export const SCHEMA_CONTEXT = 'https://schema.org';

/** Drops undefined members (JSON has no undefined) and empty arrays. */
const node = (type: string, props: Readonly<Record<string, JsonValue | undefined>>): SchemaNode => {
  const out: Record<string, JsonValue> = { '@type': type };
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as SchemaNode;
};

const plain = (m: MarkedText | undefined): string | undefined => m?.text;

const titleText = (t: Title): string => (t.sub === undefined ? t.main.text : `${t.main.text}: ${t.sub.text}`);

const agent = (n: Name): SchemaNode => {
  if (n.kind === 'corporate') return node('Organization', { name: n.name.text });
  const familyName = [n.particle?.text, n.family.text].filter((s) => s !== undefined).join(' ');
  return node('Person', {
    name: [n.given?.text, familyName, n.suffix?.text].filter((s) => s !== undefined).join(' '),
    givenName: plain(n.given),
    familyName,
    honorificSuffix: plain(n.suffix),
  });
};

const agents = (list: NameList): readonly SchemaNode[] => list.names.map(agent);

const organization = (name: MarkedText | undefined, place?: MarkedText): SchemaNode | undefined =>
  name === undefined
    ? undefined
    : node('Organization', {
        name: name.text,
        location: place === undefined ? undefined : node('Place', { name: place.text }),
      });

const publisher = (im: Imprint): SchemaNode | undefined => organization(im.publisher, im.place);

const edition = (e: Edition | undefined): string | undefined =>
  e === undefined ? undefined : e.kind === 'ordinal' ? String(e.n) : e.text.text;

const series = (s: Series | undefined): SchemaNode | undefined =>
  s === undefined ? undefined : node('BookSeries', { name: s.title.text, position: s.number });

/** pageStart/pageEnd for one interval; `pagination` for anything else (379-423, 623-656). */
const pages = (is: readonly Interval[] | undefined): Readonly<Record<string, string | undefined>> => {
  if (is === undefined) return {};
  const only = is.length === 1 ? is[0] : undefined;
  if (only !== undefined) return { pageStart: only.first, pageEnd: only.last };
  return { pagination: is.map((i) => (i.last === undefined ? i.first : `${i.first}-${i.last}`)).join(', ') };
};

/** The periodical chain: issue → volume → periodical, keeping only the levels that exist. */
const periodical = (ref: Extract<Reference, { type: 'article' }>): SchemaNode => {
  const journal = node('Periodical', { name: titleText(ref.journal) });
  const volume =
    ref.volume === undefined ? journal : node('PublicationVolume', { volumeNumber: ref.volume, isPartOf: journal });
  return ref.number === undefined ? volume : node('PublicationIssue', { issueNumber: ref.number, isPartOf: volume });
};

/** The schema.org description of one reference. */
export const toSchemaOrg = (ref: Reference): SchemaNode => {
  const common: Readonly<Record<string, JsonValue | undefined>> = {
    '@id': ref.doi === undefined ? undefined : doiHref(ref.doi),
    name: titleText(ref.title),
    author: agents(ref.authors),
    translator: agents(ref.translators),
    datePublished: issuedIso(ref.issued),
    inLanguage: ref.language,
    identifier: ref.doi === undefined ? undefined : node('PropertyValue', { propertyID: 'DOI', value: ref.doi }),
    url: ref.url ?? (ref.doi === undefined ? undefined : doiHref(ref.doi)),
  };
  switch (ref.type) {
    case 'article':
      return node('ScholarlyArticle', { ...common, isPartOf: periodical(ref), ...pages(ref.pages) });
    case 'inproceedings':
      return node('ScholarlyArticle', {
        ...common,
        isPartOf: node('Book', {
          name: titleText(ref.container),
          editor: agents(ref.editors),
          publisher: publisher(ref.imprint),
          datePublished: issuedIso(ref.issued),
        }),
        ...pages(ref.pages),
      });
    case 'chapter':
      return node('Chapter', {
        ...common,
        isPartOf: node('Book', {
          name: titleText(ref.container),
          author: agents(ref.bookAuthors),
          editor: agents(ref.editors),
          bookEdition: edition(ref.edition),
          publisher: publisher(ref.imprint),
          isPartOf: series(ref.series),
          datePublished: issuedIso(ref.issued),
        }),
        ...pages(ref.pages),
      });
    case 'book':
      return node('Book', {
        ...common,
        editor: agents(ref.editors),
        bookEdition: edition(ref.edition),
        publisher: publisher(ref.imprint),
        isPartOf: series(ref.series),
      });
    case 'thesis':
      return node('Thesis', {
        ...common,
        inSupportOf: ref.thesisType?.text ?? (ref.degree === 'phd' ? 'PhD' : "Master's degree"),
        publisher: organization(ref.institution, ref.place),
      });
    case 'report':
      return node('Report', {
        ...common,
        reportNumber: ref.number,
        publisher: organization(ref.institution, ref.place),
      });
    case 'online':
      return node('WebPage', {
        ...common,
        editor: agents(ref.editors),
        version: ref.version,
        isPartOf: ref.site === undefined ? undefined : node('WebSite', { name: ref.site.text }),
        publisher: publisher(ref.imprint),
      });
    case 'software':
      return node('SoftwareApplication', {
        ...common,
        softwareVersion: ref.version,
        publisher: publisher(ref.imprint),
      });
    default:
      return absurd(ref);
  }
};

/** The `citation` array of a page: one node per cited work, in the order given (first use). */
export const schemaCitations = (refs: readonly Reference[]): readonly SchemaNode[] => refs.map(toSchemaOrg);
