/**
 * Search excerpts for the command palette (transform: page text → segments).
 *
 * What Pagefind 1.5.2 gives (pagefind.js, `loadFragment` / `build_excerpt`):
 *   content    the page's indexed text, raw;
 *   locations  indices of the matched words in content.split(/[\r\n\s]+/g);
 *   excerpt    a window of those words, joined by single spaces, the matched ones
 *              wrapped in <mark>, built from raw_content = content with
 *              "<" → "&lt;" and ">" → "&gt;" — and nothing else: "&" stays raw.
 * That escaping is not injective: a page that literally says "&lt;" and a page
 * that says "<" yield the same excerpt, so no decoder of `excerpt` can show the
 * page's text (review chrome#1: "escreve-se &lt;script&gt;" came out as
 * "escreve-se <script>").
 *
 * excerptFromContent therefore rebuilds the excerpt from `content` and
 * `locations` and decodes nothing: it chooses a window of whole words and
 * slices the ORIGINAL string, marking the matched words. Law (information
 * preservation, docs/arquitetura.md §2.4): the text of the result is a
 * substring of the page text that starts and ends on word boundaries, and the
 * marked segments are exactly the matched words inside the window
 * (tests/unit/chrome/excerpt-nav.test.ts). The shell renders segments with text
 * nodes and <mark> elements only, never innerHTML.
 *
 * sanitiseExcerpt is the fallback for a result without usable `content`: it
 * parses Pagefind's `excerpt` allowing exactly one element (<mark>, every other
 * tag dropped) and undoes exactly Pagefind's escaping (&lt; &gt;). It is a left
 * inverse of that escaping only for texts that do not themselves contain
 * "&lt;" or "&gt;" — the ambiguity above, which only the primary path avoids.
 */

export interface ExcerptSegment {
  readonly text: string;
  readonly marked: boolean;
}

/** Excerpt length in words: Pagefind's default `excerptLength`. */
export const EXCERPT_WORDS = 30;

/** Pagefind's escaping of raw_content: only "<" and ">" ("&" is left raw). */
export const escapePagefind = (s: string): string => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Undoes escapePagefind (exactly &lt; and &gt;; any other "&…;" is page text and stays verbatim). */
export const unescapePagefind = (s: string): string =>
  s.replace(/&(lt|gt);/g, (_, name: string) => (name === 'lt' ? '<' : '>'));

interface Word {
  /** Offsets in the content string: [start, end). An empty word has start = end. */
  readonly start: number;
  readonly end: number;
}

/**
 * The words of a text in Pagefind's numbering: the pieces of
 * content.split(/[\r\n\s]+/g), with their offsets. A leading or trailing
 * separator yields an empty first or last word, exactly as split does, so
 * Pagefind's `locations` index this array.
 */
export const pagefindWords = (content: string): readonly Word[] => {
  const words: Word[] = [];
  let start = 0;
  for (const m of content.matchAll(/\s+/g)) {
    words.push({ start, end: m.index });
    start = m.index + m[0].length;
  }
  words.push({ start, end: content.length });
  return words;
};

/**
 * First word of the excerpt window: the window of `length` words holding the
 * most matched words; among the first run of consecutive best windows, the
 * middle one, so the matches sit in the middle of the excerpt (Pagefind's
 * calculate_excerpt_region, with one point per match instead of its
 * relevance weights). No match: the start of the text.
 */
export const excerptWindowStart = (matched: readonly number[], wordCount: number, length: number): number => {
  if (wordCount <= length || matched.length === 0) return 0;
  const hits = new Array<number>(wordCount).fill(0);
  for (const i of matched) hits[i] = (hits[i] ?? 0) + 1;
  let sum = 0;
  for (let i = 0; i < length; i++) sum += hits[i] ?? 0;
  let best = sum;
  let runStart = 0;
  let runEnd = 0;
  let inRun = true;
  for (let s = 1; s + length <= wordCount; s++) {
    sum += (hits[s + length - 1] ?? 0) - (hits[s - 1] ?? 0);
    if (sum > best) {
      best = sum;
      runStart = s;
      runEnd = s;
      inRun = true;
    } else if (sum === best && inRun && runEnd === s - 1) runEnd = s;
    else inRun = false;
  }
  return runStart + Math.floor((runEnd - runStart) / 2);
};

/**
 * Builds the excerpt from the raw page text and the matched word indices
 * (Pagefind's `content` and `locations`). Indices that are not words of the
 * text are ignored. Whitespace inside the window is kept as in the page; the
 * window is trimmed to its first and last non-empty word.
 */
export const excerptFromContent = (
  content: string,
  locations: readonly number[],
  length: number = EXCERPT_WORDS,
): readonly ExcerptSegment[] => {
  const words = pagefindWords(content);
  const size = Number.isFinite(length) && length >= 1 ? Math.floor(length) : EXCERPT_WORDS;
  const matched = [...new Set(locations)]
    .filter((i) => Number.isInteger(i) && i >= 0 && i < words.length)
    .sort((a, b) => a - b);
  const first = excerptWindowStart(matched, words.length, size);
  const window = words.slice(first, first + size).filter((w) => w.end > w.start);
  const head = window[0];
  const tail = window[window.length - 1];
  if (head === undefined || tail === undefined) return [];

  const out: ExcerptSegment[] = [];
  const push = (text: string, marked: boolean): void => {
    if (text.length > 0) out.push({ text, marked });
  };
  let cursor = head.start;
  for (const i of matched) {
    const w = words[i];
    if (w === undefined || i < first || i >= first + size || w.end === w.start) continue;
    push(content.slice(cursor, w.start), false);
    push(content.slice(w.start, w.end), true);
    cursor = w.end;
  }
  push(content.slice(cursor, tail.end), false);
  return out;
};

// A start or end tag (or comment / doctype). Anything that is not a tag is text.
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^<>]*>|<!--[\s\S]*?-->|<![^<>]*>/g;

/**
 * Fallback: parses Pagefind's excerpt string into segments. Adjacent segments
 * with the same flag are merged; empty segments are dropped. Nested <mark>
 * counts as one level; unbalanced tags degrade gracefully (an unclosed <mark>
 * marks the rest).
 */
export const sanitiseExcerpt = (html: string): readonly ExcerptSegment[] => {
  const out: ExcerptSegment[] = [];
  let depth = 0;
  let last = 0;
  const push = (raw: string): void => {
    const text = unescapePagefind(raw);
    if (text.length === 0) return;
    const marked = depth > 0;
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.marked === marked) out[out.length - 1] = { text: prev.text + text, marked };
    else out.push({ text, marked });
  };
  for (const m of html.matchAll(TAG)) {
    push(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2]?.toLowerCase() === 'mark') depth = m[1] === '/' ? Math.max(0, depth - 1) : depth + 1;
  }
  push(html.slice(last));
  return out;
};

/** Plain text of an excerpt (what a screen reader would read). */
export const excerptText = (segments: readonly ExcerptSegment[]): string => segments.map((s) => s.text).join('');
