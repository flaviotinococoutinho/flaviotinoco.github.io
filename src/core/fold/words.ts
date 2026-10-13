/**
 * Word counting and reading time — folds over the prose of a document.
 *
 * Words are Unicode word segments (UAX #29 via Intl.Segmenter, with the
 * document's locale) that are word-like, with one orthographic refinement:
 * segments joined by a single hyphen form one word ("guarda-chuva",
 * "disse-lhe", "well-known"), as the hyphen is a word-internal sign in
 * Portuguese orthography (Acordo Ortográfico de 1990, Bases XV–XVII) and in English
 * compounds. Apostrophes are already word-internal in UAX #29 ("d’água").
 *
 * Reading time follows M. Brysbaert, "How many words do we read per minute? A
 * review and meta-analysis of reading rate", Journal of Memory and Language
 * 109 (2019) 104047, doi:10.1016/j.jml.2019.104047: 238 words per minute for
 * silent reading of non-fiction by adults. Rounded up, at least one minute.
 */
import type { Locale } from '../domain/locale.ts';

export const WORDS_PER_MINUTE = 238;

const HYPHENS = new Set(['-', '‐', '‑']);

/** Number of words in a string of prose. */
export const countWords = (text: string, locale: Locale): number => {
  const segments = [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)];
  let count = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    if (s === undefined || s.isWordLike !== true) continue;
    const prev = segments[i - 1];
    const before = segments[i - 2];
    const joined = prev !== undefined && HYPHENS.has(prev.segment) && before !== undefined && before.isWordLike === true;
    if (!joined) count += 1;
  }
  return count;
};

/** Brysbaert (2019): minutes = ⌈words / 238⌉, at least 1. */
export const readingMinutes = (words: number, wordsPerMinute: number = WORDS_PER_MINUTE): number =>
  Math.max(1, Math.ceil(Math.max(0, words) / wordsPerMinute));
