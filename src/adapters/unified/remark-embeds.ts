/**
 * Remark stage "embeds" (see pipeline.ts for its place in the pipeline).
 *
 * Thin shell around the pure transform src/core/labs/embed.ts: `::lab{widget=…}` → `<ft-lab-<widget>>`
 * with a no-JS fallback that links to the lab page, data-* configuration, and build-time checks of the
 * parameters (also of the `:::step{state}` of a scrolly whose figure is the lab).
 *
 * Runs AFTER reading (a `::lab` first in a `::::scrolly` is already its figure) and BEFORE abnt and meta
 * (the meta fold lists the emitted ft-* tag in `embeds`; the fallback text is hast, not prose, so it is not
 * counted as words of the essay).
 *
 * The fallback links to the lab page of the document's locale. The slugs come from the labs' own
 * frontmatter (src/content/labs/{pt,en}/*.md), read once per build with the YAML options Astro uses
 * (scripts/lib/frontmatter.ts documents them), so a renamed lab can never leave a stale link. Tests and
 * a future PipelineContext field can inject the entries instead (`options.labs`).
 *
 * Reporting: as in the reading stage, warnings go to `file.message`, and the stage fails once listing
 * every error (unknown widget, unknown attribute, bad value, bad step state).
 */
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Root } from 'mdast';
import type { VFile } from 'vfile';
import { parseDocument } from 'yaml';
import type {} from '@astrojs/markdown-remark';
import type { PipelineContext } from './context.ts';
import { documentLocale, reportDiagnostics } from './remark-reading.ts';
import type { MdNode } from '../../core/fold/tree.ts';
import { LOCALES, localeCodec } from '../../core/domain/locale.ts';
import { labLinks, parseLabIndexEntry, transformEmbeds, type LabIndexEntry } from '../../core/labs/embed.ts';

export interface RemarkEmbedsOptions {
  readonly context: PipelineContext;
  /** Lab pages to link to; read from src/content/labs/ under the working directory when absent. */
  readonly labs?: readonly LabIndexEntry[];
}

/** Astro's frontmatter block (@astrojs/internal-helpers `frontmatterRE`, YAML fences only). */
const FRONTMATTER = /(?:^﻿?|^\s*\n)---([\s\S]*?\n)---/;

/** Reads and parses the frontmatter of every lab; throws one Error listing every problem. */
export const readLabIndex = async (root: URL): Promise<readonly LabIndexEntry[]> => {
  const entries: LabIndexEntry[] = [];
  const problems: string[] = [];
  for (const locale of LOCALES) {
    const dir = new URL(`src/content/labs/${localeCodec.encode(locale)}/`, root);
    const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.md')).sort();
    for (const name of names) {
      const file = new URL(name, dir);
      const match = FRONTMATTER.exec(await readFile(file, 'utf8'));
      const doc = match === null ? null : parseDocument(match[1] ?? '', { customTags: ['timestamp'], merge: true, schema: 'core' });
      const parsed = doc === null || doc.errors.length > 0 ? null : parseLabIndexEntry(doc.toJS());
      if (parsed === null) problems.push(`${file.pathname}: unreadable frontmatter`);
      else if (!parsed.ok) problems.push(`${file.pathname}: ${parsed.error}`);
      else entries.push(parsed.value);
    }
  }
  if (problems.length > 0) throw new Error(`embeds: ${problems.length} lab file(s) unreadable\n  ${problems.join('\n  ')}`);
  return entries;
};

export function remarkEmbeds(options: RemarkEmbedsOptions) {
  // One read per build (per processor), started on the first document.
  let index: Promise<readonly LabIndexEntry[]> | undefined =
    options.labs === undefined ? undefined : Promise.resolve(options.labs);
  return async (tree: Root, file: VFile): Promise<Root> => {
    const locale = documentLocale(file, 'embeds');
    index ??= readLabIndex(pathToFileURL(`${file.cwd}/`));
    const links = labLinks(await index, locale, options.context.base);
    // Boundary cast: mdast nodes are read through the core's structural MdNode view, never mutated.
    const result = transformEmbeds(tree as unknown as MdNode, { locale, source: String(file.value), links });
    reportDiagnostics(file, result.diagnostics, 'embeds');
    return result.tree as unknown as Root;
  };
}
