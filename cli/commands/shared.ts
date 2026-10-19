/**
 * Small helpers shared by the commands (shell).
 */
import { bareSession, parseUiLocale, type Session } from '../args.ts';
import { EXIT_USAGE, type ExitCode, type Io } from '../io.ts';

/**
 * Reports a usage error on stderr (with the command to get help) and returns
 * exit code 2. Before the options are parsed, pass the raw arguments: their
 * --lang (if any) selects the language of the message.
 */
export const usageError = (
  io: Io,
  command: string,
  detail: string,
  context: Session | readonly string[] = [],
): ExitCode => {
  const s = Array.isArray(context) ? bareSession(io, sniffLang(context)) : (context as Session);
  s.warn(s.errStyle.red(s.t('error.usage', { command, detail })));
  s.warn(s.t('error.seeHelp', { command }));
  return EXIT_USAGE;
};

/** The message language named by --lang in raw arguments, if any (for errors raised before parsing). */
export const sniffLang = (args: readonly string[]): string | undefined => {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '--lang') return parseUiLocale(args[i + 1]) === undefined ? undefined : args[i + 1];
    if (a.startsWith('--lang=')) return a.slice('--lang='.length);
  }
  return undefined;
};

/** A number in an option (`--fp 0.001`), or undefined when absent; NaN when malformed. */
export const numberOption = (raw: string | undefined): number | undefined =>
  raw === undefined ? undefined : raw.trim() === '' ? Number.NaN : Number(raw);
