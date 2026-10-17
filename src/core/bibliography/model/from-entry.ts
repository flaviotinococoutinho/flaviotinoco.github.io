/**
 * BibTeX entry → Reference (pure parser at the data boundary).
 *
 * "Parse, don't validate" (A. King, 2019): each field is converted once into a
 * typed value, and every field the entry type does not support is an ERROR rather
 * than something silently ignored or guessed — a typo such as `pubisher`, an
 * article with both `pages` and `eid`, or `month` next to a full `date` is
 * reported with its position. Problems are accumulated (applicative validation)
 * so an author sees all of them at once.
 *
 * Supported types (biblatex names in parentheses):
 *   book (mvbook) · chapter (incollection, inbook) · article · inproceedings
 *   (conference) · thesis (phdthesis, mastersthesis, thesis) · report (techreport)
 *   · online (electronic, www, and misc WITH url+urldate) · software.
 * Field semantics follow the biblatex manual (P. Kime, M. Wemheuer, P. Lehman,
 * "The biblatex Package", v3.20, §2.1–2.3), e.g. @inbook has a `booktitle`.
 */
import { err, ok, type Result } from '../../algebra/result.ts';
import { parseCitationKey } from '../../domain/identifiers.ts';
import type { BibEntry, BibField } from '../bibtex/database.ts';
import { decodeLatex, sliceMarked, trimMarked, type MarkedText } from '../bibtex/latex.ts';
import { EMPTY_NAMES, parseNames, type NameList } from '../bibtex/names.ts';
import {
  byPosition,
  error,
  isError,
  warning,
  type Diagnostic,
  type DiagnosticCode,
  type Span,
} from '../bibtex/source.ts';
import type {
  CalendarDate,
  Common,
  Edition,
  EditorRole,
  Editors,
  Event,
  Imprint,
  Interval,
  Issued,
  Month,
  Reference,
  ReferenceType,
  Series,
  Title,
} from './reference.ts';

/** Fields accepted on every type and deliberately not rendered (NBR 6023 §6.4: complementary elements are optional). */
const METADATA = new Set(['abstract', 'keywords', 'isbn', 'issn', 'file', 'timestamp', 'owner', 'annote', 'comment']);

const TYPE_ALIASES: Readonly<Partial<Record<string, ReferenceType>>> = {
  book: 'book',
  mvbook: 'book',
  incollection: 'chapter',
  inbook: 'chapter',
  article: 'article',
  inproceedings: 'inproceedings',
  conference: 'inproceedings',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  thesis: 'thesis',
  report: 'report',
  techreport: 'report',
  online: 'online',
  electronic: 'online',
  www: 'online',
  software: 'software',
};

/** babel/polyglossia language names → BCP 47 (RFC 5646). */
const LANGUAGES: Readonly<Partial<Record<string, string>>> = {
  english: 'en',
  american: 'en',
  british: 'en',
  usenglish: 'en',
  ukenglish: 'en',
  canadian: 'en',
  australian: 'en',
  newzealand: 'en',
  brazil: 'pt-BR',
  brazilian: 'pt-BR',
  portuguese: 'pt',
  portuges: 'pt',
  german: 'de',
  ngerman: 'de',
  austrian: 'de',
  naustrian: 'de',
  swissgerman: 'de-CH',
  french: 'fr',
  francais: 'fr',
  spanish: 'es',
  italian: 'it',
  latin: 'la',
  russian: 'ru',
  dutch: 'nl',
  greek: 'el',
};
const BCP47 = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const ORDINAL_WORDS: Readonly<Partial<Record<string, number>>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
};

const EDITOR_ROLES: Readonly<Partial<Record<string, EditorRole>>> = {
  editor: 'editor',
  organizer: 'organizer',
  coordinator: 'coordinator',
  compiler: 'compiler',
};

/** DOI syntax (DOI Handbook §2.2: "10." prefix, "/" then any printable suffix). Stored bare, never as a URL. */
const DOI = /^10\.\d{4,9}\/\S+$/;
const URL_PATTERN = /^https?:\/\/[^\s<>"]+$/;
/** ISO 8601 calendar date, year-month or year (the subset used by biblatex's `date`). */
const ISO_PART = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

const isMonth = (n: number): n is Month => Number.isInteger(n) && n >= 1 && n <= 12;
const daysIn = (year: number, month: Month): number =>
  [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ] ?? 31;

export type Converted = { readonly reference: Reference; readonly warnings: readonly Diagnostic[] };

export const toReference = (entry: BibEntry): Result<Converted, readonly Diagnostic[]> => {
  const diagnostics: Diagnostic[] = [];
  const used = new Set<string>();
  const fail = (code: DiagnosticCode, message: string, span: Span = entry.keySpan): undefined => {
    diagnostics.push(error(code, `${entry.key}: ${message}`, span));
    return undefined;
  };

  const field = (name: string): BibField | undefined => {
    used.add(name);
    return entry.fields.get(name);
  };
  /** Reads one of two synonymous fields (address/location…); both present is an error. */
  const aliased = (a: string, b: string): BibField | undefined => {
    const fa = field(a);
    const fb = field(b);
    if (fa !== undefined && fb !== undefined) {
      return fail('model:conflicting-fields', `"${a}" and "${b}" are synonyms; keep one`, fb.nameSpan);
    }
    return fa ?? fb;
  };
  const decode = (f: BibField | undefined): MarkedText | undefined => {
    if (f === undefined) return undefined;
    const r = decodeLatex(f.raw);
    for (const p of r.problems) diagnostics.push(warning(p.code, `${entry.key}.${f.name}: ${p.message}`, f.span));
    const value = trimMarked(r.value);
    return value.text === '' ? fail('model:invalid-value', `"${f.name}" is empty`, f.span) : value;
  };
  const text = (name: string): MarkedText | undefined => decode(field(name));
  const plainOf = (f: BibField | undefined): string | undefined => decode(f)?.text;
  const required = <T>(value: T | undefined, name: string): T | undefined =>
    value === undefined ? fail('model:missing-field', `@${entry.type} requires "${name}"`) : value;

  const names = (name: string): NameList => {
    const f = field(name);
    if (f === undefined) return EMPTY_NAMES;
    const r = parseNames(f.raw);
    for (const p of r.problems) {
      const message = `${entry.key}.${name}: ${p.message}`;
      diagnostics.push(p.severity === 'error' ? error(p.code, message, f.span) : warning(p.code, message, f.span));
    }
    return r.value;
  };

  /**
   * Title and subtitle. An explicit subtitle field wins; otherwise the title is
   * split at its first ": " outside case-protected braces (NBR 6023 §8.2 —
   * a fallback heuristic, documented in docs/guia-citacoes.md).
   */
  const title = (mainName: string, subName: string): Title | undefined => {
    const main = text(mainName);
    const sub = text(subName);
    if (main === undefined)
      return sub === undefined ? undefined : fail('model:missing-field', `"${subName}" without "${mainName}"`);
    if (sub !== undefined) return { main, sub };
    const colon = /:\s/gu;
    for (let m = colon.exec(main.text); m !== null; m = colon.exec(main.text)) {
      const at = m.index;
      if (main.protected.some((r) => r.start <= at && at < r.end)) continue;
      const head = trimMarked(sliceMarked(main, 0, at));
      const tail = trimMarked(sliceMarked(main, at + 1));
      if (head.text !== '' && tail.text !== '') return { main: head, sub: tail };
      break;
    }
    return { main };
  };

  /** One ISO 8601 date part (YYYY, YYYY-MM, YYYY-MM-DD), validated against the calendar. */
  const isoPart = (v: string, f: BibField): { year: number; month?: Month; day?: number } | undefined => {
    const m = ISO_PART.exec(v);
    if (m === null) return undefined;
    const year = Number(m[1]);
    if (m[2] === undefined) return { year };
    const month = Number(m[2]);
    if (!isMonth(month)) return fail('model:invalid-value', `"${f.raw}" has an invalid month`, f.span);
    if (m[3] === undefined) return { year, month };
    const day = Number(m[3]);
    if (day < 1 || day > daysIn(year, month))
      return fail('model:invalid-value', `"${f.raw}" is not a calendar date`, f.span);
    return { year, month, day };
  };

  /**
   * Date of issue from `year` (1948, 1931--1958, [1933]) or `date` (ISO 8601 /
   * EDTF level 0 intervals: 1948-07/1948-10, 1931/1958), plus `month`.
   */
  const issued = (): Issued | undefined => {
    const y = field('year');
    const d = field('date');
    const mf = field('month');
    if (y !== undefined && d !== undefined) {
      return fail('model:conflicting-fields', 'use either "year" or "date", not both', d.nameSpan);
    }
    const month = (): Month | undefined => {
      if (mf === undefined) return undefined;
      const v = (plainOf(mf) ?? '').toLowerCase().replace(/\.$/u, '');
      const n = /^\d{1,2}$/u.test(v)
        ? Number(v)
        : MONTH_NAMES.findIndex((name) => name === v || name.slice(0, 3) === v) + 1;
      return isMonth(n) ? n : fail('model:invalid-value', `month "${mf.raw}" is not a month (jan…dec, 1…12)`, mf.span);
    };
    if (y !== undefined) {
      const v = plainOf(y) ?? '';
      const inferred = /^\[(\d{4})\]$/u.exec(v);
      if (inferred !== null) {
        const mo = month();
        return { year: Number(inferred[1]), inferred: true, ...(mo !== undefined ? { month: mo } : {}) };
      }
      const m = /^(\d{4})(?:\s*[-–—/]\s*(\d{4}))?$/u.exec(v);
      if (m === null) return fail('model:invalid-value', `year "${v}" is not YYYY, YYYY--YYYY or [YYYY]`, y.span);
      const start = Number(m[1]);
      const end = m[2] === undefined ? undefined : Number(m[2]);
      if (end !== undefined && end <= start)
        return fail('model:invalid-value', `year span "${v}" must increase`, y.span);
      const mo = month();
      return {
        year: start,
        ...(end !== undefined ? { endYear: end } : {}),
        ...(mo !== undefined ? { month: mo } : {}),
      };
    }
    if (d !== undefined) {
      if (mf !== undefined) {
        return fail('model:conflicting-fields', 'use either "month" or "date", not both', mf.nameSpan);
      }
      const [from = '', to, ...more] = d.raw.trim().split('/');
      const a = isoPart(from, d);
      const b = to === undefined ? undefined : isoPart(to, d);
      if (a === undefined || more.length > 0 || (to !== undefined && b === undefined)) {
        return fail(
          'model:invalid-value',
          `date "${d.raw}" is not ISO 8601 (YYYY, YYYY-MM, YYYY-MM-DD, or an interval A/B)`,
          d.span,
        );
      }
      if (b === undefined) return a;
      if (a.day !== undefined || b.day !== undefined || (a.month === undefined) !== (b.month === undefined)) {
        return fail('model:invalid-value', `date interval "${d.raw}" must be YYYY/YYYY or YYYY-MM/YYYY-MM`, d.span);
      }
      if (b.year < a.year || (b.year === a.year && (b.month ?? 0) <= (a.month ?? 0))) {
        return fail('model:invalid-value', `date interval "${d.raw}" must increase`, d.span);
      }
      return {
        year: a.year,
        ...(b.year !== a.year ? { endYear: b.year } : {}),
        ...(a.month !== undefined ? { month: a.month } : {}),
        ...(b.month !== undefined ? { endMonth: b.month } : {}),
      };
    }
    return fail('model:missing-field', 'a "year" or "date" is required');
  };

  const calendarDate = (f: BibField): CalendarDate | undefined => {
    const part = isoPart(f.raw.trim(), f);
    if (part?.month === undefined || part.day === undefined) {
      return fail('model:invalid-value', `"${f.name}" must be an ISO date YYYY-MM-DD`, f.span);
    }
    return { year: part.year, month: part.month, day: part.day };
  };

  const intervals = (f: BibField | undefined): readonly Interval[] | undefined => {
    const v = plainOf(f);
    if (f === undefined || v === undefined) return undefined;
    const out: Interval[] = [];
    for (const part of v.split(/\s*,\s*/u).filter((p) => p !== '')) {
      const m = /^([\p{L}\p{N}.]+)(?:\s*[-–—]+\s*([\p{L}\p{N}.]+))?$/u.exec(part);
      if (m === null)
        return fail('model:invalid-value', `"${f.name}" value "${part}" is not a number or range`, f.span);
      out.push(m[2] === undefined ? { first: m[1] as string } : { first: m[1] as string, last: m[2] });
    }
    return out.length === 0 ? fail('model:invalid-value', `"${f.name}" is empty`, f.span) : out;
  };
  const integer = (f: BibField | undefined): number | undefined => {
    const v = plainOf(f);
    if (f === undefined || v === undefined) return undefined;
    return /^\d+$/u.test(v) ? Number(v) : fail('model:invalid-value', `"${f.name}" must be a whole number`, f.span);
  };

  const edition = (): Edition | undefined => {
    const m = text('edition');
    if (m === undefined) return undefined;
    const numeric = /^(\d+)(?:st|nd|rd|th|\.|ª|º)?$/iu.exec(m.text);
    if (numeric !== null) return { kind: 'ordinal', n: Number(numeric[1]) };
    const word = ORDINAL_WORDS[m.text.toLowerCase()];
    return word !== undefined ? { kind: 'ordinal', n: word } : { kind: 'text', text: m };
  };

  const editors = (): Editors => {
    const list = names('editor');
    const f = field('editortype');
    if (f === undefined) return { editors: list, editorRole: 'editor' };
    const role = EDITOR_ROLES[(plainOf(f) ?? '').toLowerCase()];
    if (role === undefined) {
      fail('model:invalid-value', `editortype must be one of ${Object.keys(EDITOR_ROLES).join(', ')}`, f.span);
    } else if (list.names.length === 0) {
      fail('model:conflicting-fields', '"editortype" without "editor"', f.nameSpan);
    }
    return { editors: list, editorRole: role ?? 'editor' };
  };

  /** Series with its number; for these types `number` means the number in the series. */
  const series = (): Series | undefined => {
    const s = text('series');
    const nf = field('number');
    const n = plainOf(nf);
    if (s === undefined) {
      if (nf !== undefined)
        fail('model:unsupported-field', '"number" without "series" has no meaning for this type', nf.nameSpan);
      return undefined;
    }
    return n === undefined ? { title: s } : { title: s, number: n };
  };

  const place = (): MarkedText | undefined => decode(aliased('address', 'location'));

  const imprint = (): Imprint => {
    const where = place();
    const publisher = text('publisher');
    return { ...(where !== undefined ? { place: where } : {}), ...(publisher !== undefined ? { publisher } : {}) };
  };

  const language = (): string | undefined => {
    const f = aliased('langid', 'language');
    const v = plainOf(f);
    if (f === undefined || v === undefined) return undefined;
    const tag = LANGUAGES[v.toLowerCase()] ?? (BCP47.test(v) ? v : undefined);
    return tag ?? fail('model:invalid-value', `unknown language "${v}" (use a babel name or a BCP 47 tag)`, f.span);
  };

  const pagesOrEid = (): { readonly pages?: readonly Interval[]; readonly eid?: string } => {
    const p = field('pages');
    const e = field('eid');
    if (p !== undefined && e !== undefined) {
      fail(
        'model:conflicting-fields',
        'an electronic locator ("eid") replaces "pages" (NBR 6023:2025 §7.7.6); keep one',
        e.nameSpan,
      );
      return {};
    }
    const pages = intervals(p);
    const eid = plainOf(e);
    return { ...(pages !== undefined ? { pages } : {}), ...(eid !== undefined ? { eid } : {}) };
  };

  // ---------------------------------------------------------------- common part
  const key = parseCitationKey(entry.key);
  if (!key.ok) fail('model:invalid-value', key.error, entry.keySpan);
  const kind = TYPE_ALIASES[entry.type] ?? (entry.type === 'misc' && entry.fields.has('url') ? 'online' : undefined);
  if (kind === undefined) {
    fail(
      'model:unsupported-type',
      `entry type "@${entry.type}" is not supported (use one of ${Object.keys(TYPE_ALIASES).join(', ')}, or @misc with url and urldate)`,
      entry.span,
    );
    return err(diagnostics);
  }

  const authors = names('author');
  const mainTitle = required(title('title', 'subtitle'), 'title');
  const date = issued();
  const lang = language();
  const translators = names('translator');
  const doiField = field('doi');
  const doi = doiField?.raw.trim();
  if (doiField !== undefined && doi !== undefined && !DOI.test(doi)) {
    fail('model:invalid-value', `doi "${doi}" must look like 10.NNNN/suffix (no URL prefix)`, doiField.span);
  }
  const urlField = field('url');
  const url = urlField?.raw.trim();
  if (urlField !== undefined && url !== undefined && !URL_PATTERN.test(url)) {
    fail('model:invalid-value', `url "${url}" must be an absolute http(s) URL`, urlField.span);
  }
  const urldate = field('urldate');
  if (urlField !== undefined && urldate === undefined) {
    fail('model:missing-field', '"url" requires "urldate" (NBR 6023 §6.6: Acesso em)', urlField.nameSpan);
  }
  if (urldate !== undefined && urlField === undefined) {
    fail('model:conflicting-fields', '"urldate" without "url"', urldate.nameSpan);
  }
  const accessed = urldate === undefined ? undefined : calendarDate(urldate);
  const note = text('note');

  const base: Common | undefined =
    !key.ok || date === undefined || mainTitle === undefined
      ? undefined
      : {
          key: key.value,
          title: mainTitle,
          authors,
          translators,
          issued: date,
          ...(lang !== undefined ? { language: lang } : {}),
          ...(doi !== undefined ? { doi } : {}),
          ...(url !== undefined ? { url } : {}),
          ...(accessed !== undefined ? { accessed } : {}),
          ...(note !== undefined ? { note } : {}),
        };

  const build = (): Reference | undefined => {
    switch (kind) {
      case 'book': {
        const eds = editors();
        const ed = edition();
        const volume = plainOf(field('volume'));
        const volumes = integer(field('volumes'));
        const s = series();
        const im = imprint();
        if (base === undefined) return undefined;
        return {
          ...base,
          ...eds,
          type: 'book',
          ...(ed !== undefined ? { edition: ed } : {}),
          ...(volume !== undefined ? { volume } : {}),
          ...(volumes !== undefined ? { volumes } : {}),
          ...(s !== undefined ? { series: s } : {}),
          imprint: im,
        };
      }
      case 'chapter': {
        const container = required(title('booktitle', 'booksubtitle'), 'booktitle');
        const bookAuthors = names('bookauthor');
        const eds = editors();
        const ed = edition();
        const volume = plainOf(field('volume'));
        const chapter = plainOf(field('chapter'));
        const pages = intervals(field('pages'));
        const s = series();
        const im = imprint();
        if (base === undefined || container === undefined) return undefined;
        return {
          ...base,
          ...eds,
          type: 'chapter',
          container,
          bookAuthors,
          ...(ed !== undefined ? { edition: ed } : {}),
          ...(volume !== undefined ? { volume } : {}),
          ...(chapter !== undefined ? { chapter } : {}),
          ...(pages !== undefined ? { pages } : {}),
          ...(s !== undefined ? { series: s } : {}),
          imprint: im,
        };
      }
      case 'article': {
        const journalField = entry.fields.has('journaltitle') ? 'journaltitle' : 'journal';
        if (entry.fields.has('journaltitle') && entry.fields.has('journal')) {
          fail(
            'model:conflicting-fields',
            '"journal" and "journaltitle" are synonyms; keep one',
            entry.fields.get('journal')?.nameSpan,
          );
          used.add('journal');
        }
        const journal = required(title(journalField, 'journalsubtitle'), 'journal');
        const where = place();
        const volume = plainOf(field('volume'));
        const number = plainOf(aliased('number', 'issue'));
        const locator = pagesOrEid();
        if (base === undefined || journal === undefined) return undefined;
        return {
          ...base,
          type: 'article',
          journal,
          ...(where !== undefined ? { place: where } : {}),
          ...(volume !== undefined ? { volume } : {}),
          ...(number !== undefined ? { number } : {}),
          ...locator,
        };
      }
      case 'inproceedings': {
        const container = required(title('booktitle', 'booksubtitle'), 'booktitle');
        const eds = editors();
        const eventTitle = text('eventtitle');
        const eventNumber = plainOf(field('eventnumber'));
        const eventYear = integer(field('eventyear'));
        const venue = text('venue');
        if (eventTitle === undefined && (eventNumber !== undefined || eventYear !== undefined || venue !== undefined)) {
          fail(
            'model:missing-field',
            '"eventnumber", "eventyear" and "venue" describe an event and require "eventtitle"',
          );
        }
        const event: Event | undefined =
          eventTitle === undefined
            ? undefined
            : {
                title: eventTitle,
                ...(eventNumber !== undefined ? { number: eventNumber } : {}),
                ...(eventYear !== undefined ? { year: eventYear } : {}),
                ...(venue !== undefined ? { venue } : {}),
              };
        const volume = plainOf(field('volume'));
        const s = series();
        const locator = pagesOrEid();
        const im = imprint();
        if (base === undefined || container === undefined) return undefined;
        return {
          ...base,
          ...eds,
          type: 'inproceedings',
          container,
          ...(event !== undefined ? { event } : {}),
          ...(volume !== undefined ? { volume } : {}),
          ...(s !== undefined ? { series: s } : {}),
          ...locator,
          imprint: im,
        };
      }
      case 'thesis': {
        const typeField = field('type');
        let degree: 'phd' | 'masters' | undefined =
          entry.type === 'phdthesis' ? 'phd' : entry.type === 'mastersthesis' ? 'masters' : undefined;
        let thesisType: MarkedText | undefined;
        if (entry.type === 'thesis') {
          const t = (plainOf(typeField) ?? '').toLowerCase();
          degree = ['phdthesis', 'phd'].includes(t)
            ? 'phd'
            : ['mathesis', 'mastersthesis', 'masters'].includes(t)
              ? 'masters'
              : undefined;
          if (degree === undefined)
            fail('model:invalid-value', '@thesis needs type = phdthesis or mathesis', typeField?.span);
        } else {
          thesisType = decode(typeField);
        }
        const institution = required(decode(aliased('school', 'institution')), 'school');
        const where = place();
        const leaves = integer(field('pagetotal'));
        if (base === undefined || degree === undefined || institution === undefined) return undefined;
        return {
          ...base,
          type: 'thesis',
          degree,
          institution,
          ...(thesisType !== undefined ? { thesisType } : {}),
          ...(where !== undefined ? { place: where } : {}),
          ...(leaves !== undefined ? { leaves } : {}),
        };
      }
      case 'report': {
        const institution = required(text('institution'), 'institution');
        const where = place();
        const reportType = text('type');
        const number = plainOf(field('number'));
        if (base === undefined || institution === undefined) return undefined;
        return {
          ...base,
          type: 'report',
          institution,
          ...(where !== undefined ? { place: where } : {}),
          ...(reportType !== undefined ? { reportType } : {}),
          ...(number !== undefined ? { number } : {}),
        };
      }
      case 'online': {
        const eds = editors();
        const site = text('organization');
        const im = imprint();
        if (site !== undefined && im.publisher !== undefined) {
          fail(
            'model:conflicting-fields',
            '"organization" (website name) and "publisher" (imprint) are exclusive for @online',
          );
        }
        const version = plainOf(field('version'));
        required(url, 'url');
        if (base === undefined || url === undefined || accessed === undefined) return undefined;
        return {
          ...base,
          ...eds,
          type: 'online',
          ...(site !== undefined ? { site } : {}),
          imprint: im,
          ...(version !== undefined ? { version } : {}),
          url,
          accessed,
        };
      }
      case 'software': {
        const version = plainOf(field('version'));
        const im = imprint();
        if (base === undefined) return undefined;
        return { ...base, type: 'software', ...(version !== undefined ? { version } : {}), imprint: im };
      }
    }
  };

  const reference = build();
  for (const [name, f] of entry.fields) {
    if (!used.has(name) && !METADATA.has(name)) {
      fail('model:unsupported-field', `field "${name}" is not supported on @${entry.type}`, f.nameSpan);
    }
  }
  const sorted = diagnostics.sort(byPosition);
  if (sorted.some(isError) || reference === undefined) return err(sorted);
  return ok({ reference, warnings: sorted });
};
