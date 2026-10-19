/**
 * Language-aware activation of dictionary entries, and per-document overrides.
 *
 * "Foreign" is relative to the language of the document (WCAG 2.2 SC 3.1.2,
 * Language of Parts): in an English essay "software" is not foreign, while a
 * Portuguese "saudade" is. An entry is ACTIVE in a document of locale L when:
 *
 *   foreign, latin   primary(entry.lang) ≠ primary(L) and primary(L) ∉ entry.vernacularIn
 *                    (a phrase common in English, e.g. "a priori", stays roman in English
 *                    text: APA 7 and WCAG 3.1.2's vernacular exemption)
 *   homograph        primary(L) ∈ entry.homographOf  and  primary(entry.lang) ≠ primary(L)
 *                    (it is ambiguous only where it is ALSO a native word)
 *   acronym          entry.lang = "mul", or primary(entry.lang) = primary(L)
 *                    ("CLT" is an English acronym — in pt-BR it is the labour code)
 *   proper           always (a name is a name in every language)
 *
 * Precedence (docs/arquitetura.md §5.6): explicit directive > frontmatter >
 * dictionary. The frontmatter part is modelled here: `lexicon.ignore` removes
 * every entry whose term or variant equals an ignored term (case-folded, NFC),
 * and `lexicon.foreign` adds document-local foreign terms (replacing dictionary
 * entries with the same spelling; `ignore` wins over both). Removing entries
 * (rather than filtering matches afterwards) keeps leftmost-longest exact: an
 * ignored long term no longer hides the shorter terms inside it.
 */
import { unsafeBrand } from '../algebra/brand.ts';
import { absurd } from '../algebra/match.ts';
import type { Locale } from '../domain/locale.ts';
import { type LanguageTag, parseLanguageTag, primaryLanguage } from './language-tag.ts';
import { fold, normalizeSpaces } from './text.ts';
import type { ForeignEntry, LexiconEntry } from './types.ts';

export const isActiveIn = (entry: LexiconEntry, locale: Locale): boolean => {
  const doc = primaryLanguage(locale);
  const own = primaryLanguage(entry.lang);
  switch (entry.kind) {
    case 'foreign':
    case 'latin':
      return own !== doc && !entry.vernacularIn.includes(doc);
    case 'homograph':
      return own !== doc && entry.homographOf.includes(doc);
    case 'acronym':
      return own === 'mul' || own === doc;
    case 'proper':
      return true;
    default:
      return absurd(entry);
  }
};

export interface LexiconOverrides {
  /** Terms (any kind) the dictionary must not mark in this document. */
  readonly ignore: readonly string[];
  /** Document-local foreign terms. */
  readonly foreign: readonly { readonly term: string; readonly lang: LanguageTag }[];
}

export const NO_OVERRIDES: LexiconOverrides = { ignore: [], foreign: [] };

export const isEmptyOverrides = (o: LexiconOverrides): boolean => o.ignore.length === 0 && o.foreign.length === 0;

export interface OverrideProblem {
  readonly reason: 'not-an-object' | 'bad-ignore' | 'bad-foreign' | 'bad-lang' | 'same-language';
  readonly detail: string;
}

/** A short, total description of an untyped YAML value for diagnostics. */
const describe = (v: unknown): string => JSON.stringify(v) ?? typeof v;

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Reads the raw `lexicon` frontmatter field (untyped YAML) for a document of
 * `locale`. Total: invalid items are dropped and reported, valid ones kept.
 */
export const parseOverrides = (
  raw: unknown,
  locale: Locale,
): { readonly overrides: LexiconOverrides; readonly problems: readonly OverrideProblem[] } => {
  if (raw === undefined || raw === null) return { overrides: NO_OVERRIDES, problems: [] };
  if (!isRecord(raw)) {
    return { overrides: NO_OVERRIDES, problems: [{ reason: 'not-an-object', detail: describe(raw) }] };
  }
  const problems: OverrideProblem[] = [];
  const ignore: string[] = [];
  const foreign: { term: string; lang: LanguageTag }[] = [];
  const rawIgnore = raw['ignore'] ?? [];
  if (Array.isArray(rawIgnore)) {
    for (const item of rawIgnore as readonly unknown[]) {
      if (typeof item === 'string' && /[\p{L}\p{N}]/u.test(item))
        ignore.push(normalizeSpaces(item.trim()).normalize('NFC'));
      else problems.push({ reason: 'bad-ignore', detail: describe(item) });
    }
  } else problems.push({ reason: 'bad-ignore', detail: describe(rawIgnore) });
  const rawForeign = raw['foreign'] ?? [];
  if (Array.isArray(rawForeign)) {
    for (const item of rawForeign as readonly unknown[]) {
      const term = isRecord(item) ? item['term'] : undefined;
      const lang = isRecord(item) ? item['lang'] : undefined;
      if (typeof term !== 'string' || !/[\p{L}\p{N}]/u.test(term) || typeof lang !== 'string') {
        problems.push({ reason: 'bad-foreign', detail: describe(item) });
        continue;
      }
      const tag = parseLanguageTag(lang);
      if (!tag.ok) {
        problems.push({ reason: 'bad-lang', detail: tag.error });
        continue;
      }
      if (primaryLanguage(tag.value) === primaryLanguage(locale)) {
        problems.push({ reason: 'same-language', detail: `${term} (${tag.value})` });
        continue;
      }
      foreign.push({ term: normalizeSpaces(term.trim()).normalize('NFC'), lang: tag.value });
    }
  } else problems.push({ reason: 'bad-foreign', detail: describe(rawForeign) });
  return { overrides: { ignore, foreign }, problems };
};

const spellingsOf = (e: LexiconEntry): readonly string[] =>
  e.kind === 'foreign' || e.kind === 'latin' ? [e.term, ...e.variants] : [e.term];

/** Active entries of a locale with the document overrides applied. */
export const entriesFor = (
  entries: readonly LexiconEntry[],
  locale: Locale,
  overrides: LexiconOverrides = NO_OVERRIDES,
): readonly LexiconEntry[] => {
  const ignored = new Set(overrides.ignore.map(fold));
  // A document-local foreign term also replaces any dictionary entry with the same spelling.
  const replaced = new Set([...ignored, ...overrides.foreign.map((f) => fold(f.term))]);
  const kept = entries.filter((e) => isActiveIn(e, locale) && !spellingsOf(e).some((s) => replaced.has(fold(s))));
  const local: readonly ForeignEntry[] = overrides.foreign
    .filter((f) => !ignored.has(fold(f.term)))
    .map((f, i) => ({
      kind: 'foreign',
      id: unsafeBrand<string, 'LexiconEntryId'>(`foreign:${f.term}`),
      term: f.term,
      lang: f.lang,
      casePolicy: 'insensitive',
      variants: [],
      vernacularIn: [],
      note: 'frontmatter',
      source: { file: 'frontmatter', line: i + 1 },
    }));
  return [...kept, ...local];
};
