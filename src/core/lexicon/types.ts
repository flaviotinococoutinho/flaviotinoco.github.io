/**
 * Lexicon domain model — the typed form of lexicon/*.tsv after parsing.
 *
 * One dictionary file per kind (closed set). Each entry keeps its source line,
 * so every diagnostic, mark or statistic can be traced back to the TSV row that
 * caused it.
 */
import type { Brand } from '../algebra/brand.ts';
import type { Locale } from '../domain/locale.ts';
import type { LanguageTag } from './language-tag.ts';

export const ENTRY_KINDS = ['homograph', 'acronym', 'proper', 'latin', 'foreign'] as const;
/**
 * foreign   — foreign term (estrangeirismo) → <i lang class="foreign">
 * latin     — Latin locution → <i lang="la" class="locution">
 * proper    — proper name → <span class="proper-name" translate="no">
 * acronym   — acronym (sigla) → <abbr class="acronym" title>
 * homograph — foreign in one sense, native in another: NEVER marked, only linted
 */
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const CASE_POLICIES = ['exact', 'insensitive', 'sentence'] as const;
/**
 * exact       — the text must reproduce the term code point by code point;
 * insensitive — any letter case (context-free fold, see text.ts);
 * sentence    — as written, or with the first letter capitalised (sentence start).
 */
export type CasePolicy = (typeof CASE_POLICIES)[number];

export const PROPER_CATEGORIES = ['person', 'place', 'institution', 'work'] as const;
export type ProperCategory = (typeof PROPER_CATEGORIES)[number];

/** Stable identity of an entry: `${kind}:${term}` (unique by construction — duplicates are parse errors). */
export type EntryId = Brand<string, 'LexiconEntryId'>;

export interface SourceRef {
  readonly file: string;
  /** 1-based line number in the TSV file. */
  readonly line: number;
}

interface EntryBase {
  readonly id: EntryId;
  /** NFC surface form as written in the dictionary. */
  readonly term: string;
  readonly lang: LanguageTag;
  readonly casePolicy: CasePolicy;
  readonly source: SourceRef;
}

export interface ForeignEntry extends EntryBase {
  readonly kind: 'foreign';
  /** Inflected or alternative spellings (e.g. plurals), same case policy. */
  readonly variants: readonly string[];
  /**
   * Primary language subtags in which the term has become part of the vernacular
   * (written in roman, no `lang`: WCAG 2.2 SC 3.1.2 exempts it; APA 7 does not
   * italicise foreign phrases common in English). The entry is inactive there.
   */
  readonly vernacularIn: readonly string[];
  readonly note: string;
}

export interface LatinEntry extends EntryBase {
  readonly kind: 'latin';
  readonly variants: readonly string[];
  readonly vernacularIn: readonly string[];
  readonly note: string;
}

export interface ProperEntry extends EntryBase {
  readonly kind: 'proper';
  readonly category: ProperCategory;
  readonly note: string;
}

export interface AcronymEntry extends EntryBase {
  readonly kind: 'acronym';
  /** Full form shown (title attribute) and expected in the text, per document locale. */
  readonly expansion: Readonly<Record<Locale, string>>;
  /** Language of the name the letters abbreviate (FFT → en, ABNT → pt-BR, SI → fr). */
  readonly expansionLang: LanguageTag;
}

export interface HomographEntry extends EntryBase {
  readonly kind: 'homograph';
  /** Primary language subtags in which the term is ALSO a native word (e.g. ["pt"] for "data"). */
  readonly homographOf: readonly string[];
  readonly note: string;
}

export type LexiconEntry = ForeignEntry | LatinEntry | ProperEntry | AcronymEntry | HomographEntry;

export interface Lexicon {
  /** In file order, then line order. */
  readonly entries: readonly LexiconEntry[];
}

/** A diagnostic of the TSV parser: accumulated, never thrown. */
export interface LexiconIssue {
  readonly file: string;
  readonly line: number;
  /** 1-based column (UTF-16 code units) of the offending field. */
  readonly column: number;
  readonly code: LexiconIssueCode;
  readonly message: string;
}

export type LexiconIssueCode =
  | 'unknown-file'
  | 'missing-header'
  | 'bad-header'
  | 'field-count'
  | 'empty-field'
  | 'whitespace'
  | 'bad-term'
  | 'bad-lang'
  | 'bad-case'
  | 'bad-category'
  | 'bad-homograph-of'
  | 'bad-vernacular-in'
  | 'duplicate'
  | 'conflict';

/** Rank of each kind when two entries match the same span (lower wins). */
export const KIND_RANK: Readonly<Record<EntryKind, number>> = {
  homograph: 0,
  acronym: 1,
  proper: 2,
  latin: 3,
  foreign: 4,
};
