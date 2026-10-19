/**
 * Lint findings and their two renderings (pure).
 *
 * Severities:
 *   error       the build would fail, or the data is wrong (schema, broken reference,
 *               a scaffold placeholder left in place) — exit code 1;
 *   warning     a non-fatal message of a pipeline stage: exactly a `[content-lint]`
 *               line of the build (same rule id, same message, same coordinates);
 *   suggestion  a candidate foreign term (Bloom filter) — never affects the exit code.
 * Coordinates are file coordinates: 1-based lines counted from the top of the
 * file, frontmatter included (0:0 when a stage gave no place, as in the build log).
 */
import type { Style } from '../term.ts';

export type Severity = 'error' | 'warning' | 'suggestion';

export interface Diagnostic {
  /** Project-relative path with forward slashes. */
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly severity: Severity;
  /** `stage:rule` of the pipeline, or ft's own rule (frontmatter:schema, lexicon:unknown-word, ft:placeholder…). */
  readonly rule: string;
  readonly message: string;
  /** A command that resolves or classifies the finding. */
  readonly hint?: string;
}

export interface Summary {
  readonly files: number;
  readonly errors: number;
  readonly warnings: number;
  readonly suggestions: number;
}

export const summarise = (files: number, diagnostics: readonly Diagnostic[]): Summary => ({
  files,
  errors: diagnostics.filter((d) => d.severity === 'error').length,
  warnings: diagnostics.filter((d) => d.severity === 'warning').length,
  suggestions: diagnostics.filter((d) => d.severity === 'suggestion').length,
});

/** Stable order: file, line, column, then severity (errors first) and rule. */
export const byPlace = (a: Diagnostic, b: Diagnostic): number => {
  const rank: Readonly<Record<Severity, number>> = { error: 0, warning: 1, suggestion: 2 };
  return (
    (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) ||
    a.line - b.line ||
    a.column - b.column ||
    rank[a.severity] - rank[b.severity] ||
    (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0)
  );
};

/** One finding as a terminal line (+ an indented hint line). */
export const formatText = (d: Diagnostic, label: (s: Severity) => string, s: Style): readonly string[] => {
  const tone = d.severity === 'error' ? s.red : d.severity === 'warning' ? s.yellow : s.cyan;
  const rule = d.rule === '' ? '' : ` ${s.dim(d.rule)}`;
  const head = `${s.bold(`${d.file}:${String(d.line)}:${String(d.column)}`)} ${tone(label(d.severity))}${rule} ${d.message}`;
  return d.hint === undefined ? [head] : [head, `  ${s.dim('→')} ${d.hint}`];
};

/** The machine-readable report (`--format json`). */
export const formatJson = (
  diagnostics: readonly Diagnostic[],
  summary: Summary,
  notes: readonly string[],
): string => `${JSON.stringify({ version: 1, summary, diagnostics, notes }, null, 2)}\n`;

/** Exit status of a lint run: errors fail; warnings fail only beyond `maxWarnings` (when given). */
export const lintFails = (summary: Summary, maxWarnings: number | undefined): boolean =>
  summary.errors > 0 || (maxWarnings !== undefined && summary.warnings > maxWarnings);
