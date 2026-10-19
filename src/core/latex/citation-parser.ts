/**
 * Parser: Pandoc citation syntax in a text run → citation tokens.
 *
 * Used ONLY by the .tex exporter (the citations workstream owns the HTML
 * rendering and its own parser). Grammar, after Pandoc's manual §"Citation
 * syntax" (pandoc.org/MANUAL.html#citation-syntax):
 *
 *   parenthetical  "[" item (";" item)* "]"      [@k, p. 12]  [see @a; @b]  [-@k]
 *   item           prefix? "-"? "@" key suffix?
 *   narrative      "@" key ( ws "[" suffix "]" )?   @k  @k [p. 3]
 *   key            [\p{L}\p{N}_] ( [\p{L}\p{N}_] | [:.#$%&+?<>~/-] followed by [\p{L}\p{N}_] )*
 *
 * Laws (tested):
 *   - lossless: concatenating the `raw` of every token gives back the input;
 *   - escapes honoured: a `[` or `@` the author escaped in Markdown (`\[@k]`)
 *     never starts a citation (the caller supplies which positions were
 *     escaped, recovered from the source by `escapedPositions`).
 */

export interface CitationItem {
  readonly key: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly suppressAuthor: boolean;
}

export type CitationToken =
  | { readonly type: 'text'; readonly raw: string }
  | { readonly type: 'parenthetical'; readonly raw: string; readonly items: readonly CitationItem[] }
  | { readonly type: 'narrative'; readonly raw: string; readonly item: CitationItem };

const KEY = String.raw`[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&+?<>~\/\-](?=[\p{L}\p{N}_]))*`;
const ITEM = new RegExp(String.raw`^(.*?)(-?)@(${KEY})(.*)$`, 'su');
const NARRATIVE = String.raw`@(${KEY})(?:(\s*)\[([^\[\]]*)\])?`;
const WORD = /[\p{L}\p{N}_]/u;
/** A narrative citation cannot follow a word character (e-mail) or a literal "[" (escaped group, `\[@k]`). */
const AFTER_NO_NARRATIVE = /[\p{L}\p{N}_[]/u;

const parseItem = (raw: string): CitationItem | undefined => {
  const m = ITEM.exec(raw);
  if (m === null) return undefined;
  const [, before = '', dash = '', key = '', after = ''] = m;
  // "fulano@exemplo" is an e-mail fragment, not a citation.
  if (before.length > 0 && WORD.test(before.charAt(before.length - 1))) return undefined;
  return {
    key,
    prefix: before.trim(),
    suffix: after.replace(/^\s*,\s*/, '').trim(),
    suppressAuthor: dash === '-',
  };
};

const parseGroup = (content: string): readonly CitationItem[] | undefined => {
  const items: CitationItem[] = [];
  for (const part of content.split(';')) {
    const item = parseItem(part);
    if (item === undefined) return undefined;
    items.push(item);
  }
  return items.length > 0 ? items : undefined;
};

export interface ScanOptions {
  /** Narrative `@key` becomes a citation only when this accepts the key (default: any key). */
  readonly isKey?: (key: string) => boolean;
  /** Whether the character at `index` was backslash-escaped in the Markdown source. */
  readonly escaped?: (index: number) => boolean;
}

export const scanCitations = (text: string, options: ScanOptions = {}): readonly CitationToken[] => {
  const isKey = options.isKey ?? ((): boolean => true);
  // Sticky regex, local to the call: its lastIndex is the only state it carries.
  const narrative = new RegExp(NARRATIVE, 'uy');
  const escaped = options.escaped ?? ((): boolean => false);
  const tokens: CitationToken[] = [];
  let pending = '';
  const flush = (): void => {
    if (pending !== '') tokens.push({ type: 'text', raw: pending });
    pending = '';
  };
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if (c === '[' && !escaped(i)) {
      const close = text.indexOf(']', i + 1);
      const open = text.indexOf('[', i + 1);
      if (close !== -1 && (open === -1 || open > close)) {
        const content = text.slice(i + 1, close);
        const items = content.includes('@') ? parseGroup(content) : undefined;
        const atEscaped = [...content].some((ch, k) => ch === '@' && escaped(i + 1 + k));
        if (items !== undefined && !atEscaped) {
          flush();
          tokens.push({ type: 'parenthetical', raw: text.slice(i, close + 1), items });
          i = close + 1;
          continue;
        }
      }
    } else if (c === '@' && !escaped(i) && (i === 0 || !AFTER_NO_NARRATIVE.test(text.charAt(i - 1)))) {
      narrative.lastIndex = i;
      const m = narrative.exec(text);
      const key = m?.[1];
      if (m !== null && key !== undefined && isKey(key)) {
        const locatorEscaped = m[3] !== undefined && escaped(i + 1 + key.length + (m[2]?.length ?? 0));
        const raw = locatorEscaped ? `@${key}` : m[0];
        flush();
        tokens.push({
          type: 'narrative',
          raw,
          item: {
            key,
            prefix: '',
            suffix: locatorEscaped ? '' : (m[3] ?? '').trim(),
            suppressAuthor: false,
          },
        });
        i += raw.length;
        continue;
      }
    }
    pending += c;
    i += 1;
  }
  flush();
  return tokens;
};

/**
 * Which characters of a text node were escaped in the source.
 *
 * mdast text has escapes resolved (`\[` → `[`). The k-th `[` (or `@`) of the
 * value corresponds to the k-th `[` (or `@`) of the raw source slice, escaped
 * or not, as long as no character reference produced extra ones; when the
 * counts disagree the mapping is unknown and `undefined` is returned (the
 * caller then leaves the text alone — no guessing).
 */
export const escapedPositions = (value: string, raw: string): ((index: number) => boolean) | undefined => {
  const tracked = (ch: string): boolean => ch === '[' || ch === '@';
  const rawFlags: boolean[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    if (!tracked(raw.charAt(i))) continue;
    let backslashes = 0;
    for (let j = i - 1; j >= 0 && raw.charAt(j) === '\\'; j -= 1) backslashes += 1;
    rawFlags.push(backslashes % 2 === 1);
  }
  const valueIndices: number[] = [];
  for (let i = 0; i < value.length; i += 1) if (tracked(value.charAt(i))) valueIndices.push(i);
  if (valueIndices.length !== rawFlags.length) return undefined;
  const escapedSet = new Set(valueIndices.filter((_, k) => rawFlags[k] === true));
  return (index: number): boolean => escapedSet.has(index);
};
