/**
 * Command palette — pure keyboard model and quick-navigation ranking.
 *
 * Interaction follows the WAI-ARIA Authoring Practices "Editable Combobox With
 * List Autocomplete" (APG, combobox pattern, listbox popup): DOM focus stays in
 * the text field; the active option is conveyed with aria-activedescendant.
 * The first option is selected automatically whenever a non-empty query has
 * results ("list autocomplete with automatic selection"), so Enter follows it.
 *
 *   ArrowDown  next option, wrapping to the first
 *   ArrowUp    previous option, wrapping to the last
 *   Enter      follow the active option
 *   Escape     close the palette (the native <dialog> also does)
 *   Home/End   are left to the text field (caret movement), as APG recommends.
 *
 * The reducer is a Mealy machine: (state, event) → (state, effect). The shell
 * performs the effect (navigation, closing) and renders the state.
 */
import { absurd } from '../algebra/match.ts';

export interface PaletteState {
  readonly query: string;
  /** Number of options currently listed. */
  readonly count: number;
  /** Index of the active option, or -1 for none. Invariant: -1 ≤ active < count. */
  readonly active: number;
}

export type PaletteKey = 'ArrowDown' | 'ArrowUp' | 'Enter' | 'Escape';

export type PaletteEvent =
  | { readonly type: 'query'; readonly query: string }
  | { readonly type: 'results'; readonly count: number }
  | { readonly type: 'key'; readonly key: PaletteKey }
  | { readonly type: 'point'; readonly index: number };

export type PaletteEffect =
  | { readonly kind: 'none' }
  | { readonly kind: 'follow'; readonly index: number }
  | { readonly kind: 'close' };

export interface PaletteStep {
  readonly state: PaletteState;
  readonly effect: PaletteEffect;
  /** Whether the shell must preventDefault() the originating keyboard event. */
  readonly handled: boolean;
}

export const INITIAL_PALETTE: PaletteState = { query: '', count: 0, active: -1 };

const NONE: PaletteEffect = { kind: 'none' };

const isPaletteKey = (key: string): key is PaletteKey =>
  key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === 'Escape';

/** Narrows a KeyboardEvent#key to the keys the model handles (others stay with the text field). */
export const toPaletteKey = (key: string): PaletteKey | null => (isPaletteKey(key) ? key : null);

const mod = (n: number, m: number): number => ((n % m) + m) % m;
const sanitiseCount = (n: number): number => (Number.isInteger(n) && n > 0 ? n : 0);

/** Automatic selection: first option when the query is non-empty and something matched. */
const autoActive = (query: string, count: number): number => (query.trim().length > 0 && count > 0 ? 0 : -1);

export const stepPalette = (state: PaletteState, event: PaletteEvent): PaletteStep => {
  switch (event.type) {
    case 'query':
      return {
        state: { query: event.query, count: state.count, active: autoActive(event.query, state.count) },
        effect: NONE,
        handled: false,
      };
    case 'results': {
      const count = sanitiseCount(event.count);
      return { state: { ...state, count, active: autoActive(state.query, count) }, effect: NONE, handled: false };
    }
    case 'point':
      return Number.isInteger(event.index) && event.index >= 0 && event.index < state.count
        ? { state: { ...state, active: event.index }, effect: NONE, handled: false }
        : { state, effect: NONE, handled: false };
    case 'key':
      switch (event.key) {
        case 'ArrowDown':
          return state.count === 0
            ? { state, effect: NONE, handled: true }
            : { state: { ...state, active: mod(state.active + 1, state.count) }, effect: NONE, handled: true };
        case 'ArrowUp':
          return state.count === 0
            ? { state, effect: NONE, handled: true }
            : {
                state: { ...state, active: state.active <= 0 ? state.count - 1 : state.active - 1 },
                effect: NONE,
                handled: true,
              };
        case 'Enter':
          return {
            state,
            effect: state.active >= 0 ? { kind: 'follow', index: state.active } : NONE,
            handled: true,
          };
        case 'Escape':
          return { state, effect: { kind: 'close' }, handled: true };
        default:
          return absurd(event.key);
      }
    default:
      return absurd(event);
  }
};

/* ------------------------------------------------------------------------ */
/* Quick navigation ranking                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Search folding: Unicode canonical decomposition (NFD), combining marks
 * removed, lower-cased — so "colofao", "Colofão" and "COLOFÃO" match.
 * (Same normalisation Pagefind applies to its own index.)
 */
export const foldForSearch = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export interface Rankable {
  readonly label: string;
  /** Extra searchable words (synonyms, the other language's name, the stratum's question…). */
  readonly keywords?: string;
}

const tokens = (s: string): readonly string[] => foldForSearch(s).split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);

/**
 * Score of one item for a query: every query token must occur (conjunctive);
 * a token scores 3 when it prefixes the label, 2 when it prefixes another word,
 * 1 when it only occurs inside a word. 0 means "no match".
 */
export const scoreItem = (item: Rankable, query: string): number => {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const label = foldForSearch(item.label);
  const words = tokens(`${item.label} ${item.keywords ?? ''}`);
  let total = 0;
  for (const t of q) {
    const s = label.startsWith(t) ? 3 : words.some((w) => w.startsWith(t)) ? 2 : words.some((w) => w.includes(t)) ? 1 : 0;
    if (s === 0) return 0;
    total += s;
  }
  return total;
};

/**
 * Filters and orders items for a query. Empty query: all items, original order.
 * Otherwise: matching items by descending score; ties keep the original order
 * (stable), so the author-defined order is the tie-breaker.
 */
export const rankQuickNav = <T extends Rankable>(items: readonly T[], query: string): readonly T[] => {
  if (tokens(query).length === 0) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreItem(item, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item);
};

/** Whether a URL path belongs to the given locale prefix (e.g. "/base/pt/"). */
export const inLocale = (pathname: string, localePrefix: string): boolean =>
  localePrefix.length > 0 && pathname.startsWith(localePrefix);
