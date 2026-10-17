/**
 * The per-document rules of the authoring language (docs/arquitetura.md §5),
 * applied to the syntax tree of one Markdown file. Kept apart from the test
 * runner so that rules.test.ts can prove each rule fires on bad input.
 */
import katex from 'katex';
import type { Nodes, Parents, Text } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { visitParents } from 'unist-util-visit-parents';
import { KATEX_OPTIONS, MACROS } from '../../../src/core/latex/macros.ts';
import { parseSlug } from '../../../src/core/domain/identifiers.ts';
import { decodeRoute, encodeRoute, type Route } from '../../../src/core/i18n/routes.ts';
import {
  ARGUMENT_KINDS,
  CITATION_KEYS,
  CONCEPT_IDS,
  DIRECTIVES,
  ENVIRONMENTS,
  HEADING_ID,
  LABEL,
  LANGUAGE_TAG,
  WIDGETS,
  citationsIn,
  headingAttributes,
  strayDollars,
} from './checkers.ts';
import { type CollectionName, type Doc, LOCALE_DIRS } from './corpus.ts';

/** Route of an authored document in its own locale (the inverse of the page dispatchers). */
export const routeOf = (doc: Doc): Route | null => {
  const slug = parseSlug(doc.frontmatter['slug']);
  if (!slug.ok) return null;
  switch (doc.collection) {
    case 'essays':
      return { kind: 'essay', slug: slug.value };
    case 'labs':
      return { kind: 'lab', slug: slug.value };
    case 'pages': {
      const key = doc.frontmatter['translationKey'];
      return key === 'about' || key === 'colophon' ? { kind: key } : null;
    }
    default:
      return null;
  }
};

/** Resolves a relative link from a document and checks that it lands on an existing route. */
export const checkRelativeLink = (doc: Doc, url: string, corpus: readonly Doc[]): string | null => {
  const from = routeOf(doc);
  if (from === null) return `cannot resolve "${url}": the document has no route`;
  const locale = LOCALE_DIRS[doc.dir];
  const { pathname } = new URL(url, `https://site.invalid${encodeRoute(from, locale)}`);
  const decoded = decodeRoute(pathname);
  if (!decoded.ok) return `relative link "${url}" resolves to ${pathname}, which is no route (${decoded.error})`;
  const { route } = decoded.value;
  if (decoded.value.locale !== locale) return `relative link "${url}" leaves the document's language`;
  if (route.kind === 'essay' || route.kind === 'lab') {
    const collection: CollectionName = route.kind === 'essay' ? 'essays' : 'labs';
    const found = corpus.some(
      (d) => d.collection === collection && d.dir === doc.dir && d.frontmatter['slug'] === route.slug,
    );
    if (!found) return `relative link "${url}" points to no ${doc.dir} ${route.kind} "${route.slug}"`;
  }
  return null;
};

type Directive = Extract<Nodes, { type: 'containerDirective' | 'leafDirective' | 'textDirective' }>;
const isDirective = (n: Nodes): n is Directive =>
  n.type === 'containerDirective' || n.type === 'leafDirective' || n.type === 'textDirective';

const where = (doc: Doc, node: Nodes): string => `${doc.path}:${node.position?.start.line ?? '?'}`;

interface Facts {
  readonly labels: Set<string>;
  readonly equationLabels: Set<string>;
  readonly refs: { readonly target: string; readonly node: Nodes; readonly kind: 'ref' | 'eqref' }[];
  readonly headingIds: Map<string, Nodes>;
  readonly depends: { readonly id: string; readonly on: string; readonly node: Nodes }[];
}

/** Walks one document and returns every problem found (messages with file:line). */
export const checkDocument = (doc: Doc, corpus: readonly Doc[]): string[] => {
  const problems: string[] = [];
  const report = (node: Nodes, message: string): void => {
    problems.push(`${where(doc, node)} ${message}`);
  };
  const facts: Facts = { labels: new Set(), equationLabels: new Set(), refs: [], headingIds: new Map(), depends: [] };
  const protectedRanges: (readonly [number, number])[] = [];
  const defineLabel = (node: Nodes, label: string, equation: boolean): void => {
    if (!LABEL.test(label)) report(node, `invalid label "${label}"`);
    if (facts.labels.has(label)) report(node, `duplicate label "${label}"`);
    facts.labels.add(label);
    if (equation) facts.equationLabels.add(label);
  };

  visitParents(doc.tree, (node: Nodes, ancestors: readonly Parents[]) => {
    const parent = ancestors[ancestors.length - 1];

    if (
      node.type === 'math' ||
      node.type === 'inlineMath' ||
      node.type === 'code' ||
      node.type === 'inlineCode' ||
      node.type === 'html'
    ) {
      const { start, end } = node.position ?? {};
      if (start?.offset !== undefined && end?.offset !== undefined) protectedRanges.push([start.offset, end.offset]);
    }

    if (node.type === 'math' || node.type === 'inlineMath') {
      const display = node.type === 'math';
      for (const m of node.value.matchAll(/\\label\{([^}]*)\}/gu)) {
        if (!display) report(node, `\\label{${m[1]}} in inline math (only display math is numbered)`);
        else defineLabel(node, m[1] ?? '', true);
      }
      for (const m of node.value.matchAll(/\\(?:eq)?ref\{([^}]*)\}/gu)) {
        facts.refs.push({ target: m[1] ?? '', node, kind: 'eqref' });
      }
      const tex = node.value.replace(/\\label\{[^}]*\}/gu, '').replace(/\\(?:eq)?ref\{[^}]*\}/gu, '\\text{(1)}');
      try {
        katex.renderToString(tex, {
          ...KATEX_OPTIONS,
          macros: { ...MACROS },
          displayMode: display,
          throwOnError: true,
        });
      } catch (error) {
        report(node, `KaTeX rejects ${JSON.stringify(node.value)}: ${String(error)}`);
      }
      return 'skip';
    }

    if (node.type === 'text') {
      const { value } = node as Text;
      for (const use of citationsIn(value)) {
        if (!CITATION_KEYS.has(use.key)) report(node, `unknown citation key "@${use.key}"`);
      }
      // A directive that failed to parse (e.g. unbalanced brackets) survives as literal text.
      const stray = /(?<![:\\]):{1,4}[a-z][a-z-]*[[{]/u.exec(value);
      if (stray !== null) report(node, `directive-shaped text left unparsed: "${stray[0]}…"`);
    }

    if (node.type === 'link' && node.url.startsWith('.')) {
      // Relative links are resolved against the page's own route and decoded with the core codec,
      // so they stay valid under any deployment base path.
      const problem = checkRelativeLink(doc, node.url, corpus);
      if (problem !== null) report(node, problem);
    }

    if (node.type === 'heading') {
      const last = node.children[node.children.length - 1];
      const attributes = last?.type === 'text' ? headingAttributes(last.value) : null;
      if (attributes !== null) {
        for (const id of attributes.ids) {
          if (!HEADING_ID.test(id)) report(node, `heading id "${id}" is not lowercase ASCII kebab-case`);
          if (facts.headingIds.has(id)) report(node, `duplicate heading id "${id}"`);
          facts.headingIds.set(id, node);
        }
        if (attributes.ids.length !== 1) report(node, 'an argument heading needs exactly one #id');
        for (const kind of attributes.classes) {
          if (!ARGUMENT_KINDS.has(kind)) report(node, `unknown argument kind ".${kind}"`);
        }
        for (const key of Object.keys(attributes.pairs)) {
          if (key !== 'depends') report(node, `unknown heading attribute "${key}"`);
        }
        const id = attributes.ids[0] ?? '';
        for (const on of (attributes.pairs['depends'] ?? '').split(',').filter((s) => s.length > 0)) {
          facts.depends.push({ id, on: on.trim(), node });
        }
      } else if (/\{[^}]*\}\s*$/u.test(toString(node))) {
        report(node, `heading ends with a brace block that is not a valid attribute list: "${toString(node)}"`);
      }
    }

    if (!isDirective(node)) return undefined;

    const known: ReadonlySet<string> = DIRECTIVES[node.type];
    if (!known.has(node.name)) {
      // Prose such as "10:30", "7:1" or "NBR 10520:2023" parses as a text directive; the
      // integrity stage restores it verbatim. Only bracketed/braced ones look intentional.
      const { start, end } = node.position ?? {};
      const raw = doc.source.slice(start?.offset ?? 0, end?.offset ?? 0);
      if (node.type !== 'textDirective' || /[[{]/u.test(raw)) report(node, `unknown ${node.type} "${node.name}"`);
      return 'skip';
    }
    if (node.type === 'textDirective') {
      // Every text directive of the language takes a [label]; without one (e.g. unbalanced
      // brackets) remark-directive yields an empty directive and leaves the text behind.
      const { start, end } = node.position ?? {};
      const raw = doc.source.slice(start?.offset ?? 0, end?.offset ?? 0);
      if (!/^:[a-z][a-z-]*\[/u.test(raw)) report(node, `:${node.name} needs a [label]`);
    }
    const attrs = node.attributes ?? {};
    const attr = (name: string): string | undefined => attrs[name] ?? undefined;
    const label = toString(node);

    switch (node.name) {
      case 'ref':
      case 'eqref': {
        // remark-directive reads ":entropia" inside "[eq:entropia]" as a nested directive,
        // so the label is taken verbatim from the source slice, as the latex stage does.
        const { start, end } = node.position ?? {};
        const raw = doc.source.slice(start?.offset ?? 0, end?.offset ?? 0);
        const target = /^:[a-z]+\[([^\]]*)\]$/u.exec(raw)?.[1] ?? label;
        facts.refs.push({ target, node, kind: node.name });
        return 'skip';
      }
      case 'concept': {
        const id = attr('id');
        if (id === undefined || !CONCEPT_IDS.has(id))
          report(node, `concept id "${id ?? ''}" is not in the ontology list`);
        if (label.trim().length === 0) report(node, ':concept needs a visible label');
        break;
      }
      case 'concept-map': {
        const focus = attr('focus');
        if (focus === undefined || !CONCEPT_IDS.has(focus)) report(node, `concept-map focus "${focus ?? ''}" unknown`);
        if (!/^[1-3]$/u.test(attr('depth') ?? '')) report(node, 'concept-map depth must be 1, 2 or 3');
        break;
      }
      case 'lab': {
        const widget = attr('widget');
        if (widget === undefined || !WIDGETS.has(widget)) report(node, `unknown lab widget "${widget ?? ''}"`);
        if (doc.collection === 'labs')
          report(node, 'lab pages render their widget from the frontmatter: no ::lab in the body');
        break;
      }
      case 'foreign':
        if (!LANGUAGE_TAG.test(attr('lang') ?? '')) report(node, ':foreign needs lang=<BCP 47 tag>');
        break;
      case 'abbr':
        if ((attr('title') ?? '').length === 0) report(node, ':abbr needs title="…"');
        break;
      case 'stretch':
      case 'horizontal':
        if ((attr('label') ?? '').trim().length === 0) report(node, `:::${node.name} needs label="…"`);
        break;
      case 'step':
        if (parent?.type !== 'containerDirective' || parent.name !== 'scrolly')
          report(node, ':::step outside ::::scrolly');
        if ((attr('state') ?? '').length === 0) report(node, ':::step needs state="…"');
        break;
      case 'panel':
        if (parent?.type !== 'containerDirective' || parent.name !== 'horizontal')
          report(node, ':::panel outside ::::horizontal');
        break;
      case 'scrolly':
        if (!node.children.some((c) => c.type === 'containerDirective' && c.name === 'step'))
          report(node, 'scrolly without steps');
        break;
      case 'epigraph': {
        const source = attr('source') ?? '';
        if (source.length === 0) report(node, ':::epigraph needs source="…"');
        for (const use of citationsIn(source)) {
          if (!CITATION_KEYS.has(use.key)) report(node, `unknown citation key "@${use.key}" in epigraph source`);
        }
        break;
      }
      case 'figure':
        if (!['figure', 'chart', 'frame', 'table'].includes(attr('kind') ?? '')) report(node, 'figure kind invalid');
        if ((attr('title') ?? '').length === 0) report(node, 'figure needs title');
        if ((attr('source') ?? '').length === 0) report(node, 'figure needs source');
        defineLabel(node, attr('id') ?? '', false);
        break;
      default:
        break;
    }
    if (ENVIRONMENTS.has(node.name) && node.type === 'containerDirective') {
      const id = attr('id');
      if (id !== undefined) defineLabel(node, id, false);
      else if (node.name !== 'proof' && node.name !== 'remark') report(node, `:::${node.name} without #label`);
    }
    return undefined;
  });

  for (const ref of facts.refs) {
    if (!facts.labels.has(ref.target))
      report(ref.node, `${ref.kind} target "${ref.target}" is not defined in this document`);
    else if (ref.kind === 'eqref' && !facts.equationLabels.has(ref.target)) {
      report(ref.node, `eqref target "${ref.target}" is not an equation label`);
    }
  }
  for (const dep of facts.depends) {
    if (!facts.headingIds.has(dep.on)) report(dep.node, `"${dep.id}" depends on unknown heading id "${dep.on}"`);
    if (dep.on === dep.id) report(dep.node, `"${dep.id}" depends on itself`);
  }
  // Heading ids must not collide with the HTML ids derived from labels (':' → '-').
  for (const label of facts.labels) {
    const html = label.replace(':', '-');
    const clash = facts.headingIds.get(html);
    if (clash !== undefined) report(clash, `heading id "${html}" collides with label "${label}"`);
  }
  for (const offset of strayDollars(doc.source, protectedRanges)) {
    const line = doc.source.slice(0, offset).split('\n').length;
    problems.push(`${doc.path}:${line} single "$" outside $$…$$ (write \\$ or R$ for currency)`);
  }
  return problems;
};
