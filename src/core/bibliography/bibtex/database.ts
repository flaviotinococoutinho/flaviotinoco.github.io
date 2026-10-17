/**
 * From concrete syntax to the abstract database (pure, total).
 *
 * Resolves `@string` macros and `#` concatenation, lower-cases entry types and
 * field names (BibTeX is case-insensitive in both), and rejects duplicate keys
 * (case-insensitively, as bibtex(1) does) and duplicate fields. Field values stay
 * RAW LaTeX here: decoding is a separate, field-aware step (names must be split
 * on brace-level-0 "and" before any decoding, URLs must never be decoded).
 *
 * Also provides the canonical printer (`printCst`), whose law
 * `strip(parseCst(printCst(c))) = strip(c)` is property-tested.
 */
import { err, ok, type Result } from '../../algebra/result.ts';
import { parseCst, type Cst, type CstField, type CstNode, type CstValue } from './cst.ts';
import { byPosition, error, formatPoint, isError, type Diagnostic, type Span } from './source.ts';

export type BibField = {
  readonly name: string;
  /** Raw LaTeX after macro expansion and concatenation (outer delimiters removed). */
  readonly raw: string;
  readonly span: Span;
  readonly nameSpan: Span;
};

export type BibEntry = {
  /** Lower-cased entry type, e.g. "article". */
  readonly type: string;
  readonly key: string;
  readonly keySpan: Span;
  readonly span: Span;
  /** Lower-cased field name → field, in source order. */
  readonly fields: ReadonlyMap<string, BibField>;
};

export type BibDatabase = {
  readonly entries: readonly BibEntry[];
  /** Lower-cased macro name → raw expansion (user `@string`s only). */
  readonly strings: ReadonlyMap<string, string>;
  readonly preamble: readonly string[];
  readonly comments: readonly string[];
  readonly warnings: readonly Diagnostic[];
};

/** The month macros every BibTeX style predefines (btxdoc §4: "jan" … "dec"). */
export const MONTH_MACROS: Readonly<Partial<Record<string, string>>> = {
  jan: 'January',
  feb: 'February',
  mar: 'March',
  apr: 'April',
  may: 'May',
  jun: 'June',
  jul: 'July',
  aug: 'August',
  sep: 'September',
  oct: 'October',
  nov: 'November',
  dec: 'December',
};

export type DatabaseResult = { readonly database: BibDatabase; readonly diagnostics: readonly Diagnostic[] };

export const buildDatabase = (cst: Cst): DatabaseResult => {
  const diagnostics: Diagnostic[] = [];
  const strings = new Map<string, string>();
  const preamble: string[] = [];
  const comments: string[] = [];
  const entries: BibEntry[] = [];
  const keys = new Map<string, Span>();

  const evaluate = (value: CstValue): string =>
    value.pieces
      .map((piece) => {
        switch (piece.kind) {
          case 'braced':
          case 'quoted':
          case 'number':
            return piece.raw;
          case 'macro': {
            const name = piece.name.toLowerCase();
            const user = strings.get(name);
            if (user !== undefined) return user;
            const month = MONTH_MACROS[name];
            if (month !== undefined) return month;
            diagnostics.push(error('db:undefined-macro', `undefined @string macro "${piece.name}"`, piece.span));
            return '';
          }
        }
      })
      .join('');

  const toField = (field: CstField): BibField => ({
    name: field.name.toLowerCase(),
    raw: evaluate(field.value),
    span: field.value.span,
    nameSpan: field.nameSpan,
  });

  for (const node of cst.nodes) {
    switch (node.kind) {
      case 'junk':
        break;
      case 'comment':
        comments.push(node.raw);
        break;
      case 'preamble':
        preamble.push(evaluate(node.value));
        break;
      case 'string': {
        // User macros may shadow the predefined month macros (as in bibtex(1)); redefining a user macro is an error.
        const name = node.field.name.toLowerCase();
        if (strings.has(name)) {
          diagnostics.push(
            error('db:duplicate-macro', `@string "${node.field.name}" is already defined`, node.field.nameSpan),
          );
        } else {
          strings.set(name, evaluate(node.field.value));
        }
        break;
      }
      case 'entry': {
        if (node.key === '') break; // already reported by the parser
        const folded = node.key.toLowerCase();
        const first = keys.get(folded);
        if (first !== undefined) {
          diagnostics.push(
            error(
              'db:duplicate-key',
              `duplicate key "${node.key}" (first defined at ${formatPoint(first.start)})`,
              node.keySpan,
            ),
          );
          break;
        }
        keys.set(folded, node.keySpan);
        const fields = new Map<string, BibField>();
        for (const f of node.fields) {
          const field = toField(f);
          if (fields.has(field.name)) {
            diagnostics.push(
              error('db:duplicate-field', `field "${field.name}" appears twice in "${node.key}"`, f.nameSpan),
            );
            continue;
          }
          fields.set(field.name, field);
        }
        entries.push({ type: node.type, key: node.key, keySpan: node.keySpan, span: node.span, fields });
        break;
      }
    }
  }
  return {
    database: { entries, strings, preamble, comments, warnings: diagnostics.filter((d) => !isError(d)) },
    diagnostics,
  };
};

/**
 * Parses a .bib source. Every lexical, syntactic and database error is
 * accumulated (sorted by position); warnings ride along in `database.warnings`.
 */
export const parseBibtex = (source: string): Result<BibDatabase, readonly Diagnostic[]> => {
  const { cst, diagnostics: syntax } = parseCst(source);
  const { database, diagnostics: semantic } = buildDatabase(cst);
  const all = [...syntax, ...semantic].sort(byPosition);
  return all.some(isError) ? err(all) : ok(database);
};

// ---------------------------------------------------------------------------
// Canonical printer
// ---------------------------------------------------------------------------

const printValue = (value: CstValue): string =>
  value.pieces
    .map((piece) => {
      switch (piece.kind) {
        case 'braced':
          return `{${piece.raw}}`;
        case 'quoted':
          return `"${piece.raw}"`;
        case 'number':
          return piece.raw;
        case 'macro':
          return piece.name;
      }
    })
    .join(' # ');

const printNode = (node: CstNode): string => {
  switch (node.kind) {
    case 'junk':
      return node.text;
    case 'comment':
      return `@comment{${node.raw}}`;
    case 'preamble':
      return `@preamble{${printValue(node.value)}}`;
    case 'string':
      return `@string{${node.field.name} = ${printValue(node.field.value)}}`;
    case 'entry':
      return `@${node.type}{${node.key}${node.fields.map((f) => `,\n  ${f.name} = ${printValue(f.value)}`).join('')}\n}`;
  }
};

/** Prints a CST in canonical layout (junk preserved verbatim, entries re-indented). */
export const printCst = (cst: Cst): string => cst.nodes.map(printNode).join('');
