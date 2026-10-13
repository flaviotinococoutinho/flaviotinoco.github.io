/**
 * Shared linguistic data of the styles: articles and monosyllables (for entries
 * and calls by title), month tables, and the detection of the "first words" of a
 * title (NBR 6023 §8.1.4 / NBR 10520 §6.1.1.4).
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

/** APA 7 spells months in full (APA Publication Manual §9.14). */
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
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', // pt
  'the', 'an', // en ("a" above)
  'le', 'la', 'les', "l'", 'l’', 'un', 'une', 'des', // fr
  'el', 'los', 'las', 'lo', // es
  'der', 'die', 'das', 'ein', 'eine', // de
  'il', 'gli', 'i', // it
]);

/** Vowel nuclei; a word with exactly one is a monosyllable (heuristic for Portuguese spelling). */
const NUCLEUS = /[aeiouyáéíóúâêîôûãõàèìòùäëïöü]+/giu;

export const isArticleOrMonosyllable = (word: string): boolean => {
  const w = word.toLowerCase().replace(/[.,;:!?]+$/u, '');
  return ARTICLES.has(w) || (w.match(NUCLEUS)?.length ?? 0) === 1;
};

/**
 * End offset of the words that open an entry or call by title: the first word,
 * plus the next one when the first is an article or a monosyllable
 * ("A flor [...]", "Nos canaviais [...]", "OS GRANDES clássicos").
 * Returns the end offset and whether the whole title is covered.
 */
export const leadingWords = (m: MarkedText): { readonly end: number; readonly whole: boolean } => {
  const words = [...m.text.matchAll(/\S+/gu)];
  const first = words[0];
  if (first === undefined) return { end: 0, whole: true };
  const take = isArticleOrMonosyllable(first[0]) && words.length > 1 ? 2 : 1;
  const last = words[take - 1] as RegExpMatchArray;
  const end = (last.index ?? 0) + last[0].length;
  return { end, whole: take >= words.length };
};
