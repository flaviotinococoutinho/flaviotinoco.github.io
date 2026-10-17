/**
 * Reference model → BibTeX (biblatex dialect) — the inverse of the parser (pure).
 *
 * Law (tests/unit/bibliography/encode.test.ts, over the whole seed bibliography
 * and the fixtures): toReference(parse(toBibtex(r))) = r — every field, every
 * case-protected and italic span. It is what a "download the references of this
 * page (.bib)" link serves, and it proves the model loses nothing of what it
 * read.
 *
 * Encoding of marked text (bibtex/latex.ts is the decoder):
 *   - the LaTeX special characters become commands that BibTeX accepts even
 *     when unbalanced (\textbraceleft{}, \textbackslash{}…; Lamport, "LaTeX",
 *     1994, §2.2.1 and textcomp), "--" is broken as "-{}-" so TeX does not
 *     ligate it into an en dash (TeXbook ch. 2);
 *   - case-protected spans are brace groups (Patashnik, "BibTeXing", 1988, §4);
 *     a group that would start with "\" gets an empty group first, since
 *     "{\…" is a special character, not a protection;
 *   - italic spans are \emph{…}, with the protected pieces nested inside: \emph{{KOS} book}.
 */
import { absurd } from '../../algebra/match.ts';
import type { Edition, EditorRole, Issued, Reference, Title } from '../model/reference.ts';
import type { MarkedText } from './latex.ts';
import type { Name, NameList } from './names.ts';

/**
 * Escapes text so that the decoder yields it back unchanged. TeX's quote
 * ligatures (' ` → ’ ‘) are left alone: in BibTeX that is what they mean, and
 * text decoded from a .bib never contains them.
 */
export const escapeBibtex = (s: string): string =>
  s
    .replace(/[\\{}%&#$_~^]/gu, (c) => {
      switch (c) {
        case '\\':
          return '\\textbackslash{}';
        case '~':
          return '\\textasciitilde{}';
        case '^':
          return '\\textasciicircum{}';
        // BibTeX counts braces even after a backslash, so "\{" alone would unbalance the value.
        case '{':
          return '\\textbraceleft{}';
        case '}':
          return '\\textbraceright{}';
        default:
          return `\\${c}`;
      }
    })
    .replace(/-(?=-)/gu, '-{}');

/** A protecting group; "{\\…" would be a special character, so an empty group goes first. */
const group = (body: string): string => `{${body.startsWith('\\') ? '{}' : ''}${body}}`;

/** Text in [from, to) with its case-protected pieces (clipped to the interval) as groups. */
const withProtection = (m: MarkedText, from: number, to: number): string => {
  let out = '';
  let at = from;
  for (const r of m.protected) {
    const start = Math.max(r.start, from);
    const end = Math.min(r.end, to);
    if (end <= start) continue;
    out += escapeBibtex(m.text.slice(at, start)) + group(escapeBibtex(m.text.slice(start, end)));
    at = end;
  }
  return out + escapeBibtex(m.text.slice(at, to));
};

/**
 * Marked text → a BibTeX value body (without the outer delimiters). Italic spans
 * are the outer structure (\emph{…}, whose argument the decoder reads on its
 * own) and protected pieces nest inside them; a protected span that crosses an
 * italic boundary is cut there, which is harmless: the decoder merges adjacent
 * protected pieces back into one span. Decoded italic spans never begin or end
 * with a space, so no space is ever lost at the edge of an argument.
 */
export const encodeMarked = (m: MarkedText): string => {
  let out = '';
  let at = 0;
  for (const r of m.italic) {
    out += `${withProtection(m, at, r.start)}\\emph{${withProtection(m, r.start, r.end)}}`;
    at = r.end;
  }
  return out + withProtection(m, at, m.text.length);
};

/** A part of a name: a no-break space is written as the tie "~" (the name splitter reads other spaces as word breaks). */
const namePart = (m: MarkedText): string => {
  const body = encodeMarked(m).replace(/\u00A0/gu, '~');
  // "and" or a comma inside a part would split the list or the name: keep the part one unit.
  return /(?:^|\s)and(?:\s|$)|,/iu.test(m.text) ? `{${body}}` : body;
};

const encodeName = (n: Name): string => {
  if (n.kind === 'corporate') return `{${encodeMarked(n.name).replace(/\u00A0/gu, '~')}}`;
  const family = namePart(n.family);
  // A surname that starts in lower case would be read as a "von" particle.
  const last = /^\p{Ll}/u.test(n.family.text) ? `{${family}}` : family;
  const von = n.particle === undefined ? '' : `${namePart(n.particle)} `;
  const given = n.given === undefined ? undefined : namePart(n.given);
  const suffix = n.suffix === undefined ? undefined : namePart(n.suffix);
  // "von Last, Jr, First" (or "von Last, First"; or "von Last" alone) — Patashnik §4.
  if (suffix !== undefined) return `${von}${last}, ${suffix}, ${given ?? ''}`;
  return given === undefined ? `${von}${last}` : `${von}${last}, ${given}`;
};

export const encodeNames = (list: NameList): string =>
  [...list.names.map(encodeName), ...(list.others ? ['others'] : [])].join(' and ');

const iso = (year: number, month?: number, day?: number): string =>
  [
    String(year).padStart(4, '0'),
    ...(month === undefined ? [] : [String(month).padStart(2, '0')]),
    ...(month !== undefined && day !== undefined ? [String(day).padStart(2, '0')] : []),
  ].join('-');

/** Date of issue as `year` (+ `month`) or as an ISO 8601 / EDTF `date` (model/from-entry.ts reads both). */
const dateFields = (d: Issued): readonly (readonly [string, string])[] => {
  if (d.inferred === true)
    return [['year', `[${d.year}]`], ...(d.month === undefined ? [] : [['month', String(d.month)] as const])];
  if (d.endMonth !== undefined) return [['date', `${iso(d.year, d.month)}/${iso(d.endYear ?? d.year, d.endMonth)}`]];
  // A span of years with one month (year = {1931--1958}, month = 3) has no EDTF form: keep the two fields.
  if (d.endYear !== undefined)
    return [
      ['year', `${d.year}--${d.endYear}`],
      ...(d.month === undefined ? [] : [['month', String(d.month)] as const]),
    ];
  if (d.month !== undefined) return [['date', iso(d.year, d.month, d.day)]];
  return [['year', String(d.year)]];
};

/** BCP 47 → babel language names (biblatex `langid` expects babel/polyglossia names). */
const BABEL: Readonly<Partial<Record<string, string>>> = {
  en: 'english',
  'pt-BR': 'brazilian',
  pt: 'portuguese',
  de: 'ngerman',
  'de-CH': 'swissgerman',
  fr: 'french',
  es: 'spanish',
  it: 'italian',
  la: 'latin',
  ru: 'russian',
  nl: 'dutch',
  el: 'greek',
};

const ROLE: Readonly<Record<EditorRole, string>> = {
  editor: 'editor',
  organizer: 'organizer',
  coordinator: 'coordinator',
  compiler: 'compiler',
};

type Field = readonly [name: string, value: string | undefined];

const names = (name: string, list: NameList): Field => [name, list.names.length === 0 ? undefined : encodeNames(list)];
const text = (name: string, m: MarkedText | undefined): Field => [name, m === undefined ? undefined : encodeMarked(m)];
const raw = (name: string, s: string | number | undefined): Field => [
  name,
  s === undefined ? undefined : escapeBibtex(String(s)),
];
const titleFields = (main: string, sub: string, t: Title): readonly Field[] => [text(main, t.main), text(sub, t.sub)];
const editionField = (e: Edition | undefined): Field => [
  'edition',
  e === undefined ? undefined : e.kind === 'ordinal' ? String(e.n) : encodeMarked(e.text),
];
const pagesField = (pages: readonly { readonly first: string; readonly last?: string }[] | undefined): Field => [
  'pages',
  pages
    ?.map((p) => (p.last === undefined ? escapeBibtex(p.first) : `${escapeBibtex(p.first)}--${escapeBibtex(p.last)}`))
    .join(', '),
];
const editorFields = (list: NameList, role: EditorRole): readonly Field[] => [
  names('editor', list),
  ['editortype', list.names.length === 0 || role === 'editor' ? undefined : ROLE[role]],
];

/** The entry type and the fields specific to each variant, in a conventional order. */
const variant = (ref: Reference): { readonly type: string; readonly fields: readonly Field[] } => {
  switch (ref.type) {
    case 'book':
      return {
        type: 'book',
        fields: [
          ...editorFields(ref.editors, ref.editorRole),
          editionField(ref.edition),
          raw('volume', ref.volume),
          raw('volumes', ref.volumes),
          text('series', ref.series?.title),
          raw('number', ref.series?.number),
          text('address', ref.imprint.place),
          text('publisher', ref.imprint.publisher),
        ],
      };
    case 'chapter':
      return {
        type: ref.bookAuthors.names.length > 0 ? 'inbook' : 'incollection',
        fields: [
          ...titleFields('booktitle', 'booksubtitle', ref.container),
          names('bookauthor', ref.bookAuthors),
          ...editorFields(ref.editors, ref.editorRole),
          editionField(ref.edition),
          raw('volume', ref.volume),
          raw('chapter', ref.chapter),
          pagesField(ref.pages),
          text('series', ref.series?.title),
          raw('number', ref.series?.number),
          text('address', ref.imprint.place),
          text('publisher', ref.imprint.publisher),
        ],
      };
    case 'article':
      return {
        type: 'article',
        fields: [
          ...titleFields('journal', 'journalsubtitle', ref.journal),
          text('address', ref.place),
          raw('volume', ref.volume),
          raw('number', ref.number),
          pagesField(ref.pages),
          raw('eid', ref.eid),
        ],
      };
    case 'inproceedings':
      return {
        type: 'inproceedings',
        fields: [
          ...titleFields('booktitle', 'booksubtitle', ref.container),
          ...editorFields(ref.editors, ref.editorRole),
          text('eventtitle', ref.event?.title),
          raw('eventnumber', ref.event?.number),
          raw('eventyear', ref.event?.year),
          text('venue', ref.event?.venue),
          raw('volume', ref.volume),
          text('series', ref.series?.title),
          raw('number', ref.series?.number),
          pagesField(ref.pages),
          raw('eid', ref.eid),
          text('address', ref.imprint.place),
          text('publisher', ref.imprint.publisher),
        ],
      };
    case 'thesis':
      return {
        type: ref.degree === 'phd' ? 'phdthesis' : 'mastersthesis',
        fields: [
          text('type', ref.thesisType),
          text('school', ref.institution),
          text('address', ref.place),
          raw('pagetotal', ref.leaves),
        ],
      };
    case 'report':
      return {
        type: 'techreport',
        fields: [
          text('type', ref.reportType),
          raw('number', ref.number),
          text('institution', ref.institution),
          text('address', ref.place),
        ],
      };
    case 'online':
      return {
        type: 'online',
        fields: [
          ...editorFields(ref.editors, ref.editorRole),
          text('organization', ref.site),
          text('address', ref.imprint.place),
          text('publisher', ref.imprint.publisher),
          raw('version', ref.version),
        ],
      };
    case 'software':
      return {
        type: 'software',
        fields: [
          raw('version', ref.version),
          text('address', ref.imprint.place),
          text('publisher', ref.imprint.publisher),
        ],
      };
    default:
      return absurd(ref);
  }
};

/** One reference as a biblatex entry (UTF-8, two-space indent, aligned "="). */
export const toBibtex = (ref: Reference): string => {
  const { type, fields } = variant(ref);
  const all: readonly Field[] = [
    names('author', ref.authors),
    ...titleFields('title', 'subtitle', ref.title),
    names('translator', ref.translators),
    ...fields,
    ...dateFields(ref.issued),
    ['doi', ref.doi],
    ['url', ref.url],
    ['urldate', ref.accessed === undefined ? undefined : iso(ref.accessed.year, ref.accessed.month, ref.accessed.day)],
    text('note', ref.note),
    ['langid', ref.language === undefined ? undefined : (BABEL[ref.language] ?? ref.language)],
  ];
  const present = all.filter((f): f is readonly [string, string] => f[1] !== undefined);
  const width = Math.max(...present.map(([name]) => name.length));
  const body = present.map(([name, value]) => `  ${name.padEnd(width)} = {${value}},`).join('\n');
  return `@${type}{${ref.key},\n${body}\n}\n`;
};

/** Several references as one .bib file, separated by blank lines (e.g. the works cited by a page). */
export const toBibtexFile = (refs: readonly Reference[]): string => refs.map(toBibtex).join('\n');
