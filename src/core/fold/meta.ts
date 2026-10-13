/**
 * Document metadata as a fold over the finished mdast tree (catamorphism:
 * Tree → Summary), exported to the page through remarkPluginFrontmatter.
 *
 *   wordCount, readingMinutes   prose only: code, math, HTML, image alt,
 *                               hidden/popover content and generated labels
 *                               are excluded (math is excluded before KaTeX
 *                               would duplicate it in the MathML annotation)
 *   expandableWordCount         words inside stretchtext (folded by default)
 *   outline                     headings with their ids, in document order
 *   argument                    argument graph {nodes, edges} (Toulmin)
 *   embeds / hasEmbeds          ft-* custom elements present in the document
 *   hasMath                     any $$…$$ in the document
 *   sidenoteCount / marginnoteCount
 *
 * `parseDocumentMeta` is the boundary parser used by views (decode ∘ encode = id,
 * tested): remarkPluginFrontmatter arrives untyped.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import type { Locale } from '../domain/locale.ts';
import { ARGUMENT_KINDS, isArgumentKind, type ArgumentKind } from '../reading/argument.ts';
import { HEADING_RECORD, isHeadingRecord } from '../reading/records.ts';
import {
  childrenOf,
  directiveName,
  isClaimed,
  isGenerated,
  OPAQUE_TYPES,
  sourceOf,
  visibleText,
  type MdNode,
} from './tree.ts';
import { countWords, readingMinutes } from './words.ts';

export interface OutlineEntry {
  readonly depth: number;
  readonly id: string;
  readonly text: string;
  /** False for headings inside stretchtext, asides, epigraphs or horizontal panels. */
  readonly inToc: boolean;
}

export interface ArgumentNodeMeta {
  readonly id: string;
  readonly kind: ArgumentKind;
  readonly title: string;
  readonly depends: readonly string[];
}
export interface ArgumentEdgeMeta {
  readonly from: string;
  readonly to: string;
}
export interface ArgumentMeta {
  readonly nodes: readonly ArgumentNodeMeta[];
  readonly edges: readonly ArgumentEdgeMeta[];
}

export interface DocumentMeta {
  readonly wordCount: number;
  readonly readingMinutes: number;
  readonly expandableWordCount: number;
  readonly outline: readonly OutlineEntry[];
  readonly argument: ArgumentMeta;
  readonly embeds: readonly string[];
  readonly hasEmbeds: boolean;
  readonly hasMath: boolean;
  readonly sidenoteCount: number;
  readonly marginnoteCount: number;
}

export const EMPTY_META: DocumentMeta = {
  wordCount: 0,
  readingMinutes: 1,
  expandableWordCount: 0,
  outline: [],
  argument: { nodes: [], edges: [] },
  embeds: [],
  hasEmbeds: false,
  hasMath: false,
  sidenoteCount: 0,
  marginnoteCount: 0,
};

/** mdast node types that are phrasing content (inline). */
const INLINE_TYPES = new Set([
  'text',
  'emphasis',
  'strong',
  'delete',
  'link',
  'linkReference',
  'inlineCode',
  'inlineMath',
  'break',
  'image',
  'imageReference',
  'footnoteReference',
  'textDirective',
]);
/** HTML phrasing elements that stages may emit through hName. */
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'math', 'q', 's',
  'samp', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'time', 'u', 'var', 'wbr',
]);
const isInline = (n: MdNode): boolean =>
  n.data?.hName !== undefined ? INLINE_TAGS.has(n.data.hName) : INLINE_TYPES.has(n.type);

/** Content no reader reads as prose. */
const isExcluded = (n: MdNode): boolean => {
  if (isGenerated(n) || OPAQUE_TYPES.has(n.type)) return true;
  if (n.type === 'image' || n.type === 'imageReference' || n.type === 'footnoteReference') return true;
  const hp = n.data?.hProperties;
  if (hp !== undefined && (hp['hidden'] !== undefined || hp['popover'] !== undefined)) return true;
  const tag = n.data?.hName;
  return tag === 'template' || tag === 'script' || tag === 'style';
};

const isStretch = (n: MdNode): boolean => directiveName(n) === 'stretch' && n.data?.hName === 'details';

interface Block {
  readonly text: string;
  readonly expandable: boolean;
}

/** Text of an inline run; code and math become word separators, claimed directives are space-delimited. */
const inlineText = (n: MdNode, source: string | null): string => {
  if (n.type === 'inlineCode' || n.type === 'inlineMath') return ' ';
  if (isExcluded(n)) return '';
  if (n.type === 'break') return ' ';
  if (n.type === 'textDirective' && !isClaimed(n)) return visibleText(n, source);
  if (typeof n.value === 'string') return n.value;
  const inner = childrenOf(n)
    .map((c) => inlineText(c, source))
    .join('');
  return n.type === 'textDirective' ? ` ${inner} ` : inner;
};

/** Splits the document into prose blocks so that words never glue across block boundaries. */
const proseBlocks = (root: MdNode, source: string | null): readonly Block[] => {
  const blocks: Block[] = [];
  const go = (node: MdNode, expandable: boolean): void => {
    if (isExcluded(node)) return;
    const inside = expandable || isStretch(node);
    let run = '';
    const flush = (): void => {
      if (run.trim().length > 0) blocks.push({ text: run, expandable: inside });
      run = '';
    };
    for (const c of childrenOf(node)) {
      if (isInline(c)) run += inlineText(c, source);
      else {
        flush();
        go(c, inside);
      }
    }
    flush();
  };
  go(root, false);
  return blocks;
};

const outlineOf = (root: MdNode, source: string | null): readonly OutlineEntry[] => {
  const out: OutlineEntry[] = [];
  const go = (node: MdNode): void => {
    if (OPAQUE_TYPES.has(node.type)) return;
    if (node.type === 'heading') {
      const record = node.data?.[HEADING_RECORD];
      const depth = node['depth'];
      if (isHeadingRecord(record) && typeof depth === 'number') {
        out.push({ depth, id: record.id, text: visibleText(node, source).trim(), inToc: record.inToc });
      }
      return;
    }
    for (const c of childrenOf(node)) go(c);
  };
  go(root);
  return out;
};

const argumentOf = (root: MdNode, source: string | null): ArgumentMeta => {
  const nodes: ArgumentNodeMeta[] = [];
  const go = (node: MdNode): void => {
    if (OPAQUE_TYPES.has(node.type)) return;
    if (node.type === 'heading') {
      const record = node.data?.[HEADING_RECORD];
      if (isHeadingRecord(record) && record.kind !== null) {
        nodes.push({ id: record.id, kind: record.kind, title: visibleText(node, source).trim(), depends: record.depends });
      }
      return;
    }
    for (const c of childrenOf(node)) go(c);
  };
  go(root);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = nodes.flatMap((n) => n.depends.filter((d) => ids.has(d)).map((d) => ({ from: d, to: n.id })));
  return { nodes, edges };
};

const count = (root: MdNode, predicate: (n: MdNode) => boolean): number =>
  (predicate(root) ? 1 : 0) + childrenOf(root).reduce((acc, c) => acc + count(c, predicate), 0);

const embedsOf = (root: MdNode): readonly string[] => {
  const tags = new Set<string>();
  const go = (n: MdNode): void => {
    const tag = n.data?.hName;
    if (tag !== undefined && tag.startsWith('ft-')) tags.add(tag);
    for (const c of childrenOf(n)) go(c);
  };
  go(root);
  return [...tags].sort();
};

export interface FoldOptions {
  readonly locale: Locale;
  readonly source: string | null;
}

/** The metadata fold. Deterministic; reads only. */
export const foldDocument = (root: MdNode, options: FoldOptions): DocumentMeta => {
  const blocks = proseBlocks(root, options.source);
  const wordCount = blocks.reduce((acc, b) => acc + countWords(b.text, options.locale), 0);
  const expandableWordCount = blocks
    .filter((b) => b.expandable)
    .reduce((acc, b) => acc + countWords(b.text, options.locale), 0);
  const embeds = embedsOf(root);
  return {
    wordCount,
    readingMinutes: readingMinutes(wordCount),
    expandableWordCount,
    outline: outlineOf(root, options.source),
    argument: argumentOf(root, options.source),
    embeds,
    hasEmbeds: embeds.length > 0,
    hasMath: count(root, (n) => n.type === 'math' || n.type === 'inlineMath') > 0,
    sidenoteCount: count(root, (n) => n.data?.hProperties?.['dataSidenote'] !== undefined),
    marginnoteCount: count(root, (n) => n.data?.hProperties?.['dataMarginnote'] !== undefined),
  };
};

/** Raw source of a node, re-exported for adapters that need it. */
export { sourceOf };

// ── Boundary parser (remarkPluginFrontmatter → DocumentMeta) ────────────────

type Json = Readonly<Record<string, unknown>>;
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const nat = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const strings = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Parses the metadata a page receives in remarkPluginFrontmatter. Reports every
 * problem. Fields absent altogether (a document processed without the meta
 * stage) are an error: the pipeline contract guarantees them.
 */
export const parseDocumentMeta = (v: unknown): Result<DocumentMeta, readonly string[]> => {
  if (!isRecord(v)) return err(['document metadata is not an object']);
  const errors: string[] = [];
  const num = (k: string): number => {
    const x = v[k];
    if (nat(x)) return x;
    errors.push(`${k}: expected a non-negative integer`);
    return 0;
  };
  const bool = (k: string): boolean => {
    const x = v[k];
    if (typeof x === 'boolean') return x;
    errors.push(`${k}: expected a boolean`);
    return false;
  };
  const outlineRaw = v['outline'];
  const outline: OutlineEntry[] = [];
  if (Array.isArray(outlineRaw)) {
    for (const e of outlineRaw as readonly unknown[]) {
      if (isRecord(e) && nat(e['depth']) && typeof e['id'] === 'string' && typeof e['text'] === 'string' && typeof e['inToc'] === 'boolean') {
        outline.push({ depth: e['depth'], id: e['id'], text: e['text'], inToc: e['inToc'] });
      } else errors.push('outline: malformed entry');
    }
  } else errors.push('outline: expected an array');
  const argRaw = v['argument'];
  const nodes: ArgumentNodeMeta[] = [];
  const edges: ArgumentEdgeMeta[] = [];
  if (isRecord(argRaw) && Array.isArray(argRaw['nodes']) && Array.isArray(argRaw['edges'])) {
    for (const n of argRaw['nodes'] as readonly unknown[]) {
      if (isRecord(n) && typeof n['id'] === 'string' && isArgumentKind(n['kind']) && typeof n['title'] === 'string' && strings(n['depends'])) {
        nodes.push({ id: n['id'], kind: n['kind'], title: n['title'], depends: n['depends'] });
      } else errors.push(`argument.nodes: malformed node (kinds: ${ARGUMENT_KINDS.join(', ')})`);
    }
    for (const e of argRaw['edges'] as readonly unknown[]) {
      if (isRecord(e) && typeof e['from'] === 'string' && typeof e['to'] === 'string') edges.push({ from: e['from'], to: e['to'] });
      else errors.push('argument.edges: malformed edge');
    }
  } else errors.push('argument: expected {nodes, edges}');
  const embedsRaw = v['embeds'];
  const embeds = strings(embedsRaw) ? embedsRaw : (errors.push('embeds: expected strings'), []);
  const meta: DocumentMeta = {
    wordCount: num('wordCount'),
    readingMinutes: num('readingMinutes'),
    expandableWordCount: num('expandableWordCount'),
    outline,
    argument: { nodes, edges },
    embeds,
    hasEmbeds: bool('hasEmbeds'),
    hasMath: bool('hasMath'),
    sidenoteCount: num('sidenoteCount'),
    marginnoteCount: num('marginnoteCount'),
  };
  return errors.length > 0 ? err(errors) : ok(meta);
};
