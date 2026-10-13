/**
 * Remark stage "latex" (imperative shell; contract in pipeline.ts).
 *
 * Thin adapter around the pure transform src/core/latex/transform.ts:
 *   1. reads the document language from frontmatter.lang;
 *   2. runs the two-pass transform (numbering, then rendering/resolution);
 *   3. swaps the tree's children for the transformed ones (the only mutation);
 *   4. reports diagnostics — warnings through file.message, errors through a
 *      single file.fail that lists ALL of them (applicative validation: the
 *      author sees every problem of the document at once);
 *   5. exports frontmatter.hasMath (views load <MathAssets/> only when true)
 *      and frontmatter.crossrefs (label table: lists of figures/tables, etc.).
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import { DEFAULT_LOCALE, parseLocale } from '../../core/domain/locale.ts';
import type { Diagnostic } from '../../core/latex/model.ts';
import { transformLatex } from '../../core/latex/transform.ts';
import type { PipelineContext } from './context.ts';

export interface RemarkLatexOptions {
  readonly context: PipelineContext;
}

const ORIGIN = 'latex';

const frontmatterOf = (file: VFile): Record<string, unknown> => {
  const astro = (file.data.astro ??= {});
  return (astro.frontmatter ??= {});
};

const where = (d: Diagnostic): string =>
  d.position === undefined ? '' : `${String(d.position.start.line)}:${String(d.position.start.column)}: `;

const report = (file: VFile, diagnostics: readonly Diagnostic[]): void => {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  for (const d of diagnostics) {
    const m = file.message(d.message, d.position, `${ORIGIN}:${d.rule}`);
    if (d.severity === 'error') m.fatal = true;
  }
  const first = errors[0];
  if (first === undefined) return;
  const summary =
    errors.length === 1
      ? first.message
      : `${String(errors.length)} LaTeX errors:\n${errors.map((d) => `  ${where(d)}${d.message} [${d.rule}]`).join('\n')}`;
  file.fail(summary, first.position, `${ORIGIN}:${first.rule}`);
};

export function remarkLatex(_options: RemarkLatexOptions) {
  return (tree: Root, file: VFile): void => {
    const frontmatter = frontmatterOf(file);
    const lang = parseLocale(frontmatter['lang']);
    const result = transformLatex(tree, {
      locale: lang.ok ? lang.value : DEFAULT_LOCALE,
      source: String(file.value),
    });
    const diagnostics: readonly Diagnostic[] =
      !lang.ok && result.localized
        ? [
            ...result.diagnostics,
            {
              severity: 'warning',
              rule: 'missing-lang',
              message: `frontmatter.lang is missing or invalid (${lang.error}); LaTeX names fall back to ${DEFAULT_LOCALE}`,
            },
          ]
        : result.diagnostics;
    report(file, diagnostics);
    tree.children = result.tree.children;
    frontmatter['hasMath'] = result.hasMath;
    frontmatter['crossrefs'] = result.crossrefs;
  };
}
