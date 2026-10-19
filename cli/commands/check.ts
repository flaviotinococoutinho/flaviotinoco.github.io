/**
 * ft check [--format text|json] [--max-warnings n] [--no-discovery]
 *
 * The gate the CI calls: dictionaries (lexicon/*.tsv, the build's parser),
 * bibliography (bibliography/*.bib), concept scheme (cli/ontology-port.ts) and
 * `ft lint` over every content entry — then one summary table. Exit 1 when
 * any part has an error (or the warnings exceed --max-warnings).
 */
import { formatIssue } from '../../src/core/lexicon/parse.ts';
import { formatDiagnostic } from '../../src/core/bibliography/index.ts';
import { bool, openSession, parseCommand, str, type Session } from '../args.ts';
import { EXIT_FAILURE, EXIT_OK, type ExitCode, type Io } from '../io.ts';
import { formatText, lintFails, type Diagnostic } from '../lint/diagnostic.ts';
import { loadOntology } from '../ontology-port.ts';
import { loadBibliographySources, loadLexicon } from '../sources.ts';
import { table } from '../term.ts';
import { lintPaths, OPTIONS as LINT_OPTIONS, type LintRun } from './lint.ts';
import { usageError } from './shared.ts';

export const OPTIONS = LINT_OPTIONS;

type Status = 'ok' | 'failed' | 'absent' | 'skipped';

export interface CheckRow {
  readonly part: 'lexicon' | 'bibliography' | 'ontology' | 'content';
  readonly status: Status;
  readonly errors: number;
  readonly warnings: number;
  readonly suggestions: number;
  readonly detail: string;
}

export const run = async (args: readonly string[], io: Io): Promise<ExitCode> => {
  const parsed = parseCommand(args, OPTIONS);
  if (!parsed.ok) return usageError(io, 'check', parsed.error, args);
  const { values, positionals } = parsed.value;
  const session = openSession(io, values);
  const { t } = session;
  if (positionals.length > 0) return usageError(io, 'check', t('error.extra', { value: positionals.join(' ') }), session);
  const format = str(values, 'format') ?? 'text';
  if (format !== 'text' && format !== 'json') return usageError(io, 'check', t('error.format', { format }), session);
  const maxRaw = str(values, 'max-warnings');
  const maxWarnings = maxRaw === undefined ? undefined : Number(maxRaw);
  if (maxWarnings !== undefined && !(Number.isInteger(maxWarnings) && maxWarnings >= 0)) {
    return usageError(io, 'check', t('error.maxWarnings', { value: maxRaw ?? '' }), session);
  }
  const text = format === 'text';
  const report = (line: string): void => (text ? session.warn(line) : undefined);
  const rows: CheckRow[] = [];

  // 1. Dictionaries.
  const lexicon = await loadLexicon(session.root, io.fs);
  if (lexicon.result.ok) {
    rows.push({ part: 'lexicon', status: 'ok', errors: 0, warnings: 0, suggestions: 0, detail: t('check.entries', { count: lexicon.result.value.entries.length }) });
  } else {
    for (const i of lexicon.result.error) report(session.errStyle.red(formatIssue(i)));
    rows.push({ part: 'lexicon', status: 'failed', errors: lexicon.result.error.length, warnings: 0, suggestions: 0, detail: t('check.files', { count: lexicon.sources.length }) });
  }

  // 2. Bibliography.
  const bib = await loadBibliographySources(session.root, io.fs);
  if (bib.ok) {
    for (const w of bib.value.warnings) report(session.errStyle.yellow(formatDiagnostic(w)));
    rows.push({ part: 'bibliography', status: 'ok', errors: 0, warnings: bib.value.warnings.length, suggestions: 0, detail: t('check.works', { count: bib.value.index.size }) });
  } else {
    for (const line of bib.error) report(session.errStyle.red(line));
    rows.push({ part: 'bibliography', status: 'failed', errors: bib.error.length, warnings: 0, suggestions: 0, detail: '' });
  }

  // 3. Concept scheme.
  const ontology = await loadOntology(session.root, io.fs);
  if (ontology === undefined) {
    rows.push({ part: 'ontology', status: 'absent', errors: 0, warnings: 0, suggestions: 0, detail: t('check.noConcepts') });
  } else if (ontology.ok) {
    rows.push({ part: 'ontology', status: 'ok', errors: 0, warnings: 0, suggestions: 0, detail: t('check.concepts', { count: ontology.value.ids.length }) });
  } else {
    for (const p of ontology.error) report(session.errStyle.red(`${p.file}: ${p.message}`));
    rows.push({ part: 'ontology', status: 'failed', errors: ontology.error.length, warnings: 0, suggestions: 0, detail: '' });
  }

  // 4. Content (needs the build context: dictionaries and bibliography must load).
  let lint: LintRun | undefined;
  if (lexicon.result.ok && bib.ok) {
    try {
      lint = await lintPaths(session, [], !bool(values, 'no-discovery'));
    } catch (e: unknown) {
      report(session.errStyle.red(t('lint.contextFailed', { detail: e instanceof Error ? e.message : String(e) })));
    }
  }
  if (lint === undefined) {
    rows.push({ part: 'content', status: 'skipped', errors: 0, warnings: 0, suggestions: 0, detail: t('check.contentSkipped') });
  } else {
    const s = lint.summary;
    rows.push({
      part: 'content',
      status: lintFails(s, maxWarnings) ? 'failed' : 'ok',
      errors: s.errors,
      warnings: s.warnings,
      suggestions: s.suggestions,
      detail: t('check.files', { count: s.files }),
    });
  }

  const failed = rows.some((r) => r.status === 'failed' || (r.part === 'content' && r.status === 'skipped'));
  if (!text) {
    io.stdout.write(`${JSON.stringify({ version: 1, ok: !failed, parts: rows, diagnostics: lint?.diagnostics ?? [], notes: lint?.notes ?? [] }, null, 2)}\n`);
    return failed ? EXIT_FAILURE : EXIT_OK;
  }
  if (lint !== undefined) {
    const label = (s: Diagnostic['severity']): string => t(`severity.${s}`);
    for (const d of lint.diagnostics) for (const line of formatText(d, label, session.out)) session.print(line);
    for (const note of lint.notes) session.warn(session.errStyle.dim(note));
    session.print();
  }
  printTable(session, rows);
  session.print(failed ? session.out.red(t('check.failed')) : session.out.green(t('check.passed')));
  return failed ? EXIT_FAILURE : EXIT_OK;
};

const printTable = (session: Session, rows: readonly CheckRow[]): void => {
  const { t, out } = session;
  const tone = (s: Status): ((x: string) => string) => (s === 'failed' ? out.red : s === 'ok' ? out.green : out.dim);
  const body: string[][] = [
    [t('check.col.part'), t('check.col.status'), t('check.col.errors'), t('check.col.warnings'), t('check.col.suggestions'), t('check.col.detail')],
    ...rows.map((r) => [
      t(`check.part.${r.part}`),
      tone(r.status)(t(`check.status.${r.status}`)),
      String(r.errors),
      String(r.warnings),
      r.part === 'content' ? String(r.suggestions) : '—',
      r.detail,
    ]),
  ];
  const lines = table(body, ['left', 'left', 'right', 'right', 'right', 'left']);
  session.print(out.bold(lines[0] ?? ''));
  for (const line of lines.slice(1)) session.print(line.trimEnd());
};
