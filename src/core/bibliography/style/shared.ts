/**
 * Building blocks shared by the citation styles (pure).
 *
 * The styles themselves are data plus a handful of templates (Strategy pattern);
 * what is common — marked text → inline nodes, case transforms that respect
 * case-protected spans, the punctuation engine, intervals and initials — lives
 * here so each style states only what its norm says.
 */
import type { MarkedText, Range } from '../bibtex/latex.ts';
import type { Name, NameList, PersonName } from '../bibtex/names.ts';
import { italic, lastChar, link, text, toPlainText, type Inline } from '../render/inline.ts';
import type { Interval, Title } from '../model/reference.ts';

export const NBSP = ' ';

/** Marked text → inline nodes (italic spans become <i>). */
export const fromMarked = (m: MarkedText): Inline[] => {
  const out: Inline[] = [];
  let at = 0;
  for (const r of m.italic) {
    if (r.start > at) out.push(text(m.text.slice(at, r.start)));
    out.push(italic([text(m.text.slice(r.start, r.end))]));
    at = r.end;
  }
  if (at < m.text.length) out.push(text(m.text.slice(at)));
  return out;
};

/**
 * Applies `f` to the characters in [from, to) that are NOT case-protected,
 * remapping every span through the (possibly length-changing) transform:
 * "ß".toLocaleUpperCase() is "SS".
 */
export const transformMarked = (m: MarkedText, from: number, to: number, f: (s: string) => string): MarkedText => {
  const cuts = [
    ...new Set([0, m.text.length, from, to, ...[...m.protected, ...m.italic].flatMap((r) => [r.start, r.end])]),
  ]
    .filter((c) => c >= 0 && c <= m.text.length)
    .sort((a, b) => a - b);
  const isProtected = (a: number, b: number): boolean => m.protected.some((r) => r.start <= a && b <= r.end);
  const map = new Map<number, number>([[0, 0]]);
  let out = '';
  for (let k = 0; k + 1 < cuts.length; k++) {
    const a = cuts[k] as number;
    const b = cuts[k + 1] as number;
    const seg = m.text.slice(a, b);
    out += a >= from && b <= to && !isProtected(a, b) ? f(seg) : seg;
    map.set(b, out.length);
  }
  const remap = (rs: readonly Range[]): Range[] => rs.map((r) => ({ start: map.get(r.start) ?? 0, end: map.get(r.end) ?? out.length }));
  return { text: out, protected: remap(m.protected), italic: remap(m.italic) };
};

export const upperAll = (m: MarkedText, locale: string): MarkedText =>
  transformMarked(m, 0, m.text.length, (s) => s.toLocaleUpperCase(locale));

/** Joins inline fragments with a separator. */
export const joinInline = (parts: readonly (readonly Inline[])[], separator: string): Inline[] =>
  parts.flatMap((p, k) => (k === 0 ? [...p] : [text(separator), ...p]));

/** Joins with ", " and a final conjunction: "A, B e C" / "A, B, & C". */
export const joinList = (parts: readonly (readonly Inline[])[], comma: string, lastSeparator: string): Inline[] =>
  parts.length <= 1
    ? [...(parts[0] ?? [])]
    : [...joinInline(parts.slice(0, -1), comma), text(lastSeparator), ...(parts.at(-1) ?? [])];

export type Block = { readonly content: readonly Inline[]; readonly terminal?: 'none' };

/**
 * The punctuation engine (NBR 6023 §6.4 "pontuação uniforme"; APA 9.x).
 * Blocks are sentences: each ends with "." unless it already ends with . ? !
 * (H5: no period added after a title ending in ? or !), or it is marked
 * terminal 'none' (APA: no period after a DOI or URL).
 */
export const sentences = (blocks: readonly (Block | undefined)[]): Inline[] => {
  const present = blocks.filter((b): b is Block => b !== undefined && toPlainText(b.content).trim() !== '');
  return present.flatMap((b, k) => {
    const end = lastChar(b.content);
    const needsPeriod = b.terminal !== 'none' && !['.', '?', '!'].includes(end);
    return [...(k === 0 ? [] : [text(' ')]), ...b.content, ...(needsPeriod ? [text('.')] : [])];
  });
};

export const block = (...content: readonly (Inline | readonly Inline[] | undefined)[]): Block => ({
  content: content.flatMap((c) => (c === undefined ? [] : Array.isArray(c) ? (c as readonly Inline[]) : [c as Inline])),
});

/** "379-423" (ABNT, hyphen-minus) or "379–423" (APA, en dash). */
export const interval = (i: Interval, dash: string): string => (i.last === undefined ? i.first : `${i.first}${dash}${i.last}`);
export const intervals = (is: readonly Interval[], dash: string): string => is.map((i) => interval(i, dash)).join(', ');
export const isPlural = (is: readonly Interval[]): boolean => is.length > 1 || is.some((i) => i.last !== undefined);

/** "Claude Elwood" → "C. E."; "Jean-Pierre" → "J.-P."; lower-case particles kept. */
export const initials = (given: string): string =>
  given
    .split(/\s+/u)
    .filter((w) => w !== '')
    .map((word) =>
      word
        .split('-')
        .map((part) => {
          const first = [...part][0] ?? '';
          if (first === '' || first === first.toLowerCase()) return part;
          return /^\p{Lu}\.$/u.test(part) ? part : `${first}.`;
        })
        .join('-'),
    )
    .join(' ');

export const isPerson = (n: Name): n is PersonName => n.kind === 'person';

export const hasNames = (list: NameList): boolean => list.names.length > 0;

/** Plain family name as cited (mixed case): "Saussure", "López de Mántaras". */
export const familyText = (n: Name): string => (n.kind === 'person' ? n.family.text : n.name.text);

/** True when the work's language differs from the document's (compared on the primary subtag). */
export const foreign = (workLang: string | undefined, docLang: string): string | undefined => {
  if (workLang === undefined) return undefined;
  const primary = (tag: string): string => tag.toLowerCase().split('-')[0] ?? '';
  return primary(workLang) === primary(docLang) ? undefined : workLang;
};

export const titleText = (t: Title): string => (t.sub === undefined ? t.main.text : `${t.main.text}: ${t.sub.text}`);

export const doiUrl = (doi: string): string => `https://doi.org/${doi}`;
export const urlLink = (url: string): Inline => link(url, [text(url)]);

export const isoDate = (year: number, month?: number, day?: number): string =>
  [String(year).padStart(4, '0'), ...(month === undefined ? [] : [String(month).padStart(2, '0')]), ...(month !== undefined && day !== undefined ? [String(day).padStart(2, '0')] : [])].join('-');

/** Letters for same-author-same-year works: a…z, then aa, ab… (bijective base-26). */
export const yearLetter = (index: number): string => {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(97 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export const yearText = (start: number, end: number | undefined, dash: string): string =>
  end === undefined ? String(start) : `${start}${dash}${end}`;
