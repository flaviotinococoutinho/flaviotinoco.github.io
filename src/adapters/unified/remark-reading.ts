/**
 * Remark stage "reading" (see pipeline.ts for its place in the pipeline).
 *
 * Thin shell around the pure transform src/core/reading/transform.ts:
 * non-linear reading directives (stretchtext, side/margin notes, scrollytelling,
 * horizontal passages, epigraphs, asides, ::toc) and Pandoc heading attributes
 * `## Título {#id .claim depends="a,b"}` (argument graph, Toulmin 1958).
 *
 * Runs AFTER citations (a citation node may already sit inside an epigraph:
 * it is preserved) and BEFORE concepts, embeds and abnt (their directives are
 * left untouched; a `::lab` first in a scrolly becomes its sticky figure and is
 * claimed later by the embeds stage).
 *
 * Reporting: warnings go to `file.message(reason, place, 'reading:<rule>')`;
 * errors are recorded as fatal messages and the stage then fails ONCE with
 * all of them listed, so an author sees every problem in a single build.
 */
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import type {} from '@astrojs/markdown-remark';
import type { PipelineContext } from './context.ts';
import { parseLocale, type Locale } from '../../core/domain/locale.ts';
import type { MdNode } from '../../core/fold/tree.ts';
import { PAGE_IDS } from '../../core/reading/records.ts';
import { transformReading, type Diagnostic } from '../../core/reading/transform.ts';

export interface RemarkReadingOptions {
  readonly context: PipelineContext;
}

/** Language of the document being processed (frontmatter `lang`); a build error when absent or unknown. */
export const documentLocale = (file: VFile, stage: string): Locale => {
  const frontmatter: unknown = file.data.astro?.frontmatter;
  const lang =
    typeof frontmatter === 'object' && frontmatter !== null ? (frontmatter as { lang?: unknown }).lang : undefined;
  const parsed = parseLocale(lang);
  if (!parsed.ok) {
    file.fail(
      `${parsed.error}: the frontmatter must declare lang: pt-BR | en (it selects generated labels and word segmentation)`,
      undefined,
      `${stage}:lang`,
    );
  }
  return parsed.value;
};

const where = (d: Diagnostic): string =>
  d.position === undefined ? '' : `${d.position.start.line}:${d.position.start.column} `;

/** Reports core diagnostics through vfile; fails once, listing every error. */
export const reportDiagnostics = (file: VFile, diagnostics: readonly Diagnostic[], stage: string): void => {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  for (const d of diagnostics) {
    const message = file.message(d.message, d.position, d.rule);
    if (d.severity === 'error') message.fatal = true;
  }
  const first = errors[0];
  if (first !== undefined) {
    const list = errors.map((d) => `  ${where(d)}${d.message} [${d.rule}]`).join('\n');
    file.fail(`${errors.length} error(s) in the ${stage} stage:\n${list}`, first.position, first.rule);
  }
};

export function remarkReading(_options: RemarkReadingOptions) {
  return (tree: Root, file: VFile): Root => {
    const locale = documentLocale(file, 'reading');
    // Boundary cast: mdast nodes are read through the core's structural MdNode view, never mutated.
    const result = transformReading(tree as unknown as MdNode, {
      locale,
      source: String(file.value),
      reservedIds: PAGE_IDS,
    });
    reportDiagnostics(file, result.diagnostics, 'reading');
    return result.tree as unknown as Root;
  };
}
