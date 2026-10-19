/**
 * Test-side model of the authored corpus (src/content/{essays,labs,pages}).
 *
 * Every file is parsed exactly as the site's Markdown pipeline sees its
 * syntax (docs/arquitetura.md §5): remark-parse + remark-gfm +
 * remark-math (singleDollarTextMath: false) + remark-directive, with the
 * frontmatter read by Astro's own parser (@astrojs/markdown-remark) and
 * blanked with spaces so source offsets stay valid for error messages.
 *
 * The checks in syntax.test.ts are written against this model. The helpers
 * that scan prose (citations, dollars, heading attributes, words) are pure and
 * are themselves property-tested in checkers.test.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '@astrojs/markdown-remark';
import type { Root } from 'mdast';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const CONTENT_ROOT = join(REPO_ROOT, 'src/content');

export const COLLECTIONS = ['essays', 'labs', 'pages'] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export const LOCALE_DIRS = { pt: 'pt-BR', en: 'en' } as const;
export type LocaleDir = keyof typeof LOCALE_DIRS;

export interface Doc {
  /** Repository-relative path, for messages. */
  readonly path: string;
  readonly collection: CollectionName;
  readonly dir: LocaleDir;
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** File source with the frontmatter blanked by spaces (offsets preserved). */
  readonly source: string;
  readonly tree: Root;
}

/** The syntax layer of the site pipeline, without any of its semantic stages. */
export const parseMarkdown = (source: string): Root =>
  unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkDirective)
    .parse(source);

const markdownFiles = (dir: string): readonly string[] => {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md'))
      .sort()
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
};

/** Builds the model of one file from its raw text (frontmatter included). */
export const parseDoc = (path: string, collection: CollectionName, dir: LocaleDir, raw: string): Doc => {
  const { frontmatter, content } = parseFrontmatter(raw, { frontmatter: 'empty-with-spaces' });
  return { path, collection, dir, frontmatter, source: content, tree: parseMarkdown(content) };
};

export const loadCorpus = (root: string = CONTENT_ROOT): readonly Doc[] =>
  COLLECTIONS.flatMap((collection) =>
    (Object.keys(LOCALE_DIRS) as LocaleDir[]).flatMap((dir) =>
      markdownFiles(join(root, collection, dir)).map((file) =>
        parseDoc(relative(REPO_ROOT, file), collection, dir, readFileSync(file, 'utf8')),
      ),
    ),
  );
