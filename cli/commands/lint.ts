/**
 * ft lint [paths…] [--format text|json] [--max-warnings n] [--no-discovery]
 *
 * Without paths: every Markdown entry of src/content/{essays,labs,pages,strata}.
 * Exit 1 on any error, or when warnings exceed --max-warnings; suggestions
 * (candidate foreign terms) never change the exit code.
 */
import { bool, openSession, parseCommand, str, type Session } from '../args.ts';
import { EXIT_FAILURE, EXIT_OK, type ExitCode, type Io } from '../io.ts';
import { expandPaths } from '../project.ts';
import { byPlace, formatJson, formatText, lintFails, summarise, type Diagnostic, type Summary } from '../lint/diagnostic.ts';
import { createLinter, prepareLint, type LintEnvironment } from '../lint/engine.ts';
import { usageError } from './shared.ts';

export const OPTIONS = {
  format: { type: 'string' },
  'max-warnings': { type: 'string' },
  'no-discovery': { type: 'boolean' },
} as const;

export interface LintRun {
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: Summary;
  readonly notes: readonly string[];
}

/** Lints files (used by `ft lint` and `ft check`). Throws when the build context cannot load. */
export const lintPaths = async (
  session: Session,
  paths: readonly string[],
  discovery: boolean,
  prepared?: LintEnvironment,
): Promise<LintRun> => {
  const env = prepared ?? (await prepareLint(session));
  const files = await expandPaths(session.root, session.io.cwd, paths, session.io.fs);
  const lint = createLinter(session, env, { discovery });
  const diagnostics: Diagnostic[] = [];
  for (const file of files) diagnostics.push(...(await lint(file)));
  diagnostics.sort(byPlace);
  return { diagnostics, summary: summarise(files.length, diagnostics), notes: env.notes };
};

export const printSummary = (session: Session, summary: Summary): void => {
  const { t, out } = session;
  const line = t('lint.summary', {
    files: summary.files,
    errors: summary.errors,
    warnings: summary.warnings,
    suggestions: summary.suggestions,
  });
  session.print(summary.errors > 0 ? out.red(line) : summary.warnings > 0 ? out.yellow(line) : out.green(line));
};

export const run = async (args: readonly string[], io: Io): Promise<ExitCode> => {
  const parsed = parseCommand(args, OPTIONS);
  if (!parsed.ok) return usageError(io, 'lint', parsed.error, args);
  const session = openSession(io, parsed.value.values);
  const { values, positionals } = parsed.value;
  const format = str(values, 'format') ?? 'text';
  if (format !== 'text' && format !== 'json') {
    return usageError(io, 'lint', session.t('error.format', { format }), session);
  }
  const maxRaw = str(values, 'max-warnings');
  const maxWarnings = maxRaw === undefined ? undefined : Number(maxRaw);
  if (maxWarnings !== undefined && !(Number.isInteger(maxWarnings) && maxWarnings >= 0)) {
    return usageError(io, 'lint', session.t('error.maxWarnings', { value: maxRaw ?? '' }), session);
  }
  let result: LintRun;
  try {
    result = await lintPaths(session, positionals, !bool(values, 'no-discovery'));
  } catch (e: unknown) {
    session.warn(session.errStyle.red(session.t('lint.contextFailed', { detail: e instanceof Error ? e.message : String(e) })));
    return EXIT_FAILURE;
  }
  if (format === 'json') {
    io.stdout.write(formatJson(result.diagnostics, result.summary, result.notes));
  } else {
    const label = (s: Diagnostic['severity']): string => session.t(`severity.${s}`);
    for (const d of result.diagnostics) for (const line of formatText(d, label, session.out)) session.print(line);
    for (const note of result.notes) session.warn(session.errStyle.dim(note));
    printSummary(session, result.summary);
  }
  return lintFails(result.summary, maxWarnings) ? EXIT_FAILURE : EXIT_OK;
};
