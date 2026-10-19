/**
 * Parser: TeX source → lossless token stream (+ argument reader).
 *
 * A deliberately small model of TeX's input processor (Knuth, "The TeXbook",
 * ch. 7–8): control words (`\` + letters), control symbols (`\` + one
 * non-letter), comments (`%` to end of line), group delimiters and the rest.
 * It is enough to find `\label`, `\tag`, `\ref` and `\eqref` exactly where
 * TeX would — never inside comments (`% \label{x}`) and never in escaped
 * forms (`\\label` is a line break followed by the letters "label").
 *
 * Law (tested): print(tokenize(s)) = s for every string s — the lexer loses
 * nothing, so rewrites done on tokens touch only what they target.
 */

export type TexTokenKind = 'command' | 'comment' | 'open' | 'close' | 'space' | 'text';

export interface TexToken {
  readonly kind: TexTokenKind;
  /** Exact source text of the token. */
  readonly text: string;
  /** Offset of the first character in the source. */
  readonly start: number;
}

const isLetter = (c: string): boolean => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const SPECIAL = new Set(['\\', '%', '{', '}']);

export const tokenize = (source: string): readonly TexToken[] => {
  const tokens: TexToken[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source.charAt(i);
    const start = i;
    if (c === '\\') {
      if (i + 1 >= source.length) {
        tokens.push({ kind: 'text', text: c, start });
        i += 1;
      } else if (isLetter(source.charAt(i + 1))) {
        let j = i + 1;
        while (j < source.length && isLetter(source.charAt(j))) j += 1;
        tokens.push({ kind: 'command', text: source.slice(i, j), start });
        i = j;
      } else {
        tokens.push({ kind: 'command', text: source.slice(i, i + 2), start });
        i += 2;
      }
    } else if (c === '%') {
      let j = i;
      while (j < source.length && source.charAt(j) !== '\n') j += 1;
      tokens.push({ kind: 'comment', text: source.slice(i, j), start });
      i = j;
    } else if (c === '{') {
      tokens.push({ kind: 'open', text: c, start });
      i += 1;
    } else if (c === '}') {
      tokens.push({ kind: 'close', text: c, start });
      i += 1;
    } else if (isSpace(c)) {
      let j = i;
      while (j < source.length && isSpace(source.charAt(j))) j += 1;
      tokens.push({ kind: 'space', text: source.slice(i, j), start });
      i = j;
    } else {
      let j = i;
      while (j < source.length && !SPECIAL.has(source.charAt(j)) && !isSpace(source.charAt(j))) j += 1;
      tokens.push({ kind: 'text', text: source.slice(i, j), start });
      i = j;
    }
  }
  return tokens;
};

/** Inverse of tokenize on its image. */
export const print = (tokens: readonly TexToken[]): string => tokens.map((t) => t.text).join('');

/** Name of a command token without the backslash (`\label` → "label", `\\` → "\\"). */
export const commandName = (token: TexToken): string => (token.kind === 'command' ? token.text.slice(1) : '');

/** A braced argument found after a command. Indices are token indices; `end` is exclusive. */
export interface TexArgument {
  /** Index of the first token after the command (spaces included) that belongs to the call. */
  readonly from: number;
  /** Index one past the closing brace. */
  readonly end: number;
  /** Raw source between the braces. */
  readonly content: string;
}

/**
 * Reads the mandatory braced argument that follows the token at `index`,
 * skipping intervening spaces and comments as TeX does (a blank line — \par —
 * ends the search). Returns undefined when the next significant token is not
 * an opening brace or the group is unbalanced.
 */
export const readArgument = (tokens: readonly TexToken[], index: number): TexArgument | undefined => {
  let i = index + 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === undefined) return undefined;
    if (t.kind === 'comment' || (t.kind === 'space' && !/\n[ \t\r]*\n/.test(t.text))) i += 1;
    else break;
  }
  const open = tokens[i];
  if (open?.kind !== 'open') return undefined;
  let depth = 0;
  for (let j = i; j < tokens.length; j += 1) {
    const t = tokens[j];
    if (t === undefined) break;
    if (t.kind === 'open') depth += 1;
    else if (t.kind === 'close') {
      depth -= 1;
      if (depth === 0) return { from: index + 1, end: j + 1, content: print(tokens.slice(i + 1, j)) };
    }
  }
  return undefined;
};

/** Reads an optional `*` immediately after a command (\tag*, \section*). */
export const isStarred = (tokens: readonly TexToken[], index: number): boolean =>
  tokens[index + 1]?.kind === 'text' && tokens[index + 1]?.text.startsWith('*') === true;
