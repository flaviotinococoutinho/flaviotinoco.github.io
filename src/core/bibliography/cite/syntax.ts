/**
 * Pandoc citation syntax in running text (pure scanner).
 *
 * Grammar (Pandoc User's Guide, "Citation syntax"; docs/research/unified-latex.md §6):
 *
 *   bracketed = "[" item { ";" item } "]"                      (parenthetical)
 *   item      = [ prefix ] [ "-" ] "@" key [ suffix ]           ("-" suppresses the author)
 *   narrative = "@" key [ " " "[" suffix "]" ]                  (author in the text)
 *   key       = (L|N|_) { L|N|_ | punct (L|N|_) } | "{" any "}"   punct ∈ : . # $ % & - + ? < > ~ /
 *
 * A prefix must end with white space ("see @k", never "see@k"), and an "@"
 * glued to a preceding letter or digit is never a citation ("fulano@exemplo.com").
 * A bracket is a citation group only if EVERY ";"-separated item has a key;
 * otherwise it is ordinary text. Narrative citations are recognised only for
 * KNOWN keys, so "@flavio" stays prose; inside brackets an unknown key is an
 * error the caller reports. Escaped markers (\[@k], \@k) are never citations.
 */
import { parseSuffix, type Locator } from './locator.ts';

export type CiteItem = {
  readonly prefix: string;
  readonly key: string;
  readonly suppressAuthor: boolean;
  readonly locator?: Locator;
  /** Verbatim text after the locator (", grifo nosso"). */
  readonly suffix: string;
};

export type Citation = {
  readonly mode: 'parenthetical' | 'narrative';
  readonly items: readonly CiteItem[];
  /** Offsets in the scanned text: value.slice(start, end) === source. */
  readonly start: number;
  readonly end: number;
  /** The exact citation syntax, kept in data-cite (information preservation). */
  readonly source: string;
};

export type ScanProblem = {
  readonly kind: 'unknown-key';
  readonly key: string;
  readonly start: number;
  readonly end: number;
};

export type ScanResult = { readonly citations: readonly Citation[]; readonly problems: readonly ScanProblem[] };

export type ScanOptions = {
  readonly isKnown: (key: string) => boolean;
  /** Whether the marker at this index of the text was backslash-escaped in the source. */
  readonly isEscaped: (index: number) => boolean;
};

const KEY = String.raw`[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&\-+?<>~/](?=[\p{L}\p{N}_]))*`;
const ITEM = new RegExp(String.raw`^(.*?)(-?)@(${KEY}|\{[^{}]+\})(.*)$`, 'su');
/** Narrative candidates: "@" not glued to a preceding letter, digit, "_" or "@". */
const NARRATIVE = String.raw`(?<![\p{L}\p{N}_@])@(${KEY}|\{[^{}]+\})`;
const NARRATIVE_SUFFIX = /^ ?\[([^[\]@]*)\]/u;

const unbrace = (key: string): string => (key.startsWith('{') ? key.slice(1, -1) : key);

/** Parses the content of a bracket (offset = index of its first character in the text). */
const parseGroup = (content: string, offset: number, options: ScanOptions): readonly CiteItem[] | undefined => {
  const items: CiteItem[] = [];
  let at = offset;
  for (const part of content.split(';')) {
    const m = ITEM.exec(part);
    if (m === null) return undefined;
    const rawPrefix = m[1] ?? '';
    const minus = m[2] ?? '';
    const key = m[3] ?? '';
    if (rawPrefix.trim() !== '' && !/\s$/u.test(rawPrefix)) return undefined;
    const atSign = at + rawPrefix.length + minus.length;
    const prefix = rawPrefix.trimStart();
    if (options.isEscaped(atSign)) return undefined;
    const parsed = parseSuffix(m[4] ?? '');
    items.push({
      prefix,
      key: unbrace(key),
      suppressAuthor: minus === '-',
      ...(parsed.locator !== undefined ? { locator: parsed.locator } : {}),
      suffix: parsed.rest,
    });
    at += part.length + 1;
  }
  return items;
};

export const scanCitations = (value: string, options: ScanOptions): ScanResult => {
  const citations: Citation[] = [];
  const problems: ScanProblem[] = [];

  // Escaped brackets are literal text, content included (\[@k] stays "[@k]").
  const literal: { readonly start: number; readonly end: number }[] = [];

  // 1. Bracketed (parenthetical) groups: innermost brackets containing "@".
  for (let i = value.indexOf('['); i !== -1; i = value.indexOf('[', i + 1)) {
    const close = value.indexOf(']', i + 1);
    if (close === -1) break;
    const inner = value.indexOf('[', i + 1);
    if (inner !== -1 && inner < close) continue;
    if (options.isEscaped(i) || options.isEscaped(close)) {
      literal.push({ start: i, end: close + 1 });
      continue;
    }
    const content = value.slice(i + 1, close);
    if (!content.includes('@')) continue;
    const items = parseGroup(content, i + 1, options);
    if (items === undefined) continue;
    for (const item of items) {
      if (!options.isKnown(item.key)) problems.push({ kind: 'unknown-key', key: item.key, start: i, end: close + 1 });
    }
    citations.push({ mode: 'parenthetical', items, start: i, end: close + 1, source: value.slice(i, close + 1) });
    i = close;
  }

  // 2. Narrative citations in the gaps between groups, for known keys only.
  const taken = [...citations, ...literal];
  const inGroup = (index: number): boolean => taken.some((c) => c.start <= index && index < c.end);
  const narrative = new RegExp(NARRATIVE, 'gu');
  for (let m = narrative.exec(value); m !== null; m = narrative.exec(value)) {
    const start = m.index;
    const key = unbrace(m[1] ?? '');
    if (inGroup(start) || options.isEscaped(start) || !options.isKnown(key)) continue;
    let end = start + m[0].length;
    let locator: Locator | undefined;
    let suffix = '';
    const after = NARRATIVE_SUFFIX.exec(value.slice(end));
    if (after !== null) {
      const open = end + after[0].indexOf('[');
      const close = end + after[0].length - 1;
      if (!options.isEscaped(open) && !options.isEscaped(close) && !inGroup(open)) {
        const parsed = parseSuffix(after[1] ?? '', { bare: true });
        locator = parsed.locator;
        suffix = parsed.rest;
        end += after[0].length;
      }
    }
    citations.push({
      mode: 'narrative',
      items: [{ prefix: '', key, suppressAuthor: false, ...(locator !== undefined ? { locator } : {}), suffix }],
      start,
      end,
      source: value.slice(start, end),
    });
  }
  return { citations: citations.sort((a, b) => a.start - b.start), problems };
};
