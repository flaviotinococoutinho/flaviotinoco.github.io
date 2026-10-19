/**
 * Reading position (pure): which heading the reader last passed, and the small
 * record <ft-reading-position> keeps in the browser's localStorage.
 *
 * Privacy by construction: the record holds page paths and heading ids only — no
 * time, no identifier, nothing about the reader — and never leaves the browser
 * (no request carries it). It is bounded (MAX_PAGES, least recently read dropped
 * first) and the reader can erase the entry of a page with the "forget" control.
 * Parsing is total: a corrupt, foreign or future-format value reads as empty.
 */

export const STORAGE_KEY = 'ft:reading-position';
export const STORE_VERSION = 1;
export const MAX_PAGES = 24;

export type PositionEntry = { readonly path: string; readonly id: string };
export type PositionStore = { readonly pages: readonly PositionEntry[] };

export const EMPTY_STORE: PositionStore = { pages: [] };

/** Heading ids are HTML ids (no white space), bounded in length to keep the record small. */
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200 && !/\s/u.test(v);
const isPath = (v: unknown): v is string => typeof v === 'string' && v.startsWith('/') && v.length <= 400;

/** Total parser of the stored text (null when nothing is stored). */
export const parseStore = (raw: string | null): PositionStore => {
  if (raw === null) return EMPTY_STORE;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return EMPTY_STORE;
  }
  if (typeof value !== 'object' || value === null) return EMPTY_STORE;
  const o = value as Readonly<Record<string, unknown>>;
  if (o['v'] !== STORE_VERSION || !Array.isArray(o['pages'])) return EMPTY_STORE;
  const seen = new Set<string>();
  const pages: PositionEntry[] = [];
  for (const item of o['pages'] as readonly unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const { path, id } = item as Readonly<Record<string, unknown>>;
    if (!isPath(path) || !isId(id) || seen.has(path)) continue;
    seen.add(path);
    pages.push({ path, id });
    if (pages.length === MAX_PAGES) break;
  }
  return { pages };
};

export const serializeStore = (store: PositionStore): string =>
  JSON.stringify({ v: STORE_VERSION, pages: store.pages.map(({ path, id }) => ({ path, id })) });

/** Records the position of a page as the most recent one. */
export const remember = (store: PositionStore, entry: PositionEntry): PositionStore => {
  if (!isPath(entry.path) || !isId(entry.id)) return store;
  return { pages: [entry, ...store.pages.filter((p) => p.path !== entry.path)].slice(0, MAX_PAGES) };
};

export const forget = (store: PositionStore, path: string): PositionStore => ({
  pages: store.pages.filter((p) => p.path !== path),
});

export const recall = (store: PositionStore, path: string): PositionEntry | null =>
  store.pages.find((p) => p.path === path) ?? null;

/**
 * The last heading whose top edge is at or above `line` (a reading line, in the
 * same coordinates as the tops, e.g. a third of the viewport from its top).
 * Headings are given in document order; null when none has been passed yet.
 */
export const lastPassed = (
  headings: readonly { readonly id: string; readonly top: number }[],
  line: number,
): string | null => {
  let found: string | null = null;
  for (const h of headings) {
    if (h.top <= line) found = h.id;
    else break;
  }
  return found;
};

/**
 * Whether to offer "continue at": the remembered heading still exists on the page
 * and is not its first heading (returning to the very beginning needs no help).
 */
export const shouldOffer = (entry: PositionEntry | null, ids: readonly string[]): entry is PositionEntry =>
  entry !== null && ids.indexOf(entry.id) > 0;
