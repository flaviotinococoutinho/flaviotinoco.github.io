/**
 * Integrity stage — the last remark stage. Guarantees that no source text is
 * silently lost by the directive syntax.
 *
 * remark-directive parses ANY ":name" as a text directive, so prose such as
 * "às 10:30" or "proporção 1:2" becomes a directive node that remark-rehype
 * would render as an empty <div> ("10:30" → "10"). Here every directive that
 * no earlier stage claimed (claimed ⇔ node.data.hName is set or the node was
 * replaced) is handled by its kind:
 *
 *   text directive       → restored verbatim from the source slice (byte-identical);
 *                          a warning is emitted when it looks intentional ([…] or {…}).
 *   leaf / container     → build error: an unknown block directive is an author
 *                          mistake (e.g. ":::teorem"), never prose.
 */
import type { Root, Parent, RootContent } from 'mdast';
import type { VFile } from 'vfile';
import { SKIP, visit } from 'unist-util-visit';
import type { PipelineContext } from './context.ts';
import { fileLineColumn } from './source-lines.ts';

export interface RemarkIntegrityOptions {
  readonly context: PipelineContext;
}

type Directive = Extract<RootContent, { type: 'textDirective' | 'leafDirective' | 'containerDirective' }>;
const isDirective = (node: { type: string }): node is Directive =>
  node.type === 'textDirective' || node.type === 'leafDirective' || node.type === 'containerDirective';

export function remarkIntegrity(_options: RemarkIntegrityOptions) {
  return (tree: Root, file: VFile): void => {
    const source = String(file.value);
    visit(tree, (node, index, parent: Parent | undefined) => {
      if (!isDirective(node) || node.data?.hName !== undefined || parent === undefined || index === undefined) return;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) {
        file.fail(`directive ":${node.name}" has no source position; cannot restore it losslessly`, node);
      }
      const raw = source.slice(start, end);
      if (node.type !== 'textDirective') {
        file.fail(`unknown ${node.type === 'leafDirective' ? 'leaf' : 'container'} directive "${node.name}"`, node);
      }
      if (/[[{]/.test(raw)) {
        file.message(
          `unknown text directive ":${node.name}" kept as literal text`,
          node,
          'integrity:unknown-directive',
        );
      }
      parent.children.splice(index, 1, { type: 'text', value: raw } as RootContent);
      return [SKIP, index + 1];
    });
    reportWarnings(file);
  };
}

/**
 * Astro does not print non-fatal vfile messages of Markdown files, so the
 * advisory lints of earlier stages (abnt:*, reading:*, integrity:*) would be
 * invisible. As the last remark stage, surface them in the build log with a
 * stable prefix the CLI and CI can grep.
 */
const reportWarnings = (file: VFile): void => {
  for (const m of file.messages) {
    if (m.fatal === true) continue;
    const where = `${file.path}:${fileLineColumn(file, m.line, m.column)}`;
    const rule = [m.source, m.ruleId].filter(Boolean).join(':');
    console.warn(`[content-lint] ${where} ${rule} ${m.reason}`);
  }
};
