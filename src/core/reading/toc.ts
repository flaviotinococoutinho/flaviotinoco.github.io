/**
 * Table of contents (ABNT NBR 6027 "Sumário") — fills the ::toc placeholder
 * claimed by the reading stage. It runs in the meta stage, AFTER concepts,
 * embeds and abnt have marked the headings, so each entry is a sanitised deep
 * copy of the heading's phrasing: foreign-language marking (<i lang>, WCAG
 * 3.1.2), abbreviations and math survive, while links are unwrapped (no
 * nested <a>), ids are dropped (no duplicates) and footnote references and
 * generated marks are removed. Directives no stage claimed ("10:30") are
 * restored from the source exactly as the integrity stage will do.
 *
 * The contents are also the outline of the argument (an advance organizer,
 * Ausubel 1960; signalling the top-level structure of a text helps readers
 * recall it, Lorch 1989; Meyer & Poon 2001): an entry whose section declares a
 * kind (premise, claim, objection…) shows it as SHAPE + LABEL, the kinds that
 * carry the argument (claim, conclusion) are set apart as its spine, and each
 * top-level section says how long it is to read (information foraging: the
 * cost of a patch before entering it, Pirolli & Card 1999).
 */
import type { Locale } from '../domain/locale.ts';
import { sectionWords } from '../fold/meta.ts';
import {
  childrenOf,
  isClaimed,
  isGenerated,
  sourceOf,
  type HastElement,
  type MdNode,
  type NodeData,
} from '../fold/tree.ts';
import { sectionMinutes } from '../fold/words.ts';
import catalog from '../i18n/catalogs/reading.ts';
import { translator } from '../i18n/messages.ts';
import { glyphSymbolId, type ArgumentKind } from './argument.ts';
import { element, link, text } from './nodes.ts';
import { HEADING_RECORD, isHeadingRecord, TOC_RECORD } from './records.ts';

export interface TocItem {
  readonly depth: number;
  readonly id: string;
  /** The kind of the section's argument node, or null for a section outside the argument. */
  readonly kind: ArgumentKind | null;
  readonly content: readonly MdNode[];
}

/** The kinds that carry the argument itself: what the essay holds and where it ends. */
export const SPINE_KINDS: ReadonlySet<ArgumentKind> = new Set(['claim', 'conclusion']);

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
        out.push({ depth, id: record.id, kind: record.kind, content: tocPhrasing(childrenOf(node), source) });
      }
      return;
    }
    for (const c of childrenOf(node)) go(c);
  };
  go(root);
  return out;
};

/**
 * The glyph of a kind as a reference to the page's symbol sprite (ArgumentGlyphs.astro, rendered with every
 * argument): a few bytes per entry where the inline paths of the section headings cost a few hundred. Without the
 * sprite the reference draws nothing and the label still names the kind.
 */
const glyphUse = (kind: ArgumentKind): HastElement => ({
  type: 'element',
  tagName: 'svg',
  properties: { className: ['toc__svg'], ariaHidden: 'true', focusable: 'false' },
  children: [{ type: 'element', tagName: 'use', properties: { href: `#${glyphSymbolId(kind)}` }, children: [] }],
});

interface Decoration {
  /** The label of a kind, in the document's language. */
  readonly kindLabel: (kind: ArgumentKind) => string;
  /** The reading time of a top-level section, in the document's language ("3 min"), or null. */
  readonly time: (id: string) => string | null;
}

/**
 * One entry: the kind of its section (glyph + label, outside the link so that the link is named by the section
 * alone), the link, and for a top-level section its reading time. Everything but the copied heading is generated.
 */
const renderItem = (n: Nested, decoration: Decoration): MdNode => {
  const { kind, id, depth } = n.item;
  const time = depth === 2 ? decoration.time(id) : null;
  const label = kind !== null ? decoration.kindLabel(kind) : '';
  return element(
    'li',
    { className: ['toc__item', ...(kind !== null && SPINE_KINDS.has(kind) ? ['toc__item--spine'] : [])] },
    [
      ...(kind !== null
        ? [
            element('span', { className: ['toc__kind'] }, [text(label, true)], {
              generated: true,
              extra: { hChildren: [glyphUse(kind), { type: 'text', value: label }] },
            }),
          ]
        : []),
      link(`#${id}`, n.item.content, { className: ['toc__link'] }),
      // The dotted leader to the time is drawn by the stylesheet, as in a printed contents page.
      ...(time !== null
        ? [element('span', { className: ['toc__time'] }, [text(time, true)], { generated: true })]
        : []),
      ...(n.children.length > 0 ? [renderList(n.children, decoration)] : []),
    ],
  );
};

const renderList = (nested: readonly Nested[], decoration: Decoration): MdNode =>
  element(
    'ol',
    { className: ['toc__list'], role: 'list' },
    nested.map((n) => renderItem(n, decoration)),
  );

/**
 * Rebuilds the tree with every ::toc placeholder filled. Entries are generated
 * content (skipped by recoverText). Idempotent: an already filled TOC is rebuilt
 * from the same headings (the contents are generated, so they never count as words of a section).
 */
export const fillToc = (root: MdNode, source: string | null, locale: Locale): MdNode => {
  const t = translator(catalog, locale);
  const words = sectionWords(root, { locale, source });
  const decoration: Decoration = {
    kindLabel: (kind) => t(`kind.${kind}`),
    time: (id) => {
      const w = words.get(id);
      return w === undefined ? null : t('toc.minutes', { minutes: sectionMinutes(w) });
    },
  };
  const fill = (node: MdNode): MdNode => {
    const record = node.data?.[TOC_RECORD];
    if (typeof record === 'object' && record !== null) {
      const depth = Number((record as { depth?: unknown }).depth ?? 3);
      // The reading stage always puts the title first; anything after it is a previous fill.
      const title = childrenOf(node)[0];
      const list = element(
        'div',
        { className: ['toc__body'] },
        [renderList(nestToc(tocItems(root, depth, source)), decoration)],
        { generated: true },
      );
      return { ...node, children: [...(title !== undefined ? [title] : []), list] };
    }
    const kids = childrenOf(node);
    if (kids.length === 0) return node;
    const next = kids.map(fill);
    return next.every((k, i) => k === kids[i]) ? node : { ...node, children: next };
  };
  return fill(root);
};
