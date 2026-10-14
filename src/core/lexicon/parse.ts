/**
 * Lexicon parser: TSV text → typed entries (applicative validation).
 *
 * "Parse, don't validate" (A. King, 2019): the strings of lexicon/*.tsv become
 * LexiconEntry values exactly once, here, and every problem of every file is
 * reported together with its file, line and column — the build fails with the
 * whole list, never with the first error or with a half-loaded dictionary.
 *
 * Schema (explicit header line per file; columns in this order):
 *   estrangeirismos.tsv  term lang case variants vernacular_in note
 *   latim.tsv            term lang case variants vernacular_in note   (lang must be "la")
 *   nomes-proprios.tsv   term lang case category note
 *   siglas.tsv           term lang case expansion_pt expansion_en lang_of_expansion
 *   homografos.tsv       term lang case homograph_of note
 *
 * Terms are normalised to NFC (UAX #15) — canonically equivalent spellings are
 * the same term. Duplicates (same NFC term, or variant, within a kind) and
 * contradictions (a homograph also listed as foreign/Latin) are errors.
 */
import { unsafeBrand } from '../algebra/brand.ts';
import { err, ok, type Result } from '../algebra/result.ts';
import { absurd } from '../algebra/match.ts';
import { type LanguageTag, parseLanguageTag, primaryLanguage } from './language-tag.ts';
import { type TsvField, type TsvLine, tokenizeTsv } from './tsv.ts';
import {
  CASE_POLICIES,
  type CasePolicy,
  type EntryId,
  type EntryKind,
  type Lexicon,
  type LexiconEntry,
  type LexiconIssue,
  type LexiconIssueCode,
  PROPER_CATEGORIES,
  type ProperCategory,
} from './types.ts';

/** File name → kind (closed set). */
export const LEXICON_FILES: Readonly<Record<string, EntryKind>> = {
  'estrangeirismos.tsv': 'foreign',
  'latim.tsv': 'latin',
  'nomes-proprios.tsv': 'proper',
  'siglas.tsv': 'acronym',
  'homografos.tsv': 'homograph',
};

/** Expected header of each kind. */
export const LEXICON_COLUMNS: Readonly<Record<EntryKind, readonly string[]>> = {
  foreign: ['term', 'lang', 'case', 'variants', 'vernacular_in', 'note'],
  latin: ['term', 'lang', 'case', 'variants', 'vernacular_in', 'note'],
  proper: ['term', 'lang', 'case', 'category', 'note'],
  acronym: ['term', 'lang', 'case', 'expansion_pt', 'expansion_en', 'lang_of_expansion'],
  homograph: ['term', 'lang', 'case', 'homograph_of', 'note'],
};

export interface LexiconSource {
  /** File name (basename), e.g. "siglas.tsv". */
  readonly name: string;
  readonly text: string;
}

type Issue = Omit<LexiconIssue, 'file'>;

const issue = (line: number, column: number, code: LexiconIssueCode, message: string): Issue => ({
  line,
  column,
  code,
  message,
});

/** Validates one term or variant: no stray/odd whitespace, contains a letter or digit; returns its NFC form. */
const parseTerm = (raw: string): Result<string, string> => {
  if (raw.length === 0) return err('empty term');
  if (/^\s|\s$/u.test(raw)) return err(`term "${raw}" has leading or trailing whitespace`);
  if (/[^\S ]| {2}/u.test(raw)) {
    return err(`term "${raw}" may only contain single U+0020 spaces between words (no tabs, NBSP or runs)`);
  }
  if (/\p{Cc}|\p{Cf}/u.test(raw)) return err(`term "${raw}" contains control or format characters`);
  if (!/[\p{L}\p{N}]/u.test(raw)) return err(`term "${raw}" contains no letter or digit`);
  return ok(raw.normalize('NFC'));
};

const parseCase = (raw: string): Result<CasePolicy, string> =>
  (CASE_POLICIES as readonly string[]).includes(raw)
    ? ok(raw as CasePolicy)
    : err(`case must be one of ${CASE_POLICIES.join(' | ')}, got "${raw}"`);

const parseCategory = (raw: string): Result<ProperCategory, string> =>
  (PROPER_CATEGORIES as readonly string[]).includes(raw)
    ? ok(raw as ProperCategory)
    : err(`category must be one of ${PROPER_CATEGORIES.join(' | ')}, got "${raw}"`);

const NON_LINGUISTIC = new Set(['mul', 'und', 'zxx']);

const entryId = (kind: EntryKind, term: string): EntryId => unsafeBrand<string, 'LexiconEntryId'>(`${kind}:${term}`);

/**
 * Row parser for one kind. The returned function parses a data row into an
 * entry, appending every problem it finds to the returned `issues` list (local
 * accumulator owned by this closure; the input row is never modified).
 */
const rowParser = (kind: EntryKind, file: string) => {
  const issues: Issue[] = [];
  let line: TsvLine = { line: 0, fields: [] };

  const field = (index: number): TsvField => line.fields[index] ?? { value: '', column: 1 };
  const report = (index: number, code: LexiconIssueCode, message: string): undefined => {
    issues.push(issue(line.line, field(index).column, code, message));
    return undefined;
  };
  const required = (index: number, name: string): string | undefined => {
    const f = field(index);
    if (f.value.length === 0) return report(index, 'empty-field', `required column "${name}" is empty`);
    if (f.value.trim() !== f.value) {
      return report(index, 'whitespace', `column "${name}" has leading or trailing whitespace`);
    }
    return f.value;
  };
  const optionalText = (index: number, name: string): string => {
    const f = field(index);
    if (f.value.trim() !== f.value) report(index, 'whitespace', `column "${name}" has leading or trailing whitespace`);
    return f.value.trim().normalize('NFC');
  };
  const lift = <T>(index: number, code: LexiconIssueCode, r: Result<T, string>): T | undefined =>
    r.ok ? r.value : report(index, code, r.error);
  const langColumn = (index: number, name: string): LanguageTag | undefined => {
    const raw = required(index, name);
    return raw === undefined ? undefined : lift(index, 'bad-lang', parseLanguageTag(raw));
  };
  const variantsColumn = (index: number): readonly string[] | undefined => {
    const raw = field(index).value;
    if (raw === '') return [];
    const parsed = raw.split('|').map(parseTerm);
    const failures = parsed.filter((r) => !r.ok);
    for (const r of failures) if (!r.ok) report(index, 'bad-term', `variant: ${r.error}`);
    return failures.length > 0 ? undefined : parsed.flatMap((r) => (r.ok ? [r.value] : []));
  };
  /** A space-separated list of primary language subtags ("pt", "pt en"); `optional` allows an empty field. */
  const languageListColumn = (
    index: number,
    name: 'homograph_of' | 'vernacular_in',
    optional: boolean,
  ): readonly string[] | undefined => {
    const code: LexiconIssueCode = name === 'homograph_of' ? 'bad-homograph-of' : 'bad-vernacular-in';
    const raw = optional ? field(index).value : required(index, name);
    if (raw === undefined) return undefined;
    if (raw === '' && optional) return [];
    const out: string[] = [];
    for (const part of raw.split(' ')) {
      const tag = parseLanguageTag(part);
      if (!tag.ok || tag.value !== primaryLanguage(tag.value) || NON_LINGUISTIC.has(tag.value)) {
        return report(
          index,
          code,
          `${name} must list primary language subtags separated by single spaces (e.g. "pt" or "pt en"), got "${part}"`,
        );
      }
      out.push(tag.value);
    }
    if (lang !== undefined && out.includes(primaryLanguage(lang))) {
      return report(index, code, `${name} must not contain the entry's own language`);
    }
    return out;
  };

  let lang: LanguageTag | undefined;

  const parse = (row: TsvLine): LexiconEntry | undefined => {
    line = row;
    const termRaw = required(0, 'term');
    const term = termRaw === undefined ? undefined : lift(0, 'bad-term', parseTerm(termRaw));
    lang = langColumn(1, 'lang');
    const caseRaw = required(2, 'case');
    const casePolicy = caseRaw === undefined ? undefined : lift(2, 'bad-case', parseCase(caseRaw));
    if (lang !== undefined && kind !== 'acronym' && kind !== 'proper' && NON_LINGUISTIC.has(primaryLanguage(lang))) {
      return report(1, 'bad-lang', `"${lang}" cannot mark ${kind} text: name a real language`);
    }
    if (kind === 'latin' && lang !== undefined && primaryLanguage(lang) !== 'la') {
      return report(1, 'bad-lang', 'latim.tsv entries must have lang "la"');
    }
    const source = { file, line: row.line };
    switch (kind) {
      case 'foreign':
      case 'latin': {
        const variants = variantsColumn(3);
        const vernacularIn = languageListColumn(4, 'vernacular_in', true);
        const note = optionalText(5, 'note');
        if (
          term === undefined ||
          lang === undefined ||
          casePolicy === undefined ||
          variants === undefined ||
          vernacularIn === undefined
        ) {
          return undefined;
        }
        const base = { id: entryId(kind, term), term, lang, casePolicy, source, variants, vernacularIn, note };
        return kind === 'foreign' ? { ...base, kind: 'foreign' } : { ...base, kind: 'latin' };
      }
      case 'proper': {
        const categoryRaw = required(3, 'category');
        const category = categoryRaw === undefined ? undefined : lift(3, 'bad-category', parseCategory(categoryRaw));
        const note = optionalText(4, 'note');
        if (term === undefined || lang === undefined || casePolicy === undefined || category === undefined) {
          return undefined;
        }
        return { kind, id: entryId(kind, term), term, lang, casePolicy, source, category, note };
      }
      case 'acronym': {
        const pt = required(3, 'expansion_pt');
        const en = required(4, 'expansion_en');
        const expansionLang = langColumn(5, 'lang_of_expansion');
        if (
          term === undefined ||
          lang === undefined ||
          casePolicy === undefined ||
          pt === undefined ||
          en === undefined ||
          expansionLang === undefined
        ) {
          return undefined;
        }
        return {
          kind,
          id: entryId(kind, term),
          term,
          lang,
          casePolicy,
          source,
          expansion: { 'pt-BR': pt.normalize('NFC'), en: en.normalize('NFC') },
          expansionLang,
        };
      }
      case 'homograph': {
        const homographOf = languageListColumn(3, 'homograph_of', false);
        const note = optionalText(4, 'note');
        if (term === undefined || lang === undefined || casePolicy === undefined || homographOf === undefined) {
          return undefined;
        }
        return { kind, id: entryId(kind, term), term, lang, casePolicy, source, homographOf, note };
      }
      default:
        return absurd(kind);
    }
  };
  return { parse, issues };
};

/** Parses one lexicon file. The kind is decided by the file name (closed set). */
export const parseLexiconFile = (source: LexiconSource): Result<readonly LexiconEntry[], readonly LexiconIssue[]> => {
  const withFile = (xs: readonly Issue[]): readonly LexiconIssue[] => xs.map((x) => ({ ...x, file: source.name }));
  const kind = LEXICON_FILES[source.name];
  if (kind === undefined) {
    return err(
      withFile([
        issue(0, 0, 'unknown-file', `unknown lexicon file; expected one of ${Object.keys(LEXICON_FILES).join(', ')}`),
      ]),
    );
  }
  const doc = tokenizeTsv(source.text);
  const expected = LEXICON_COLUMNS[kind];
  if (doc.header === undefined) {
    return err(withFile([issue(1, 1, 'missing-header', `missing header line: ${expected.join('\\t')}`)]));
  }
  const header = doc.header.fields.map((f) => f.value);
  if (header.length !== expected.length || header.some((h, i) => h !== expected[i])) {
    return err(
      withFile([
        issue(
          doc.header.line,
          1,
          'bad-header',
          `header must be exactly "${expected.join('\\t')}", got "${header.join('\\t')}"`,
        ),
      ]),
    );
  }
  const { parse, issues } = rowParser(kind, source.name);
  const entries: LexiconEntry[] = [];
  const seen = new Map<string, number>();
  for (const line of doc.records) {
    if (line.fields.length !== expected.length) {
      const last = line.fields[line.fields.length - 1];
      issues.push(
        issue(
          line.line,
          last?.column ?? 1,
          'field-count',
          `expected ${expected.length} tab-separated fields (${expected.join(', ')}), got ${line.fields.length}`,
        ),
      );
      continue;
    }
    const entry = parse(line);
    if (entry === undefined) continue;
    const spellings = [entry.term, ...(entry.kind === 'foreign' || entry.kind === 'latin' ? entry.variants : [])];
    let duplicate = false;
    for (const spelling of spellings) {
      const previous = seen.get(spelling);
      if (previous !== undefined) {
        duplicate = true;
        issues.push(
          issue(
            line.line,
            1,
            'duplicate',
            `duplicate ${kind} term "${spelling}" (already defined at line ${previous})`,
          ),
        );
      } else seen.set(spelling, line.line);
    }
    if (!duplicate) entries.push(entry);
  }
  return issues.length === 0 ? ok(entries) : err(withFile(issues));
};

/**
 * Parses a set of lexicon files and checks cross-file consistency: a homograph
 * (never auto-marked) must not also be listed as an always-marked foreign or
 * Latin term — the two declarations would contradict each other.
 */
export const parseLexicon = (sources: readonly LexiconSource[]): Result<Lexicon, readonly LexiconIssue[]> => {
  const issues: LexiconIssue[] = [];
  const entries: LexiconEntry[] = [];
  const names = new Set<string>();
  for (const source of sources) {
    if (names.has(source.name)) {
      issues.push({ file: source.name, line: 0, column: 0, code: 'duplicate', message: 'file given twice' });
      continue;
    }
    names.add(source.name);
    const r = parseLexiconFile(source);
    if (r.ok) entries.push(...r.value);
    else issues.push(...r.error);
  }
  const markedSpellings = new Map<string, LexiconEntry>();
  for (const e of entries) {
    if (e.kind === 'foreign' || e.kind === 'latin') {
      for (const s of [e.term, ...e.variants]) markedSpellings.set(s, e);
    }
  }
  for (const e of entries) {
    if (e.kind !== 'homograph') continue;
    const clash = markedSpellings.get(e.term);
    if (clash !== undefined) {
      issues.push({
        file: e.source.file,
        line: e.source.line,
        column: 1,
        code: 'conflict',
        message: `homograph "${e.term}" is also listed as ${clash.kind} in ${clash.source.file}:${clash.source.line}`,
      });
    }
  }
  return issues.length === 0 ? ok({ entries }) : err(issues);
};

/** Human-readable one-line rendering of an issue (file:line:column code message). */
export const formatIssue = (i: LexiconIssue): string => `${i.file}:${i.line}:${i.column} [${i.code}] ${i.message}`;
