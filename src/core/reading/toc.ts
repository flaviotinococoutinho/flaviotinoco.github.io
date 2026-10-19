/**
 * Table of contents (ABNT NBR 6027 "Sumário") — fills the ::toc placeholder
 * claimed by the reading stage. It runs in the meta stage, AFTER concepts,
 * embeds and abnt have marked the headings, so each entry is a sanitised deep
 * copy of the heading's phrasing: foreign-language marking (<i lang>, WCAG
 * 3.1.2), abbreviations and math survive, while links are unwrapped (no
 * nested <a>), ids are dropped (no duplicates) and footnote references and
 * generated marks are removed. Directives no stage claimed ("10:30") are
 * restored from the source exactly as the integrity stage will do.
 */
import { childrenOf, isClaimed, isGenerated, sourceOf, type MdNode, type NodeData } from '../fold/tree.ts';
import { element, link } from './nodes.ts';
import { HEADING_RECORD, isHeadingRecord, TOC_RECORD } from './records.ts';

export interface TocItem {
  readonly depth: number;
  readonly id: string;
  readonly content: readonly MdNode[];
}

interface Nested {
  readonly item: TocItem;
  readonly children: Nested[];
}

/** Nests a flat, document-ordered heading list by depth (gaps in depth are tolerated). */
export const nestToc = (items: readonly TocItem[]): readonly Nested[] => {
  const roots: Nested[] = [];
  const stack: Nested[] = [];
  for (const item of items) {
    while (stack.length > 0 && (stack[stack.length - 1]?.item.depth ?? 0) >= item.depth) stack.pop();
    const node: Nested = { item, children: [] };
    const parent = stack[stack.length - 1];
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
    stack.push(node);
  }
  return roots;
};

const withoutId = (data: NodeData | undefined): NodeData | undefined => {
  if (data === undefined) return undefined;
  const cloned = structuredClone(data) as Record<string, unknown> & NodeData;
  const hp = cloned.hProperties;
  if (hp === undefined) return cloned;
  const { id: _drop, ...rest } = hp;
  return { ...cloned, hProperties: rest };
};

/** Sanitised deep copy of heading phrasing for a TOC entry. */
export const tocPhrasing = (nodes: readonly MdNode[], source: string | null): readonly MdNode[] =>
  nodes.flatMap((n): readonly MdNode[] => {
    if (isGenerated(n) || n.type === 'footnoteReference') return [];
    // Still unclaimed after every claiming stage: the integrity stage restores it verbatim.
    if (n.type === 'textDirective' && !isClaimed(n)) {
      const raw = sourceOf(n, source);
      return raw !== null ? [{ type: 'text', value: raw }] : tocPhrasing(childrenOf(n), source);
    }
    if (n.type === 'link' || n.type === 'linkReference' || n.data?.hName === 'a')
      return tocPhrasing(childrenOf(n), source);
    const { children, data, position: _position, ...rest } = n;
    const copy = structuredClone(rest);
    const cleanData = withoutId(data);
    return [
      {
        ...copy,
        ...(cleanData !== undefined ? { data: cleanData } : {}),
        ...(children !== undefined ? { children: tocPhrasing(children, source) } : {}),
      },
    ];
  });

/** Headings eligible for the table of contents, in document order. */
export const tocItems = (root: MdNode, maxDepth: number, source: string | null): readonly TocItem[] => {
  const out: TocItem[] = [];
  const go = (node: MdNode): void => {
    if (node.type === 'heading') {
      const record = node.data?.[HEADING_RECORD];
      const depth = typeof node['depth'] === 'number' ? node['depth'] : 0;
      if (isHeadingRecord(record) && record.inToc && depth >= 2 && depth <= maxDepth) {
        out.push({ depth, id: record.id, content: tocPhrasing(childrenOf(node), source) });
      }
      return;
    }
    for (const c of childrenOf(node)) go(c);
  };
  go(root);
  return out;
};

const renderList = (nested: readonly Nested[]): MdNode =>
  element(
    'ol',
    { className: ['toc__list'], role: 'list' },
    nested.map((n) =>
      element('li', { className: ['toc__item'] }, [
        link(`#${n.item.id}`, n.item.content, { className: ['toc__link'] }),
        ...(n.children.length > 0 ? [renderList(n.children)] : []),
      ]),
    ),
  );

/**
 * Rebuilds the tree with every ::toc placeholder filled. Entries are generated
 * content (skipped by recoverText). Idempotent: an already filled TOC is rebuilt
 * from the same headings.
 */
export const fillToc = (root: MdNode, source: string | null): MdNode => {
  const fill = (node: MdNode): MdNode => {
    const record = node.data?.[TOC_RECORD];
    if (typeof record === 'object' && record !== null) {
      const depth = Number((record as { depth?: unknown }).depth ?? 3);
      // The reading stage always puts the title first; anything after it is a previous fill.
      const title = childrenOf(node)[0];
      const list = element('div', { className: ['toc__body'] }, [renderList(nestToc(tocItems(root, depth, source)))], {
        generated: true,
      });
      return { ...node, children: [...(title !== undefined ? [title] : []), list] };
    }
    const kids = childrenOf(node);
    if (kids.length === 0) return node;
    const next = kids.map(fill);
    return next.every((k, i) => k === kids[i]) ? node : { ...node, children: next };
  };
  return fill(root);
};
