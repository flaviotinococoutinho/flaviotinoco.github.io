/**
 * Unknown-word discovery (pure; no I/O).
 *
 *   prose of the final mdast ──tokenise──▶ words ──drop dictionary words──▶
 *   ──Bloom filter of the pt-BR lexicon──▶ words DEFINITELY absent = candidates
 *
 * A Bloom filter (Bloom, 1970) has no false negatives: if a word was inserted,
 * `bloomHas` is true. A "no" is therefore certain, and only such words are
 * reported — a Portuguese word that is in the filter's word list is never
 * flagged (property test: tests/unit/cli/discovery.test.ts). A "yes" is wrong
 * with probability ≈ p, which only means a foreign word goes unreported. That is
 * why the filter drives suggestions and never markup (docs/research/lexicon.md §2).
 *
 * What is prose: text nodes of the tree the stages produced, with a source
 * position, outside code, inline code, math, raw HTML, images, link URLs and
 * autolinks; outside the abnt marks (:foreign, :name, :abbr, :raw — already
 * classified by the dictionary or by the author) and outside text that a stage
 * generated (citations, reference lists, numbering: no source position). Directive
 * attributes are not text nodes, so they are never read.
 */
import type { Root } from 'mdast';
import { bloomHas, type BloomFilter } from '../../src/core/lexicon/bloom.ts';
import { fold } from '../../src/core/lexicon/text.ts';
import type { LexiconEntry } from '../../src/core/lexicon/types.ts';

/** A word of the prose with its offset (UTF-16) in the document body. */
export interface Token {
  readonly word: string;
  readonly offset: number;
}

/** A candidate foreign term: first occurrence and number of occurrences in the document. */
export interface Candidate {
  readonly word: string;
  readonly offset: number;
  readonly count: number;
  /** Shape of the surface form, for the suggested `ft lexicon add` command. */
  readonly shape: 'lower' | 'capitalised' | 'upper';
}

interface AnyNode {
  readonly type: string;
  readonly value?: unknown;
  readonly url?: unknown;
  readonly name?: unknown;
  readonly children?: readonly AnyNode[];
  readonly position?: { readonly start: { readonly offset?: number }; readonly end: { readonly offset?: number } };
  readonly data?: { readonly hName?: unknown };
}

/** Node types that never contain prose (or whose text is an attribute). */
const OPAQUE = new Set([
  'code',
  'inlineCode',
  'math',
  'inlineMath',
  'html',
  'yaml',
  'toml',
  'definition',
  'footnoteReference',
  'image',
  'imageReference',
]);

/** Marks of the abnt stage whose content is already classified. */
const CLASSIFIED_MARKS = new Set(['foreign', 'name', 'abbr', 'raw']);

/** Elements whose content is not running prose (rendered by a stage, or raw HTML). */
const PROTECTED_ELEMENTS = new Set(['i', 'abbr', 'cite', 'code', 'kbd', 'samp', 'var', 'pre', 'math', 'svg']);

const VOID = new Set(['br', 'hr', 'img', 'input', 'wbr', 'meta', 'link', 'area', 'base', 'col', 'source']);

/** Open raw-HTML elements among siblings ("<i lang=de>" … "</i>"), as the abnt stage tracks them. */
const htmlStack = (stack: readonly string[], html: string): readonly string[] => {
  let next = [...stack];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/gu)) {
    const name = (m[2] ?? '').toLowerCase();
    if (VOID.has(name) || m[3] === '/') continue;
    if (m[1] === '/') {
      const at = next.lastIndexOf(name);
      if (at >= 0) next = next.slice(0, at);
    } else next.push(name);
  }
  return next;
};

const textOf = (n: AnyNode): string =>
  typeof n.value === 'string' ? n.value : (n.children ?? []).map(textOf).join('');

const isAutolink = (n: AnyNode): boolean => {
  if (typeof n.url !== 'string') return false;
  const label = textOf(n).trim();
  return label === n.url || label === n.url.replace(/^mailto:/, '') || /^(https?:\/\/|www\.)/i.test(label);
};

const WORDS = new Map<string, Intl.Segmenter>();
const segmenter = (locale: string): Intl.Segmenter => {
  let s = WORDS.get(locale);
  if (s === undefined) {
    s = new Intl.Segmenter(locale, { granularity: 'word' });
    WORDS.set(locale, s);
  }
  return s;
};

/**
 * Word-like segments of a text (UAX #29 word boundaries, Intl.Segmenter). A
 * segment with an apostrophe ("d’água") contributes its parts; segments with
 * digits or an underscore are not words of a lexicon.
 */
export const words = (text: string, locale: string): readonly Token[] => {
  const out: Token[] = [];
  for (const s of segmenter(locale).segment(text)) {
    if (s.isWordLike !== true || /[\p{N}_]/u.test(s.segment) || !/\p{L}/u.test(s.segment)) continue;
    let at = 0;
    for (const part of s.segment.split(/['’]/u)) {
      if (part !== '') out.push({ word: part, offset: s.index + at });
      at += part.length + 1;
    }
  }
  return out;
};

/**
 * Tokens of the prose of a tree, with offsets into `source` (the text the
 * positions refer to). A token is located in its node's source slice, so
 * SmartyPants replacements before it ("--" → "–") cannot shift its column.
 */
export const proseTokens = (tree: Root, source: string, locale: string): readonly Token[] => {
  const out: Token[] = [];
  const visitText = (n: AnyNode): void => {
    const start = n.position?.start.offset;
    const end = n.position?.end.offset;
    if (typeof n.value !== 'string' || start === undefined || end === undefined) return;
    const slice = source.slice(start, end);
    let cursor = 0;
    for (const t of words(n.value, locale)) {
      const at = slice.indexOf(t.word, cursor);
      if (at >= 0) {
        out.push({ word: t.word, offset: start + at });
        cursor = at + t.word.length;
      } else out.push({ word: t.word, offset: start });
    }
  };
  const walk = (parent: AnyNode): void => {
    let html: readonly string[] = [];
    for (const child of parent.children ?? []) {
      if (child.type === 'html' && typeof child.value === 'string') {
        html = htmlStack(html, child.value);
        continue;
      }
      if (OPAQUE.has(child.type) || html.some((tag) => PROTECTED_ELEMENTS.has(tag))) continue;
      const hName = typeof child.data?.hName === 'string' ? child.data.hName : undefined;
      if (hName !== undefined && PROTECTED_ELEMENTS.has(hName)) continue;
      if (child.type === 'textDirective' && typeof child.name === 'string' && CLASSIFIED_MARKS.has(child.name)) {
        continue;
      }
      if (child.type === 'link' && isAutolink(child)) continue;
      if (child.type === 'text') visitText(child);
      else walk(child);
    }
  };
  walk(tree as unknown as AnyNode);
  return out;
};

/** The words of the site's dictionaries (every kind, terms and variants), case-folded NFC. */
export const dictionaryWords = (entries: readonly LexiconEntry[], locale: string): ReadonlySet<string> => {
  const out = new Set<string>();
  for (const e of entries) {
    const spellings = e.kind === 'foreign' || e.kind === 'latin' ? [e.term, ...e.variants] : [e.term];
    for (const s of spellings) for (const t of words(s, locale)) out.add(fold(t.word.normalize('NFC')));
  }
  return out;
};

const ROMAN = /^[IVXLCDM]+$/u;

const shapeOf = (w: string): Candidate['shape'] => {
  if (w.length > 1 && w === w.toUpperCase() && w !== w.toLowerCase()) return 'upper';
  const first = String.fromCodePoint(w.codePointAt(0) ?? 0);
  return first !== first.toLowerCase() ? 'capitalised' : 'lower';
};

export interface DiscoveryOptions {
  /** Words known to the site (dictionaries, frontmatter lexicon.ignore), case-folded NFC. */
  readonly known: ReadonlySet<string>;
  /** Membership in the general lexicon: false must be certain (a Bloom filter's "no"). */
  readonly inLexicon: (word: string) => boolean;
  /** Shortest word considered (default 2). */
  readonly minLength?: number;
}

/**
 * Candidates among the tokens, in order of first occurrence, one per folded
 * word. LAW: a token whose word satisfies `inLexicon` or is `known` is never part
 * of the result.
 */
export const unknownWords = (tokens: readonly Token[], options: DiscoveryOptions): readonly Candidate[] => {
  const min = options.minLength ?? 2;
  const seen = new Map<string, { word: string; offset: number; count: number }>();
  const verdict = new Map<string, boolean>();
  for (const t of tokens) {
    const word = t.word.normalize('NFC');
    if ([...word].length < min || ROMAN.test(word)) continue;
    const key = fold(word);
    let unknown = verdict.get(key);
    if (unknown === undefined) {
      unknown = !options.known.has(key) && !options.inLexicon(word);
      verdict.set(key, unknown);
    }
    if (!unknown) continue;
    const hit = seen.get(key);
    if (hit === undefined) seen.set(key, { word, offset: t.offset, count: 1 });
    else hit.count += 1;
  }
  return [...seen.values()].map((c) => ({ ...c, shape: shapeOf(c.word) }));
};

/** `inLexicon` backed by a Bloom filter (its normalisation flags are applied by bloomHas). */
export const bloomMembership =
  (filter: BloomFilter) =>
  (word: string): boolean =>
    bloomHas(filter, word);
