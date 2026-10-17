/**
 * Remark stage "citations" (imperative shell around src/core/bibliography).
 *
 * Contract (docs/arquitetura.md §5.4; pipeline.ts):
 *   - Recognises Pandoc citation syntax in TEXT nodes only — never inside code,
 *     inlineCode, math, inlineMath, html, links, link references, definitions,
 *     images or JSX: [@k], [@k, p. 12], [see @a, p. 3; @b], [-@k] (parenthetical),
 *     @k and @k [p. 12] (narrative, for known keys only). Backslash escapes
 *     (\[@k], \@k) are honoured by consulting the source slice of the node.
 *   - An unknown key inside brackets fails the build, listing every unknown key
 *     of the document with its position.
 *   - Each citation becomes
 *       <span class="cite" data-cite="[@k, p. 12]">(<a href="#ref-k">Shannon</a>, 1948, p. 12)</span>
 *     The original syntax is kept in data-cite, so the transform is injective:
 *     replacing every span.cite by its data-cite restores the input text.
 *   - The reference list (only cited works) replaces the ::bibliography leaf
 *     directive, or is appended to the document:
 *       <section class="references" data-style="abnt" aria-labelledby="references-title">
 *         <h2 id="references-title">Referências</h2>
 *         <ul role="list" class="references__list"><li id="ref-k" class="references__item">… <a class="references__backlink" href="#cite-k" aria-label="…">↩\uFE0E</a></li></ul>
 *       </section>
 *     The first citation of each work carries id="cite-k" (the backlink target).
 *   - :::epigraph{source="@k"} (or source="[@k, p. 3]"): the citation is rendered
 *     into a paragraph flagged data.epigraphSource, appended to the directive, for
 *     the "reading" stage to place in the figcaption.
 *   - The document language (frontmatter.lang) selects the style: pt-BR → ABNT
 *     (NBR 10520:2023 + NBR 6023:2025), en → APA 7.
 *   - Exports frontmatter.citations: the cited keys in order of first use.
 */
import type { Element, ElementContent, Properties } from 'hast';
import type { Heading, Nodes, Paragraph, Parent, PhrasingContent, Root, RootContent, Text } from 'mdast';
import type { VFile } from 'vfile';
import { SKIP, visitParents } from 'unist-util-visit-parents';
import {
  buildReferenceList,
  renderCitation,
  type CiteRef,
  type ReferenceList,
} from '../../core/bibliography/cite/engine.ts';
import { escapedMarkers } from '../../core/bibliography/cite/escapes.ts';
import { scanCitations, type Citation } from '../../core/bibliography/cite/syntax.ts';
import { lineIndex, pointAt, type LineIndex } from '../../core/bibliography/bibtex/source.ts';
import type { Reference } from '../../core/bibliography/model/reference.ts';
import { toPlainText, type Inline } from '../../core/bibliography/render/inline.ts';
import { abnt } from '../../core/bibliography/style/abnt.ts';
import { apa } from '../../core/bibliography/style/apa.ts';
import type { CitationStyle } from '../../core/bibliography/style/style.ts';
import type { CitationKey } from '../../core/domain/identifiers.ts';
import { DEFAULT_LOCALE, parseLocale, type Locale } from '../../core/domain/locale.ts';
import { translator } from '../../core/i18n/messages.ts';
import catalog from '../../core/i18n/catalogs/citations.ts';
import type { PipelineContext } from './context.ts';

export interface RemarkCitationsOptions {
  readonly context: PipelineContext;
}

/** Style per document language. */
const STYLES: Readonly<Record<Locale, CitationStyle>> = { 'pt-BR': abnt, en: apa };

/** Nodes whose content is never prose for this stage (docs/arquitetura.md §4). */
const OPAQUE = new Set([
  'code',
  'inlineCode',
  'math',
  'inlineMath',
  'html',
  'link',
  'linkReference',
  'definition',
  'image',
  'imageReference',
  'yaml',
  'toml',
  'citation',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxFlowExpression',
  'mdxTextExpression',
  'mdxjsEsm',
]);

export const REFERENCES_HEADING_ID = 'references-title';
export const referenceId = (key: string): string => `ref-${key}`;
export const citationId = (key: string): string => `cite-${key}`;

/** hast interpretation of the core's inline tree (https://github.com/syntax-tree/hast). */
export const toHast = (nodes: readonly Inline[]): ElementContent[] =>
  nodes.map((n): ElementContent => {
    const element = (tagName: string, properties: Properties, children: readonly Inline[]): Element => ({
      type: 'element',
      tagName,
      properties,
      children: toHast(children),
    });
    switch (n.kind) {
      case 'text':
        return { type: 'text', value: n.value };
      case 'title':
        return element('cite', n.lang === undefined ? {} : { lang: n.lang }, n.children);
      case 'italic':
        return element('i', n.lang === undefined ? {} : { lang: n.lang }, n.children);
      case 'lang':
        return element('span', { lang: n.lang }, n.children);
      case 'link':
        return element('a', n.id === undefined ? { href: n.href } : { href: n.href, id: n.id }, n.children);
      case 'time':
        return element('time', { dateTime: n.datetime }, n.children);
    }
  });

type FrontmatterHolder = { astro?: { frontmatter?: Record<string, unknown> } };

const frontmatterOf = (file: VFile): Record<string, unknown> => {
  const data = file.data as unknown as FrontmatterHolder;
  data.astro ??= {};
  data.astro.frontmatter ??= {};
  return data.astro.frontmatter;
};

/** A citation found in the tree, before rendering. */
type Found = {
  readonly citation: Citation;
  /** Where it was written (for messages). */
  readonly place: Nodes;
  readonly offset: number | undefined;
};

type TextJob = { readonly parent: Parent; readonly node: Text; readonly found: readonly Found[] };
type EpigraphJob = { readonly directive: Parent; readonly found: Found };

/** Custom mdast nodes rendered through data.hName/hProperties/hChildren (mdast-util-to-hast "unknown" handler). */
type CitationNode = {
  readonly type: 'citation';
  readonly children: Text[];
  readonly data: { readonly hName: 'span'; readonly hProperties: Properties; readonly hChildren: ElementContent[] };
};

export function remarkCitations(options: RemarkCitationsOptions) {
  const { bibliography } = options.context;
  return (tree: Root, file: VFile): void => {
    const source = String(file.value ?? '');
    let lines: LineIndex | undefined;
    const pointOf = (offset: number) => pointAt((lines ??= lineIndex(source)), offset);
    const frontmatter = frontmatterOf(file);
    const parsedLang = parseLocale(frontmatter['lang']);
    const locale: Locale = parsedLang.ok ? parsedLang.value : DEFAULT_LOCALE;
    const style = STYLES[locale];
    const t = translator(catalog, locale);

    const textJobs: TextJob[] = [];
    const epigraphs: EpigraphJob[] = [];
    const placeholders: { readonly parent: Parent; readonly node: RootContent }[] = [];
    const unknown: { readonly key: string; readonly place: Nodes; readonly offset: number | undefined }[] = [];
    const isKnown = (key: string): boolean => bibliography.has(key);

    const collect = (
      found: readonly Citation[],
      problems: ReturnType<typeof scanCitations>['problems'],
      place: Nodes,
      base: number | undefined,
      exact: boolean,
    ): Found[] => {
      for (const p of problems)
        unknown.push({ key: p.key, place, offset: base !== undefined && exact ? base + p.start : base });
      return found.map((citation) => ({
        citation,
        place,
        offset: base !== undefined && exact ? base + citation.start : base,
      }));
    };

    // ------------------------------------------------------------ 1. collect
    visitParents(tree, (node, ancestors) => {
      if (OPAQUE.has(node.type)) return SKIP;
      const parent = ancestors.at(-1);
      if (node.type === 'leafDirective' && node.name === 'bibliography') {
        if (parent !== undefined) placeholders.push({ parent, node });
        return SKIP;
      }
      if (node.type === 'containerDirective' && node.name === 'epigraph') {
        const attribute = node.attributes?.['source'];
        if (typeof attribute === 'string' && attribute.includes('@')) {
          const scan = scanCitations(attribute, { isKnown, isEscaped: () => false });
          const only = scan.citations.length === 1 ? scan.citations[0] : undefined;
          if (only !== undefined && only.source.trim() === attribute.trim()) {
            const [found] = collect([only], scan.problems, node, node.position?.start.offset, false);
            if (found !== undefined) epigraphs.push({ directive: node, found });
          }
        }
        return undefined;
      }
      if (node.type !== 'text' || parent === undefined || !node.value.includes('@')) return undefined;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      const raw = start === undefined || end === undefined ? undefined : source.slice(start, end);
      let escaped: ReadonlySet<number> = new Set();
      if (raw !== undefined) {
        const mapped = escapedMarkers(node.value, raw);
        if (mapped === undefined) {
          const naive = scanCitations(node.value, { isKnown, isEscaped: () => false });
          if (naive.citations.length > 0) {
            file.message(
              'citation syntax next to a character reference cannot be checked for escapes; left as text',
              node,
              'citations:unmappable',
            );
          }
          return undefined;
        }
        escaped = mapped;
      }
      const scan = scanCitations(node.value, { isKnown, isEscaped: (i) => escaped.has(i) });
      if (scan.citations.length === 0 && scan.problems.length === 0) return undefined;
      const found = collect(scan.citations, scan.problems, node, start, raw === node.value);
      textJobs.push({ parent, node, found });
      return undefined;
    });

    if (unknown.length > 0) {
      const where = (u: (typeof unknown)[number]): string => {
        const p = u.offset !== undefined ? pointOf(u.offset) : u.place.position?.start;
        return p === undefined ? '' : ` (${p.line}:${p.column})`;
      };
      const first = unknown[0] as (typeof unknown)[number];
      const reason = `unknown citation key${unknown.length > 1 ? 's' : ''}: ${unknown.map((u) => `@${u.key}${where(u)}`).join(', ')} — not found in bibliography/*.bib`;
      const at = first.offset !== undefined ? pointOf(first.offset) : first.place.position?.start;
      file.fail(reason, at === undefined ? undefined : { start: at, end: at }, 'citations:unknown-key');
    }
    if (placeholders.length > 1) {
      file.fail(
        'only one ::bibliography directive is allowed per document',
        placeholders[1]?.node,
        'citations:duplicate-bibliography',
      );
    }

    // ------------------------------------------------------------ 2. reference list
    const order: CitationKey[] = [];
    const seen = new Set<string>();
    const all: Found[] = [...textJobs.flatMap((j) => j.found), ...epigraphs.map((e) => e.found)].sort(
      (a, b) => (a.offset ?? 0) - (b.offset ?? 0),
    );
    for (const f of all) {
      for (const item of f.citation.items) {
        const ref = bibliography.get(item.key);
        if (ref !== undefined && !seen.has(ref.key)) {
          seen.add(ref.key);
          order.push(ref.key);
        }
      }
    }
    const list: ReferenceList = buildReferenceList(
      order.map((k) => bibliography.get(k)).filter((r): r is Reference => r !== undefined),
      style,
    );

    // ------------------------------------------------------------ 3. render calls
    const anchored = new Set<string>();
    const context = {
      style,
      letterOf: list.letterOf,
      href: (key: CitationKey) => `#${referenceId(key)}`,
      anchorId: (key: CitationKey) => {
        if (anchored.has(key)) return undefined;
        anchored.add(key);
        return citationId(key);
      },
    };
    const citationNode = (c: Citation): CitationNode => {
      const items: CiteRef[] = c.items.flatMap((item) => {
        const reference = bibliography.get(item.key);
        return reference === undefined
          ? []
          : [
              {
                reference,
                prefix: item.prefix,
                suppressAuthor: item.suppressAuthor,
                suffix: item.suffix,
                ...(item.locator !== undefined ? { locator: item.locator } : {}),
              },
            ];
      });
      const inline = renderCitation(c.mode, items, context);
      return {
        type: 'citation',
        children: [{ type: 'text', value: toPlainText(inline) }],
        data: { hName: 'span', hProperties: { className: ['cite'], dataCite: c.source }, hChildren: toHast(inline) },
      };
    };

    // Document order for anchors: text jobs and epigraphs interleaved by position.
    type Job = { readonly offset: number; readonly run: () => void };
    const jobs: Job[] = [
      ...textJobs.map((job): Job => ({
        offset: job.node.position?.start.offset ?? 0,
        run: () => {
          const pieces: (Text | CitationNode)[] = [];
          let at = 0;
          for (const { citation } of job.found) {
            if (citation.start > at) pieces.push({ type: 'text', value: job.node.value.slice(at, citation.start) });
            pieces.push(citationNode(citation));
            at = citation.end;
          }
          if (at < job.node.value.length) pieces.push({ type: 'text', value: job.node.value.slice(at) });
          const index = job.parent.children.indexOf(job.node);
          if (index >= 0) job.parent.children.splice(index, 1, ...(pieces as unknown as RootContent[]));
        },
      })),
      ...epigraphs.map((e): Job => ({
        offset: e.directive.position?.start.offset ?? 0,
        run: () => {
          const paragraph: Paragraph = {
            type: 'paragraph',
            data: { epigraphSource: true } as Paragraph['data'],
            children: [citationNode(e.found.citation) as unknown as PhrasingContent],
          };
          e.directive.children.push(paragraph);
        },
      })),
    ];
    for (const job of jobs.sort((a, b) => a.offset - b.offset)) job.run();

    // ------------------------------------------------------------ 4. the list
    const section = list.entries.length === 0 ? undefined : referencesNode(list, style, t);
    const placeholder = placeholders[0];
    if (placeholder !== undefined) {
      const index = placeholder.parent.children.indexOf(placeholder.node);
      if (section === undefined) {
        file.message(
          '::bibliography but no work is cited; the directive renders nothing',
          placeholder.node,
          'citations:empty-bibliography',
        );
        placeholder.parent.children.splice(index, 1);
      } else {
        placeholder.parent.children.splice(index, 1, section);
      }
    } else if (section !== undefined) {
      tree.children.push(section);
    }

    frontmatter['citations'] = [...order];
  };
}

/** The reference list as an mdast subtree (a real heading, so later folds such as a table of contents see it). */
const referencesNode = (
  list: ReferenceList,
  style: CitationStyle,
  t: (
    key: 'references.heading' | 'references.backlink' | 'references.backlink.symbol',
    params?: Readonly<Record<string, string>>,
  ) => string,
): RootContent => {
  const heading: Heading = {
    type: 'heading',
    depth: 2,
    data: { hProperties: { id: REFERENCES_HEADING_ID } },
    children: [{ type: 'text', value: t('references.heading') }],
  };
  const items: ElementContent[] = list.entries.map((entry) => {
    const call = `${toPlainText(style.label(entry.reference, 'parenthetical'))}, ${style.year(entry.reference, entry.letter)}`;
    return {
      type: 'element',
      tagName: 'li',
      properties: { id: referenceId(entry.key), className: ['references__item'] },
      children: [
        ...toHast(entry.content),
        { type: 'text', value: ' ' },
        {
          type: 'element',
          tagName: 'a',
          properties: {
            href: `#${citationId(entry.key)}`,
            className: ['references__backlink'],
            ariaLabel: t('references.backlink', { label: call }),
          },
          children: [{ type: 'text', value: t('references.backlink.symbol') }],
        },
      ],
    };
  });
  const listNode = {
    type: 'referenceList',
    children: [],
    data: { hName: 'ul', hProperties: { role: 'list', className: ['references__list'] }, hChildren: items },
  };
  return {
    type: 'references',
    children: [heading, listNode],
    data: {
      hName: 'section',
      hProperties: { className: ['references'], dataStyle: style.id, ariaLabelledBy: REFERENCES_HEADING_ID },
    },
  } as unknown as RootContent;
};
