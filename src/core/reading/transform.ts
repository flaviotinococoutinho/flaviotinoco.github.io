/**
 * The reading transform (Tree → Tree): non-linear reading directives and
 * heading attributes, as a pure function over an mdast tree.
 *
 *   :::stretch{label}  → <details class="stretch">        stretchtext (T. H. Nelson, 1967)
 *   :sidenote[…]       → numbered sidenote                 (E. Tufte; Tufte CSS)
 *   :marginnote[…]     → unnumbered margin note
 *   ::::scrolly        → <ft-scrolly> (sticky figure + :::step{state})
 *   ::::horizontal     → <ft-horizontal> (:::panel sequence)
 *   :::epigraph        → <figure class="epigraph"> (blockquote + source)
 *   :::aside           → <aside class="aside">
 *   ::toc              → <nav class="toc"> (list filled by the meta stage)
 *   ## T {#id .kind depends="a,b"}  → heading id, argument node (S. Toulmin, 1958)
 *
 * Laws (tests/unit/reading/*.test.ts):
 *   - injectivity: recoverText(transform(x)) = recoverText(x)       (recover.ts)
 *   - idempotence: transform(transform(x)) = transform(x)
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
  isProseDirective,
  OPAQUE_TYPES,
  sourceOf,
  visibleText,
  type HastProperties,
  type MdNode,
} from '../fold/tree.ts';
import {
  ARGUMENT_KINDS,
  argumentGraph,
  describeGraphError,
  isArgumentKind,
  parseSectionId,
  type ArgumentGraph,
  type ArgumentKind,
  type ArgumentNode,
  type SectionId,
} from './argument.ts';
import { isEscapedInSource, splitHeadingAttributes, type HeadingAttributes } from './heading-attributes.ts';
import { uniqueSlugs } from './slug.ts';
import { claim, element, glyphHast, link, text } from './nodes.ts';
import {
  ATTRS_RECORD,
  EPIGRAPH_SOURCE,
  HEADING_RECORD,
  marginnoteId,
  PERMUTATION_RECORD,
  readingIds,
  sidenoteId,
  sidenoteRefId,
  TOC_ID,
  TOC_RECORD,
  TOC_TITLE_ID,
  type HeadingRecord,
} from './records.ts';

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

/** Closed vocabulary: allowed attributes per block directive (anything else is an authoring error). */
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
/** BCP 47 shape (RFC 5646 §2.1, simplified: language + subtags). */
const LANG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
/** Containers whose headings are not part of the main flow (folded, digressive or translated sideways). */
const OUTSIDE_FLOW = new Set(['stretch', 'aside', 'epigraph', 'horizontal']);
const DEFAULT_TOC_DEPTH = 3;

const isLabelParagraph = (n: MdNode): boolean => n.type === 'paragraph' && n.data?.['directiveLabel'] === true;

/** First-child figure of a scrolly: ::lab, a lone image, a :::figure or any island an earlier stage emitted. */
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

// ── Heading attribute blocks ────────────────────────────────────────────────

/**
 * Where a heading's attribute block lies among its children. The block is a
 * suffix of the heading's trailing run of text (remark-directive splits
 * `depends="def:x"` into text + `:x` directive + text, so the run may span
 * several nodes); `keep` children stay untouched and, when the block starts in
 * the middle of child `keep`, `head` is the part of that text node that stays.
 */
interface HeadingCut {
  readonly keep: number;
  readonly head: string | null;
  /** The removed suffix exactly as the reader would have seen it (recovery record). */
  readonly block: string;
  readonly attributes: HeadingAttributes;
}

/** Finds a valid trailing attribute block, or null (the common case: a plain heading). */
const headingCut = (heading: MdNode, source: string | null): HeadingCut | null => {
  const kids = childrenOf(heading);
  let start = kids.length;
  while (start > 0) {
    const c = kids[start - 1];
    if (c === undefined || !(c.type === 'text' || isProseDirective(c, source))) break;
    start -= 1;
  }
  const run = kids.slice(start).map((c) => (c.type === 'text' ? (c.value ?? '') : (sourceOf(c, source) ?? '')));
  const split = splitHeadingAttributes(run.join(''));
  if (split === null) return null;
  // Walk back from the end until the removed length is covered.
  let remaining = split.block.length;
  let k = kids.length;
  while (k > start && remaining > 0) {
    const len = run[k - 1 - start]?.length ?? 0;
    if (len > remaining) break;
    remaining -= len;
    k -= 1;
  }
  if (remaining === 0) return { keep: k, head: null, block: split.block, attributes: split.attributes };
  // The block starts inside child k-1, which is a text node (a prose directive has no whitespace).
  const straddling = run[k - 1 - start] ?? '';
  return {
    keep: k - 1,
    head: straddling.slice(0, straddling.length - remaining),
    block: split.block,
    attributes: split.attributes,
  };
};

/** Children of a heading with its attribute block removed. */
const cutChildren = (heading: MdNode, cut: HeadingCut): readonly MdNode[] => {
  const kids = childrenOf(heading);
  const kept = kids.slice(0, cut.keep);
  const straddling = kids[cut.keep];
  return cut.head !== null && cut.head.length > 0 && straddling !== undefined
    ? [...kept, { ...straddling, value: cut.head }]
    : kept;
};

/** True when a heading ends with something that looks like an attribute block but is not one. */
const looksLikeAttributes = (heading: MdNode): boolean => {
  const last = childrenOf(heading).at(-1);
  return last?.type === 'text' && /\s\{\s*[#.][^{}]*\}\s*$/u.test(last.value ?? '');
};

interface HeadingPlan {
  readonly id: string;
  readonly kind: ArgumentKind | null;
  readonly depends: readonly string[];
  readonly title: string;
  readonly cut: HeadingCut | null;
  readonly inToc: boolean;
}

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
  const scan = (node: MdNode, outsideFlow: boolean): void => {
    const hid = node.data?.hProperties?.['id'];
    if (typeof hid === 'string' && node.data?.[HEADING_RECORD] === undefined) existingIds.push(hid);
    const name = directiveName(node);
    if (isDirective(node) && !isClaimed(node)) {
      const id = directiveAttributes(node)['id'];
      if (id !== undefined && id.length > 0) existingIds.push(id);
      if (node.type === 'textDirective' && name === 'sidenote') sidenoteTotal += 1;
      if (node.type === 'textDirective' && name === 'marginnote') marginnoteTotal += 1;
    }
    if (node.type === 'heading') {
      if (node.data?.[HEADING_RECORD] === undefined) {
        headings.push(node);
        headingInToc.set(node, !outsideFlow);
      } else {
        const record = node.data[HEADING_RECORD] as HeadingRecord;
        existingIds.push(record.id);
      }
    }
    if (OPAQUE_TYPES.has(node.type)) return;
    const outside =
      outsideFlow ||
      (name !== undefined && OUTSIDE_FLOW.has(name) && node.type === 'containerDirective') ||
      node.type === 'footnoteDefinition';
    for (const c of childrenOf(node)) scan(c, outside);
  };
  scan(root, false);

  interface Parsed {
    readonly node: MdNode;
    readonly cut: HeadingCut | null;
    readonly explicitId: string | undefined;
    readonly kind: ArgumentKind | null;
    readonly depends: readonly string[];
    readonly title: string;
  }
  const parseHeading = (h: MdNode): Parsed => {
    const candidate = headingCut(h, ctx.source);
    const raw = sourceOf(h, ctx.source);
    const cut = candidate !== null && (raw === null || !isEscapedInSource(raw)) ? candidate : null;
    if (cut === null) {
      if (candidate === null && looksLikeAttributes(h)) {
        report(
          'warning',
          'heading-attributes',
          'the heading ends with "{…}" that is not a valid attribute block; it is kept as text',
          h,
        );
      }
      return {
        node: h,
        cut: null,
        explicitId: undefined,
        kind: null,
        depends: [],
        title: visibleText(h, ctx.source).trim(),
      };
    }
    const title = cutChildren(h, cut)
      .map((k) => visibleText(k, ctx.source))
      .join('')
      .trim();
    if (title.length === 0)
      report('error', 'heading-attributes', 'a heading needs a title besides its attribute block', h);
    const { ids, classes, pairs } = cut.attributes;
    if (ids.length > 1) report('error', 'heading-attributes', `a heading takes one #id, got ${ids.join(', ')}`, h);
    for (const id of ids) {
      const r = parseSectionId(id);
      if (!r.ok) report('error', 'invalid-id', r.error, h);
    }
    const kinds = classes.filter(isArgumentKind);
    for (const c of classes.filter((x) => !isArgumentKind(x))) {
      report(
        'error',
        'unknown-kind',
        `unknown argument kind ".${c}" (expected one of ${ARGUMENT_KINDS.join(', ')})`,
        h,
      );
    }
    if (kinds.length > 1)
      report('error', 'unknown-kind', `a heading has one argument kind, got ${kinds.join(', ')}`, h);
    for (const [k] of pairs.filter(([key]) => key !== 'depends')) {
      report(
        'error',
        'heading-attributes',
        `unknown heading attribute "${k}" (only depends="…" is defined; write \\{ to keep a brace as text)`,
        h,
      );
    }
    const dependsPairs = pairs.filter(([k]) => k === 'depends');
    if (dependsPairs.length > 1) report('error', 'heading-attributes', 'depends is given twice', h);
    const depends = [...new Set((dependsPairs[0]?.[1] ?? '').split(/[\s,;]+/u).filter((d) => d.length > 0))];
    for (const d of depends) {
      const r = parseSectionId(d);
      if (!r.ok) report('error', 'invalid-id', r.error, h);
    }
    const kind = kinds[0] ?? null;
    if (kind === null && depends.length > 0) {
      report('error', 'heading-attributes', 'depends="…" needs an argument kind (e.g. .claim) on the same heading', h);
    }
    return { node: h, cut, explicitId: ids[0], kind, depends, title };
  };
  const parsed = headings.map(parseHeading);

  // Ids: explicit ones first, then github-compatible slugs avoiding every taken id.
  const taken = new Set([...ctx.reservedIds, ...existingIds]);
  const explicit = new Set<string>();
  for (const p of parsed) {
    if (p.explicitId === undefined) continue;
    if (explicit.has(p.explicitId) || taken.has(p.explicitId)) {
      report('error', 'duplicate-id', `id "${p.explicitId}" is used more than once in the page`, p.node);
    }
    explicit.add(p.explicitId);
  }
  const ownId = (p: Parsed): string | undefined => {
    const v = p.node.data?.hProperties?.['id'];
    return typeof v === 'string' ? v : undefined;
  };
  const needSlug = parsed.filter((p) => p.explicitId === undefined && ownId(p) === undefined);
  const slugs = uniqueSlugs(
    needSlug.map((p) => p.title),
    [...taken, ...explicit, ...readingIds(sidenoteTotal, marginnoteTotal)],
  );
  const slugOf = new Map<MdNode, string>(needSlug.map((p, i) => [p.node, slugs[i] ?? 'section']));
  const plans = new Map<MdNode, HeadingPlan>(
    parsed.map((p) => [
      p.node,
      {
        id: p.explicitId ?? ownId(p) ?? slugOf.get(p.node) ?? 'section',
        kind: p.kind,
        depends: p.depends,
        title: p.title,
        cut: p.cut,
        inToc: headingInToc.get(p.node) ?? true,
      },
    ]),
  );

  // Argument graph: nodes are the headings with a kind, in document order.
  const planList = [...plans.values()];
  const argumentIds = new Set(planList.filter((p) => p.kind !== null).map((p) => p.id));
  const headingIds = new Set(planList.map((p) => p.id));
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
      if (!argumentIds.has(d) && headingIds.has(d)) {
        report(
          'error',
          'missing-dependency',
          `section "${plan.id}" depends on "${d}", a heading without an argument kind (add one, e.g. {#${d} .premise})`,
          p.node,
        );
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
  const titleOf = new Map<string, string>(argNodes.map((n) => [n.id, n.title]));

  // ── Phase 2: rebuild ────────────────────────────────────────────────────
  interface Env {
    /** Name of the enclosing construct where notes are not allowed, if any. */
    readonly noNotes: string | null;
  }
  const ROOT_ENV: Env = { noNotes: null };
  let sidenotes = 0;
  let marginnotes = 0;
  let tocs = 0;

  const checkAttributes = (node: MdNode, name: string): Readonly<Record<string, string>> => {
    const attrs = directiveAttributes(node);
    const allowed = BLOCK_ATTRIBUTES[name] ?? [];
    const shown = `${node.type === 'leafDirective' ? '::' : ':::'}${name}`;
    for (const key of Object.keys(attrs)) {
      if (!allowed.includes(key)) {
        const hint = allowed.length > 0 ? ` (allowed: ${allowed.join(', ')})` : '';
        report('error', 'unknown-attribute', `${shown} does not take the attribute "${key}"${hint}`, node);
      }
    }
    return attrs;
  };

  /** Splits a container's `[label]` paragraph off its content. */
  const labelOf = (node: MdNode): { readonly label: MdNode | null; readonly rest: readonly MdNode[] } => {
    const kids = childrenOf(node);
    const first = kids[0];
    return first !== undefined && isLabelParagraph(first)
      ? { label: first, rest: kids.slice(1) }
      : { label: null, rest: kids };
  };

  const noLabel = (node: MdNode, name: string): void => {
    if (labelOf(node).label !== null)
      report('error', 'label-not-allowed', `:::${name} takes no [label]; use label="…"`, node);
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
    const kept = plan.cut === null ? childrenOf(node) : cutChildren(node, plan.cut);
    const kids = rebuildAll(kept, { ...env, noNotes: 'a heading' });
    const previous = node.data?.hProperties ?? {};
    const prevClass = previous['className'];
    const classes = [
      ...(Array.isArray(prevClass) ? prevClass.map(String) : []),
      ...(plan.kind !== null ? ['arg__title'] : []),
    ];
    const hProperties: HastProperties = {
      ...previous,
      id: plan.id,
      className: classes.length > 0 ? classes : undefined,
      dataKind: plan.kind ?? undefined,
      dataDepends: plan.depends.length > 0 ? plan.depends.join(' ') : undefined,
      dataAttrs: plan.cut !== null ? plan.cut.block.trim() : undefined,
    };
    const record: HeadingRecord = { id: plan.id, kind: plan.kind, depends: plan.depends, inToc: plan.inToc };
    const h: MdNode = {
      ...node,
      children: kids,
      data: {
        ...node.data,
        hProperties: Object.fromEntries(Object.entries(hProperties).filter(([, v]) => v !== undefined)),
        [HEADING_RECORD]: record,
        ...(plan.cut !== null ? { [ATTRS_RECORD]: plan.cut.block } : {}),
      },
    };
    if (plan.kind === null) return [h];
    // An argument node: the kind is shown as SHAPE + LABEL above the title, the
    // dependencies as links below it (non-linear navigation through the argument).
    const eyebrow = element(
      'p',
      { className: ['arg__kind'] },
      [
        element('span', { className: ['arg__glyph'] }, [], {
          generated: true,
          extra: { hChildren: [glyphHast(plan.kind)] },
        }),
        text(t(`kind.${plan.kind}`), true),
      ],
      { generated: true },
    );
    const deps = plan.depends.filter((d) => titleOf.has(d));
    const parts =
      deps.length > 0
        ? new Intl.ListFormat(ctx.locale, { type: 'conjunction' }).formatToParts(deps.map((d) => titleOf.get(d) ?? d))
        : [];
    let k = 0;
    const depLinks = parts.map((part): MdNode => {
      if (part.type === 'literal') return text(part.value, true);
      const id = deps[k] ?? '';
      k += 1;
      return link(`#${id}`, [text(part.value, true)], { className: ['arg__dep'] });
    });
    const depsParagraph =
      depLinks.length > 0
        ? [
            element(
              'p',
              { className: ['arg__deps'] },
              [
                element('span', { className: ['arg__deps-label'] }, [text(t('argument.rests'), true)]),
                text(' ', true),
                ...depLinks,
              ],
              { generated: true },
            ),
          ]
        : [];
    return [
      element(
        'hgroup',
        { className: ['arg', `arg--${plan.kind}`], dataKind: plan.kind },
        [eyebrow, h, ...depsParagraph],
        {
          position: node.position,
        },
      ),
    ];
  };

  const note = (node: MdNode, name: 'sidenote' | 'marginnote', env: Env): readonly MdNode[] => {
    if (env.noNotes !== null) {
      report('error', 'note-placement', `:${name} cannot be placed inside ${env.noNotes}`, node);
      return [node];
    }
    if (Object.keys(directiveAttributes(node)).length > 0)
      report('error', 'unknown-attribute', `:${name} takes no attributes`, node);
    if (childrenOf(node).length === 0)
      report('error', 'empty-note', `:${name}[…] needs a text between the brackets`, node);
    const content = rebuildAll(childrenOf(node), { ...env, noNotes: 'another note' });
    if (name === 'sidenote') {
      sidenotes += 1;
      const n = sidenotes;
      return [
        claim(node, 'span', { className: ['sidenote'], dataSidenote: n, style: `--anchor:--${sidenoteId(n)}` }, [
          element('sup', { className: ['sidenote__ref'], id: sidenoteRefId(n) }, [
            link(`#${sidenoteId(n)}`, [text(String(n), true)], {
              className: ['sidenote__link'],
              ariaLabel: t('sidenote.label', { n }),
            }),
          ]),
          element('span', { className: ['sidenote__note'], id: sidenoteId(n), role: 'note' }, [
            element('span', { className: ['sidenote__num'], ariaHidden: 'true' }, [text(String(n), true)], {
              generated: true,
            }),
            ...content,
          ]),
        ]),
      ];
    }
    marginnotes += 1;
    const m = marginnotes;
    return [
      claim(
        node,
        'span',
        {
          className: ['marginnote'],
          dataMarginnote: m,
          dataLabel: t('marginnote.label'),
          style: `--anchor:--${marginnoteId(m)}`,
        },
        [
          element('span', { className: ['marginnote__anchor'], ariaHidden: 'true' }, []),
          element('span', { className: ['marginnote__note'], id: marginnoteId(m), role: 'note' }, content),
        ],
      ),
    ];
  };

  const stretch = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'stretch');
    const { label, rest } = labelOf(node);
    const attrLabel = attrs['label'];
    if (label !== null && attrLabel !== undefined)
      report('error', 'ambiguous-label', ':::stretch has both [label] and label="…"; keep one', node);
    if (label === null && (attrLabel === undefined || attrLabel.trim() === '')) {
      report('error', 'missing-label', ':::stretch needs a label: :::stretch{label="Por que…?"}', node);
    }
    if (rest.length === 0) report('error', 'empty-container', ':::stretch has no content to expand', node);
    const labelText = (label !== null ? visibleText(label, ctx.source) : (attrLabel ?? '')).trim();
    const summary =
      label !== null
        ? element(
            'summary',
            { className: ['stretch__label'] },
            rebuildAll(childrenOf(label), { noNotes: 'a stretchtext label' }),
            {
              position: label.position,
            },
          )
        : element('summary', { className: ['stretch__label'] }, [text(labelText, true)]);
    return [
      claim(node, 'details', { className: ['stretch'], dataLabel: labelText, id: attrs['id'] }, [
        summary,
        element('div', { className: ['stretch__body'] }, rebuildAll(rest, env)),
      ]),
    ];
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
      report(
        'error',
        'scrolly-content',
        '::::scrolly holds an optional first figure (::lab, an image or :::figure) followed only by :::step blocks',
        c,
      );
    }
    if (steps.length === 0) report('error', 'scrolly-content', '::::scrolly needs at least one :::step', node);
    if (figure === null)
      report('warning', 'scrolly-figure', '::::scrolly without a figure: the steps will read as plain text', node);
    const stepNodes = steps.map((s, i) => {
      const sa = checkAttributes(s, 'step');
      noLabel(s, 'step');
      return claim(
        s,
        'div',
        { className: ['scrolly__step'], dataIndex: i, dataState: sa['state'] },
        rebuildAll(childrenOf(s), env),
      );
    });
    const label = attrs['label'];
    const named = label !== undefined && label.trim().length > 0;
    return [
      claim(
        node,
        'ft-scrolly',
        {
          className: ['scrolly'],
          dataSteps: steps.length,
          role: named ? 'group' : undefined,
          ariaLabel: named ? label : undefined,
          id: attrs['id'],
        },
        [
          ...(figure !== null ? [element('div', { className: ['scrolly__figure'] }, rebuild(figure, env))] : []),
          element('div', { className: ['scrolly__steps'] }, stepNodes),
        ],
      ),
    ];
  };

  const horizontal = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'horizontal');
    noLabel(node, 'horizontal');
    const label = (attrs['label'] ?? '').trim();
    if (label === '')
      report(
        'error',
        'missing-label',
        '::::horizontal needs label="…" (it names the scrollable region for assistive technology)',
        node,
      );
    const kids = childrenOf(node).filter((c) => !isLabelParagraph(c));
    const panels = kids.filter((c) => c.type === 'containerDirective' && directiveName(c) === 'panel' && !isClaimed(c));
    for (const c of kids.filter((x) => !panels.includes(x))) {
      report('error', 'horizontal-content', '::::horizontal holds only :::panel blocks', c);
    }
    if (panels.length === 0) report('error', 'horizontal-content', '::::horizontal needs at least one :::panel', node);
    if (panels.length === 1)
      report('warning', 'horizontal-content', '::::horizontal with a single :::panel reads as a plain block', node);
    const n = panels.length;
    const panelNodes = panels.map((p, i) => {
      const pa = checkAttributes(p, 'panel');
      noLabel(p, 'panel');
      const position = t('horizontal.panel', { i: i + 1, n });
      const pl = (pa['label'] ?? '').trim();
      return claim(
        p,
        'div',
        {
          className: ['horizontal__panel'],
          role: 'group',
          ariaLabel: pl.length > 0 ? `${pl} (${position})` : position,
          dataIndex: i,
        },
        rebuildAll(childrenOf(p), env),
      );
    });
    return [
      claim(
        node,
        'ft-horizontal',
        { className: ['horizontal'], dataPanels: n, style: `--panels:${n}`, id: attrs['id'] },
        [
          element('div', { className: ['horizontal__viewport'], role: 'region', ariaLabel: label, tabIndex: 0 }, [
            element('div', { className: ['horizontal__track'] }, panelNodes),
          ]),
          element(
            'p',
            { className: ['horizontal__hint'], ariaHidden: 'true' },
            [text(t('horizontal.hint', { n }), true)],
            { generated: true },
          ),
        ],
      ),
    ];
  };

  const epigraph = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'epigraph');
    const lang = attrs['lang'];
    if (lang !== undefined && !LANG.test(lang))
      report('error', 'unknown-attribute', `:::epigraph lang="${lang}" is not a BCP 47 language tag`, node);
    const kids = childrenOf(node);
    // The source is the [label], or a node the citations stage flagged as such.
    const sourceIndex = kids.findIndex((c) => isLabelParagraph(c) || c.data?.[EPIGRAPH_SOURCE] === true);
    const sourceNode = sourceIndex >= 0 ? kids[sourceIndex] : undefined;
    const attrSource = attrs['source'];
    if (sourceNode !== undefined && isLabelParagraph(sourceNode) && attrSource !== undefined) {
      report('error', 'ambiguous-label', ':::epigraph has both [source] and source="…"; keep one', node);
    }
    const quote = kids.filter((_, i) => i !== sourceIndex);
    if (quote.length === 0) report('error', 'empty-container', ':::epigraph has no quotation', node);
    const caption: readonly MdNode[] =
      sourceNode !== undefined
        ? [
            element(
              'figcaption',
              { className: ['epigraph__source'] },
              rebuildAll(sourceNode.type === 'paragraph' ? childrenOf(sourceNode) : [sourceNode], env),
            ),
          ]
        : attrSource !== undefined && attrSource.trim().length > 0
          ? [element('figcaption', { className: ['epigraph__source'] }, [text(attrSource.trim(), true)])]
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
    if (label !== null && attrLabel !== undefined)
      report('error', 'ambiguous-label', ':::aside has both [title] and label="…"; keep one', node);
    const name = (label !== null ? visibleText(label, ctx.source) : (attrLabel ?? '')).trim();
    const title =
      label !== null
        ? [
            element('p', { className: ['aside__title'] }, rebuildAll(childrenOf(label), env), {
              position: label.position,
            }),
          ]
        : name.length > 0
          ? [element('p', { className: ['aside__title'] }, [text(name, true)])]
          : [];
    return [
      claim(node, 'aside', { className: ['aside'], ariaLabel: name.length > 0 ? name : undefined, id: attrs['id'] }, [
        ...title,
        ...rebuildAll(rest, env),
      ]),
    ];
  };

  const toc = (node: MdNode, env: Env): readonly MdNode[] => {
    const attrs = checkAttributes(node, 'toc');
    tocs += 1;
    if (tocs > 1) report('error', 'toc-duplicate', 'only one ::toc per document', node);
    const depthRaw = attrs['depth'];
    const depth = depthRaw === undefined ? DEFAULT_TOC_DEPTH : Number(depthRaw);
    const valid = Number.isInteger(depth) && depth >= 2 && depth <= 6;
    if (!valid)
      report('error', 'unknown-attribute', `::toc depth="${String(depthRaw)}" must be an integer from 2 to 6`, node);
    const kids = childrenOf(node);
    const title =
      kids.length > 0
        ? element('p', { className: ['toc__title'], id: TOC_TITLE_ID }, rebuildAll(kids, env))
        : element('p', { className: ['toc__title'], id: TOC_TITLE_ID }, [text(t('toc.title'), true)]);
    return [
      claim(node, 'nav', { className: ['toc'], id: TOC_ID, ariaLabelledBy: TOC_TITLE_ID }, [title], {
        [TOC_RECORD]: { depth: valid ? depth : DEFAULT_TOC_DEPTH },
      }),
    ];
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
      if (node.type === 'textDirective' && (name === 'sidenote' || name === 'marginnote')) return note(node, name, env);
      if (node.type === 'leafDirective' && name === 'toc') return toc(node, env);
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
    }
    const inLink = node.type === 'link' || node.type === 'linkReference' || node.data?.hName === 'a';
    return [rebuildChildren(node, inLink ? { ...env, noNotes: 'a link' } : env)];
  }

  return { tree: rebuildChildren(root, ROOT_ENV), diagnostics, graph };
};
