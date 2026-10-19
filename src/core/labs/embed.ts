/**
 * The embed transform (Tree → Tree): `::lab{widget=…}` → the custom element `<ft-lab-<widget>>` with a
 * useful fallback inside, as a pure function over an mdast tree (docs/arquitetura.md §5.5).
 *
 *   ::lab{widget=sampling}                    → <ft-lab-sampling class="lab" data-widget="sampling" …>
 *   ::lab{widget=fourier N=10 wave=sawtooth}  parameters as attributes (src/core/labs/widgets.ts)
 *   ::lab{widget=sampling state="fs=6000"}    or as a state string (src/core/labs/state.ts)
 *
 * The element carries its configuration in data-* attributes — data-widget, data-locale, data-state (the
 * canonical state string), data-href (the lab page) and data-source (the directive exactly as written:
 * information preservation, docs/arquitetura.md §2.4) — and, inside, the no-JS fallback: a localised
 * description of what the lab shows, a note that the interactive version needs JavaScript, and a link
 * to the lab page. The same model renders the widget of the lab page (src/components/labs/LabWidget.astro).
 *
 * Inside a scrolly (`::::scrolly` whose figure is the lab), every `:::step{state}` is checked against the
 * widget's parameters, so a typo in a step fails the build instead of being ignored in the browser.
 *
 * Closed vocabulary: an unknown widget, an unknown attribute, a bad value, a [label], or `:lab`/`:::lab`
 * are errors (the shell fails the build once, listing all of them).
 *
 * Laws (tests/unit/labs/embed.test.ts): idempotence (claimed nodes are left alone); the input tree is
 * never mutated; the directive source is recoverable from data-source.
 */
import type { Position } from 'unist';
import { ok, err, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';
import { parseLocale, type Locale } from '../domain/locale.ts';
import { parseSlug } from '../domain/identifiers.ts';
import {
  childrenOf,
  directiveAttributes,
  directiveName,
  isClaimed,
  OPAQUE_TYPES,
  sourceOf,
  type HastChild,
  type HastElement,
  type HastProperties,
  type MdNode,
} from '../fold/tree.ts';
import catalog from '../i18n/catalogs/labs.ts';
import { translator } from '../i18n/messages.ts';
import { encodeRoute } from '../i18n/routes.ts';
import { checkLabState, parseLabState, parseParamValue, serializeLabState, type LabState } from './state.ts';
import { paramSpec, parseWidget, widgetTag, WIDGETS, type ParamValue, type Widget } from './widgets.ts';

export type Severity = 'error' | 'warning';
/** Same shape as the reading stage's diagnostics (reported by the shell through vfile). */
export interface Diagnostic {
  readonly severity: Severity;
  /** "embeds:<rule>". */
  readonly rule: string;
  readonly message: string;
  readonly position: Position | undefined;
}

/** Where the fallback of a widget links to, in the document's locale. */
export interface LabLink {
  readonly href: string;
  readonly title: string;
}
export type LabLinks = Readonly<Partial<Record<Widget, LabLink>>>;

export interface EmbedContext {
  readonly locale: Locale;
  /** Raw Markdown source (exact directive text for data-source); null for synthetic trees. */
  readonly source: string | null;
  readonly links: LabLinks;
}

export interface EmbedResult {
  readonly tree: MdNode;
  readonly diagnostics: readonly Diagnostic[];
}

// ── The element model (shared by the Markdown stage and the lab page) ─────────

export interface LabElementOptions {
  /** Canonical state string ('' for the defaults). */
  readonly state: string;
  readonly link: LabLink | null;
  /** The directive as written, when the element comes from Markdown. */
  readonly source?: string | null;
  /** The element keeps its state in the URL hash (lab pages only). */
  readonly permalink?: boolean;
  /** Name the element's group is labelled with (the theorem or the lab's title). */
  readonly title?: string | undefined;
}

export interface LabElementModel {
  readonly tag: `ft-lab-${Widget}`;
  /** HTML attributes, in kebab case, ready for an element (absent ones omitted). */
  readonly attributes: Readonly<Record<string, string>>;
  readonly description: string;
  readonly noscript: string;
  readonly link: { readonly href: string; readonly text: string } | null;
}

export const labElementModel = (widget: Widget, locale: Locale, options: LabElementOptions): LabElementModel => {
  const t = translator(catalog, locale);
  const attributes: Record<string, string> = { class: 'lab', 'data-widget': widget, 'data-locale': locale };
  if (options.state !== '') attributes['data-state'] = options.state;
  if (options.link !== null) attributes['data-href'] = options.link.href;
  if (options.permalink === true) attributes['data-permalink'] = '';
  if (options.title !== undefined) attributes['data-title'] = options.title;
  if (options.source !== undefined && options.source !== null) attributes['data-source'] = options.source;
  return {
    tag: widgetTag(widget),
    attributes,
    description: t(`${widget}.fallback`),
    noscript: t('lab.noscript'),
    link:
      options.link === null ? null : { href: options.link.href, text: t('lab.open', { title: options.link.title }) },
  };
};

/** hast property name of an HTML attribute (property-information: data-foo-bar → dataFooBar). */
const propertyName = (attribute: string): string =>
  attribute === 'class'
    ? 'className'
    : attribute.startsWith('data-')
      ? `data${attribute
          .slice(5)
          .split('-')
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join('')}`
      : attribute;

const h = (tagName: string, properties: HastProperties, children: readonly HastChild[]): HastElement => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const txt = (value: string): HastChild => ({ type: 'text', value });

/** The fallback content of the element, as hast. */
export const fallbackHast = (model: LabElementModel): HastElement =>
  h('div', { className: ['lab__fallback'] }, [
    h('p', { className: ['lab__description'] }, [txt(model.description)]),
    h('p', { className: ['lab__noscript'] }, [txt(model.noscript)]),
    ...(model.link === null
      ? []
      : [h('p', { className: ['lab__open'] }, [h('a', { href: model.link.href }, [txt(model.link.text)])])]),
  ]);

/** The element's hast properties (from the kebab-case attributes of the model). */
export const elementProperties = (model: LabElementModel): HastProperties =>
  Object.fromEntries(
    Object.entries(model.attributes).map(([k, v]) => [propertyName(k), k === 'class' ? v.split(' ') : v]),
  );

// ── Lab pages index (where a widget links to) ─────────────────────────────────

export interface LabIndexEntry {
  readonly widget: Widget;
  readonly locale: Locale;
  readonly slug: string;
  readonly title: string;
  readonly draft: boolean;
}

/** Reads the fields the embeds need from a lab's frontmatter (untyped data at the boundary). */
export const parseLabIndexEntry = (frontmatter: unknown): Result<LabIndexEntry, string> => {
  if (typeof frontmatter !== 'object' || frontmatter === null) return err('frontmatter is not a mapping');
  const f = frontmatter as Readonly<Record<string, unknown>>;
  const widget = parseWidget(f['widget']);
  if (!widget.ok) return widget;
  const locale = parseLocale(f['lang']);
  if (!locale.ok) return locale;
  const slug = parseSlug(f['slug']);
  if (!slug.ok) return slug;
  const title = f['title'];
  if (typeof title !== 'string' || title.trim() === '')
    return err(`title must be a non-empty string, got ${show(title)}`);
  const draft = f['draft'];
  if (draft !== undefined && typeof draft !== 'boolean') return err(`draft must be a boolean, got ${show(draft)}`);
  return ok({ widget: widget.value, locale: locale.value, slug: slug.value, title, draft: draft === true });
};

/**
 * The links of one locale: each widget to its published lab page (base-aware, trailing slash). The first
 * published entry wins; drafts never get a link (their pages are not built for production).
 */
export const labLinks = (entries: readonly LabIndexEntry[], locale: Locale, base: string): LabLinks => {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const out: Partial<Record<Widget, LabLink>> = {};
  for (const e of entries) {
    if (e.locale !== locale || e.draft || out[e.widget] !== undefined) continue;
    const slug = parseSlug(e.slug);
    if (!slug.ok) continue;
    out[e.widget] = {
      href: `${prefix}${encodeRoute({ kind: 'lab', slug: slug.value }, locale).slice(1)}`,
      title: e.title,
    };
  }
  return out;
};

// ── The transform ─────────────────────────────────────────────────────────────

/** Attributes of ::lab that are not parameters. */
const RESERVED = ['widget', 'state', 'id'] as const;

const hasClass = (n: MdNode, name: string): boolean => {
  const cls = n.data?.hProperties?.['className'];
  return Array.isArray(cls) && cls.includes(name);
};

/** The :::step nodes of a scrolly (claimed by the reading stage as div.scrolly__step[data-state]). */
const stepStates = (scrolly: MdNode): readonly MdNode[] => {
  const out: MdNode[] = [];
  const go = (n: MdNode): void => {
    if (hasClass(n, 'scrolly__step')) out.push(n);
    else for (const c of childrenOf(n)) go(c);
  };
  for (const c of childrenOf(scrolly)) go(c);
  return out;
};

export const transformEmbeds = (tree: MdNode, ctx: EmbedContext): EmbedResult => {
  const diagnostics: Diagnostic[] = [];
  const report = (severity: Severity, rule: string, message: string, node: MdNode): void => {
    diagnostics.push({ severity, rule: `embeds:${rule}`, message, position: node.position });
  };

  const parseAttributes = (node: MdNode): { readonly widget: Widget; readonly state: LabState } | null => {
    const attrs = directiveAttributes(node);
    const widget = parseWidget(attrs['widget']);
    if (attrs['widget'] === undefined) {
      report('error', 'missing-widget', `::lab needs a widget: ::lab{widget=${WIDGETS.join('|')}}`, node);
      return null;
    }
    if (!widget.ok) {
      report('error', 'unknown-widget', widget.error, node);
      return null;
    }
    const w = widget.value;
    if (childrenOf(node).length > 0) report('error', 'label-not-allowed', '::lab takes no [label]', node);
    const fromState = parseLabState(w, attrs['state'] ?? '');
    if (!fromState.ok) for (const e of fromState.error) report('error', 'invalid-state', `::lab state: ${e}`, node);
    const params: Record<string, ParamValue> = {};
    for (const [key, raw] of Object.entries(attrs)) {
      if ((RESERVED as readonly string[]).includes(key)) continue;
      const spec = paramSpec(w, key);
      if (spec === undefined) {
        report('error', 'unknown-attribute', `::lab{widget=${w}} does not take the attribute "${key}"`, node);
        continue;
      }
      const value = parseParamValue(spec, raw);
      if (!value.ok) report('error', 'invalid-value', value.error, node);
      else if (fromState.ok && Object.hasOwn(fromState.value, key))
        report('error', 'duplicate-param', `"${key}" is given both as an attribute and in state="…"`, node);
      else params[key] = value.value;
    }
    const merged = { ...(fromState.ok ? fromState.value : {}), ...params };
    const checked = checkLabState(w, merged);
    return { widget: w, state: checked.ok ? checked.value : {} };
  };

  const claimLab = (node: MdNode, steps: readonly MdNode[] | null): MdNode => {
    const parsed = parseAttributes(node);
    if (parsed === null) return node;
    const { widget, state } = parsed;
    for (const step of steps ?? []) {
      const raw = step.data?.hProperties?.['dataState'];
      if (typeof raw !== 'string') continue;
      const r = parseLabState(widget, raw);
      if (!r.ok) for (const e of r.error) report('error', 'invalid-step-state', `:::step{state="${raw}"}: ${e}`, step);
    }
    const link = ctx.links[widget] ?? null;
    if (link === null)
      report('warning', 'no-page', `no published ${widget} lab page in ${ctx.locale}: the fallback has no link`, node);
    const id = directiveAttributes(node)['id'];
    const model = labElementModel(widget, ctx.locale, {
      state: serializeLabState(widget, state),
      link,
      title: link?.title,
      source: sourceOf(node, ctx.source) ?? `::lab{widget=${widget}}`,
    });
    return {
      ...node,
      data: {
        ...node.data,
        hName: model.tag,
        hProperties: { ...elementProperties(model), ...(id !== undefined && id !== '' ? { id } : {}) },
        hChildren: [fallbackHast(model)],
      },
    };
  };

  const rebuild = (node: MdNode, steps: readonly MdNode[] | null): MdNode => {
    if (OPAQUE_TYPES.has(node.type)) return node;
    if (directiveName(node) === 'lab') {
      if (isClaimed(node)) return node;
      if (node.type !== 'leafDirective') {
        report('error', 'not-a-leaf', '"lab" is a leaf directive: write ::lab{widget=…} on a line of its own', node);
        return node;
      }
      return claimLab(node, steps);
    }
    const kids = childrenOf(node);
    if (kids.length === 0) return node;
    // A scrolly drives the elements of its figure only (src/islands/elements/ft-scrolly.ts).
    const scrolly = node.data?.hName === 'ft-scrolly' ? stepStates(node) : null;
    const next = kids.map((c) =>
      rebuild(c, scrolly === null ? steps : hasClass(c, 'scrolly__figure') ? scrolly : null),
    );
    return next.every((c, i) => c === kids[i]) ? node : { ...node, children: next };
  };

  return { tree: rebuild(tree, null), diagnostics };
};
