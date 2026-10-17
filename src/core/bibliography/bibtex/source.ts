/**
 * Source positions and diagnostics shared by every BibTeX stage.
 *
 * Positions follow the unist convention (https://github.com/syntax-tree/unist#point):
 * `line` and `column` are 1-based, `offset` is 0-based. Columns and offsets count
 * UTF-16 code units, which is what JavaScript string indices are.
 *
 * Diagnostics are values, never exceptions: every stage returns the problems it
 * found next to its (possibly partial) result, so the build can report ALL of them
 * at once (applicative validation, docs/arquitetura.md §2.3).
 */

export type Point = { readonly line: number; readonly column: number; readonly offset: number };
export type Span = { readonly start: Point; readonly end: Point };

export type Severity = 'error' | 'warning';

/** Closed set of diagnostic codes, namespaced by the stage that emits them. */
export type DiagnosticCode =
  | 'lex:unterminated-braces'
  | 'lex:unterminated-quote'
  | 'lex:unexpected-character'
  | 'lex:unclosed-entry'
  | 'parse:expected-entry-type'
  | 'parse:expected-open'
  | 'parse:expected-key'
  | 'parse:expected-field-name'
  | 'parse:expected-equals'
  | 'parse:expected-value'
  | 'parse:expected-comma'
  | 'db:duplicate-key'
  | 'db:duplicate-field'
  | 'db:undefined-macro'
  | 'db:duplicate-macro'
  | 'latex:unknown-command'
  | 'latex:math-verbatim'
  | 'latex:unbalanced-brace'
  | 'name:empty'
  | 'name:too-many-commas'
  | 'name:misplaced-others'
  | 'model:unsupported-type'
  | 'model:unsupported-field'
  | 'model:missing-field'
  | 'model:conflicting-fields'
  | 'model:invalid-value';

export type Diagnostic = {
  readonly severity: Severity;
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly span: Span;
};

export const START: Point = { line: 1, column: 1, offset: 0 };

export const error = (code: DiagnosticCode, message: string, span: Span): Diagnostic => ({
  severity: 'error',
  code,
  message,
  span,
});

export const warning = (code: DiagnosticCode, message: string, span: Span): Diagnostic => ({
  severity: 'warning',
  code,
  message,
  span,
});

export const isError = (d: Diagnostic): boolean => d.severity === 'error';

/** Total order on diagnostics by position, so reports are stable and read top-down. */
export const byPosition = (a: Diagnostic, b: Diagnostic): number =>
  a.span.start.offset - b.span.start.offset || a.span.end.offset - b.span.end.offset;

/** "12:5" — the conventional `line:column` rendering used in compiler messages. */
export const formatPoint = (p: Point): string => `${p.line}:${p.column}`;

/**
 * Index of line starts, for O(log n) offset → point conversion. Recognises
 * LF, CRLF and lone CR as line terminators (as micromark does).
 */
export type LineIndex = readonly number[];

export const lineIndex = (source: string): LineIndex => {
  const starts: number[] = [0];
  for (let i = 0; i < source.length; i++) {
    const c = source.charCodeAt(i);
    if (c === 13 /* \r */) {
      if (source.charCodeAt(i + 1) === 10) i++;
      starts.push(i + 1);
    } else if (c === 10 /* \n */) {
      starts.push(i + 1);
    }
  }
  return starts;
};

/** Converts a 0-based offset into a unist point (binary search over line starts). */
export const pointAt = (index: LineIndex, offset: number): Point => {
  let lo = 0;
  let hi = index.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((index[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  const lineStart = index[lo] ?? 0;
  return { line: lo + 1, column: offset - lineStart + 1, offset };
};

export const spanOf = (index: LineIndex, start: number, end: number): Span => ({
  start: pointAt(index, start),
  end: pointAt(index, end),
});
