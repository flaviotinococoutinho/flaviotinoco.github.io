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
 *
 * Site content (a file under src/content/) is bound to the formula registry:
 * every numbered equation gets the version in words of its formula and an
 * unregistered label fails the build (ADR 0011). Documents rendered from
 * strings (tests, tools) have no path and are not bound.
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import { DEFAULT_LOCALE, parseLocale, type Locale } from '../../core/domain/locale.ts';
import { encodeRoute } from '../../core/i18n/routes.ts';
import type { Diagnostic } from '../../core/latex/model.ts';
import { transformLatex, type FormulaBinding } from '../../core/latex/transform.ts';
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

/** Site content: the collections under src/content/ (Astro renders them with their file path). */
const CONTENT_DIR = /[\\/]src[\\/]content[\\/]/;
const isContent = (file: VFile): boolean => CONTENT_DIR.test(file.path ?? '');

const formulaBinding = (context: PipelineContext, locale: Locale): FormulaBinding => ({
  registry: context.formulas,
  href: (formula) => `${context.base}${encodeRoute({ kind: 'formula', slug: formula.slug[locale] }, locale).slice(1)}`,
});

export function remarkLatex(options: RemarkLatexOptions) {
  return (tree: Root, file: VFile): void => {
    const frontmatter = frontmatterOf(file);
    const lang = parseLocale(frontmatter['lang']);
    const locale = lang.ok ? lang.value : DEFAULT_LOCALE;
    const result = transformLatex(tree, {
      locale,
      source: String(file.value),
      ...(isContent(file) ? { formulas: formulaBinding(options.context, locale) } : {}),
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
