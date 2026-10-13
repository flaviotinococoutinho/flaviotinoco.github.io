/**
 * The reading transform (Tree → Tree): non-linear reading directives and
 * heading attributes, as a pure function over an mdast tree.
 *
 *   :::stretch{label}  → <details class="stretch">         stretchtext (T. Nelson, 1967)
 *   :sidenote[…]       → numbered sidenote                  (E. Tufte; Tufte CSS)
 *   :marginnote[…]     → unnumbered margin note
 *   ::::scrolly        → <ft-scrolly> (sticky figure + :::step{state})
 *   ::::horizontal     → <ft-horizontal> (:::panel sequence)
 *   :::epigraph        → <figure class="epigraph"> (blockquote + source)
 *   :::aside           → <aside>
 *   ::toc              → <nav class="toc"> (list filled by the meta stage)
 *   ## T {#id .kind depends="a,b"}  → heading id, argument node (Toulmin, 1958)
 *
 * Laws (tests/unit/reading/*.test.ts):
 *   - injectivity: recoverText(transform(x)) = plainText(x)    (recover.ts)
 *   - idempotence: transform(transform(x)) ≅ transform(x)
 *   - the input tree is never mutated (the spine is rebuilt; untouched
 *     subtrees are shared).
 * Problems are accumulated as diagnostics (applicative validation): the shell
 * reports warnings and fails the build once, listing every error.
 */
import type { Position } from 'unist';
import { translator } from '../i18n/messages.ts';
import catalog from '../i18n/catalogs/reading.ts';
import type { Locale } from '../domain/locale.ts';
import {
  childrenOf,
  directiveAttributes,
  directiveName,
  isClaimed,
  isDirective,
  OPAQUE_TYPES,
  sourceOf,
  visibleText,
  type HastProperties,
  type MdNode,
} from '../fold/tree.ts';
import {
  argumentGraph,
  describeGraphError,
  isArgumentKind,
  parseSectionId,
  type ArgumentGraph,
  type ArgumentKind,
  type ArgumentNode,
  type SectionId,
} from './argument.ts';
import { isEscapedInSource, splitHeadingAttributes } from './heading-attributes.ts';
import { uniqueSlugs } from './slug.ts';
import { claim, element, glyphHast, link, READING_NODE, text } from './nodes.ts';
import { ATTRS_RECORD, HEADING_RECORD, PERMUTATION_RECORD, readingIds, TOC_RECORD, type HeadingRecord } from './records.ts';

export interface ReadingContext {
  readonly locale: Locale;
  /** Raw Markdown source (escape detection, prose-like directives); null for synthetic trees. */
  readonly source: string | null;
  /** Ids used by the page around the document (view chrome), never given to headings. */
  readonly reservedIds: readonly string[];
}

export type Severity = 'error' | 'warning';
export interface Diagnostic {
  readonly severity: Severity;
  /** "reading:<rule>" — the ruleId reported through vfile. */
  readonly rule: string;
  readonly message: string;
  readonly position: Position | undefined;
}

export interface ReadingResult {
  readonly tree: MdNode;
  readonly diagnostics: readonly Diagnostic[];
  readonly graph: ArgumentGraph;
}


/** Closed vocabulary: allowed attributes per directive (anything else is an authoring error). */
const BLOCK_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  stretch: ['label', 'id'],
  scrolly: ['label', 'id'],
  step: ['state'],
  horizontal: ['label', 'id'],
  panel: ['label'],
  epigraph: ['source', 'lang', 'id'],
  aside: ['label', 'id'],
  toc: ['depth'],
};
const NOTE_DIRECTIVES = new Set(['sidenote', 'marginnote']);
const LANG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

interface HeadingPlan {
  readonly id: string;
  readonly kind: ArgumentKind | null;
  readonly depends: readonly string[];
  readonly title: string;
  /** Present when an attribute block was removed from the last text node. */
  readonly split: { readonly text: string; readonly block: string } | null;
  readonly inToc: boolean;
}

const isLabelParagraph = (n: MdNode): boolean => n.type === 'paragraph' && n.data?.['directiveLabel'] === true;

/** First-child figure of a scrolly: ::lab, a lone image, or an (already claimed) figure. */
const isFigureCandidate = (n: MdNode): boolean => {
  if (n.type === 'leafDirective' && directiveName(n) === 'lab') return true;
  if (n.data?.hName === 'figure' || (n.type === 'containerDirective' && directiveName(n) === 'figure')) return true;
  if (n.data?.hName !== undefined && n.data.hName.startsWith('ft-')) return true;
  if (n.type === 'paragraph') {
    const meaningful = childrenOf(n).filter((c) => !(c.type === 'text' && (c.value ?? '').trim() === ''));
    return meaningful.length === 1 && (meaningful[0]?.type === 'image' || meaningful[0]?.type === 'imageReference');
  }
  return false;
};

const EXCLUDED_FROM_TOC = new Set(['stretch', 'aside', 'epigraph', 'horizontal', 'sidenote', 'marginnote']);

export const transformReading = (root: MdNode, ctx: ReadingContext): ReadingResult => {
  const t = translator(catalog, ctx.locale);
  const diagnostics: Diagnostic[] = [];
  const report = (severity: Severity, rule: string, message: string, node: MdNode | undefined): void => {
    diagnostics.push({ severity, rule: `reading:${rule}`, message, position: node?.position });
  };

  // ── Phase 1: scan (read-only) ───────────────────────────────────────────
  const headings: MdNode[] = [];
  const headingInToc = new Map<MdNode, boolean>();
  const existingIds: string[] = [];
  let sidenoteTotal = 0;
  let marginnoteTotal = 0;
  const scan = (node: MdNode, excluded: boolean): void => {
    const hid = node.data?.hProperties?.['id'];
    if (typeof hid === 'string') existingIds.push(hid);
    if (isDirective(node) && !isClaimed(node)) {
      const id = directiveAttributes(node)['id'];
      if (id !== undefined && id.length > 0) existingIds.push(id);
    }
    if (node.type === 'heading' && node.data?.[HEADING_RECORD] === undefined) {
      headings.push(node);
      headingInToc.set(node, !excluded);
    }
    const name = directiveName(node);
    if (node.type === 'textDirective' && !isClaimed(node) && name === 'sidenote') sidenoteTotal += 1;
    if (node.type === 'textDirective' && !isClaimed(node) && name === 'marginnote') marginnoteTotal += 1;
    if (OPAQUE_TYPES.has(node.type)) return;
    const excludes = excluded || (name !== undefined && EXCLUDED_FROM_TOC.has(name)) || node.type === 'footnoteDefinition';
    for (const c of childrenOf(node)) scan(c, excludes);
  };
  scan(root, false);

  // Heading attribute blocks.
  interface Parsed {
    readonly node: MdNode;
    readonly split: { readonly text: string; readonly block: string } | null;
    readonly ids: readonly string[];
    readonly kind: ArgumentKind | null;
    readonly depends: readonly string[];
    readonly title: string;
  }
  const parsed: Parsed[] = headings.map((h): Parsed => {
    const kids = childrenOf(h);
    const last = kids[kids.length - 1];
    const candidate = last?.type === 'text' ? splitHeadingAttributes(last.value ?? '') : null;
    const raw = sourceOf(h, ctx.source);
    const split = candidate !== null && (raw === null || !isEscapedInSource(raw)) ? candidate : null;
    const before = kids.slice(0, -1).map((k) => visibleText(k, ctx.source)).join('');
    const title = (split === null ? visibleText(h, ctx.source) : before + split.text).trim();
    if (split === null) {
      return { node: h, split: null, ids: [], kind: null, depends: [], title };
    }
    if (title.length === 0) {
      report('error', 'heading-attributes', 'a heading needs a title besides its attribute block', h);
    }
    const a = candidate?.attributes;
    const ids = a?.ids ?? [];
    if (ids.length > 1) report('error', 'heading-attributes', `a heading takes one #id, got ${ids.join(', ')}`, h);
    for (const id of ids) {
      const r = parseSectionId(id);
      if (!r.ok) report('error', 'invalid-id', r.error, h);
    }
    const classes = a?.classes ?? [];
    const kinds = classes.filter(isArgumentKind);
    for (const c of classes.filter((x) => !isArgumentKind(x))) {
      report('error', 'unknown-kind', `unknown argument kind ".${c}" (expected one of question, definition, premise, claim, proof, example, objection, reply, application, conclusion)`, h);
    }
    if (kinds.length > 1) report('error', 'unknown-kind', `a heading has one argument kind, got ${kinds.join(', ')}`, h);
    const pairs = a?.pairs ?? [];
    for (const [k] of pairs.filter(([k]) => k !== 'depends')) {
      report('error', 'heading-attributes', `unknown heading attribute "${k}" (only depends="…" is defined; escape the brace as \\{ to keep it as text)`, h);
    }
    if (pairs.filter(([k]) => k === 'depends').length > 1) report('error', 'heading-attributes', 'depends is given twice', h);
    const dependsRaw = pairs.find(([k]) => k === 'depends')?.[1] ?? '';
    const depends = dependsRaw.split(/[\s,]+/u).filter((d) => d.length > 0);
    for (const d of depends) {
      const r = parseSectionId(d);
      if (!r.ok) report('error', 'invalid-id', r.error, h);
    }
    const kind = kinds[0] ?? null;
    if (kind === null && depends.length > 0) {
      report('error', 'heading-attributes', 'depends="…" needs an argument kind (e.g. .claim) on the same heading', h);
    }
    return { node: h, split, ids, kind, depends, title };
  });

  // Ids: explicit ones first, then github-compatible slugs avoiding every taken id.
  const explicit = new Map<string, MdNode>();
  for (const p of parsed) {
    const id = p.ids[0];
    if (id === undefined) continue;
    if (explicit.has(id) || existingIds.includes(id) || ctx.reservedIds.includes(id)) {
      report('error', 'duplicate-id', `id "${id}" is used more than once in the page`, p.node);
    }
    explicit.set(id, p.node);
  }
  const ownHid = (p: Parsed): string | undefined => {
    const v = p.node.data?.hProperties?.['id'];
    return typeof v === 'string' ? v : undefined;
  };
  const needSlug = parsed.filter((p) => p.ids[0] === undefined && ownHid(p) === undefined);
  const slugs = uniqueSlugs(
    needSlug.map((p) => p.title),
    [...ctx.reservedIds, ...existingIds, ...explicit.keys(), ...readingIds(sidenoteTotal, marginnoteTotal)],
  );
  const slugOf = new Map<MdNode, string>(needSlug.map((p, i) => [p.node, slugs[i] ?? 'section']));
  const plans = new Map<MdNode, HeadingPlan>(
    parsed.map((p) => [
      p.node,
      {
        id: p.ids[0] ?? ownHid(p) ?? slugOf.get(p.node) ?? 'section',
        kind: p.kind,
        depends: p.depends,
        title: p.title,
        split: p.split,
        inToc: headingInToc.get(p.node) ?? true,
      },
    ]),
  );

  // Argument graph: nodes are the headings with a kind.
  const argumentIds = new Set(parsed.filter((p) => p.kind !== null).map((p) => plans.get(p.node)?.id));
  const allHeadingIds = new Set([...plans.values()].map((p) => p.id));
  const argNodes: ArgumentNode[] = [];
  for (const p of parsed) {
    const plan = plans.get(p.node);
    if (plan === undefined || plan.kind === null) continue;
    const id = parseSectionId(plan.id);
    if (!id.ok) continue;
    const deps: SectionId[] = [];
    for (const d of plan.depends) {
      const r = parseSectionId(d);
      if (!r.ok) continue;
      if (!argumentIds.has(d) && allHeadingIds.has(d)) {
        report('error', 'missing-dependency', `section "${plan.id}" depends on "${d}", a heading without an argument kind (add one, e.g. {#${d} .premise})`, p.node);
        continue;
      }
      deps.push(r.value);
    }
    argNodes.push({ id: id.value, kind: plan.kind, title: plan.title, depends: deps });
  }
  const graphResult = argumentGraph(argNodes);
  const graph: ArgumentGraph = graphResult.ok ? graphResult.value : { nodes: argNodes, edges: [] };
  if (!graphResult.ok) {
    for (const e of graphResult.error) {
      const at = e.type === 'cycle' ? e.path[0] : e.node;
      const node = parsed.find((p) => plans.get(p.node)?.id === at)?.node;
      report('error', e.type === 'cycle' ? 'circular-dependency' : 'missing-dependency', describeGraphError(e), node);
    }
  }
  const titleOf = new Map(argNodes.map((n) => [n.id as string, n.title]));

  // ── Phase 2: rebuild ────────────────────────────────────────────────────
  interface Env {
    readonly inLink: boolean;
    readonly inHeading: boolean;
    readonly inNote: boolean;
  }
  const ROOT_ENV: Env = { inLink: false, inHeading: false, inNote: false };
  let sidenotes = 0;
  let marginnotes = 0;
  let tocs = 0;

  const checkAttributes = (node: MdNode, name: string): Readonly<Record<string, string>> => {
    const attrs = directiveAttributes(node);
    const allowed = BLOCK_ATTRIBUTES[name] ?? [];
    for (const key of Object.keys(attrs)) {
      if (!allowed.includes(key)) {
        report('error', 'unknown-attribute', `:::${name} does not take the attribute "${key}"${allowed.length > 0 ? ` (allowed: ${allowed.join(', ')})` : ''}`, node);
      }
    }
    return attrs;
  };

  /** Splits a container's `[label]` paragraph off its content. */
  const labelOf = (node: MdNode): { readonly label: MdNode | null; readonly rest: readonly MdNode[] } => {
    const kids = childrenOf(node);
    const first = kids[0];
    return first !== undefined && isLabelParagraph(first) ? { label: first, rest: kids.slice(1) } : { label: null, rest: kids };
  };

  const rebuildAll = (nodes: readonly MdNode[], env: Env): readonly MdNode[] => nodes.flatMap((n) => rebuild(n, env));

  const rebuildChildren = (node: MdNode, env: Env): MdNode => {
    const kids = childrenOf(node);
    if (kids.length === 0) return node;
    const next = rebuildAll(kids, env);
    const same = next.length === kids.length && next.every((n, i) => n === kids[i]);
    return same ? node : { ...node, children: next };
  };

  const heading = (node: MdNode, plan: HeadingPlan, env: Env): readonly MdNode[] => {
    const rebuilt = rebuildChildren(node, { ...env, inHeading: true });
    let kids = childrenOf(rebuilt);
    if (plan.split !== null) {
      const last = kids[kids.length - 1];
      kids =
        plan.split.text.length === 0
          ? kids.slice(0, -1)
          : [...kids.slice(0, -1), { ...(last ?? { type: 'text' }), value: plan.split.text }];
    }
    const previous = node.data?.hProperties ?? {};
    const prevClass = previous['className'];
    const classes = [
      ...(Array.isArray(prevClass) ? prevClass.map(String) : []),
      ...(plan.kind !== null ? ['arg', `arg--${plan.kind}`] : []),
    ];
    const hProperties: HastProperties = {
      ...previous,
      id: plan.id,
      className: classes.length > 0 ? classes : undefined,
      dataKind: plan.kind ?? undefined,
      dataDepends: plan.depends.length > 0 ? plan.depends.join(' ') : undefined,
      dataAttrs: plan.split !== null ? plan.split.block.trim() : undefined,
    };
    const record: HeadingRecord = { id: plan.id, kind: plan.kind, depends: plan.depends, inToc: plan.inToc };
    const h: MdNode = {
      ...rebuilt,
      children: kids,
      data: {
        ...node.data,
        hProperties: Object.fromEntries(Object.entries(hProperties).filter(([, v]) => v !== undefined)),
        [HEADING_RECORD]: record,
        ...(plan.split !== null ? { [ATTRS_RECORD]: plan.split.block } : {}),
      },
    };
    if (plan.kind === null) return [h];
    const kindLabel = t(`kind.${plan.kind}`);
    const eyebrow = element(
      'p',
      { className: ['arg__kind'] },
      [
        { type: READING_NODE, children: [], data: { hName: 'span', hProperties: { className: ['arg__glyph'] }, hChildren: [glyphHast(plan.kind)] } },
        text(kindLabel, true),
      ],
      { generated: true },
    );
    const deps = plan.depends.filter((d) => titleOf.has(d));
    const parts =
      deps.length > 0
        ? new Intl.ListFormat(ctx.locale, { type: 'conjunction' }).formatToParts(deps.map((d) => titleOf.get(d) ?? d))
        : [];
    let k = 0;
    const depNodes = parts.map((part): MdNode => {
      if (part.type === 'literal') return text(part.value, true);
      const id = deps[k] ?? '';
      k += 1;
      return link(`#${id}`, [text(part.value, true)], { className: ['arg__dep'] });
    });
    const depsParagraph =
      depNodes.length > 0
        ? [element('p', { className: ['arg__deps'] }, [element('span', { className: ['arg__deps-label'] }, [text(t('argument.rests'), true)]), text(' ', true), ...depNodes], { generated: true })]
        : [];
    return [
      element('hgroup', { className: ['arg', `arg--${plan.kind}`], dataKind: plan.kind }, [eyebrow, h, ...depsParagraph], {
        position: node.position,
      }),
    ];
  };

  const note = (node: MdNode, name: 'sidenote' | 'marginnote', env: Env): readonly MdNode[] => {
    const where = env.inLink ? 'a link' : env.inHeading ? 'a heading' : env.inNote ? 'another note' : null;
    if (where !== null) {
      report('error', 'note-placement', `:${name} cannot be placed inside ${where}`, node);
      return [node];
    }
    const attrs = directiveAttributes(node);
    if (Object.keys(attrs).length > 0) report('error', 'unknown-attribute', `:${name} takes no attributes`, node);
    const content = rebuildAll(childrenOf(node), { ...env, inNote: true });
    if (name === 'sidenote') {
      sidenotes += 1;
      const n = sidenotes;
      const label = t('sidenote.label', { n });
      return [
        claim(node, 'span', { className: ['sidenote'], dataSidenote: n }, [
          element('sup', { className: ['sidenote__ref'], id: `sn-ref-${n}` }, [link(`#sn-${n}`, [text(String(n), true)], { className: ['sidenote__link'], ariaLabel: label })], { generated: true }),
          element('span', { className: ['sidenote__note'], id: `sn-${n}`, role: 'note' }, [
            element('span', { className: ['sidenote__num'], ariaHidden: 'true' }, [text(String(n), true)], { generated: true }),
            ...content,
          ]),
        ]),
      ];
    }
    marginnotes += 1;
    const m = marginnotes;
    return [
      claim(node, 'span', { className: ['marginnote'], dataMarginnote: m, dataLabel: t('marginnote.label') }, [
        element('span', { className: ['marginnote__note'], id: `mn-${m}`, role: 'note' }, content),
      ]),
    ];
  };

  const stretch = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'stretch');
    const { label, rest } = labelOf(node);
    const attrLabel = attrs['label'];
    if (label !== null && attrLabel !== undefined) report('error', 'ambiguous-label', ':::stretch has both [label] and label="…"; keep one', node);
    if (label === null && (attrLabel === undefined || attrLabel.trim() === '')) {
      report('error', 'missing-label', ':::stretch needs a label: :::stretch{label="Por que…?"}', node);
    }
    const labelText = label !== null ? visibleText(label, ctx.source) : (attrLabel ?? '');
    const summary =
      label !== null
        ? element('summary', { className: ['stretch__label'] }, rebuildAll(childrenOf(label), env), { position: label.position })
        : element('summary', { className: ['stretch__label'] }, [text(labelText, true)], { generated: true });
    return [
      claim(node, 'details', { className: ['stretch'], dataLabel: labelText, id: attrs['id'] }, [
        summary,
        element('div', { className: ['stretch__body'] }, rebuildAll(rest, env)),
      ]),
    ];
  };

  const noLabel = (node: MdNode, name: string): void => {
    if (labelOf(node).label !== null) report('error', 'label-not-allowed', `:::${name} takes no [label]; use label="…"`, node);
  };

  const scrolly = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'scrolly');
    noLabel(node, 'scrolly');
    const kids = childrenOf(node).filter((c) => !isLabelParagraph(c));
    const first = kids[0];
    const figure = first !== undefined && isFigureCandidate(first) ? first : null;
    const rest = figure === null ? kids : kids.slice(1);
    const steps = rest.filter((c) => c.type === 'containerDirective' && directiveName(c) === 'step' && !isClaimed(c));
    for (const c of rest.filter((x) => !steps.includes(x))) {
      report('error', 'scrolly-content', '::::scrolly holds an optional first figure (::lab, image or :::figure) followed only by :::step blocks', c);
    }
    if (steps.length === 0) report('error', 'scrolly-content', '::::scrolly needs at least one :::step', node);
    if (figure === null) report('warning', 'scrolly-figure', '::::scrolly without a figure: the steps will read as plain text', node);
    const stepNodes = steps.map((s, i) => {
      const sa = checkAttributes(s, 'step');
      noLabel(s, 'step');
      return claim(s, 'div', { className: ['scrolly__step'], dataIndex: i, dataState: sa['state'] }, rebuildAll(childrenOf(s), env));
    });
    return [
      claim(node, 'ft-scrolly', { className: ['scrolly'], dataSteps: steps.length, ariaLabel: attrs['label'], id: attrs['id'] }, [
        ...(figure !== null ? [element('div', { className: ['scrolly__figure'] }, rebuild(figure, env))] : []),
        element('div', { className: ['scrolly__steps'] }, stepNodes),
      ]),
    ];
  };

  const horizontal = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'horizontal');
    noLabel(node, 'horizontal');
    const label = attrs['label'] ?? '';
    if (label.trim() === '') report('error', 'missing-label', '::::horizontal needs label="…" (it names the scrollable region for assistive technology)', node);
    const kids = childrenOf(node).filter((c) => !isLabelParagraph(c));
    const panels = kids.filter((c) => c.type === 'containerDirective' && directiveName(c) === 'panel' && !isClaimed(c));
    for (const c of kids.filter((x) => !panels.includes(x))) {
      report('error', 'horizontal-content', '::::horizontal holds only :::panel blocks', c);
    }
    if (panels.length === 0) report('error', 'horizontal-content', '::::horizontal needs at least one :::panel', node);
    if (panels.length === 1) report('warning', 'horizontal-content', '::::horizontal with a single :::panel reads as a plain block', node);
    const n = panels.length;
    const panelNodes = panels.map((p, i) => {
      const pa = checkAttributes(p, 'panel');
      noLabel(p, 'panel');
      const position = t('horizontal.panel', { i: i + 1, n });
      const pl = pa['label'];
      return claim(
        p,
        'div',
        { className: ['horizontal__panel'], role: 'group', ariaLabel: pl !== undefined && pl.length > 0 ? `${pl} (${position})` : position, dataIndex: i },
        rebuildAll(childrenOf(p), env),
      );
    });
    return [
      claim(node, 'ft-horizontal', { className: ['horizontal'], dataPanels: n, dataLabel: label, style: `--panels:${n}`, id: attrs['id'] }, [
        element('div', { className: ['horizontal__viewport'], role: 'region', ariaLabel: label, tabIndex: 0 }, [
          element('div', { className: ['horizontal__track'] }, panelNodes),
        ]),
        element('p', { className: ['horizontal__hint'], ariaHidden: 'true' }, [text(t('horizontal.hint', { n }), true)], { generated: true }),
      ]),
    ];
  };

  const epigraph = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'epigraph');
    const lang = attrs['lang'];
    if (lang !== undefined && !LANG.test(lang)) report('error', 'unknown-attribute', `:::epigraph lang="${lang}" is not a BCP 47 language tag`, node);
    const kids = childrenOf(node);
    // The source is the [label], or a node an earlier stage (citations) flagged as such.
    const sourceIndex = kids.findIndex((c) => isLabelParagraph(c) || c.data?.['epigraphSource'] === true);
    const sourceNode = sourceIndex >= 0 ? kids[sourceIndex] : undefined;
    const attrSource = attrs['source'];
    if (sourceNode !== undefined && attrSource !== undefined && !(sourceNode.data?.['epigraphSource'] === true)) {
      report('error', 'ambiguous-label', ':::epigraph has both [source] and source="…"; keep one', node);
    }
    const quote = kids.filter((_, i) => i !== sourceIndex);
    const caption: readonly MdNode[] =
      sourceNode !== undefined
        ? [element('figcaption', { className: ['epigraph__source'] }, rebuildAll(sourceNode.type === 'paragraph' ? childrenOf(sourceNode) : [sourceNode], env))]
        : attrSource !== undefined && attrSource.length > 0
          ? [element('figcaption', { className: ['epigraph__source'] }, [text(attrSource, true)], { generated: true })]
          : [];
    // Recovery order: when the source came first in the input, read it first.
    const sourceFirst = sourceNode !== undefined && sourceIndex === 0 && quote.length > 0;
    return [
      claim(
        node,
        'figure',
        { className: ['epigraph'], dataSource: attrSource, id: attrs['id'] },
        [element('blockquote', { className: ['epigraph__quote'], lang }, rebuildAll(quote, env)), ...caption],
        sourceFirst ? { [PERMUTATION_RECORD]: [1, 0] } : {},
      ),
    ];
  };

  const aside = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'aside');
    const { label, rest } = labelOf(node);
    const attrLabel = attrs['label'];
    if (label !== null && attrLabel !== undefined) report('error', 'ambiguous-label', ':::aside has both [title] and label="…"; keep one', node);
    const name = label !== null ? visibleText(label, ctx.source).trim() : attrLabel;
    const title =
      label !== null
        ? [element('p', { className: ['aside__title'] }, rebuildAll(childrenOf(label), env), { position: label.position })]
        : attrLabel !== undefined && attrLabel.length > 0
          ? [element('p', { className: ['aside__title'] }, [text(attrLabel, true)], { generated: true })]
          : [];
    return [claim(node, 'aside', { className: ['aside'], ariaLabel: name !== undefined && name.length > 0 ? name : undefined, id: attrs['id'] }, [...title, ...rebuildAll(rest, env)])];
  };

  const toc = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'toc');
    tocs += 1;
    if (tocs > 1) report('error', 'toc-duplicate', 'only one ::toc per document', node);
    const depthRaw = attrs['depth'];
    const depth = depthRaw === undefined ? 3 : Number(depthRaw);
    if (!Number.isInteger(depth) || depth < 2 || depth > 6) report('error', 'unknown-attribute', `::toc depth="${String(depthRaw)}" must be an integer from 2 to 6`, node);
    const kids = childrenOf(node);
    const title =
      kids.length > 0
        ? element('p', { className: ['toc__title'], id: 'toc' }, rebuildAll(kids, env))
        : element('p', { className: ['toc__title'], id: 'toc' }, [text(t('toc.title'), true)], { generated: true });
    return [claim(node, 'nav', { className: ['toc'], ariaLabelledBy: 'toc' }, [title], { [TOC_RECORD]: { depth: Number.isInteger(depth) ? depth : 3 } })];
  };

  const misplaced = (node: MdNode, name: string, parent: string): readonly MdNode[] => {
    report('error', 'misplaced-directive', `:::${name} can only appear directly inside ::::${parent}`, node);
    return [node];
  };

  function rebuild(node: MdNode, env: Env): readonly MdNode[] {
    if (OPAQUE_TYPES.has(node.type)) return [node];
    const plan = node.type === 'heading' ? plans.get(node) : undefined;
    if (plan !== undefined) return heading(node, plan, env);
    const name = directiveName(node);
    if (name !== undefined && !isClaimed(node)) {
      if (node.type === 'textDirective' && NOTE_DIRECTIVES.has(name)) return note(node, name === 'sidenote' ? 'sidenote' : 'marginnote', env);
      if (node.type === 'containerDirective') {
        switch (name) {
          case 'stretch':
            return stretch(node, env);
          case 'scrolly':
            return scrolly(node, env);
          case 'step':
            return misplaced(node, 'step', 'scrolly');
          case 'horizontal':
            return horizontal(node, env);
          case 'panel':
            return misplaced(node, 'panel', 'horizontal');
          case 'epigraph':
            return epigraph(node, env);
          case 'aside':
            return aside(node, env);
          default:
            break;
        }
      }
      if (node.type === 'leafDirective' && name === 'toc') return toc(node, env);
    }
    return [rebuildChildren(node, node.type === 'link' || node.type === 'linkReference' ? { ...env, inLink: true } : env)];
  }

  const rebuiltRoot = rebuildChildren(root, ROOT_ENV);
  return { tree: rebuiltRoot, diagnostics, graph };
};
