/**
 * Markup — a tiny, renderer-neutral element tree (hyperscript data).
 *
 * The concept-map scene is built ONCE as data in the core and interpreted by
 * two shells: the remark stage converts it to hast (hastscript), the Astro views
 * serialise it with `renderMarkup`. One description, two outputs, no drift.
 *
 * Serialisation follows the HTML syntax (WHATWG HTML §13.3): text escapes
 * & < > and attribute values escape & and "; elements in the SVG namespace
 * with no children are self-closed (allowed in foreign content), HTML void
 * elements get no end tag. Escaping is injective (proved by a round-trip test),
 * so the serialised text decodes back to exactly the original.
 */

export type AttributeValue = string | number | boolean | null | undefined;
export type Attributes = Readonly<Record<string, AttributeValue>>;

export interface MarkupElement {
  readonly type: 'element';
  readonly tag: string;
  readonly attrs: Attributes;
  readonly children: readonly Markup[];
}
export interface MarkupText {
  readonly type: 'text';
  readonly value: string;
}
export type Markup = MarkupElement | MarkupText;

export const text = (value: string): MarkupText => ({ type: 'text', value });

export const el = (tag: string, attrs: Attributes = {}, ...children: readonly (Markup | string | null | false)[]): MarkupElement => ({
  type: 'element',
  tag,
  attrs,
  children: children.filter((c): c is Markup | string => c !== null && c !== false).map((c) => (typeof c === 'string' ? text(c) : c)),
});

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

export const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const escapeAttribute = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Formats numbers compactly and deterministically (at most 2 decimals, no "-0"). */
export const formatCoordinate = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

const attributeString = (attrs: Attributes): string =>
  Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeAttribute(typeof v === 'number' ? formatCoordinate(v) : String(v))}"`))
    .join('');

export const renderMarkup = (node: Markup, inSvg = false): string => {
  if (node.type === 'text') return escapeText(node.value);
  const svg = inSvg || node.tag === 'svg';
  const open = `<${node.tag}${attributeString(node.attrs)}`;
  if (svg && node.children.length === 0) return `${open} />`;
  if (!svg && VOID.has(node.tag)) return `${open}>`;
  return `${open}>${node.children.map((c) => renderMarkup(c, svg && node.tag !== 'foreignObject')).join('')}</${node.tag}>`;
};

/** Concatenated text content (what a reader or a word counter sees). */
export const textContent = (node: Markup): string =>
  node.type === 'text' ? node.value : node.children.map(textContent).join('');
