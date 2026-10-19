/**
 * Glossary (A–Z) of the concept scheme in one locale, in the thesaurus
 * convention of ANSI/NISO Z39.19-2005 §8: every prefLabel is an entry, and
 * every altLabel is a non-preferred entry that points to its preferred term
 * ("USE"). Entries are sorted with the locale's collation (Intl.Collator,
 * base sensitivity — accents and case only break ties) and grouped under the
 * initial letter with diacritics removed ("É" files under "E"); entries that do
 * not start with a letter are grouped under "#".
 */
import type { ConceptId } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import type { ConceptGraph } from './graph.ts';
import { stripDiacritics } from './text.ts';

export interface GlossaryEntry {
  readonly term: string;
  readonly id: ConceptId;
  /** 'pref' for the preferred term; 'alt' for a non-preferred term that refers to it. */
  readonly kind: 'pref' | 'alt';
}

export interface GlossarySection {
  /** "A" … "Z", or "#" for terms not starting with a letter. */
  readonly letter: string;
  readonly entries: readonly GlossaryEntry[];
}

export const initialOf = (term: string, locale: Locale): string => {
  const first = stripDiacritics(term.trim()).charAt(0).toLocaleUpperCase(locale);
  return /\p{L}/u.test(first) ? first : '#';
};

export const glossary = (g: ConceptGraph, locale: Locale): readonly GlossarySection[] => {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const entries: GlossaryEntry[] = g.ids.flatMap((id) => {
    const e = g.concepts.get(id);
    if (e === undefined) return [];
    return [
      { term: e.prefLabel[locale], id, kind: 'pref' as const },
      ...e.altLabel[locale].map((term) => ({ term, id, kind: 'alt' as const })),
    ];
  });
  entries.sort(
    (a, b) =>
      collator.compare(a.term, b.term) ||
      (a.term < b.term ? -1 : a.term > b.term ? 1 : 0) ||
      (a.kind === b.kind ? 0 : a.kind === 'pref' ? -1 : 1) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  // Grouped in order of first appearance (the collation order); '#' first, as in printed indexes.
  const groups = new Map<string, GlossaryEntry[]>();
  for (const entry of entries) {
    const letter = initialOf(entry.term, locale);
    groups.set(letter, [...(groups.get(letter) ?? []), entry]);
  }
  const sections = [...groups].map(([letter, list]) => ({ letter, entries: list }));
  return [...sections.filter((s) => s.letter === '#'), ...sections.filter((s) => s.letter !== '#')];
};
