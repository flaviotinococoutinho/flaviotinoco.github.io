/**
 * mdast vocabulary of the LaTeX layer: the two generated node types, their
 * smart constructors, and small total folds over mdast used by the stage and
 * by the exporter.
 *
 * Why custom node types instead of reusing `emphasis`/`paragraph` with an
 * `hName` override: a later stage (or the .tex exporter) that sees an
 * `emphasis` must be able to trust that it IS emphasis. Generated structure
 * gets its own, explicitly named types with a `role`, so no consumer can
 * misread it (docs/arquitetura.md §2.4, information preservation). Both types
 * carry `data.hName`, so remark-rehype renders them through its default
 * handler for unknown nodes without any extra configuration.
 */
import type { Properties } from 'hast';
import type { BlockContent, Data, Nodes, Parent, PhrasingContent, RootContent } from 'mdast';
// Type-only imports that load the mdast augmentations (directive and math nodes, hName data).
import type {} from 'remark-directive';
import type {} from 'remark-math';
import type {} from 'remark-rehype';

/** What a generated node stands for; consumers switch on it instead of on CSS classes. */
export type LatexRole =
  | 'env-name'
  | 'env-number'
  | 'env-title'
  | 'qed'
  | 'qed-mark'
  | 'qed-text'
  | 'figure-caption'
  | 'figure-label'
  | 'figure-title'
  | 'figure-source-label'
  | 'equation'
  /** The horizontal scroll box of a table inside :::figure{kind="table"}. */
  | 'table-scroll'
  | 'math-source'
  /** A resolved reference inside the author's own link (a span: links cannot nest). */
  | 'xref';

interface LatexData extends Data {
  hName: string;
  hProperties: Properties;
}

/** Generated phrasing element (environment name/number/title, QED mark, caption parts). */
export interface LatexInline extends Parent {
  type: 'latexInline';
  role: LatexRole;
  children: PhrasingContent[];
  data: LatexData;
}

/** Generated block element (equation wrapper, figure caption). */
export interface LatexBlock extends Parent {
  type: 'latexBlock';
  role: LatexRole;
  children: Array<BlockContent | PhrasingContent>;
  data: LatexData;
}

declare module 'mdast' {
  interface PhrasingContentMap {
    latexInline: LatexInline;
  }
  interface BlockContentMap {
    latexBlock: LatexBlock;
  }
  interface RootContentMap {
    latexInline: LatexInline;
    latexBlock: LatexBlock;
  }
}

export const latexInline = (
  role: LatexRole,
  properties: Properties,
  children: readonly PhrasingContent[],
): LatexInline => ({
  type: 'latexInline',
  role,
  children: [...children],
  data: { hName: 'span', hProperties: properties },
});

export const latexBlock = (
  role: LatexRole,
  tagName: string,
  properties: Properties,
  children: ReadonlyArray<BlockContent | PhrasingContent>,
): LatexBlock => ({
  type: 'latexBlock',
  role,
  children: [...children],
  data: { hName: tagName, hProperties: properties },
});

export const text = (value: string): PhrasingContent => ({ type: 'text', value });

export type ContainerDirective = Extract<RootContent, { type: 'containerDirective' }>;
export type LeafDirective = Extract<RootContent, { type: 'leafDirective' }>;
export type TextDirective = Extract<RootContent, { type: 'textDirective' }>;
export type Directive = ContainerDirective | LeafDirective | TextDirective;

export const isDirective = (node: Nodes): node is Directive =>
  node.type === 'containerDirective' || node.type === 'leafDirective' || node.type === 'textDirective';

/** Claimed ⇔ some stage already decided how to render it (pipeline contract). */
export const isClaimed = (node: Nodes): boolean => node.data?.hName !== undefined;

/** Nodes whose content is opaque to every stage (docs/arquitetura.md §4). */
export const isOpaque = (node: Nodes): boolean =>
  node.type === 'code' || node.type === 'inlineCode' || node.type === 'html';

export const hasChildren = (node: Nodes): node is Extract<Nodes, Parent> => 'children' in node;

/**
 * Plain text of a subtree (the mdast-util-to-string fold, restricted to what
 * a reader sees): text-like values concatenated, images by their alt text.
 */
export const plainText = (node: Nodes): string => {
  if ('value' in node && typeof node.value === 'string') return node.value;
  if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
  if (hasChildren(node)) return (node.children as readonly Nodes[]).map(plainText).join('');
  return '';
};

/**
 * Exact author text of a directive's `[label]`.
 *
 * remark-directive parses the label as phrasing content, so `:ref[thm:x]`
 * arrives as text "thm" + a nested text directive named "x". With the source
 * and positions the label is sliced verbatim; without them it is rebuilt from
 * the nodes (exact for the label grammar, whose names are directive-safe).
 */
export const directiveLabelSource = (node: Directive, source: string | undefined): string => {
  const first = node.children[0];
  const last = node.children[node.children.length - 1];
  const start = first?.position?.start.offset;
  const end = last?.position?.end.offset;
  if (source !== undefined && start !== undefined && end !== undefined) return source.slice(start, end);
  return (node.children as readonly Nodes[]).map(rebuild).join('');
};

const rebuild = (node: Nodes): string => {
  if (node.type === 'textDirective') {
    const inner = (node.children as readonly Nodes[]).map(rebuild).join('');
    return node.children.length > 0 ? `:${node.name}[${inner}]` : `:${node.name}`;
  }
  return plainText(node);
};

/**
 * Whether a text directive was written with a `[label]`.
 *
 * remark-directive turns ANY ":word" into a text directive, so prose such as
 * "nota:ref" or "3:ref" yields a bracket-less `ref` directive. Only the
 * bracketed form is a reference; the rest is prose for the integrity stage to
 * restore verbatim. Without source positions, a non-empty label decides.
 */
export const hasBracketLabel = (node: TextDirective, source: string | undefined): boolean => {
  const raw = sourceOf(node, source);
  return raw === undefined ? node.children.length > 0 : raw.startsWith(`:${node.name}[`);
};

/** Exact source of any node, when positions are available. */
export const sourceOf = (node: Nodes, source: string | undefined): string | undefined => {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return source !== undefined && start !== undefined && end !== undefined ? source.slice(start, end) : undefined;
};

export type DisplayMath = Extract<RootContent, { type: 'math' }>;
export type InlineMath = Extract<RootContent, { type: 'inlineMath' }>;
export type MathNode = DisplayMath | InlineMath;

/**
 * Copy of a math node with a new TeX value. remark-math stores a second copy
 * of the value in `data.hChildren` (the hast that remark-rehype emits), so
 * both must change together (docs/research/unified-latex.md §5).
 */
export const withMathValue = <M extends MathNode>(node: M, value: string): M => {
  const replace = (children: unknown): unknown =>
    Array.isArray(children)
      ? children.map((child: unknown): unknown => {
          if (typeof child !== 'object' || child === null) return child;
          const c = child as { type?: unknown; children?: unknown };
          if (c.type === 'text') return { ...c, value };
          if (Array.isArray(c.children)) return { ...c, children: replace(c.children) };
          return c;
        })
      : children;
  const data = node.data === undefined ? undefined : { ...node.data, hChildren: replace(node.data.hChildren) };
  const copy: M = { ...node, value, ...(data === undefined ? {} : { data }) };
  return copy;
};
