/**
 * Building blocks shared by the citation styles (pure).
 *
 * The styles themselves are data plus a handful of templates (Strategy pattern);
 * what is common — marked text → inline nodes, case transforms that respect
 * case-protected spans, the punctuation engine, intervals, initials and dates —
 * lives here so each style states only what its norm says.
 */
import { sliceMarked, type MarkedText, type Range } from '../bibtex/latex.ts';
import type { Name, NameList, PersonName } from '../bibtex/names.ts';
import type { Interval, Issued, Title } from '../model/reference.ts';
import { inLang, italic, lastChar, text, title, toPlainText, type Inline } from '../render/inline.ts';

export const NBSP = '\u00A0';

/** Marked text → inline nodes (italic spans of the source become <i>). */
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
 * "ß".toLocaleUpperCase('pt-BR') is "SS".
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
  const remap = (rs: readonly Range[]): Range[] =>
    rs.map((r) => ({ start: map.get(r.start) ?? 0, end: map.get(r.end) ?? out.length }));
  return { text: out, protected: remap(m.protected), italic: remap(m.italic) };
};

/** Upper-cases the first letter (unless case-protected): APA §6.17, first word of a subtitle. */
export const capitalizeFirst = (m: MarkedText, locale: string): MarkedText => {
  const at = m.text.search(/\p{L}/u);
  if (at < 0) return m;
  const cp = m.text.codePointAt(at) ?? 0;
  return transformMarked(m, at, at + String.fromCodePoint(cp).length, (s) => s.toLocaleUpperCase(locale));
};

/** Joins inline fragments with a separator. */
export const joinInline = (parts: readonly (readonly Inline[])[], separator: string): Inline[] =>
  parts.flatMap((p, k) => (k === 0 ? [...p] : [text(separator), ...p]));

/** Joins with a comma-like separator and a final conjunction: "A, B e C", "A, B, & C". */
export const joinList = (parts: readonly (readonly Inline[])[], comma: string, lastSeparator: string): Inline[] =>
  parts.length <= 1
    ? [...(parts[0] ?? [])]
    : [...joinInline(parts.slice(0, -1), comma), text(lastSeparator), ...(parts.at(-1) ?? [])];

/** A sentence-like element of a reference; `terminal: 'none'` suppresses the closing period. */
export type Block = { readonly content: readonly Inline[]; readonly terminal?: 'none' };

/**
 * The punctuation engine (NBR 6023 §6.4 "pontuação uniforme"; APA §9.4).
 * Blocks are sentences: each ends with "." unless it already ends with . ? !
 * (no period is added after a title ending in ? or !), or it is marked
 * terminal 'none' (APA: no period after a DOI or URL). Empty blocks vanish.
 */
export const sentences = (blocks: readonly (Block | undefined)[]): Inline[] => {
  const present = blocks.filter((b): b is Block => b !== undefined && toPlainText(b.content).trim() !== '');
  return present.flatMap((b, k) => {
    const end = lastChar(b.content);
    const needsPeriod = b.terminal !== 'none' && !['.', '?', '!'].includes(end);
    return [...(k === 0 ? [] : [text(' ')]), ...b.content, ...(needsPeriod ? [text('.')] : [])];
  });
};

const isFragment = (c: Inline | readonly Inline[]): c is readonly Inline[] => Array.isArray(c);

/** Builds a block from inline fragments, skipping undefined ones. */
export const block = (...content: readonly (Inline | readonly Inline[] | undefined)[]): Block => ({
  content: content.flatMap((c): readonly Inline[] => (c === undefined ? [] : isFragment(c) ? c : [c])),
});

/** "379-423" (ABNT, hyphen-minus) or "379–423" (APA, en dash). */
export const interval = (i: Interval, dash: string): string =>
  i.last === undefined ? i.first : `${i.first}${dash}${i.last}`;
export const intervals = (is: readonly Interval[], dash: string): string => is.map((i) => interval(i, dash)).join(', ');
export const isPlural = (is: readonly Interval[]): boolean => is.length > 1 || is.some((i) => i.last !== undefined);

/** "Claude Elwood" → "C. E."; "Jean-Pierre" → "J.-P."; lower-case particles are kept as written. */
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

/** True when the work's language differs from the document's (compared on the primary subtag). */
export const foreign = (workLang: string | undefined, docLang: string): string | undefined => {
  if (workLang === undefined) return undefined;
  const primary = (tag: string): string => tag.toLowerCase().split('-')[0] ?? '';
  return primary(workLang) === primary(docLang) ? undefined : workLang;
};

/** Highlight strategies for the title proper: the destaque (<cite>) or none. */
export type Highlight = (main: readonly Inline[]) => readonly Inline[];
export const highlighted: Highlight = (main) => [title(main)];
export const plain: Highlight = (main) => main;

/**
 * A title's main part and subtitle as inline nodes, the main part optionally
 * highlighted (the subtitle never is: NBR 6023 §8.2), wrapped in its language.
 */
export const titleParts = (
  t: Title,
  options: { readonly highlight: Highlight; readonly lang: string | undefined; readonly sub?: MarkedText },
): Inline[] => {
  // A title truncated with " [...]" (NBR 6023 §8.2.3: "Anais [...]") keeps the mark outside the destaque.
  const cut = t.main.text.endsWith(' [...]') ? t.main.text.length - ' [...]'.length : t.main.text.length;
  const main = [
    ...options.highlight(fromMarked(sliceMarked(t.main, 0, cut))),
    ...(cut < t.main.text.length ? [text(' [...]')] : []),
  ];
  const sub = options.sub ?? t.sub;
  const content: Inline[] = sub === undefined ? main : [...main, text(': '), ...fromMarked(sub)];
  return [...inLang(options.lang, content)];
};

export const doiUrl = (doi: string): string => `https://doi.org/${doi}`;

export const isoDate = (year: number, month?: number, day?: number): string =>
  [
    String(year).padStart(4, '0'),
    ...(month === undefined ? [] : [String(month).padStart(2, '0')]),
    ...(month !== undefined && day !== undefined ? [String(day).padStart(2, '0')] : []),
  ].join('-');

/** ISO 8601 form of a date of issue (start of an interval), for <time datetime>. */
export const issuedIso = (d: Issued): string => isoDate(d.year, d.month, d.day);

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

/** "1948", "1931-1958" (ABNT) / "1931–1958" (APA), "[1933]" when inferred and the style brackets it. */
export const yearText = (d: Issued, dash: string, bracketInferred: boolean): string => {
  const span = d.endYear === undefined ? String(d.year) : `${d.year}${dash}${d.endYear}`;
  return d.inferred === true && bracketInferred ? `[${span}]` : span;
};
