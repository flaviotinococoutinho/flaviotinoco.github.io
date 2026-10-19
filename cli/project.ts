/**
 * Where things are in a checkout of the site (shell helpers, no decisions).
 *
 * Two roots are distinguished:
 *  - the PROJECT root holds the data a command reads and writes (src/content,
 *    lexicon/, bibliography/, .cache/); `--root <dir>` or FT_ROOT, else the
 *    working directory;
 *  - the CODE root is the checkout this CLI was loaded from; the content schema
 *    (src/content.config.ts) and the Markdown pipeline come from there, so a
 *    fixture project is checked by exactly the rules of the site.
 */
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locale } from '../src/core/domain/locale.ts';
import type { Fs } from './io.ts';

/** The checkout this file belongs to (cli/ is one level below it). */
export const CODE_ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Content collections whose entries are Markdown files rendered by the pipeline (src/content.config.ts). */
export const MARKDOWN_COLLECTIONS = ['essays', 'labs', 'pages', 'strata'] as const;
export type MarkdownCollection = (typeof MARKDOWN_COLLECTIONS)[number];

/** Collections `ft new` scaffolds. */
export const AUTHORED_COLLECTIONS = ['essays', 'labs', 'pages'] as const;
export type AuthoredCollection = (typeof AUTHORED_COLLECTIONS)[number];

/** Locale directory of each locale (src/content/<collection>/<dir>/). */
export const LOCALE_DIR: Readonly<Record<Locale, 'pt' | 'en'>> = { 'pt-BR': 'pt', en: 'en' };
export const DIR_LOCALE: Readonly<Record<'pt' | 'en', Locale>> = { pt: 'pt-BR', en: 'en' };

export const CACHE_DIR = '.cache';
export const LEXICON_CACHE = join(CACHE_DIR, 'lexicon');

export const projectRoot = (cwd: string, option: string | undefined, env: Readonly<Record<string, string | undefined>>) =>
  resolve(cwd, option ?? env['FT_ROOT'] ?? '.');

/** Path relative to the project root, with forward slashes (stable in messages and goldens). */
export const display = (root: string, path: string): string => {
  const rel = relative(root, path);
  return (rel === '' || rel.startsWith('..') || isAbsolute(rel) ? path : rel).split(sep).join('/');
};

export interface ContentLocation {
  readonly collection: MarkdownCollection;
  readonly dir: 'pt' | 'en';
  /** File name without .md. */
  readonly name: string;
}

/** Collection and locale directory of a file under src/content, if it is a content entry. */
export const locate = (root: string, path: string): ContentLocation | undefined => {
  const parts = relative(join(root, 'src', 'content'), path).split(sep);
  if (parts.length !== 3) return undefined;
  const [collection, dir, file] = parts as [string, string, string];
  if (!(MARKDOWN_COLLECTIONS as readonly string[]).includes(collection)) return undefined;
  if (dir !== 'pt' && dir !== 'en') return undefined;
  if (!file.endsWith('.md')) return undefined;
  return { collection: collection as MarkdownCollection, dir, name: file.slice(0, -'.md'.length) };
};

/** Every Markdown entry of the content collections, in a stable order. */
export const contentFiles = async (root: string, fs: Fs): Promise<readonly string[]> => {
  const out: string[] = [];
  for (const collection of MARKDOWN_COLLECTIONS) {
    for (const dir of ['pt', 'en'] as const) {
      const base = join(root, 'src', 'content', collection, dir);
      for (const name of await fs.list(base)) if (name.endsWith('.md')) out.push(join(base, name));
    }
  }
  return out;
};

/** Expands command-line paths: files are kept, directories contribute their .md files (recursively). */
export const expandPaths = async (
  root: string,
  cwd: string,
  paths: readonly string[],
  fs: Fs,
): Promise<readonly string[]> => {
  if (paths.length === 0) return contentFiles(root, fs);
  const out: string[] = [];
  const walk = async (path: string): Promise<void> => {
    if (await fs.isDirectory(path)) {
      for (const name of await fs.list(path)) await walk(join(path, name));
    } else if (path.endsWith('.md')) out.push(path);
  };
  for (const p of paths) {
    const abs = resolve(cwd, p);
    if (await fs.isDirectory(abs)) await walk(abs);
    else out.push(abs);
  }
  return [...new Set(out)];
};
