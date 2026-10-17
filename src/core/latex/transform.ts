/**
 * Transform: the pure core of the remark stage "latex" (mdast → mdast).
 *
 * Mirrors LaTeX's two-pass reference mechanism (Lamport, "LaTeX: A Document
 * Preparation System", 2nd ed., §4.2 — the .aux file):
 *
 *   pass 1 (fold, document order)  numbers environments (one shared counter,
 *          as `\newtheorem{lemma}[theorem]`), figures (one counter per ABNT
 *          kind) and labelled display equations; builds the label table and
 *          validates the closed directive grammar;
 *   pass 2 (map, copy-on-write)    renders environments, figures and
 *          equations, and resolves every `:ref`, `:eqref`, `\ref`, `\eqref`
 *          against the complete table — so forward references work.
 *
 * Purity: the input tree is never mutated. Unchanged subtrees are shared with
 * the output (persistent-structure style); changed nodes are fresh copies.
 * Problems are returned as diagnostics, never thrown.
 *
 * Injectivity (docs/arquitetura.md §2.4): generated text (heads, captions,
 * reference texts) is added as `latexInline`/`latexBlock` structure whose
 * source is recoverable from data-* attributes (data-label, data-tex) and
 * classes; author text is never altered.
 */
import type { Properties } from 'hast';
import type { Code, Link, Nodes, Paragraph, Parent, PhrasingContent, Root, RootContent, Table } from 'mdast';
import type { Position } from 'unist';
import { parseLabel, type Label } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import {
  captionLabel,
  envName,
  equationName,
  eqrefText,
  message,
  proofOfTemplate,
  refText,
  targetNumber,
  type Segment,
} from './format.ts';
import { anonymousId, labelToId, partId } from './label-codec.ts';
import { smartPunctuation } from './smart-punctuation.ts';
import {
  appendTag,
  extractLabels,
  findTag,
  hasLabel,
  mathRefText,
  replaceRefs,
  starAutoNumbered,
  type MathRef,
} from './math-transform.ts';
import {
  ENV_ATTRIBUTES,
  ENV_STYLE,
  FIGURE_ATTRIBUTES,
  FIGURE_DIRECTIVE,
  PROOF_ATTRIBUTES,
  isEnvKind,
  isFigureKind,
  isRefDirective,
  isTheoremKind,
  type Diagnostic,
  type DiagnosticRule,
  type EnvKind,
  type FigureKind,
  type LabelEntry,
  type Target,
} from './model.ts';
import {
  directiveLabelSource,
  hasBracketLabel,
  hasChildren,
  isClaimed,
  isOpaque,
  latexBlock,
  latexInline,
  sourceOf,
  text,
  withMathValue,
  type ContainerDirective,
  type Directive,
  type DisplayMath,
  type InlineMath,
  type TextDirective,
} from './nodes.ts';

export interface TransformOptions {
  readonly locale: Locale;
  /** The Markdown source the tree was parsed from (file.value); lets labels be sliced verbatim. */
  readonly source?: string;
}

/** JSON-serialisable summary of the label table, exported as frontmatter.crossrefs. */
export interface Crossref {
  readonly label: string;
  readonly id: string;
  readonly type: Target['type'];
  readonly kind: string;
  readonly number?: string;
  readonly title?: string;
}

export interface TransformResult {
  readonly tree: Root;
  readonly labels: readonly LabelEntry[];
  readonly crossrefs: readonly Crossref[];
  /** The document contains math that KaTeX will render (pages must load MathAssets). */
  readonly hasMath: boolean;
  /** The output contains catalog text (environment heads, captions, reference texts). */
  readonly localized: boolean;
  readonly diagnostics: readonly Diagnostic[];
}

interface EnvItem {
  readonly node: ContainerDirective;
  readonly kind: EnvKind;
  readonly id: string;
  readonly headId: string;
  readonly label: Label | undefined;
  readonly number: string | undefined;
  readonly title: readonly PhrasingContent[] | undefined;
  /** The `title="…"` text as written, when typographic punctuation changed it (kept in data-title). */
  readonly titleSource: string | undefined;
  readonly body: readonly Nodes[];
  readonly of: Label | undefined;
}

interface FigureItem {
  readonly kind: FigureKind;
  readonly id: string;
  readonly captionId: string;
  readonly label: Label | undefined;
  readonly number: string;
  readonly title: readonly PhrasingContent[];
  readonly titleSource: string | undefined;
  readonly source: string | undefined;
  /** The `source="…"` text as written, when typographic punctuation changed it (kept in data-source). */
  readonly sourceSource: string | undefined;
  readonly body: readonly Nodes[];
}

interface EquationItem {
  readonly label: Label;
  readonly id: string;
  readonly number: string;
  /** Formula without the `\label`, ready for KaTeX (author `\tag` kept). */
  readonly tex: string;
  readonly explicitTag: boolean;
}

const isLabelParagraph = (node: Nodes): node is Paragraph =>
  node.type === 'paragraph' && node.data?.directiveLabel === true;

/**
 * A closing fence (":::") left over as text: remark-directive closes the
 * OUTERMOST open container whose fence is not longer than the closing one, so
 * ":::theorem … :::proof … ::: … :::" ends the theorem at the first ":::" and
 * leaves the second as text (its own paragraph, or a lazy continuation line of
 * the previous one) — the classic nesting mistake.
 *
 * Only a line that is nothing but a colon run qualifies, and only when the
 * author wrote the run unescaped: `\:::` (or `&#58;::`) is the escape hatch for
 * prose, and the backslash is gone from the text value, so the check reads the
 * source. Without a source the value decides.
 */
const FENCE_LINE = /^[ \t]*(:{3,})[ \t]*$/m;
/** A colon run of three or more that starts unescaped (not after `\` or another colon). */
const UNESCAPED_RUN = /(?<![\\:]):{3,}/;
const strayFence = (node: Nodes, source: string | undefined): string | undefined => {
  if (node.type !== 'paragraph') return undefined;
  for (const child of node.children) {
    if (child.type !== 'text') continue;
    const fence = FENCE_LINE.exec(child.value)?.[1];
    if (fence === undefined) continue;
    const raw = sourceOf(child, source);
    if (raw === undefined || UNESCAPED_RUN.test(raw)) return fence;
  }
  return undefined;
};

const attributesOf = (node: Directive): Readonly<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.attributes ?? {})) out[key] = value ?? '';
  return out;
};

const lineOf = (position: Position | undefined): string => (position === undefined ? '?' : String(position.start.line));

export const transformLatex = (tree: Root, options: TransformOptions): TransformResult => {
  const { locale, source } = options;
  const diagnostics: Diagnostic[] = [];
  const report = (severity: Diagnostic['severity'], rule: DiagnosticRule, reason: string, node?: Nodes): void => {
    diagnostics.push(
      node?.position === undefined
        ? { severity, rule, message: reason }
        : { severity, rule, message: reason, position: node.position },
    );
  };

  const table = new Map<string, LabelEntry>();
  const envs = new Map<Nodes, EnvItem>();
  const figures = new Map<Nodes, FigureItem>();
  const equations = new Map<Nodes, EquationItem>();
  let theoremCounter = 0;
  let equationCounter = 0;
  const figureCounters: Record<FigureKind, number> = { figure: 0, chart: 0, frame: 0, table: 0 };
  let envOrdinal = 0;
  let figureOrdinal = 0;
  let hasMath = false;
  let localized = false;

  // ── shared helpers ────────────────────────────────────────────────────────

  const checkAttributes = (node: Directive, allowed: readonly string[]): void => {
    for (const key of Object.keys(attributesOf(node))) {
      if (!allowed.includes(key)) {
        report(
          'error',
          'unknown-attribute',
          `unknown attribute "${key}" on :${node.name} (allowed: ${allowed.join(', ')})`,
          node,
        );
      }
    }
  };

  const labelAttribute = (node: Directive, key: string): Label | undefined => {
    const raw = attributesOf(node)[key];
    if (raw === undefined || raw === '') return undefined;
    const parsed = parseLabel(raw);
    if (parsed.ok) return parsed.value;
    report(
      'error',
      'invalid-label',
      `${parsed.error} on :${node.name} (expected prefix:name, e.g. thm:sampling)`,
      node,
    );
    return undefined;
  };

  const register = (label: Label, target: Target, node: Nodes): void => {
    const previous = table.get(label);
    if (previous !== undefined) {
      report(
        'error',
        'duplicate-label',
        `duplicate label "${label}" (first defined on line ${lineOf(previous.position)})`,
        node,
      );
      return;
    }
    table.set(label, {
      label,
      id: labelToId(label),
      target,
      ...(node.position === undefined ? {} : { position: node.position }),
    });
  };

  /**
   * Text from an attribute, with the typographic punctuation SmartyPants gave the body (it never
   * sees attributes); `source` is the author's text when that changed it, for a data-* attribute.
   */
  const typeset = (attribute: string): { readonly value: string; readonly source: string | undefined } => {
    const value = smartPunctuation(attribute);
    return { value, source: value === attribute ? undefined : attribute };
  };

  /**
   * Title from `title="…"` or from the directive label `[…]` (rich text); both is an error. The
   * label went through SmartyPants with the body; the attribute gets the same punctuation here.
   */
  const titleOf = (
    node: ContainerDirective,
  ): { readonly title: readonly PhrasingContent[] | undefined; readonly source: string | undefined } => {
    const attribute = attributesOf(node)['title'];
    const first = node.children[0];
    const fromLabel = first !== undefined && isLabelParagraph(first) ? first.children : undefined;
    const fromAttribute = attribute === undefined || attribute === '' ? undefined : typeset(attribute);
    if (fromLabel !== undefined && fromAttribute !== undefined) {
      report('error', 'duplicate-title', `:${node.name} has both a [label] and title=""; keep one`, node);
    }
    return fromAttribute === undefined
      ? { title: fromLabel, source: undefined }
      : { title: [text(fromAttribute.value)], source: fromAttribute.source };
  };

  const bodyOf = (node: ContainerDirective): readonly Nodes[] =>
    node.children.filter((child) => !isLabelParagraph(child));

  /** `:ref[…]` / `:eqref[…]` written with brackets and not claimed by an earlier stage. */
  const isReference = (node: Nodes): node is TextDirective =>
    node.type === 'textDirective' && !isClaimed(node) && isRefDirective(node.name) && hasBracketLabel(node, source);

  // ── pass 1: number and validate (pre-order fold) ──────────────────────────

  const registerEnv = (node: ContainerDirective, kind: EnvKind): void => {
    localized = true;
    checkAttributes(node, kind === 'proof' ? PROOF_ATTRIBUTES : ENV_ATTRIBUTES);
    envOrdinal += 1;
    const label = labelAttribute(node, 'id');
    const of = kind === 'proof' ? labelAttribute(node, 'of') : undefined;
    const { title, source: titleSource } = titleOf(node);
    if (kind === 'proof' && of !== undefined && title !== undefined) {
      report('error', 'duplicate-title', ':proof takes either of="…" or a title, not both', node);
    }
    const number = isTheoremKind(kind) ? String((theoremCounter += 1)) : undefined;
    const id = label === undefined ? anonymousId('env', envOrdinal) : labelToId(label);
    if (label !== undefined) {
      const target: Target =
        isTheoremKind(kind) && number !== undefined
          ? { type: 'environment', kind, number }
          : { type: 'unnumbered', kind: kind === 'proof' ? 'proof' : 'remark' };
      register(label, target, node);
    }
    envs.set(node, {
      node,
      kind,
      id,
      headId: partId(id, 'head'),
      label,
      number,
      title,
      titleSource,
      body: bodyOf(node),
      of,
    });
  };

  const registerFigure = (node: ContainerDirective): void => {
    localized = true;
    checkAttributes(node, FIGURE_ATTRIBUTES);
    figureOrdinal += 1;
    const attributes = attributesOf(node);
    const rawKind = attributes['kind'] ?? 'figure';
    const kind: FigureKind = isFigureKind(rawKind) ? rawKind : 'figure';
    if (!isFigureKind(rawKind)) {
      report(
        'error',
        'invalid-kind',
        `invalid figure kind "${rawKind}" (expected figure, chart, frame or table)`,
        node,
      );
    }
    const label = labelAttribute(node, 'id');
    const { title, source: titleSource } = titleOf(node);
    if (title === undefined) {
      report(
        'error',
        'missing-title',
        ':::figure needs a title (ABNT NBR 14724 §5.8: designation, number and title)',
        node,
      );
    }
    const rawSource = attributes['source']?.trim();
    const source = rawSource === undefined || rawSource === '' ? undefined : typeset(rawSource);
    if (source === undefined) {
      report(
        'warning',
        'missing-source',
        ':::figure has no source="…" (ABNT NBR 14724 §5.8: "Fonte" is required, even for own work)',
        node,
      );
    }
    const body = bodyOf(node);
    if (kind === 'table' && !body.some((child) => child.type === 'table')) {
      report('error', 'missing-table', ':::figure{kind="table"} must contain a Markdown (GFM) table', node);
    }
    figureCounters[kind] += 1;
    const number = String(figureCounters[kind]);
    const id = label === undefined ? anonymousId('figure', figureOrdinal) : labelToId(label);
    if (label !== undefined) register(label, { type: 'figure', kind, number }, node);
    figures.set(node, {
      kind,
      id,
      captionId: partId(id, 'caption'),
      label,
      number,
      title: title ?? [],
      titleSource,
      source: source?.value,
      sourceSource: source?.source,
      body,
    });
  };

  const registerDisplayMath = (node: DisplayMath): void => {
    const scan = extractLabels(node.value);
    if (scan.malformed > 0) {
      report('error', 'invalid-label', '\\label in display math needs a braced argument: \\label{eq:name}', node);
    }
    if (scan.labels.length > 1) {
      report(
        'error',
        'multiple-labels',
        `display math has ${String(scan.labels.length)} \\label commands; KaTeX can tag one number per display`,
        node,
      );
    }
    const raw = scan.labels[0];
    if (raw === undefined) return;
    const parsed = parseLabel(raw);
    if (!parsed.ok) {
      report('error', 'invalid-label', `${parsed.error} in \\label (expected prefix:name, e.g. eq:fourier)`, node);
      return;
    }
    const tag = findTag(scan.tex);
    if (tag !== undefined && /[\\{}$^_]/.test(tag.text)) {
      report(
        'warning',
        'complex-tag',
        `\\tag{${tag.text}} contains TeX markup; references to "${parsed.value}" will show it verbatim`,
        node,
      );
    }
    const number = tag === undefined ? String((equationCounter += 1)) : tag.text;
    register(parsed.value, { type: 'equation', number }, node);
    equations.set(node, {
      label: parsed.value,
      id: labelToId(parsed.value),
      number,
      tex: scan.tex,
      explicitTag: tag !== undefined,
    });
  };

  /**
   * `fenced`: the node sits inside a container directive or after one among its
   * siblings — the only places where a ":::" line can be a container closed early.
   * Elsewhere (a document without containers) such a line is prose.
   */
  const collect = (node: Nodes, inContainer: boolean, fenced: boolean): void => {
    // rehype-katex ≥ 7 also renders ```math fences (class language-math, which
    // Shiki is told to skip): they need the KaTeX stylesheet, but their content
    // stays opaque to this stage (no \label, no \ref there; see docs/guia-latex.md).
    if (node.type === 'code' && node.lang === 'math') {
      hasMath = true;
      localized = true;
    }
    if (isOpaque(node)) return;
    if (node.type === 'containerDirective' && !isClaimed(node)) {
      if (isEnvKind(node.name)) registerEnv(node, node.name);
      else if (node.name === FIGURE_DIRECTIVE) registerFigure(node);
    } else if (node.type === 'math') {
      hasMath = true;
      localized = true; // the scroll box is named from the catalog (see scrollBox)
      registerDisplayMath(node);
    } else if (node.type === 'inlineMath') {
      hasMath = true;
      if (hasLabel(node.value)) {
        report(
          'error',
          'inline-label',
          '\\label is not allowed in inline math: KaTeX cannot \\tag inline formulas — put the formula in its own $$ block',
          node,
        );
      }
    } else if (isReference(node)) {
      localized = true;
    } else if (fenced) {
      const fence = strayFence(node, source);
      if (fence !== undefined) {
        report(
          'error',
          'stray-fence',
          `stray "${fence}" line: a container closed early. When nesting, the OUTER fence needs ` +
            `more colons (::::theorem … :::proof … ::: … ::::); write \\${fence} to keep it as text`,
          node,
        );
      }
    }
    if (!hasChildren(node)) return;
    const inside = inContainer || node.type === 'containerDirective';
    let afterContainer = false;
    for (const child of node.children as readonly Nodes[]) {
      collect(child, inside, inside || afterContainer);
      if (child.type === 'containerDirective') afterContainer = true;
    }
  };

  collect(tree, false, false);

  // ── pass 2: render and resolve (copy-on-write map) ────────────────────────

  const kindClass = (target: Target): string => (target.type === 'equation' ? 'equation' : target.kind);

  const xref = (label: Label, target: Target, display: string): Link => ({
    type: 'link',
    url: `#${labelToId(label)}`,
    children: [{ type: 'text', value: display }],
    data: { hProperties: { className: ['xref', `xref--${kindClass(target)}`], dataLabel: label } },
  });

  /**
   * A resolved reference. Inside the author's own link it cannot be a link too: `<a>` admits no
   * interactive content (HTML Living Standard §4.5.1), and a parser closes the outer link at the
   * nested one, cutting the author's link short. There it is the same text and markup as a
   * `span.xref`, so the author's link keeps every word.
   */
  const reference = (label: Label, target: Target, display: string, inLink: boolean): PhrasingContent =>
    inLink
      ? latexInline('xref', { className: ['xref', `xref--${kindClass(target)}`], dataLabel: label }, [text(display)])
      : xref(label, target, display);

  const lookup = (raw: string, node: Nodes): { readonly label: Label; readonly entry: LabelEntry } | undefined => {
    const parsed = parseLabel(raw);
    if (!parsed.ok) {
      report('error', 'invalid-label', `${parsed.error} in reference (expected prefix:name)`, node);
      return undefined;
    }
    const entry = table.get(parsed.value);
    if (entry === undefined) {
      report(
        'error',
        'unknown-label',
        `unknown label "${parsed.value}" (no environment, figure or equation defines it)`,
        node,
      );
      return undefined;
    }
    return { label: parsed.value, entry };
  };

  const renderRef = (node: TextDirective, inLink: boolean): RootContent => {
    const raw = directiveLabelSource(node, source).trim();
    if (Object.keys(attributesOf(node)).length > 0) {
      report('error', 'unknown-attribute', `:${node.name}[…] takes no attributes`, node);
    }
    const found = lookup(raw, node);
    if (found === undefined) return node;
    const { label, entry } = found;
    if (node.name === 'eqref') {
      const number = targetNumber(entry.target);
      if (number === undefined) {
        report('error', 'unnumbered-ref', `"${label}" is unnumbered and cannot be referenced`, node);
        return node;
      }
      if (entry.target.type !== 'equation') {
        report('warning', 'eqref-target', `:eqref[${label}] points to a ${entry.target.kind}; use :ref`, node);
      }
      return reference(label, entry.target, eqrefText(locale, number), inLink);
    }
    const display = refText(locale, entry.target);
    if (display === undefined) {
      report('error', 'unnumbered-ref', `"${label}" is unnumbered and cannot be referenced`, node);
      return node;
    }
    return reference(label, entry.target, display, inLink);
  };

  const resolveMath = (tex: string, node: Nodes): string =>
    replaceRefs(tex, (ref: MathRef) => {
      const found = lookup(ref.label, node);
      if (found === undefined) return undefined;
      const number = targetNumber(found.entry.target);
      if (number === undefined) {
        report('error', 'unnumbered-ref', `"${found.label}" is unnumbered and cannot be referenced`, node);
        return undefined;
      }
      return mathRefText(ref.command, number);
    });

  /**
   * A box that scrolls horizontally when its content is wider than the column (a long
   * display, a wide table) must be reachable from the keyboard — WCAG 2.1.1, axe rule
   * scrollable-region-focusable — so it is focusable and, being a tab stop, named:
   * `tabindex="0"`, `role="group"` and a label (WAI-ARIA APG, "scrollable region").
   */
  const scrollBox = (name: Properties): Properties => ({ tabIndex: 0, role: 'group', ...name });

  /** "Equação (3)" for a numbered display (the author's \tag included), else "Equação". */
  const equationLabel = (number: string | undefined): string =>
    number === undefined ? equationName(locale) : (refText(locale, { type: 'equation', number }) ?? '');

  /**
   * Every display goes in a div.equation — its horizontal scroll container (latex.css) —
   * whether or not its TeX changes; the formula itself is left as written unless numbered
   * or referencing (then the original is kept in data-tex).
   */
  const renderDisplayMath = (node: DisplayMath): RootContent => {
    const item = equations.get(node);
    // Only this layer numbers equations: KaTeX's own counter is switched off (see starAutoNumbered).
    const body = starAutoNumbered(item === undefined ? node.value : item.tex);
    const tagged = item === undefined || item.explicitTag ? body : appendTag(body, item.number);
    const tex = resolveMath(tagged, node);
    const properties: Properties = {
      className: ['equation'],
      ...(item === undefined ? {} : { id: item.id, dataLabel: item.label }),
      dataTex: node.value,
      ...scrollBox({ ariaLabel: equationLabel(item?.number ?? findTag(node.value)?.text) }),
    };
    return latexBlock('equation', 'div', properties, [tex === node.value ? node : withMathValue(node, tex)]);
  };

  /** A ```math fence renders as a display too (rehype-katex); its content stays opaque here. */
  const renderMathFence = (node: Code): RootContent =>
    latexBlock('equation', 'div', { className: ['equation'], ...scrollBox({ ariaLabel: equationLabel(undefined) }) }, [
      node,
    ]);

  const renderInlineMath = (node: InlineMath): RootContent => {
    if (hasLabel(node.value)) return node;
    const tex = resolveMath(node.value, node);
    if (tex === node.value) return node;
    return latexInline('math-source', { className: ['math-source'], dataTex: node.value }, [withMathValue(node, tex)]);
  };

  const fill = (template: readonly Segment[], slot: (name: string) => PhrasingContent): PhrasingContent[] =>
    template.map((segment) => (segment.type === 'text' ? text(segment.value) : slot(segment.name)));

  const headContent = (item: EnvItem, title: readonly PhrasingContent[] | undefined): PhrasingContent[] => {
    const name = (children: readonly PhrasingContent[]): PhrasingContent =>
      latexInline('env-name', { className: ['env__name'] }, children);
    const titleProperties: Properties = {
      className: ['env__title'],
      ...(item.titleSource === undefined ? {} : { dataTitle: item.titleSource }),
    };
    const note = (): PhrasingContent[] =>
      title === undefined
        ? []
        : [text(' '), latexInline('env-title', titleProperties, [text('('), ...title, text(')')])];
    if (item.kind === 'proof') {
      // \begin{proof}[Esboço]: the author's title REPLACES the name (amsthm).
      if (title !== undefined) return [name([latexInline('env-title', titleProperties, title)]), text('.')];
      if (item.of !== undefined) {
        const found = lookup(item.of, item.node);
        if (found !== undefined && found.entry.target.type === 'environment') {
          const target = found.entry.target;
          const display = refText(locale, target) ?? '';
          const phrase = fill(proofOfTemplate(locale, target.kind), () => xref(found.label, target, display));
          return [name(phrase), text('.')];
        }
        if (found !== undefined) {
          report(
            'error',
            'proof-target',
            `:proof of="${item.of}" must name a numbered theorem-like environment`,
            item.node,
          );
        }
      }
      return [name([text(envName(locale, 'proof'))]), text('.')];
    }
    const number =
      item.number === undefined
        ? []
        : [text(' '), latexInline('env-number', { className: ['env__number'] }, [text(item.number)])];
    return [name([text(envName(locale, item.kind))]), ...number, ...note(), text('.')];
  };

  const qed = (): PhrasingContent =>
    latexInline('qed', { className: ['qed'] }, [
      latexInline('qed-mark', { ariaHidden: 'true' }, [text('∎')]),
      latexInline('qed-text', { className: ['visually-hidden'] }, [text(message(locale, 'proof.end'))]),
    ]);

  /** amsthm puts the tombstone at the end of the last paragraph, or on its own line after a display. */
  const withQed = (body: readonly RootContent[]): RootContent[] => {
    const last = body[body.length - 1];
    if (last?.type === 'paragraph') {
      return [...body.slice(0, -1), { ...last, children: [...last.children, qed()] }];
    }
    return [...body, { type: 'paragraph', data: { hProperties: { className: ['qed-line'] } }, children: [qed()] }];
  };

  /**
   * Titles as rendered (pass 2: references resolved), by label — the `title` of the label
   * table and of frontmatter.crossrefs (see {@link titleText}).
   */
  const titles = new Map<Label, string>();
  const recordTitle = (label: Label | undefined, title: readonly PhrasingContent[] | undefined): void => {
    if (label !== undefined && title !== undefined) titles.set(label, titleText(title, source));
  };

  const renderEnv = (node: ContainerDirective, item: EnvItem): RootContent => {
    const title = item.title?.map((child) => mapNode(child, false) as PhrasingContent);
    recordTitle(item.label, title);
    const head: Paragraph = {
      type: 'paragraph',
      data: { hProperties: { className: ['env__head'], id: item.headId } },
      children: headContent(item, title),
    };
    const body = item.body.map((child) => mapNode(child, false)) as RootContent[];
    const content = item.kind === 'proof' ? withQed(body) : body;
    const properties: Properties = {
      // Kind first, then amsthm style (deduplicated: definition/remark/proof name their own style).
      className: [...new Set(['env', `env--${item.kind}`, `env--${ENV_STYLE[item.kind]}`])],
      id: item.id,
      ...(item.label === undefined ? {} : { dataLabel: item.label }),
      ariaLabelledBy: [item.headId],
    };
    return {
      ...node,
      children: [head, ...content] as ContainerDirective['children'],
      data: { ...node.data, hName: 'section', hProperties: properties },
    };
  };

  const renderFigure = (node: ContainerDirective, item: FigureItem): RootContent => {
    const title = item.title.map((child) => mapNode(child, false) as PhrasingContent);
    recordTitle(item.label, title);
    const caption = latexBlock('figure-caption', 'figcaption', { className: ['figure__caption'], id: item.captionId }, [
      latexInline('figure-label', { className: ['figure__label'] }, [
        text(captionLabel(locale, item.kind, item.number)),
      ]),
      text(message(locale, 'caption.separator')),
      latexInline(
        'figure-title',
        { className: ['figure__title'], ...(item.titleSource === undefined ? {} : { dataTitle: item.titleSource }) },
        title,
      ),
    ]);
    let labelled = false;
    const body = item.body.map((child): RootContent => {
      const mapped = mapNode(child, false) as RootContent;
      if (item.kind !== 'table' || labelled || mapped.type !== 'table') return mapped;
      labelled = true;
      const table: Table = {
        ...mapped,
        data: { ...mapped.data, hProperties: { ...mapped.data?.hProperties, ariaLabelledBy: [item.captionId] } },
      };
      // The table scrolls in its own box, so the caption above and the source below stay in place.
      return latexBlock(
        'table-scroll',
        'div',
        { className: ['figure__scroll'], ...scrollBox({ ariaLabelledBy: [item.captionId] }) },
        [table],
      );
    });
    const sourceParagraph: Paragraph[] =
      item.source === undefined
        ? []
        : [
            {
              type: 'paragraph',
              data: {
                hProperties: {
                  className: ['figure__source'],
                  ...(item.sourceSource === undefined ? {} : { dataSource: item.sourceSource }),
                },
              },
              children: [
                latexInline('figure-source-label', { className: ['figure__source-label'] }, [
                  text(message(locale, 'figure.source')),
                ]),
                text(` ${item.source}`),
              ],
            },
          ];
    const properties: Properties = {
      className: ['figure', `figure--${item.kind}`],
      id: item.id,
      ...(item.label === undefined ? {} : { dataLabel: item.label }),
    };
    return {
      ...node,
      children: [caption, ...body, ...sourceParagraph] as ContainerDirective['children'],
      data: { ...node.data, hName: 'figure', hProperties: properties },
    };
  };

  /** `inLink`: some ancestor is a link (references inside it must not be links themselves). */
  const mapParent = <P extends Parent>(node: P, inLink: boolean): P => {
    const within = inLink || node.type === 'link' || node.type === 'linkReference';
    const children = (node.children as readonly Nodes[]).map((child) => mapNode(child, within));
    return children.every((child, i) => child === node.children[i]) ? node : { ...node, children };
  };

  /**
   * Structural map: four node types are rewritten, every other parent is
   * rebuilt only if a descendant changed, leaves and opaque nodes are shared.
   * (Not a case analysis over the closed mdast union, hence no switch.)
   */
  function mapNode(node: Nodes, inLink: boolean): Nodes {
    if (node.type === 'code' && node.lang === 'math') return renderMathFence(node);
    if (isOpaque(node)) return node;
    if (node.type === 'containerDirective') {
      const env = envs.get(node);
      if (env !== undefined) return renderEnv(node, env);
      const figure = figures.get(node);
      return figure === undefined ? mapParent(node, inLink) : renderFigure(node, figure);
    }
    if (node.type === 'textDirective') return isReference(node) ? renderRef(node, inLink) : mapParent(node, inLink);
    if (node.type === 'math') return renderDisplayMath(node);
    if (node.type === 'inlineMath') return renderInlineMath(node);
    return hasChildren(node) ? mapParent(node, inLink) : node;
  }

  const output = mapParent(tree, false);
  const labels = [...table.values()].map((entry): LabelEntry => {
    const title = titles.get(entry.label);
    return title === undefined ? entry : { ...entry, title };
  });
  return {
    tree: output,
    labels,
    crossrefs: labels.map(toCrossref),
    hasMath,
    localized,
    diagnostics,
  };
};

/**
 * Plain reading text of a RENDERED title, for the label table and frontmatter.crossrefs (lists
 * of illustrations, NBR 14724 §4.2.1.9–4.2.1.11): what the head or caption shows. References
 * read as their resolved text ("Lema 1"); inline math keeps its TeX (references inside it
 * resolved) between the site's `$$` delimiters, so a list can show it as written or render it
 * again; text directives no stage claimed ("10:30") read as their source, which is what the
 * integrity stage will restore; footnote marks are left out.
 */
const titleText = (nodes: readonly Nodes[], source: string | undefined): string =>
  nodes
    .map((node): string => {
      if (node.type === 'inlineMath') return `$$${node.value}$$`;
      if (node.type === 'footnoteReference') return '';
      if (node.type === 'break') return ' ';
      if (node.type === 'textDirective' && !isClaimed(node)) {
        return (
          sourceOf(node, source) ??
          `:${node.name}${node.children.length > 0 ? `[${titleText(node.children, source)}]` : ''}`
        );
      }
      if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
      if ('value' in node && typeof node.value === 'string') return node.value;
      return hasChildren(node) ? titleText(node.children as readonly Nodes[], source) : '';
    })
    .join('');

const toCrossref = (entry: LabelEntry): Crossref => {
  const number = targetNumber(entry.target);
  return {
    label: entry.label,
    id: entry.id,
    type: entry.target.type,
    kind: entry.target.type === 'equation' ? 'equation' : entry.target.kind,
    ...(number === undefined ? {} : { number }),
    ...(entry.title === undefined ? {} : { title: entry.title }),
  };
};
