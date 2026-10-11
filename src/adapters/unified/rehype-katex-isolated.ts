/**
 * KaTeX with per-file macro isolation and fail-fast errors.
 *
 * rehype-katex shares one options object across files, so a \gdef in one
 * essay would leak into the next (verified). Each file gets a fresh copy of
 * the site preamble (src/core/latex/macros.ts) plus its own frontmatter
 * `macros`. rehype-katex reports TeX errors as non-fatal messages and renders
 * red text; here any such message fails the build instead.
 */
import type { Root } from 'hast';
import type { VFile } from 'vfile';
import rehypeKatex from 'rehype-katex';
import { KATEX_OPTIONS, MACROS } from '../../core/latex/macros.ts';

const isStringRecord = (v: unknown): v is Record<string, string> =>
  typeof v === 'object' && v !== null && Object.values(v).every((x) => typeof x === 'string');

export function rehypeKatexIsolated() {
  return (tree: Root, file: VFile): void => {
    const frontmatter = (file.data as { astro?: { frontmatter?: Record<string, unknown> } }).astro?.frontmatter;
    const local = isStringRecord(frontmatter?.['macros']) ? frontmatter['macros'] : {};
    const transform = rehypeKatex({ ...KATEX_OPTIONS, macros: { ...MACROS, ...local } });
    (transform as (tree: Root, file: VFile) => void)(tree, file);
    const errors = file.messages.filter((m) => m.source === 'rehype-katex');
    if (errors.length > 0) {
      file.fail(`KaTeX: ${errors.map((m) => m.reason).join('; ')}`);
    }
  };
}
