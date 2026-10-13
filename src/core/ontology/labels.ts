/**
 * Label index — resolves the text of `:concept[texto]` (no explicit id) to a
 * concept, in the document's locale.
 *
 * Keys are `labelKey` (NFC, locale lower case, typographic folding); both
 * prefLabel and every altLabel of the locale are indexed. SKOS allows homonymous
 * altLabels across concepts, so a key maps to a SET of ids and the lookup is a
 * three-way result: exactly one concept, none, or an ambiguity the author must
 * settle with an explicit `{id=…}`.
 */
import type { ConceptId } from '../domain/identifiers.ts';
import { LOCALES, type Locale } from '../domain/locale.ts';
import type { ConceptGraph } from './graph.ts';
import type { ConceptEntry } from './model.ts';
import { labelKey, searchKey } from './text.ts';

export type LabelLookup =
  | { readonly kind: 'found'; readonly id: ConceptId }
  | { readonly kind: 'unknown'; readonly key: string; readonly suggestions: readonly ConceptId[] }
  | { readonly kind: 'ambiguous'; readonly key: string; readonly ids: readonly ConceptId[] };

export type LabelIndex = Readonly<Record<Locale, ReadonlyMap<string, readonly ConceptId[]>>>;

export const labelsOf = (e: ConceptEntry, locale: Locale): readonly string[] => [e.prefLabel[locale], ...e.altLabel[locale]];

export const buildLabelIndex = (g: ConceptGraph): LabelIndex => {
  const index = {} as Record<Locale, ReadonlyMap<string, readonly ConceptId[]>>;
  for (const locale of LOCALES) {
    const map = new Map<string, ConceptId[]>();
    for (const id of g.ids) {
      const e = g.concepts.get(id);
      if (e === undefined) continue;
      for (const label of labelsOf(e, locale)) {
        const key = labelKey(label, locale);
        const ids = map.get(key) ?? [];
        if (!ids.includes(id)) map.set(key, [...ids, id]);
      }
    }
    index[locale] = map;
  }
  return index;
};

/**
 * Resolves a label. On failure, suggests concepts whose labels contain the
 * accent-insensitive search key (or are contained in it), to make the build
 * error actionable.
 */
export const lookupLabel = (index: LabelIndex, label: string, locale: Locale): LabelLookup => {
  const key = labelKey(label, locale);
  const ids = index[locale].get(key) ?? [];
  const [first] = ids;
  if (ids.length === 1 && first !== undefined) return { kind: 'found', id: first };
  if (ids.length > 1) return { kind: 'ambiguous', key, ids };
  const needle = searchKey(label, locale);
  const suggestions = new Set<ConceptId>();
  if (needle.length > 0) {
    for (const [k, candidates] of index[locale]) {
      const hay = searchKey(k, locale);
      if (hay.includes(needle) || needle.includes(hay)) for (const c of candidates) suggestions.add(c);
    }
  }
  return { kind: 'unknown', key, suggestions: [...suggestions].sort().slice(0, 5) };
};
