/**
 * Remark stage "latex" (imperative shell; contract in pipeline.ts).
 *
 * Thin adapter around the pure transform src/core/latex/transform.ts:
 *   1. reads the document language from frontmatter.lang;
 *   2. runs the two-pass transform (numbering, then rendering/resolution);
 *   3. swaps the tree's children for the transformed ones (the only mutation);
 *   4. reports diagnostics — warnings through file.message, errors through ONE
 *      file.fail that lists all of them (applicative validation: the author
 *      sees every problem of the document at once), positioned at the first;
 *   5. exports frontmatter.hasMath (views render <MathAssets/> only when true)
 *      and frontmatter.crossrefs (the label table, e.g. for lists of figures).
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
  for (const d of diagnostics) {
    if (d.severity === 'warning') file.message(d.message, d.position, `${ORIGIN}:${d.rule}`);
  }
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const [first] = errors;
  if (first === undefined) return;
  const reason =
    errors.length === 1
      ? first.message
      : `${String(errors.length)} LaTeX errors:\n${errors.map((d) => `  ${where(d)}${d.message} [${d.rule}]`).join('\n')}`;
  file.fail(reason, first.position, `${ORIGIN}:${first.rule}`);
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
