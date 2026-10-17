/**
 * Surface forms: the exact strings an engine looks for, derived from entries.
 *
 * Every matching engine (trie-compiled regex, Aho–Corasick, and the naive
 * reference used by the tests) consumes the SAME list of forms, so their
 * equivalence is a statement about search strategy only, never about which
 * strings count as a hit.
 *
 *   case exact        → the spelling itself                       (fold = false)
 *   case sentence     → the spelling and its capitalised variant  (fold = false)
 *   case insensitive  → fold(spelling), compared on folded text   (fold = true)
 *
 * Spellings are the term plus its variants (foreign/Latin) and, for acronyms
 * ending in a capital letter, the plural with lower-case "s" (CPUs, APIs — the
 * Brazilian Senate style guide forms acronym plurals without apostrophe).
 * Each form gets a `rank`: when several forms match the same span, the lowest
 * rank wins (kind order of KIND_RANK, then exact before folded, then file order).
 */
import { fold, upperFirst } from './text.ts';
import { KIND_RANK, type LexiconEntry } from './types.ts';

export interface SurfaceForm {
  /** NFC; single U+0020 between words; folded when `fold` is true. */
  readonly key: string;
  readonly fold: boolean;
  readonly entry: LexiconEntry;
  readonly rank: number;
}

const spellings = (entry: LexiconEntry): readonly string[] => {
  switch (entry.kind) {
    case 'foreign':
    case 'latin':
      return [entry.term, ...entry.variants];
    case 'acronym':
      return /\p{Lu}$/u.test(entry.term) ? [entry.term, `${entry.term}s`] : [entry.term];
    case 'proper':
    case 'homograph':
      return [entry.term];
  }
};

const formsOf = (entry: LexiconEntry): readonly { readonly key: string; readonly fold: boolean }[] => {
  const out = new Map<string, { readonly key: string; readonly fold: boolean }>();
  for (const s of spellings(entry)) {
    switch (entry.casePolicy) {
      case 'exact':
        out.set(`e:${s}`, { key: s, fold: false });
        break;
      case 'sentence':
        out.set(`e:${s}`, { key: s, fold: false });
        out.set(`e:${upperFirst(s)}`, { key: upperFirst(s), fold: false });
        break;
      case 'insensitive':
        out.set(`f:${fold(s)}`, { key: fold(s), fold: true });
        break;
    }
  }
  return [...out.values()];
};

/** Derives the ranked surface forms of a list of entries (pure, deterministic). */
export const surfaceForms = (entries: readonly LexiconEntry[]): readonly SurfaceForm[] => {
  const unranked = entries.flatMap((entry, order) => formsOf(entry).map((f) => ({ ...f, entry, order })));
  const sorted = [...unranked].sort(
    (a, b) => KIND_RANK[a.entry.kind] - KIND_RANK[b.entry.kind] || Number(a.fold) - Number(b.fold) || a.order - b.order,
  );
  return sorted.map(({ key, fold: folded, entry }, rank) => ({ key, fold: folded, entry, rank }));
};
