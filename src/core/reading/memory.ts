/**
 * Reading memory — where the reader stopped in each essay, kept only in their browser (pure).
 *
 * The shell (src/islands/elements/ft-reading-memory.ts) records, for the page being read, how far through
 * the article the reader is and the section they are in; on the next visit it offers to continue from
 * there, and the reading room's candle (ADR 0014) starts as burnt down as the reader left it. Nothing
 * leaves the device: the record lives under MEMORY_STORAGE_KEY in localStorage.
 *
 * Patterns (docs/arquitetura.md §3):
 *   codec   encodeMemory : ReadingMemory → string
 *           decodeMemory : string | null → ReadingMemory        (lenient, total: what is not a record is dropped)
 *   law     decodeMemory(encodeMemory(m)) = m   for every well-formed memory
 *
 * The memory is bounded (MEMORY_MAX_ENTRIES, least recently read dropped first) and dates are whole days
 * since the Unix epoch, passed in by the shell: the core never reads a clock.
 */
import { clamp01 } from './scroll.ts';

export const MEMORY_STORAGE_KEY = 'ft:reading';
/** Essays remembered at most; reading a new one forgets the one read longest ago. */
export const MEMORY_MAX_ENTRIES = 40;
/** A record older than this many days no longer offers to continue. */
export const MEMORY_MAX_AGE_DAYS = 180;
/** Below this much of the article nothing is offered (the reader barely started)… */
export const RESUME_MIN = 0.05;
/** …and above it neither (the reader finished). */
export const RESUME_MAX = 0.95;

export interface ReadingEntry {
  /** Progress through the article in [0, 1], three decimals. */
  readonly progress: number;
  /** The furthest progress ever reached: the candle never grows back. */
  readonly furthest: number;
  /** Id of the section heading the reader was in, if any. */
  readonly section: string | null;
  /** Day of the last reading, in whole days since 1970-01-01 (UTC). */
  readonly day: number;
}

/** Page path → entry. */
export type ReadingMemory = Readonly<Record<string, ReadingEntry>>;

const round3 = (x: number): number => Math.round(clamp01(x) * 1000) / 1000;
const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** A section id as the reading stage writes them: letters, digits and - _ : . only. */
const SECTION = /^[\p{L}\p{N}_:.-]{1,120}$/u;
/** A page path of the site: starts with "/", no spaces or quotes. */
const PAGE = /^\/[^\s"'<>]{0,300}$/;

const parseEntry = (v: unknown): ReadingEntry | null => {
  if (!isRecord(v)) return null;
  const { p, f, s, d } = v;
  if (typeof p !== 'number' || !Number.isFinite(p)) return null;
  if (typeof d !== 'number' || !Number.isInteger(d) || d < 0) return null;
  const progress = round3(p);
  const furthest = typeof f === 'number' && Number.isFinite(f) ? Math.max(progress, round3(f)) : progress;
  const section = typeof s === 'string' && SECTION.test(s) ? s : null;
  return { progress, furthest, section, day: d };
};

/** Lenient, total decoder: corrupt JSON, unknown shapes and invalid entries are dropped, never thrown. */
export const decodeMemory = (text: string | null | undefined): ReadingMemory => {
  if (text === null || text === undefined || text === '') return {};
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (!isRecord(raw)) return {};
  const out: Record<string, ReadingEntry> = {};
  for (const [page, value] of Object.entries(raw)) {
    if (!PAGE.test(page)) continue;
    const entry = parseEntry(value);
    if (entry !== null) out[page] = entry;
  }
  return out;
};

/** Canonical encoding: short keys, pages in code-unit order. */
export const encodeMemory = (memory: ReadingMemory): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.keys(memory)
        .sort()
        .flatMap((page) => {
          const e = memory[page];
          return e === undefined ? [] : [[page, { p: e.progress, f: e.furthest, s: e.section, d: e.day }]];
        }),
    ),
  );

/**
 * The memory after reading `page` up to `progress` (in `section`) on `day`: the entry is replaced, the
 * furthest point only grows, and the least recently read pages beyond MEMORY_MAX_ENTRIES are forgotten
 * (ties broken by path, so the result does not depend on insertion order).
 */
export const remember = (
  memory: ReadingMemory,
  page: string,
  progress: number,
  section: string | null,
  day: number,
): ReadingMemory => {
  if (!PAGE.test(page) || !Number.isFinite(progress) || !Number.isInteger(day) || day < 0) return memory;
  const before = memory[page];
  const p = round3(progress);
  const entry: ReadingEntry = {
    progress: p,
    furthest: Math.max(p, before?.furthest ?? 0),
    section: section !== null && SECTION.test(section) ? section : null,
    day,
  };
  const all = { ...memory, [page]: entry };
  const kept = Object.entries(all)
    .sort(([pa, a], [pb, b]) => b.day - a.day || (pa === page ? -1 : pb === page ? 1 : pa < pb ? -1 : pa > pb ? 1 : 0))
    .slice(0, MEMORY_MAX_ENTRIES);
  return Object.fromEntries(kept);
};

/** The memory without `page`. */
export const forget = (memory: ReadingMemory, page: string): ReadingMemory =>
  Object.fromEntries(Object.entries(memory).filter(([p]) => p !== page));

/** Whether to offer to continue: the reader got somewhere, did not finish, and not too long ago. */
export const shouldOffer = (entry: ReadingEntry | undefined, today: number): entry is ReadingEntry =>
  entry !== undefined &&
  entry.progress >= RESUME_MIN &&
  entry.progress <= RESUME_MAX &&
  today - entry.day <= MEMORY_MAX_AGE_DAYS;

/** Whole days since the epoch of a time in milliseconds (the shell passes Date.now()). */
export const dayOf = (milliseconds: number): number =>
  Number.isFinite(milliseconds) ? Math.max(0, Math.floor(milliseconds / 86_400_000)) : 0;

/**
 * The section the reader is in: the last heading whose top has passed the reading line (`line`, in the
 * same coordinates as the tops), or null before the first one.
 */
export const sectionAt = (
  headings: readonly { readonly id: string; readonly top: number }[],
  line: number,
): string | null => {
  let current: string | null = null;
  for (const h of headings) if (h.top <= line) current = h.id;
  return current;
};
