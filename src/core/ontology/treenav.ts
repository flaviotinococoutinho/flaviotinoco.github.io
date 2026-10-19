/**
 * Keyboard navigation of a tree view, as a pure function of the tree's
 * pre-order item list and the pressed key — the WAI-ARIA Authoring Practices
 * "Tree View" pattern (W3C APG, keyboard interaction):
 *
 *   ↓ / ↑     next / previous VISIBLE item (no expanding or collapsing);
 *   →         closed parent: expand; open parent: first child; leaf: nothing;
 *   ←         open parent: collapse; otherwise: move to the parent (roots: nothing);
 *   Home/End  first / last visible item;
 *   *         expand every sibling of the current item;
 *   printable type-ahead: the next visible item whose label starts with the
 *             typed prefix (wrapping around).
 *
 * An item is visible when every ancestor is expanded. Items are given in
 * document (pre-order) order with their 1-based level, so parents and children
 * are recovered from the levels alone; no DOM is needed and the logic is tested.
 */
import { absurd } from '../algebra/match.ts';

export interface TreeItem {
  /** aria-level (1 = root). */
  readonly level: number;
  /** aria-expanded: true/false for parents (ignored for leaves). */
  readonly expanded: boolean;
  /** Accessible name, for type-ahead (already lower-cased/normalised by the caller if wished). */
  readonly label: string;
}

export type TreeKey = 'ArrowDown' | 'ArrowUp' | 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End' | '*';

export type TreeAction =
  | { readonly kind: 'focus'; readonly index: number }
  | { readonly kind: 'expand'; readonly index: number }
  | { readonly kind: 'collapse'; readonly index: number }
  | { readonly kind: 'expand-all'; readonly indices: readonly number[] }
  | { readonly kind: 'none' };

const NONE: TreeAction = { kind: 'none' };

/** Whether item i has children (the next item is one level deeper). */
export const isParent = (items: readonly TreeItem[], i: number): boolean => {
  const here = items[i];
  const next = items[i + 1];
  return here !== undefined && next !== undefined && next.level === here.level + 1;
};

/** Index of the parent of item i (the nearest previous item one level up), or null for roots. */
export const parentOf = (items: readonly TreeItem[], i: number): number | null => {
  const here = items[i];
  if (here === undefined) return null;
  for (let j = i - 1; j >= 0; j -= 1) {
    const it = items[j];
    if (it !== undefined && it.level < here.level) return it.level === here.level - 1 ? j : null;
  }
  return null;
};

/** Indices of the visible items (all ancestors expanded), in document order. */
export const visibleItems = (items: readonly TreeItem[]): readonly number[] => {
  const out: number[] = [];
  // Level below which items are hidden by a collapsed ancestor (Infinity = nothing hidden).
  let hiddenBelow = Infinity;
  items.forEach((it, i) => {
    if (it.level > hiddenBelow) return;
    hiddenBelow = Infinity;
    out.push(i);
    if (isParent(items, i) && !it.expanded) hiddenBelow = it.level;
  });
  return out;
};

/** Ancestors of item i, from the root down (for revealing an item). */
export const ancestorsOf = (items: readonly TreeItem[], i: number): readonly number[] => {
  const out: number[] = [];
  for (let p = parentOf(items, i); p !== null; p = parentOf(items, p)) out.unshift(p);
  return out;
};

/** Siblings of item i (same parent, same level), including i, in order. */
export const siblingsOf = (items: readonly TreeItem[], i: number): readonly number[] => {
  const here = items[i];
  if (here === undefined) return [];
  const parent = parentOf(items, i);
  const out: number[] = [];
  for (let j = parent === null ? 0 : parent + 1; j < items.length; j += 1) {
    const it = items[j];
    if (it === undefined || it.level < here.level) break;
    if (it.level === here.level) out.push(j);
  }
  return out;
};

/** The action a key triggers on item `current`. */
export const treeKey = (items: readonly TreeItem[], current: number, key: TreeKey): TreeAction => {
  const here = items[current];
  if (here === undefined) return NONE;
  const visible = visibleItems(items);
  const at = visible.indexOf(current);
  switch (key) {
    case 'ArrowDown': {
      const next = visible[at + 1];
      return next === undefined ? NONE : { kind: 'focus', index: next };
    }
    case 'ArrowUp': {
      const prev = at > 0 ? visible[at - 1] : undefined;
      return prev === undefined ? NONE : { kind: 'focus', index: prev };
    }
    case 'ArrowRight':
      if (!isParent(items, current)) return NONE;
      return here.expanded ? { kind: 'focus', index: current + 1 } : { kind: 'expand', index: current };
    case 'ArrowLeft': {
      if (isParent(items, current) && here.expanded) return { kind: 'collapse', index: current };
      const parent = parentOf(items, current);
      return parent === null ? NONE : { kind: 'focus', index: parent };
    }
    case 'Home': {
      const first = visible[0];
      return first === undefined || first === current ? NONE : { kind: 'focus', index: first };
    }
    case 'End': {
      const last = visible[visible.length - 1];
      return last === undefined || last === current ? NONE : { kind: 'focus', index: last };
    }
    case '*': {
      const closed = siblingsOf(items, current).filter((j) => isParent(items, j) && items[j]?.expanded === false);
      return closed.length === 0 ? NONE : { kind: 'expand-all', indices: closed };
    }
    default:
      return absurd(key);
  }
};

/**
 * Type-ahead: the next visible item after `current` (wrapping) whose label
 * starts with `prefix` (compared as given; the caller normalises case and
 * diacritics), or null.
 */
export const typeahead = (items: readonly TreeItem[], current: number, prefix: string): number | null => {
  if (prefix.length === 0) return null;
  const visible = visibleItems(items);
  const at = Math.max(0, visible.indexOf(current));
  // A repeated single character cycles through the matches; a longer prefix may stay on the current item.
  const start = prefix.length === 1 ? 1 : 0;
  for (let k = start; k < visible.length + start; k += 1) {
    const i = visible[(at + k) % visible.length];
    if (i !== undefined && items[i]?.label.startsWith(prefix) === true) return i;
  }
  return null;
};
