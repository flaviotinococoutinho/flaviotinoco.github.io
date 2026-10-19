/**
 * Command-line parsing (node:util parseArgs, strict) and the per-run session.
 *
 * Global options, accepted by every command:
 *   --root <dir>   project root (default: FT_ROOT, else the working directory)
 *   --no-color     never emit ANSI styles (NO_COLOR is also honoured)
 *   -h, --help     the command's help
 *   --lang pt|en   language of the messages — except in `new` and `lexicon add`,
 *                  where --lang is the language of the document or of the term;
 *                  there the message language comes from FT_LANG.
 * The message language defaults to pt-BR.
 */
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { err, ok, type Result } from '../src/core/algebra/result.ts';
import type { Locale } from '../src/core/domain/locale.ts';
import type { Io } from './io.ts';
import { cliMessages, type MessageKey, type Translate, translate } from './messages.ts';
import { projectRoot } from './project.ts';
import { colourEnabled, style, type Style } from './term.ts';

export type OptionSpec = ParseArgsOptionsConfig;

export type Values = Readonly<Record<string, string | boolean | readonly (string | boolean)[] | undefined>>;

export interface Parsed {
  readonly values: Values;
  readonly positionals: readonly string[];
}

const GLOBAL: OptionSpec = {
  root: { type: 'string' },
  'no-color': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

const UI_LANG: OptionSpec = { lang: { type: 'string' } };

/**
 * Parses the arguments of one command. `ownLang` = the command defines --lang
 * itself (document/term language) instead of the global message language.
 */
export const parseCommand = (
  args: readonly string[],
  options: OptionSpec,
  ownLang = false,
): Result<Parsed, string> => {
  try {
    const { values, positionals } = parseArgs({
      args: [...args],
      options: { ...GLOBAL, ...(ownLang ? {} : UI_LANG), ...options },
      allowPositionals: true,
      strict: true,
    });
    return ok({ values: values as Values, positionals });
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : String(e));
  }
};

export const str = (values: Values, key: string): string | undefined => {
  const v = values[key];
  return typeof v === 'string' ? v : undefined;
};

export const bool = (values: Values, key: string): boolean => values[key] === true;

/** A comma-separated list option ("a,b" → ["a", "b"]); empty items are dropped. */
export const list = (values: Values, key: string): readonly string[] | undefined => {
  const v = str(values, key);
  return v === undefined
    ? undefined
    : v
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
};

/** "pt", "pt-BR" → pt-BR; "en" → en; anything else → undefined. */
export const parseUiLocale = (raw: string | undefined): Locale | undefined => {
  if (raw === undefined) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'pt' || v === 'pt-br' || v === 'pt_br') return 'pt-BR';
  if (v === 'en' || v.startsWith('en-') || v.startsWith('en_')) return 'en';
  return undefined;
};

/** Everything a command needs besides its own options. */
export interface Session {
  readonly io: Io;
  readonly root: string;
  readonly locale: Locale;
  readonly t: Translate;
  /** Styles for stdout and stderr (each stream decides on its own whether it is a terminal). */
  readonly out: Style;
  readonly errStyle: Style;
  readonly print: (line?: string) => void;
  readonly warn: (line: string) => void;
}

export const openSession = (io: Io, values: Values, ownLang = false): Session => {
  const locale = (ownLang ? undefined : parseUiLocale(str(values, 'lang'))) ?? parseUiLocale(io.env['FT_LANG']) ?? 'pt-BR';
  const noColor = bool(values, 'no-color');
  return {
    io,
    root: projectRoot(io.cwd, str(values, 'root'), io.env),
    locale,
    t: translate(cliMessages, locale),
    out: style(colourEnabled(io.stdout.isTTY, io.env, noColor)),
    errStyle: style(colourEnabled(io.stderr.isTTY, io.env, noColor)),
    print: (line = '') => io.stdout.write(`${line}\n`),
    warn: (line) => io.stderr.write(`${line}\n`),
  };
};

/** The session for a usage error raised before the options could be parsed. */
export const bareSession = (io: Io, lang?: string): Session =>
  openSession(io, lang === undefined ? {} : { lang });

export type { MessageKey };
