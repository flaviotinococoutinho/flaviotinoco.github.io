/**
 * Character trie over NFC (and, for insensitive forms, folded) keys, and its
 * compiler to a prefix-factored JavaScript regular expression.
 *
 * Why factor prefixes instead of joining the terms with "|": V8's irregexp is a
 * backtracking engine — at every start position it tries the alternatives in
 * order, so a naive alternation of N terms costs O(N) attempts per position.
 * A trie-shaped pattern shares each prefix once: at any node the next character
 * selects at most one branch (children are distinct characters), so the work per
 * position is bounded by the length of the longest key, not by the number of
 * keys. Measurements on Node 22 / V8 12.4 (docs/research/lexicon.md §1): at 5k
 * terms the naive alternation needs 3.4 s for a 285 KB corpus, the trie 37 ms.
 *
 * Longest-match semantics: a terminal node with children emits `(?:children)?`
 * — a GREEDY optional — so the depth-first search of the backtracking engine
 * tries every extension before accepting the shorter key; together with the
 * boundary look-ahead after the group, the first successful match at a position
 * is the longest key with a valid right boundary. Children that are leaves are
 * collapsed into one character class.
 *
 * A U+0020 in a key compiles to `\s+` (any whitespace run; see text.ts).
 */
import { BOUNDARY_AFTER, BOUNDARY_BEFORE, escapeClassChar, escapeLiteral } from './text.ts';

export interface TrieNode {
  readonly terminal: boolean;
  /** Children by code point, in insertion order. */
  readonly children: ReadonlyMap<string, TrieNode>;
}

interface MutableNode {
  terminal: boolean;
  readonly children: Map<string, MutableNode>;
}

/** Builds a trie over the code points of the keys (empty keys are ignored). */
export const buildTrie = (keys: Iterable<string>): TrieNode => {
  const root: MutableNode = { terminal: false, children: new Map() };
  for (const key of keys) {
    if (key.length === 0) continue;
    let node = root;
    for (const ch of key) {
      let child = node.children.get(ch);
      if (child === undefined) {
        child = { terminal: false, children: new Map() };
        node.children.set(ch, child);
      }
      node = child;
    }
    node.terminal = true;
  }
  return root;
};

/** Pattern for the non-empty suffixes below `node` (which must have children). */
const suffixPattern = (node: TrieNode): string => {
  const branches: string[] = [];
  const leaves: string[] = [];
  const keys = [...node.children.keys()].sort();
  for (const ch of keys) {
    const child = node.children.get(ch);
    if (child === undefined) continue;
    if (child.children.size === 0 && ch !== ' ') {
      leaves.push(ch);
      continue;
    }
    const below = child.children.size === 0 ? '' : suffixPattern(child);
    branches.push(escapeLiteral(ch) + (child.terminal && below !== '' ? `(?:${below})?` : below));
  }
  if (leaves.length === 1) branches.push(escapeLiteral(leaves[0] ?? ''));
  else if (leaves.length > 1) branches.push(`[${leaves.map(escapeClassChar).join('')}]`);
  return branches.length === 1 ? (branches[0] ?? '') : `(?:${branches.join('|')})`;
};

/**
 * Compiles a trie to a regex BODY (no boundaries, no flags). Returns undefined
 * for an empty trie: an empty pattern would match the empty string everywhere.
 */
export const trieToRegexBody = (trie: TrieNode): string | undefined =>
  trie.children.size === 0 ? undefined : suffixPattern(trie);

/** Wraps a body with the Unicode word-boundary look-arounds (use with the `u` flag). */
export const withBoundaries = (body: string): string => `${BOUNDARY_BEFORE}(?:${body})${BOUNDARY_AFTER}`;

/**
 * The naive alternative, for benchmarks and documentation only: every key as a
 * separate alternative, longest first. Never used by the matcher.
 */
export const naiveAlternationBody = (keys: Iterable<string>): string | undefined => {
  const unique = [...new Set(keys)].filter((k) => k.length > 0);
  if (unique.length === 0) return undefined;
  return unique
    .sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))
    .map((k) => [...k].map(escapeLiteral).join(''))
    .join('|');
};
