/**
 * Shared linguistic data of the styles: articles and monosyllables (for entries
 * and calls by title), month tables, and the detection of the "first words" of a
 * title (NBR 6023:2025 §8.1.4 / NBR 10520:2023 §6.1.1.4).
 */
import type { MarkedText } from '../bibtex/latex.ts';
import type { Month } from '../model/reference.ts';

/** NBR 6023:2025 Anexo A (Portuguese month abbreviations; "maio" is never abbreviated). */
export const MONTHS_PT: Readonly<Record<Month, string>> = {
  1: 'jan.',
  2: 'fev.',
  3: 'mar.',
  4: 'abr.',
  5: 'maio',
  6: 'jun.',
  7: 'jul.',
  8: 'ago.',
  9: 'set.',
  10: 'out.',
  11: 'nov.',
  12: 'dez.',
};

/** APA 7 spells months in full (APA Publication Manual, 7th ed., §9.14). */
export const MONTHS_EN: Readonly<Record<Month, string>> = {
  1: 'January',
  2: 'February',
  3: 'March',
  4: 'April',
  5: 'May',
  6: 'June',
  7: 'July',
  8: 'August',
  9: 'September',
  10: 'October',
  11: 'November',
  12: 'December',
};

/** Definite and indefinite articles of the languages the bibliography uses. */
const ARTICLES = new Set([
  // pt
  'o',
  'a',
  'os',
  'as',
  'um',
  'uma',
  'uns',
  'umas',
  // en ("a" above)
  'the',
  'an',
  // fr
  'le',
  'la',
  'les',
  "l'",
  'l’',
  'un',
  'une',
  'des',
  // es
  'el',
  'los',
  'las',
  'lo',
  // de
  'der',
  'die',
  'das',
  'ein',
  'eine',
  // it
  'il',
  'gli',
  'i',
]);

/** Vowel nuclei; a word with exactly one is a monosyllable (heuristic for Romance spelling). */
const NUCLEUS = /[aeiouyáéíóúâêîôûãõàèìòùäëïöü]+/giu;

/**
 * Whether a word "counts" with the next one in an entry by title. The norm says
 * "artigo (definido ou indefinido) ou monossílabo"; the monosyllable test is a
 * property of Portuguese words, so for titles in other languages only articles
 * count (otherwise "Words of…" would take two words, like "A GAME of Thrones").
 */
export const isArticleOrMonosyllable = (word: string, language?: string): boolean => {
  const w = word.toLowerCase().replace(/[.,;:!?]+$/u, '');
  const portuguese = language === undefined || language.toLowerCase().split('-')[0] === 'pt';
  return ARTICLES.has(w) || (portuguese && (w.match(NUCLEUS)?.length ?? 0) === 1);
};

/**
 * End offset of the words that open an entry or call by title: the first word,
 * plus the next one when the first is an article or a monosyllable
 * ("A flor [...]", "Nos canaviais [...]", "OS GRANDES clássicos").
 * Returns the end offset and whether the whole title is covered.
 */
export const leadingWords = (m: MarkedText, language?: string): { readonly end: number; readonly whole: boolean } => {
  const words = [...m.text.matchAll(/\S+/gu)];
  const first = words[0];
  if (first === undefined) return { end: 0, whole: true };
  const take = isArticleOrMonosyllable(first[0], language) && words.length > 1 ? 2 : 1;
  const last = words[take - 1] as RegExpExecArray;
  const end = last.index + last[0].length;
  return { end, whole: take >= words.length };
};
