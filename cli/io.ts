/**
 * The world as the commands see it (imperative shell, injected).
 *
 * Every command is `run(args, io): Promise<ExitCode>`; nothing in cli/commands
 * reaches for `process`, the console, the clock or the network directly. The
 * real implementation is built once in main.ts (`nodeIo`); tests build one
 * with string buffers, a fixed clock and a temporary directory (Bernhardt,
 * "Boundaries", 2012: the shell is thin and the decisions are testable).
 *
 * Exit codes (documented in docs/cli.md):
 *   0  success (warnings allowed);
 *   1  the checked material has errors (lint, validation, unknown key…);
 *   2  usage error (unknown command or option, missing argument).
 */
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ExitCode = 0 | 1 | 2;
export const EXIT_OK: ExitCode = 0;
export const EXIT_FAILURE: ExitCode = 1;
export const EXIT_USAGE: ExitCode = 2;

export interface Writer {
  readonly write: (text: string) => void;
  /** Whether the stream is an interactive terminal (colours are only used there). */
  readonly isTTY: boolean;
}

/** The file-system operations the commands need; paths are absolute. */
export interface Fs {
  readonly readText: (path: string) => Promise<string>;
  readonly readBytes: (path: string) => Promise<Uint8Array>;
  readonly writeText: (path: string, text: string) => Promise<void>;
  readonly writeBytes: (path: string, bytes: Uint8Array) => Promise<void>;
  /** Creates a file that must not exist yet (fails with `exists`, never overwrites). */
  readonly createText: (path: string, text: string) => Promise<'created' | 'exists'>;
  readonly copy: (from: string, to: string) => Promise<void>;
  readonly exists: (path: string) => Promise<boolean>;
  readonly isDirectory: (path: string) => Promise<boolean>;
  /** Entry names of a directory, sorted; [] when the directory does not exist. */
  readonly list: (path: string) => Promise<readonly string[]>;
  readonly mkdirp: (path: string) => Promise<void>;
}

export interface Io {
  readonly stdout: Writer;
  readonly stderr: Writer;
  readonly fs: Fs;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The clock (injected: `ft new` writes it as the publication date). */
  readonly now: () => Date;
  /** Working directory (absolute). */
  readonly cwd: string;
  /** Downloads a resource (`ft lexicon build --from <url>`). */
  readonly fetch: (url: string) => Promise<Uint8Array>;
  /** Runs a program with inherited stdio and returns its exit status (`ft reviews candidates --refresh`). */
  readonly exec: (command: string, args: readonly string[], cwd: string) => Promise<number>;
}

const isMissing = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { readonly code: unknown }).code === 'ENOENT';

/** The node:fs/promises implementation of Fs. */
export const nodeFs: Fs = {
  readText: (path) => readFile(path, 'utf8'),
  readBytes: async (path) => new Uint8Array(await readFile(path)),
  writeText: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
  },
  writeBytes: async (path, bytes) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  },
  createText: async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    try {
      // 'wx': O_CREAT | O_EXCL — the existence test and the creation are one atomic step.
      await writeFile(path, text, { encoding: 'utf8', flag: 'wx' });
      return 'created';
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 'EEXIST') {
        return 'exists';
      }
      throw e;
    }
  },
  copy: async (from, to) => {
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  },
  exists: async (path) => {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  },
  isDirectory: async (path) => {
    try {
      return (await stat(path)).isDirectory();
    } catch {
      return false;
    }
  },
  list: async (path) => {
    try {
      return (await readdir(path)).sort();
    } catch (e: unknown) {
      if (isMissing(e)) return [];
      throw e;
    }
  },
  mkdirp: async (path) => {
    await mkdir(path, { recursive: true });
  },
};

/** A Writer that accumulates text (tests, and commands that compose other commands). */
export const bufferWriter = (isTTY = false): Writer & { readonly text: () => string } => {
  const chunks: string[] = [];
  return { write: (t) => void chunks.push(t), isTTY, text: () => chunks.join('') };
};
