/**
 * Shell helpers shared by the guardrail scripts (file-system I/O only).
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Every file under `dir`, as "/"-separated paths relative to `dir`, sorted. */
export const listFiles = async (dir: string): Promise<readonly string[]> => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .sort();
};

/** Reads the files whose relative path satisfies `accept`, keyed by relative path. */
export const readMatching = async (
  dir: string,
  files: readonly string[],
  accept: (file: string) => boolean,
): Promise<ReadonlyMap<string, string>> => {
  const selected = files.filter(accept);
  const contents = await Promise.all(selected.map((f) => readFile(path.join(dir, f), 'utf8')));
  return new Map(selected.map((f, i) => [f, contents[i] ?? '']));
};

/** Value of `--name value` in argv, or the positional argument at `index` when absent. */
export const argument = (argv: readonly string[], name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

/** First positional argument (not a --flag and not a flag's value). */
export const positional = (argv: readonly string[]): string | undefined => {
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i] ?? '';
    if (a.startsWith('--')) {
      i += 1;
      continue;
    }
    return a;
  }
  return undefined;
};
