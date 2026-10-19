/**
 * Lexicon loader (imperative shell): reads lexicon/*.tsv once per build,
 * parses them with the pure parser of the core, compiles the per-locale
 * matchers, and FAILS THE BUILD with every problem of every file listed
 * (file:line:column) — never with a partially loaded dictionary.
 *
 * The result is the `lexicon` field of the PipelineContext consumed by the
 * "abnt" remark stage.
 */
import { readdir, readFile } from 'node:fs/promises';
import type { Locale } from '../../core/domain/locale.ts';
import { compileLexicon, type CompiledLexicon, matcherFor } from '../../core/lexicon/compile.ts';
import type { LexiconOverrides } from '../../core/lexicon/activation.ts';
import type { Matcher, MatcherOptions } from '../../core/lexicon/matcher.ts';
import { formatIssue, LEXICON_FILES, type LexiconSource, parseLexicon } from '../../core/lexicon/parse.ts';
import { fold } from '../../core/lexicon/text.ts';
import type { AcronymEntry, Lexicon } from '../../core/lexicon/types.ts';

export interface LexiconRuntime {
  readonly compiled: CompiledLexicon;
  /** Matcher for a document of `locale` with its frontmatter overrides (memoised). */
  readonly matcherFor: (locale: Locale, overrides: LexiconOverrides) => Matcher;
  /** Dictionary acronym by its written form (also accepts the plural "CPUs"). */
  readonly acronym: (text: string) => AcronymEntry | undefined;
}

/** Wraps a parsed lexicon for the remark stage (also used by tests with fixture lexicons). */
export const createLexiconRuntime = (lexicon: Lexicon, options: MatcherOptions = {}): LexiconRuntime => {
  const compiled = compileLexicon(lexicon, options);
  const memo = new Map<string, Matcher>();
  return {
    compiled,
    matcherFor: (locale, overrides) => {
      const key = JSON.stringify([locale, overrides]);
      const cached = memo.get(key);
      if (cached !== undefined) return cached;
      const matcher = matcherFor(compiled, locale, overrides);
      memo.set(key, matcher);
      return matcher;
    },
    acronym: (text) => {
      const key = fold(text.normalize('NFC'));
      return compiled.acronyms.get(key) ?? (key.endsWith('s') ? compiled.acronyms.get(key.slice(0, -1)) : undefined);
    },
  };
};

/** Reads and validates the sources; throws one Error listing every problem. */
export const readLexiconSources = async (dir: URL): Promise<readonly LexiconSource[]> => {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.tsv')).sort();
  const missing = Object.keys(LEXICON_FILES).filter((n) => !names.includes(n));
  if (missing.length > 0) {
    throw new Error(`lexicon: missing dictionary file(s) in ${dir.pathname}: ${missing.join(', ')}`);
  }
  return Promise.all(names.map(async (name) => ({ name, text: await readFile(new URL(name, dir), 'utf8') })));
};

export const loadLexicon = async (root: URL): Promise<LexiconRuntime> => {
  const dir = new URL('lexicon/', root);
  const parsed = parseLexicon(await readLexiconSources(dir));
  if (!parsed.ok) {
    throw new Error(
      `lexicon: ${parsed.error.length} problem(s) in ${dir.pathname}\n` +
        parsed.error.map((i) => `  ${formatIssue(i)}`).join('\n'),
    );
  }
  return createLexiconRuntime(parsed.value);
};
