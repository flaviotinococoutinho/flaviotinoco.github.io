/**
 * BibTeX tokenizer (pure, total).
 *
 * BibTeX's lexical grammar is modal (cf. G. Ward, btparse "bt_language", 1997;
 * O. Patashnik, "BibTeXing", 1988 §2): outside entries everything up to the next
 * `@` is ignored text ("junk"); after `@type{` a different vocabulary applies, in
 * which `{` and `"` open delimited strings whose braces must balance (backslashes
 * do NOT escape braces in .bib files). The lexer is therefore a small state machine
 * with four modes: top, type, body and comment-body.
 *
 * Error recovery: an unterminated string or entry would otherwise swallow the rest
 * of the file. When (and only when) the end of input proves a string unbalanced,
 * the lexer cuts it at the first line that starts a new entry (`@name{`), reports
 * the problem with its position, and resumes — so one typo yields one diagnostic
 * and every later entry is still parsed.
 */
import { error, lineIndex, spanOf, type Diagnostic, type LineIndex, type Span } from './source.ts';

export type TokenKind =
  | 'junk'
  | 'at'
  | 'name'
  | 'number'
  | 'open'
  | 'close'
  | 'comma'
  | 'equals'
  | 'hash'
  | 'braced'
  | 'quoted'
  | 'eof';

export type Token = {
  readonly kind: TokenKind;
  /** Raw lexeme; for `braced`/`quoted` the content WITHOUT the outer delimiters. */
  readonly text: string;
  /** Span of the whole lexeme, delimiters included. */
  readonly span: Span;
  /** True when inserted by error recovery (no source characters). */
  readonly synthetic: boolean;
};

export type LexResult = { readonly tokens: readonly Token[]; readonly diagnostics: readonly Diagnostic[] };

type Mode = 'top' | 'type' | 'body' | 'comment-body';

const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/u.test(c);
/** Characters that may appear in entry types, keys, field names and macro names. */
const isNameChar = (c: string | undefined): boolean => c !== undefined && !/[\s{}(),=#"@]/u.test(c);
const RECOVERY_POINT = /\r?\n[ \t]*@[A-Za-z]+[ \t]*[{(]/gu;

export const tokenize = (source: string): LexResult => {
  const index: LineIndex = lineIndex(source);
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];
  const span = (start: number, end: number): Span => spanOf(index, start, end);
  const push = (kind: TokenKind, text: string, start: number, end: number, synthetic = false): void => {
    tokens.push({ kind, text, span: span(start, end), synthetic });
  };

  /** First line-initial `@name{` after `from`, or -1. */
  const recoveryPoint = (from: number): number => {
    RECOVERY_POINT.lastIndex = from;
    const m = RECOVERY_POINT.exec(source);
    return m === null ? -1 : m.index;
  };

  let mode: Mode = 'top';
  let closer = '}';
  let entryOpen = 0;
  let entryType = '';
  let i = 0;

  /**
   * Scans a balanced-brace region whose opening brace (if any) was already consumed.
   * Returns the index of the closing delimiter, or a recovery cut when unbalanced.
   */
  const scanBalanced = (
    from: number,
    initialDepth: number,
    stopAtDepthZero: (c: string) => boolean,
  ): { readonly end: number; readonly ok: boolean } => {
    let depth = initialDepth;
    for (let j = from; j < source.length; j++) {
      const c = source[j] as string;
      if (depth === 0 && stopAtDepthZero(c)) return { end: j, ok: true };
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0 && initialDepth > 0) return { end: j, ok: true };
        if (depth < 0) return { end: j, ok: false };
      }
    }
    const cut = recoveryPoint(from);
    return { end: cut === -1 ? source.length : cut, ok: false };
  };

  const closeEntry = (at: number, synthetic: boolean): void => {
    push('close', synthetic ? '' : source.slice(at, at + 1), at, synthetic ? at : at + 1, synthetic);
    mode = 'top';
  };

  while (i < source.length) {
    const c = source[i] as string;
    switch (mode) {
      case 'top': {
        const at = source.indexOf('@', i);
        const end = at === -1 ? source.length : at;
        if (end > i) push('junk', source.slice(i, end), i, end);
        if (at === -1) {
          i = source.length;
        } else {
          push('at', '@', at, at + 1);
          mode = 'type';
          i = at + 1;
        }
        break;
      }
      case 'type': {
        if (isSpace(c)) {
          i++;
          break;
        }
        if (isNameChar(c) && tokens.at(-1)?.kind === 'at') {
          let j = i;
          while (isNameChar(source[j])) j++;
          entryType = source.slice(i, j).toLowerCase();
          push('name', source.slice(i, j), i, j);
          i = j;
          break;
        }
        if ((c === '{' || c === '(') && tokens.at(-1)?.kind === 'name') {
          push('open', c, i, i + 1);
          closer = c === '{' ? '}' : ')';
          entryOpen = i;
          mode = entryType === 'comment' ? 'comment-body' : 'body';
          i++;
          break;
        }
        // Not an entry after all: the parser reports the dangling `@`.
        mode = 'top';
        break;
      }
      case 'comment-body': {
        const r =
          closer === '}' ? scanBalanced(i, 1, () => false) : scanBalanced(i, 0, (ch) => ch === ')');
        push('braced', source.slice(i, r.end), i, r.end);
        if (r.ok) {
          closeEntry(r.end, false);
          i = r.end + 1;
        } else {
          diagnostics.push(
            error('lex:unterminated-braces', '@comment is not closed (unbalanced braces)', span(entryOpen, entryOpen + 1)),
          );
          closeEntry(r.end, true);
          i = r.end;
        }
        break;
      }
      case 'body': {
        if (isSpace(c)) {
          i++;
          break;
        }
        if (c === closer) {
          closeEntry(i, false);
          i++;
          break;
        }
        if (c === '@') {
          diagnostics.push(
            error('lex:unclosed-entry', `entry is not closed with "${closer}" before the next "@"`, span(entryOpen, entryOpen + 1)),
          );
          closeEntry(i, true);
          break;
        }
        if (c === ',' || c === '=' || c === '#') {
          push(c === ',' ? 'comma' : c === '=' ? 'equals' : 'hash', c, i, i + 1);
          i++;
          break;
        }
        if (c === '{') {
          const r = scanBalanced(i + 1, 1, () => false);
          push('braced', source.slice(i + 1, r.end), i, r.ok ? r.end + 1 : r.end);
          if (r.ok) {
            i = r.end + 1;
          } else {
            diagnostics.push(error('lex:unterminated-braces', 'unbalanced braces in field value', span(i, i + 1)));
            closeEntry(r.end, true);
            i = r.end;
          }
          break;
        }
        if (c === '"') {
          const r = scanBalanced(i + 1, 0, (ch) => ch === '"');
          push('quoted', source.slice(i + 1, r.end), i, r.ok ? r.end + 1 : r.end);
          if (r.ok) {
            i = r.end + 1;
          } else {
            diagnostics.push(error('lex:unterminated-quote', 'unterminated quoted value', span(i, i + 1)));
            if (source[r.end] !== '}') closeEntry(r.end, true);
            i = r.end;
          }
          break;
        }
        if (isNameChar(c)) {
          let j = i;
          while (isNameChar(source[j])) j++;
          const text = source.slice(i, j);
          push(/^\d+$/u.test(text) ? 'number' : 'name', text, i, j);
          i = j;
          break;
        }
        diagnostics.push(error('lex:unexpected-character', `unexpected "${c}" inside an entry`, span(i, i + 1)));
        i++;
        break;
      }
    }
  }
  if (mode === 'body' || mode === 'comment-body') {
    diagnostics.push(
      error('lex:unclosed-entry', `entry is not closed with "${closer}" at end of file`, span(entryOpen, entryOpen + 1)),
    );
    closeEntry(source.length, true);
  }
  push('eof', '', source.length, source.length);
  return { tokens, diagnostics };
};
