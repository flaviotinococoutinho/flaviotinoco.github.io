/**
 * Word lists → the keys of the lexicon Bloom filter (pure).
 *
 * Inputs: a Hunspell dictionary (.dic, optionally with its .aff: forms are
 * generated, see hunspell.ts; without .aff the affix markers are stripped and
 * only stems remain) or a plain list (one word per line; a frequency list's
 * "word count" lines contribute the word; "#" lines are comments).
 *
 * Normalisation (the same the lint applies to the words it looks up): NFC
 * (UAX #15), then split at hyphens and apostrophes — the lint tokenises prose
 * with Intl.Segmenter, for which "disse-lhe" is "disse" + "lhe" and "d’água" is
 * split by the lint into "d" and "água" — and keep parts with a letter. Keys
 * are deduplicated by their case fold, so `n` counts distinct keys; the filter
 * itself folds case (header flag), so case variants are one key.
 */
import { fold } from '../../src/core/lexicon/text.ts';
import { expandDictionary, NO_AFFIXES, type Affixes } from './hunspell.ts';

export type WordListFormat = 'hunspell' | 'plain';

/** `.dic` (optionally gzip-compressed) is a Hunspell dictionary; anything else a plain list. */
export const formatOf = (name: string): WordListFormat => (/\.dic(\.gz)?$/iu.test(name) ? 'hunspell' : 'plain');

/** The lexicon parts of one form ("bem-vindo" → bem, vindo). */
export const formParts = (form: string): readonly string[] =>
  form
    .normalize('NFC')
    .split(/[-‐‑'’]/u)
    .filter((p) => /\p{L}/u.test(p));

export interface KeySet {
  readonly add: (form: string) => void;
  readonly keys: () => readonly string[];
  readonly size: () => number;
}

/** A set of lexicon keys (deduplicated by case fold, first spelling kept). */
export const keySet = (): KeySet => {
  const map = new Map<string, string>();
  return {
    add: (form) => {
      for (const part of formParts(form)) {
        const key = fold(part);
        if (!map.has(key)) map.set(key, part);
      }
    },
    keys: () => [...map.values()],
    size: () => map.size,
  };
};

/** Lines of a plain word list. */
export const plainWords = (text: string, emit: (word: string) => void): number => {
  let count = 0;
  for (const raw of text.replace(/^﻿/u, '').split(/\r?\n/u)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const word = line.split(/\s+/u)[0] ?? '';
    if (word === '') continue;
    emit(word);
    count += 1;
  }
  return count;
};

export interface Collected {
  readonly keys: readonly string[];
  /** Entries read from the source (stems of a .dic, lines of a plain list). */
  readonly entries: number;
}

/** Collects the keys of a word list. */
export const collectKeys = (format: WordListFormat, text: string, affixes: Affixes | undefined): Collected => {
  const set = keySet();
  const entries =
    format === 'hunspell' ? expandDictionary(text, affixes ?? NO_AFFIXES, set.add) : plainWords(text, set.add);
  return { keys: set.keys(), entries };
};
