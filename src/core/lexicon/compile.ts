/**
 * Compiler: parsed lexicon → read-optimised, per-locale matchers.
 *
 *   Spec (TSV rows) ──parse──▶ Lexicon ──compile──▶ { pt-BR: Matcher, en: Matcher }
 *
 * Compilation happens once per build (the adapter memoises document-specific
 * variants created by frontmatter overrides). Everything here is pure: the same
 * lexicon always yields matchers with identical behaviour.
 */
import { LOCALES, type Locale } from '../domain/locale.ts';
import { type LexiconOverrides, entriesFor, isEmptyOverrides } from './activation.ts';
import { compileMatcher, type Matcher, type MatcherOptions } from './matcher.ts';
import { fold } from './text.ts';
import type { AcronymEntry, Lexicon, LexiconEntry } from './types.ts';

export interface CompiledLexicon {
  readonly lexicon: Lexicon;
  readonly options: MatcherOptions;
  readonly matchers: Readonly<Record<Locale, Matcher>>;
  /** Acronyms by folded term, for explicit `:abbr[…]` without a title. */
  readonly acronyms: ReadonlyMap<string, AcronymEntry>;
  /** Count of entries per kind (for diagnostics). */
  readonly counts: Readonly<Record<LexiconEntry['kind'], number>>;
}

export const compileLexicon = (lexicon: Lexicon, options: MatcherOptions = {}): CompiledLexicon => {
  const matchers = Object.fromEntries(
    LOCALES.map((locale) => [locale, compileMatcher(entriesFor(lexicon.entries, locale), options)]),
  ) as Record<Locale, Matcher>;
  const acronyms = new Map<string, AcronymEntry>();
  for (const e of lexicon.entries) if (e.kind === 'acronym') acronyms.set(fold(e.term), e);
  const counts = { homograph: 0, acronym: 0, proper: 0, latin: 0, foreign: 0 };
  for (const e of lexicon.entries) counts[e.kind] += 1;
  return { lexicon, options, matchers, acronyms, counts };
};

/** The matcher of a document: the shared one, or a fresh compile when the frontmatter overrides the dictionary. */
export const matcherFor = (compiled: CompiledLexicon, locale: Locale, overrides: LexiconOverrides): Matcher =>
  isEmptyOverrides(overrides)
    ? compiled.matchers[locale]
    : compileMatcher(entriesFor(compiled.lexicon.entries, locale, overrides), compiled.options);
