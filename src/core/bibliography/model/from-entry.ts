/**
 * BibTeX entry → Reference (pure parser at the data boundary).
 *
 * "Parse, don't validate" (A. King, 2019): each field is converted once into a
 * typed value, and every field the entry type does not support is an ERROR rather
 * than something silently ignored or guessed — a typo such as `pubisher` or an
 * article with both `pages` and `eid` is reported with its position. Problems are
 * accumulated so an author sees all of them at once.
 *
 * Supported types (biblatex names in parentheses):
 *   book (mvbook) · chapter (incollection, inbook) · article · inproceedings
 *   (conference) · thesis (phdthesis, mastersthesis, thesis) · report (techreport)
 *   · online (electronic, www, and misc WITH url+urldate) · software.
 */
import { err, ok, type Result } from '../../algebra/result.ts';
import { parseCitationKey } from '../../domain/identifiers.ts';
import type { BibEntry, BibField } from '../bibtex/database.ts';
import { decodeLatex, type MarkedText } from '../bibtex/latex.ts';
import { parseNames, type NameList } from '../bibtex/names.ts';
import { byPosition, error, isError, warning, type Diagnostic, type DiagnosticCode, type Span } from '../bibtex/source.ts';
import type {
  CalendarDate,
  Common,
  Edition,
  EditorRole,
  Event,
  Imprint,
  Interval,
  Month,
  Reference,
  Series,
  Title,
  Year,
} from './reference.ts';

/** Fields accepted on every type and deliberately not rendered (NBR 6023 §6.4: complementary elements are optional but must be uniform). */
const METADATA = new Set(['abstract', 'keywords', 'isbn', 'issn', 'file', 'timestamp', 'owner', 'annote', 'comment']);

const TYPE_ALIASES: Readonly<Record<string, Reference['type']>> = {
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
const LANGUAGES: Readonly<Record<string, string>> = {
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

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const ORDINAL_WORDS: Readonly<Record<string, number>> = {
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

const EDITOR_ROLES: Readonly<Record<string, EditorRole>> = {
  editor: 'editor',
  organizer: 'organizer',
  coordinator: 'coordinator',
  compiler: 'compiler',
};

const DOI = /^10\.\d{4,9}\/\S+$/;
const URL_PATTERN = /^https?:\/\/[^\s<>"]+$/;

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
  /** Reads one of two alias fields (address/location…); both present is an error. */
  const aliased = (a: string, b: string): BibField | undefined => {
    const fa = field(a);
    const fb = field(b);
    if (fa !== undefined && fb !== undefined) return fail('model:conflicting-fields', `"${a}" and "${b}" are synonyms; keep one`, fb.nameSpan);
    return fa ?? fb;
  };
  const decode = (f: BibField | undefined): MarkedText | undefined => {
    if (f === undefined) return undefined;
    const r = decodeLatex(f.raw);
    for (const p of r.problems) diagnostics.push(warning(p.code, `${entry.key}.${f.name}: ${p.message}`, f.span));
    return r.value;
  };
  const text = (name: string): MarkedText | undefined => decode(field(name));
  const required = <T>(value: T | undefined, name: string): T | undefined =>
    value === undefined ? fail('model:missing-field', `@${entry.type} requires "${name}"`) : value;
  const plainOf = (f: BibField | undefined): string | undefined => (f === undefined ? undefined : decode(f)?.text.trim());

  const names = (name: string): NameList => {
    const f = field(name);
    if (f === undefined) return { names: [], others: false };
    const r = parseNames(f.raw);
    for (const p of r.problems) {
      diagnostics.push(
        p.severity === 'error'
          ? error(p.code, `${entry.key}.${name}: ${p.message}`, f.span)
          : warning(p.code, `${entry.key}.${name}: ${p.message}`, f.span),
      );
    }
    return r.value;
  };

  /** Splits "Title: subtitle" at the first ": " at brace level 0 (NBR 6023 §8.2). */
  const title = (mainName: string, subName: string, isRequired: boolean): Title | undefined => {
    const f = field(mainName);
    const s = field(subName);
    if (f === undefined) return isRequired ? required(undefined, mainName) : undefined;
    if (s !== undefined) {
      const main = decode(f) as MarkedText;
      const sub = decode(s) as MarkedText;
      return { main, sub };
    }
    let depth = 0;
    for (let i = 0; i < f.raw.length; i++) {
      const c = f.raw[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (depth === 0 && c === ':' && /\s/.test(f.raw[i + 1] ?? '')) {
        const main = decodeLatex(f.raw.slice(0, i)).value;
        const sub = decodeLatex(f.raw.slice(i + 1)).value;
        decode(f); // report decoding problems once, on the whole field
        if (main.text !== '' && sub.text !== '') return { main, sub };
        break;
      }
    }
    return { main: decode(f) as MarkedText };
  };

  const year = (): Year | undefined => {
    const y = field('year');
    const d = field('date');
    if (y !== undefined && d !== undefined) return fail('model:conflicting-fields', 'use either "year" or "date", not both', d.nameSpan);
    if (y !== undefined) {
      const v = plainOf(y) ?? '';
      const m = /^(\d{4})(?:\s*[-–—/]\s*(\d{4}))?$/u.exec(v);
      if (m === null) return fail('model:invalid-value', `year "${v}" is not YYYY or YYYY–YYYY`, y.span);
      return m[2] === undefined ? { start: Number(m[1]) } : { start: Number(m[1]), end: Number(m[2]) };
    }
    if (d !== undefined) {
      const v = d.raw.trim();
      const range = /^(\d{4})\/(\d{4})$/.exec(v);
      if (range !== null) return { start: Number(range[1]), end: Number(range[2]) };
      const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v);
      if (m === null) return fail('model:invalid-value', `date "${v}" is not ISO 8601 (YYYY, YYYY-MM, YYYY-MM-DD or YYYY/YYYY)`, d.span);
      return { start: Number(m[1]) };
    }
    return fail('model:missing-field', 'a "year" or "date" is required');
  };

  /** Month and day from `date` (ISO) or `month` (macro, name or number). */
  const monthDay = (): { readonly month?: Month; readonly day?: number } => {
    const d = entry.fields.get('date');
    const mf = field('month');
    if (d !== undefined) {
      const m = /^\d{4}-(\d{2})(?:-(\d{2}))?$/.exec(d.raw.trim());
      if (mf !== undefined) {
        fail('model:conflicting-fields', 'use either "month" or a full "date", not both', mf.nameSpan);
        return {};
      }
      if (m === null) return {};
      const month = Number(m[1]);
      const day = m[2] === undefined ? undefined : Number(m[2]);
      if (month < 1 || month > 12 || (day !== undefined && (day < 1 || day > 31))) {
        fail('model:invalid-value', `invalid date "${d.raw}"`, d.span);
        return {};
      }
      return day === undefined ? { month: month as Month } : { month: month as Month, day };
    }
    if (mf === undefined) return {};
    const v = (plainOf(mf) ?? '').toLowerCase().replace(/\.$/, '');
    const n = /^\d{1,2}$/.test(v) ? Number(v) : MONTH_NAMES.findIndex((name) => name === v || name.slice(0, 3) === v) + 1;
    if (n < 1 || n > 12) {
      fail('model:invalid-value', `month "${mf.raw}" is not a month (jan…dec, 1…12)`, mf.span);
      return {};
    }
    return { month: n as Month };
  };

  const calendarDate = (f: BibField): CalendarDate | undefined => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.raw.trim());
    if (m === null) return fail('model:invalid-value', `"${f.name}" must be an ISO date YYYY-MM-DD`, f.span);
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (mo < 1 || mo > 12 || d < 1 || d > (days[mo - 1] ?? 0)) return fail('model:invalid-value', `"${f.raw}" is not a calendar date`, f.span);
    return { year: y, month: mo as Month, day: d };
  };

  const intervals = (f: BibField | undefined): readonly Interval[] | undefined => {
    if (f === undefined) return undefined;
    const v = decode(f)?.text ?? '';
    const parts = v.split(/\s*,\s*/u).filter((p) => p !== '');
    const out: Interval[] = [];
    for (const part of parts) {
      const m = /^([\p{L}\p{N}.]+)(?:\s*[-–—]+\s*([\p{L}\p{N}.]+))?$/u.exec(part);
      if (m === null) return fail('model:invalid-value', `"${f.name}" value "${part}" is not a number or range`, f.span);
      out.push(m[2] === undefined ? { first: m[1] as string } : { first: m[1] as string, last: m[2] });
    }
    return out.length === 0 ? fail('model:invalid-value', `"${f.name}" is empty`, f.span) : out;
  };
  const interval = (f: BibField | undefined): Interval | undefined => {
    const r = intervals(f);
    if (r === undefined || f === undefined) return undefined;
    if (r.length > 1) return fail('model:invalid-value', `"${f.name}" must be a single number or range`, f.span);
    return r[0];
  };
  const integer = (f: BibField | undefined): number | undefined => {
    if (f === undefined) return undefined;
    const v = plainOf(f) ?? '';
    return /^\d+$/.test(v) ? Number(v) : fail('model:invalid-value', `"${f.name}" must be a whole number`, f.span);
  };

  const edition = (): Edition | undefined => {
    const f = field('edition');
    const m = decode(f);
    if (m === undefined) return undefined;
    const v = m.text.trim();
    const numeric = /^(\d+)(?:st|nd|rd|th|\.|ª|º)?$/iu.exec(v);
    if (numeric !== null) return { kind: 'ordinal', n: Number(numeric[1]) };
    const word = ORDINAL_WORDS[v.toLowerCase()];
    return word !== undefined ? { kind: 'ordinal', n: word } : { kind: 'text', text: m };
  };

  const editorRole = (): EditorRole => {
    const f = field('editortype');
    if (f === undefined) return 'editor';
    const role = EDITOR_ROLES[(plainOf(f) ?? '').toLowerCase()];
    if (role !== undefined) return role;
    fail('model:invalid-value', `editortype must be one of ${Object.keys(EDITOR_ROLES).join(', ')}`, f.span);
    return 'editor';
  };

  const series = (): Series | undefined => {
    const s = text('series');
    const n = plainOf(field('number'));
    if (s === undefined) {
      if (n !== undefined) fail('model:unsupported-field', '"number" without "series" has no meaning for this type', entry.fields.get('number')?.nameSpan);
      return undefined;
    }
    return n === undefined ? { title: s } : { title: s, number: n };
  };

  const imprint = (): Imprint => {
    const place = decode(aliased('address', 'location'));
    const publisher = text('publisher');
    return { ...(place !== undefined ? { place } : {}), ...(publisher !== undefined ? { publisher } : {}) };
  };

  const language = (): string | undefined => {
    const f = aliased('langid', 'language');
    if (f === undefined) return undefined;
    const v = (plainOf(f) ?? '').trim();
    const tag = LANGUAGES[v.toLowerCase()] ?? (BCP47.test(v) ? v : undefined);
    return tag ?? fail('model:invalid-value', `unknown language "${v}" (use a babel name or a BCP 47 tag)`, f.span);
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
  const mainTitle = title('title', 'subtitle', true);
  const y = year();
  const md = monthDay();
  const lang = language();
  const translators = names('translator');
  const doiField = field('doi');
  const doi = doiField?.raw.trim();
  if (doi !== undefined && !DOI.test(doi)) fail('model:invalid-value', `doi "${doi}" must look like 10.NNNN/suffix (no URL prefix)`, doiField?.span);
  const urlField = field('url');
  const url = urlField?.raw.trim();
  if (url !== undefined && !URL_PATTERN.test(url)) fail('model:invalid-value', `url "${url}" must be an absolute http(s) URL`, urlField?.span);
  const urldate = field('urldate');
  if (url !== undefined && urldate === undefined) fail('model:missing-field', '"url" requires "urldate" (NBR 6023 §6.6: Acesso em)', urlField?.nameSpan);
  if (urldate !== undefined && url === undefined) fail('model:conflicting-fields', '"urldate" without "url"', urldate.nameSpan);
  const accessed = urldate === undefined ? undefined : calendarDate(urldate);
  const note = text('note');

  const base: Common | undefined =
    !key.ok || y === undefined || mainTitle === undefined
      ? undefined
      : {
    key: key.value,
    title: mainTitle,
    authors,
    translators,
    year: y,
    ...md,
    ...(lang !== undefined ? { language: lang } : {}),
    ...(doi !== undefined ? { doi } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(accessed !== undefined ? { accessed } : {}),
    ...(note !== undefined ? { note } : {}),
        };

  const pagesOrEid = (): { readonly pages?: readonly Interval[]; readonly eid?: string } => {
    const p = field('pages');
    const e = field('eid');
    if (p !== undefined && e !== undefined) {
      fail('model:conflicting-fields', 'an electronic locator ("eid") replaces "pages" (NBR 6023:2025 §7.7.6); keep one', e.nameSpan);
      return {};
    }
    const pages = intervals(p);
    const eid = plainOf(e);
    return { ...(pages !== undefined ? { pages } : {}), ...(eid !== undefined ? { eid } : {}) };
  };

  let reference: Reference | undefined;
  switch (kind) {
    case 'book': {
      const editors = names('editor');
      const role = editorRole();
      const ed = edition();
      const volume = plainOf(field('volume'));
      const volumes = integer(field('volumes'));
      const s = series();
      const im = imprint();
      if (base !== undefined) {
        reference = {
          ...base,
          type: 'book',
          editors,
          editorRole: role,
          ...(ed !== undefined ? { edition: ed } : {}),
          ...(volume !== undefined ? { volume } : {}),
          ...(volumes !== undefined ? { volumes } : {}),
          ...(s !== undefined ? { series: s } : {}),
          imprint: im,
        };
      }
      break;
    }
    case 'chapter': {
      const container = title('booktitle', 'booksubtitle', true);
      const bookAuthors = names('bookauthor');
      const editors = names('editor');
      const role = editorRole();
      const ed = edition();
      const volume = plainOf(field('volume'));
      const chapter = plainOf(field('chapter'));
      const pages = intervals(field('pages'));
      const s = series();
      const im = imprint();
      if (base !== undefined && container !== undefined) {
        reference = {
          ...base,
          type: 'chapter',
          container,
          bookAuthors,
          editors,
          editorRole: role,
          ...(ed !== undefined ? { edition: ed } : {}),
          ...(volume !== undefined ? { volume } : {}),
          ...(chapter !== undefined ? { chapter } : {}),
          ...(pages !== undefined ? { pages } : {}),
          ...(s !== undefined ? { series: s } : {}),
          imprint: im,
        };
      }
      break;
    }
    case 'article': {
      if (entry.fields.has('journaltitle') && entry.fields.has('journal')) {
        fail('model:conflicting-fields', '"journal" and "journaltitle" are synonyms; keep one', entry.fields.get('journal')?.nameSpan);
      }
      const journal = title(entry.fields.has('journaltitle') ? 'journaltitle' : 'journal', 'journalsubtitle', true);
      used.add('journal');
      used.add('journaltitle');
      const place = decode(aliased('address', 'location'));
      const volume = interval(field('volume'));
      const number = interval(aliased('number', 'issue'));
      const locator = pagesOrEid();
      if (base !== undefined && journal !== undefined) {
        reference = {
          ...base,
          type: 'article',
          journal,
          ...(place !== undefined ? { place } : {}),
          ...(volume !== undefined ? { volume } : {}),
          ...(number !== undefined ? { number } : {}),
          ...locator,
        };
      }
      break;
    }
    case 'inproceedings': {
      const container = title('booktitle', 'booksubtitle', true);
      const editors = names('editor');
      const role = editorRole();
      const eventTitle = text('eventtitle');
      const eventNumber = plainOf(field('eventnumber'));
      const eventYear = integer(field('eventyear'));
      const venue = text('venue');
      if (eventTitle === undefined && (eventNumber !== undefined || eventYear !== undefined || venue !== undefined)) {
        fail('model:missing-field', '"eventnumber", "eventyear" and "venue" describe an event and require "eventtitle"');
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
      if (base !== undefined && container !== undefined) {
        reference = {
          ...base,
          type: 'inproceedings',
          container,
          editors,
          editorRole: role,
          ...(event !== undefined ? { event } : {}),
          ...(volume !== undefined ? { volume } : {}),
          ...(s !== undefined ? { series: s } : {}),
          ...locator,
          imprint: im,
        };
      }
      break;
    }
    case 'thesis': {
      const typeField = field('type');
      let degree: 'phd' | 'masters' | undefined =
        entry.type === 'phdthesis' ? 'phd' : entry.type === 'mastersthesis' ? 'masters' : undefined;
      let thesisType: MarkedText | undefined;
      if (entry.type === 'thesis') {
        const t = (plainOf(typeField) ?? '').toLowerCase();
        degree = ['phdthesis', 'phd'].includes(t) ? 'phd' : ['mathesis', 'mastersthesis', 'masters'].includes(t) ? 'masters' : undefined;
        if (degree === undefined) fail('model:invalid-value', '@thesis needs type = phdthesis or mathesis', typeField?.span);
      } else {
        thesisType = decode(typeField);
      }
      const school = field('school');
      const inst = field('institution');
      if (school !== undefined && inst !== undefined) fail('model:conflicting-fields', '"school" and "institution" are synonyms; keep one', inst.nameSpan);
      const institution = required(decode(school ?? inst), 'school');
      const place = decode(aliased('address', 'location'));
      const leaves = integer(field('pagetotal'));
      if (base !== undefined && degree !== undefined && institution !== undefined) {
        reference = {
          ...base,
          type: 'thesis',
          degree,
          institution,
          ...(thesisType !== undefined ? { thesisType } : {}),
          ...(place !== undefined ? { place } : {}),
          ...(leaves !== undefined ? { leaves } : {}),
        };
      }
      break;
    }
    case 'report': {
      const institution = required(text('institution'), 'institution');
      const place = decode(aliased('address', 'location'));
      const reportType = text('type');
      const number = plainOf(field('number'));
      if (base !== undefined && institution !== undefined) {
        reference = {
          ...base,
          type: 'report',
          institution,
          ...(place !== undefined ? { place } : {}),
          ...(reportType !== undefined ? { reportType } : {}),
          ...(number !== undefined ? { number } : {}),
        };
      }
      break;
    }
    case 'online': {
      const editors = names('editor');
      const role = editorRole();
      const site = text('organization');
      const im = imprint();
      if (site !== undefined && im.publisher !== undefined) {
        fail('model:conflicting-fields', '"organization" (website name) and "publisher" (imprint) are exclusive for @online');
      }
      const version = plainOf(field('version'));
      required(url, 'url');
      if (base !== undefined && url !== undefined && accessed !== undefined) {
        reference = {
          ...base,
          type: 'online',
          editors,
          editorRole: role,
          ...(site !== undefined ? { site } : {}),
          imprint: im,
          ...(version !== undefined ? { version } : {}),
          url,
          accessed,
        };
      }
      break;
    }
    case 'software': {
      const version = plainOf(field('version'));
      const im = imprint();
      if (base !== undefined) {
        reference = {
          ...base,
          type: 'software',
          ...(version !== undefined ? { version } : {}),
          imprint: im,
        };
      }
      break;
    }
  }

  for (const [name, f] of entry.fields) {
    if (!used.has(name) && !METADATA.has(name)) {
      fail('model:unsupported-field', `field "${name}" is not supported on @${entry.type}`, f.nameSpan);
    }
  }
  const sorted = diagnostics.sort(byPosition);
  if (sorted.some(isError) || reference === undefined) return err(sorted);
  return ok({ reference, warnings: sorted });
};
