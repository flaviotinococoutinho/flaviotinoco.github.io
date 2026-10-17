/**
 * Concrete syntax tree of a .bib file (pure, total parser over the token stream).
 *
 * Grammar (EBNF; after Patashnik, "BibTeXing" 1988, and the biber/btparse dialect):
 *
 *   file      = { junk | command } ;
 *   command   = "@" name ( "{" body "}" | "(" body ")" ) ;
 *   body      = comment-raw                                  (* @comment *)
 *             | value                                        (* @preamble *)
 *             | field [ "," ]                                (* @string *)
 *             | key [ "," field { "," field } [ "," ] ]       (* regular entry *) ;
 *   field     = name "=" value ;
 *   value     = piece { "#" piece } ;
 *   piece     = braced | quoted | number | name (* macro reference *) ;
 *
 * Every node keeps its source span, so later stages can report positions. The
 * parser never throws: on an unexpected token it records a diagnostic and
 * re-synchronises at the next "," or at the end of the entry.
 */
import { absurd } from '../../algebra/match.ts';
import { tokenize, type Token } from './lexer.ts';
import { error, type Diagnostic, type DiagnosticCode, type Span } from './source.ts';

export type CstPiece =
  | { readonly kind: 'braced'; readonly raw: string; readonly span: Span }
  | { readonly kind: 'quoted'; readonly raw: string; readonly span: Span }
  | { readonly kind: 'number'; readonly raw: string; readonly span: Span }
  | { readonly kind: 'macro'; readonly name: string; readonly span: Span };

export type CstValue = { readonly pieces: readonly CstPiece[]; readonly span: Span };

export type CstField = {
  readonly name: string;
  readonly nameSpan: Span;
  readonly value: CstValue;
  readonly span: Span;
};

export type CstNode =
  | { readonly kind: 'junk'; readonly text: string; readonly span: Span }
  | { readonly kind: 'comment'; readonly raw: string; readonly span: Span }
  | { readonly kind: 'preamble'; readonly value: CstValue; readonly span: Span }
  | { readonly kind: 'string'; readonly field: CstField; readonly span: Span }
  | {
      readonly kind: 'entry';
      readonly type: string;
      readonly typeSpan: Span;
      readonly key: string;
      readonly keySpan: Span;
      readonly fields: readonly CstField[];
      readonly span: Span;
    };

export type Cst = { readonly nodes: readonly CstNode[] };

export type CstResult = { readonly cst: Cst; readonly diagnostics: readonly Diagnostic[] };

const join = (a: Span, b: Span): Span => ({ start: a.start, end: b.end });

export const parseCst = (source: string): CstResult => {
  const lexed = tokenize(source);
  const tokens = lexed.tokens;
  const diagnostics: Diagnostic[] = [...lexed.diagnostics];
  const nodes: CstNode[] = [];
  let p = 0;

  const peek = (): Token => tokens[p] ?? (tokens.at(-1) as Token);
  const next = (): Token => {
    const t = peek();
    if (t.kind !== 'eof') p++;
    return t;
  };
  const report = (code: DiagnosticCode, message: string, at: Token): void => {
    // A synthetic token marks a place the lexer already reported.
    if (!at.synthetic) diagnostics.push(error(code, message, at.span));
  };
  /** Skips to the next comma or entry end, without consuming the latter. */
  const synchronise = (): void => {
    while (!['comma', 'close', 'eof', 'at'].includes(peek().kind)) p++;
  };

  const parsePiece = (): CstPiece | undefined => {
    const t = peek();
    if (t.kind === 'braced' || t.kind === 'quoted' || t.kind === 'number') {
      p++;
      return { kind: t.kind, raw: t.text, span: t.span };
    }
    if (t.kind === 'name') {
      p++;
      return { kind: 'macro', name: t.text, span: t.span };
    }
    report('parse:expected-value', `expected a value ({…}, "…", number or macro) but found ${describe(t)}`, t);
    return undefined;
  };

  const parseValue = (): CstValue | undefined => {
    const first = parsePiece();
    if (first === undefined) return undefined;
    const pieces: CstPiece[] = [first];
    while (peek().kind === 'hash') {
      p++;
      const piece = parsePiece();
      if (piece === undefined) return undefined;
      pieces.push(piece);
    }
    return { pieces, span: join(first.span, (pieces.at(-1) as CstPiece).span) };
  };

  const parseField = (): CstField | undefined => {
    const nameTok = peek();
    if (nameTok.kind !== 'name') {
      report('parse:expected-field-name', `expected a field name but found ${describe(nameTok)}`, nameTok);
      return undefined;
    }
    p++;
    if (peek().kind !== 'equals') {
      report('parse:expected-equals', `expected "=" after field "${nameTok.text}"`, peek());
      return undefined;
    }
    p++;
    const value = parseValue();
    if (value === undefined) return undefined;
    return { name: nameTok.text, nameSpan: nameTok.span, value, span: join(nameTok.span, value.span) };
  };

  /** Consumes the closing delimiter; returns its span (synthetic or real). */
  const expectClose = (): Span => {
    const t = peek();
    if (t.kind === 'close') {
      p++;
      return t.span;
    }
    report('parse:expected-comma', `expected "," or the end of the entry but found ${describe(t)}`, t);
    while (!['close', 'eof', 'at'].includes(peek().kind)) p++;
    const end = peek();
    if (end.kind === 'close') p++;
    return end.span;
  };

  const parseEntryBody = (atTok: Token, type: string, typeSpan: Span): void => {
    const lower = type.toLowerCase();
    if (lower === 'comment') {
      const raw = peek().kind === 'braced' ? next().text : '';
      const end = expectClose();
      nodes.push({ kind: 'comment', raw, span: join(atTok.span, end) });
      return;
    }
    if (lower === 'preamble') {
      const value = parseValue();
      if (value === undefined) synchronise();
      const end = expectClose();
      if (value !== undefined) nodes.push({ kind: 'preamble', value, span: join(atTok.span, end) });
      return;
    }
    if (lower === 'string') {
      const field = parseField();
      if (field === undefined) synchronise();
      if (peek().kind === 'comma') p++;
      const end = expectClose();
      if (field !== undefined) nodes.push({ kind: 'string', field, span: join(atTok.span, end) });
      return;
    }
    // Regular entry: key first. `@article{author = …` (missing key) is detected by the "=".
    const keyTok = peek();
    let key = '';
    let keySpan = keyTok.span;
    if ((keyTok.kind === 'name' || keyTok.kind === 'number') && tokens[p + 1]?.kind !== 'equals') {
      p++;
      key = keyTok.text;
    } else {
      report('parse:expected-key', `expected a citation key after "@${type}{"`, keyTok);
      keySpan = keyTok.span;
    }
    const fields: CstField[] = [];
    if (key !== '' && peek().kind !== 'comma' && peek().kind !== 'close') {
      report('parse:expected-comma', `expected "," after the key "${key}" but found ${describe(peek())}`, peek());
      synchronise();
    }
    while (peek().kind === 'comma' || (key === '' && peek().kind === 'name')) {
      if (peek().kind === 'comma') p++;
      if (peek().kind === 'close' || peek().kind === 'eof' || peek().kind === 'at') break;
      const field = parseField();
      if (field === undefined) {
        synchronise();
        continue;
      }
      fields.push(field);
      const after = peek().kind;
      if (after !== 'comma' && after !== 'close') {
        report('parse:expected-comma', `expected "," or the end of the entry but found ${describe(peek())}`, peek());
        synchronise();
      }
    }
    const end = expectClose();
    nodes.push({ kind: 'entry', type: lower, typeSpan, key, keySpan, fields, span: join(atTok.span, end) });
  };

  while (peek().kind !== 'eof') {
    const t = next();
    if (t.kind === 'junk') {
      nodes.push({ kind: 'junk', text: t.text, span: t.span });
      continue;
    }
    if (t.kind !== 'at') {
      report('parse:expected-entry-type', `unexpected ${describe(t)} outside an entry`, t);
      continue;
    }
    const typeTok = peek();
    if (typeTok.kind !== 'name') {
      report('parse:expected-entry-type', 'expected an entry type after "@"', t);
      continue;
    }
    p++;
    if (peek().kind !== 'open') {
      // `@comment` followed by free text is a comment line (biber, btparse): not an error.
      if (typeTok.text.toLowerCase() === 'comment') {
        nodes.push({ kind: 'comment', raw: '', span: join(t.span, typeTok.span) });
        continue;
      }
      report('parse:expected-open', `expected "{" or "(" after "@${typeTok.text}"`, typeTok);
      continue;
    }
    p++;
    parseEntryBody(t, typeTok.text, typeTok.span);
  }
  return { cst: { nodes }, diagnostics };
};

const describe = (t: Token): string => {
  switch (t.kind) {
    case 'eof':
      return 'the end of the file';
    case 'braced':
      return 'a braced value';
    case 'quoted':
      return 'a quoted value';
    case 'close':
      return t.synthetic ? 'the end of the entry' : `"${t.text}"`;
    case 'junk':
      return 'text';
    case 'at':
    case 'name':
    case 'number':
    case 'open':
    case 'comma':
    case 'equals':
    case 'hash':
      return `"${t.text}"`;
    default:
      return absurd(t.kind);
  }
};
