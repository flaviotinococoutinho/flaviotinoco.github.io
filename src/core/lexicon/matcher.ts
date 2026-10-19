/**
 * Matcher: one interface, two engines, one resolver.
 *
 *  (i)  "regex" — the user's requested read-optimised structure: the trie of the
 *       surface forms compiled to a prefix-factored RegExp (trie.ts), wrapped in
 *       Unicode word-boundary look-arounds, flag `u`. Two patterns: one for
 *       case-sensitive forms run on the NFC text, one for insensitive forms run
 *       on its fold (length-preserving, so offsets coincide). The resolver asks
 *       each pattern for its next match from the current position (lastIndex),
 *       which yields exactly the leftmost-longest sequence of the union.
 *  (ii) "aho-corasick" — Aho & Corasick (1975) over the folded, whitespace-
 *       collapsed text (aho-corasick.ts).
 *
 * Engine selection ("auto"): the regex engine is used while every compiled
 * pattern source stays within `regexBudget` (16 KiB by default). V8 turns off
 * irregexp's optimisations (Boyer–Moore look-ahead, quick checks) for patterns
 * longer than RegExp::kRegExpTooLargeToOptimize = 20 KB, and a 2k→20k naive
 * alternation degrades by three orders of magnitude; the trie pattern degrades
 * far less but still 4× past the cliff, while Aho–Corasick is flat (9.1 ms at
 * 2k entries, 12.1 ms at 20k, for a 285 KB corpus — docs/research/lexicon.md §1).
 * The 16 KiB budget keeps a safety margin under the 20 KB cliff.
 *
 * LAW (tests/unit/lexicon/matcher.test.ts): both engines return exactly the
 * matches of the naive reference (scan every position, longest valid form).
 */
import { ahoCorasickMatch } from './aho-corasick.ts';
import { type SurfaceForm, surfaceForms } from './forms.ts';
import { best, type Candidate, type Match, resolveLeftmostLongest } from './resolve.ts';
import { fold, normalizeSpaces } from './text.ts';
import { buildTrie, trieToRegexBody, withBoundaries } from './trie.ts';
import type { LexiconEntry } from './types.ts';

export type { Match } from './resolve.ts';

export const ENGINES = ['regex', 'aho-corasick'] as const;
export type Engine = (typeof ENGINES)[number];

export interface Matcher {
  readonly engine: Engine;
  /** Number of surface forms searched. */
  readonly forms: number;
  /** Compiled regex sources (regex engine only), for diagnostics and the budget check. */
  readonly sources: readonly string[];
  /** Non-overlapping, leftmost-longest dictionary matches in an NFC text. */
  readonly match: (text: string) => readonly Match[];
}

export interface MatcherOptions {
  /** 'auto' (default) picks the regex engine while its sources fit the budget. */
  readonly engine?: Engine | 'auto';
  /** Maximum length (UTF-16 code units) of one compiled pattern source. */
  readonly regexBudget?: number;
}

export const DEFAULT_REGEX_BUDGET = 16 * 1024;

interface CompiledPattern {
  readonly source: string;
  readonly regex: RegExp;
  readonly folded: boolean;
  readonly forms: ReadonlyMap<string, readonly SurfaceForm[]>;
}

const groupByKey = (forms: readonly SurfaceForm[]): ReadonlyMap<string, readonly SurfaceForm[]> => {
  const map = new Map<string, SurfaceForm[]>();
  for (const f of forms) {
    const list = map.get(f.key);
    if (list === undefined) map.set(f.key, [f]);
    else list.push(f);
  }
  return map;
};

const compilePattern = (forms: readonly SurfaceForm[], folded: boolean): CompiledPattern | undefined => {
  const byKey = groupByKey(forms);
  const body = trieToRegexBody(buildTrie(byKey.keys()));
  if (body === undefined) return undefined;
  const source = withBoundaries(body);
  return { source, regex: new RegExp(source, 'gu'), folded, forms: byKey };
};

/**
 * The regex engine: lazily asks each pattern for its next match at or after `pos`.
 *
 * Each compiled RegExp object is reused across calls (constructing one per call
 * costs ~300× more than an `exec`). Its only state, `lastIndex`, is set
 * immediately before every `exec`, and `exec` runs no user code, so no state
 * survives between calls: `match` stays a pure function of its argument.
 */
const regexMatch =
  (patterns: readonly CompiledPattern[]) =>
  (text: string): readonly Match[] => {
    const folded = patterns.some((p) => p.folded) ? fold(text) : text;
    const cursors = patterns.map((p) => ({
      pattern: p,
      regex: p.regex,
      cached: undefined as Candidate | null | undefined,
    }));
    const next = (pos: number): Candidate | undefined => {
      let winner: Candidate | undefined;
      for (const cursor of cursors) {
        if (cursor.cached === undefined || (cursor.cached !== null && cursor.cached.start < pos)) {
          cursor.regex.lastIndex = pos;
          const m = cursor.regex.exec(cursor.pattern.folded ? folded : text);
          if (m === null) cursor.cached = null;
          else {
            const start = m.index;
            const end = start + m[0].length;
            const key = normalizeSpaces(m[0]);
            const forms = cursor.pattern.forms.get(key) ?? [];
            const top = forms.reduce<SurfaceForm | undefined>(
              (acc, f) => (acc === undefined || f.rank < acc.rank ? f : acc),
              undefined,
            );
            cursor.cached = top === undefined ? null : { start, end, form: top };
          }
        }
        winner = best(winner, cursor.cached ?? undefined);
      }
      return winner;
    };
    return resolveLeftmostLongest(next);
  };

/** Compiles the dictionary entries into a matcher (pure; selection rule in the module comment). */
export const compileMatcher = (entries: readonly LexiconEntry[], options: MatcherOptions = {}): Matcher => {
  const forms = surfaceForms(entries);
  const engine = options.engine ?? 'auto';
  const budget = options.regexBudget ?? DEFAULT_REGEX_BUDGET;
  if (engine !== 'aho-corasick') {
    const patterns = [
      compilePattern(
        forms.filter((f) => !f.fold),
        false,
      ),
      compilePattern(
        forms.filter((f) => f.fold),
        true,
      ),
    ].filter((p): p is CompiledPattern => p !== undefined);
    const sources = patterns.map((p) => p.source);
    if (engine === 'regex' || sources.every((s) => s.length <= budget)) {
      return { engine: 'regex', forms: forms.length, sources, match: regexMatch(patterns) };
    }
  }
  const ac = ahoCorasickMatch(forms);
  return { engine: 'aho-corasick', forms: forms.length, sources: [], match: ac.match };
};
