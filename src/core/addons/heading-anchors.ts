/**
 * Heading permalinks (pure hast transform; the rehype stage
 * src/adapters/unified/rehype-heading-anchors.ts is its thin adapter).
 *
 * Every h2–h4 that has an id receives, as its LAST child, a self-link
 *
 *   <ft-heading-anchor><a class="heading-anchor" href="#id"
 *     aria-label="Link para a seção “Título”"></a></ft-heading-anchor>
 *
 * The custom element is the island that copies the URL on click
 * (src/islands/elements/ft-heading-anchor.ts), loaded lazily by the registry when
 * the heading approaches the viewport; until then, and without JavaScript, the
 * anchor is a plain same-page link.
 *
 * The link has no content: the § glyph is CSS generated content with empty
 * alternative text (`content: "§" / ""`, CSS Generated Content Level 3 §1.2), so
 * the heading's text — what search, reader modes, the table of contents and the
 * document outline read — is exactly what the author wrote, and the link's
 * accessible name is its aria-label (WAI-ARIA 1.2, accessible name step 2C).
 *
 * Skipped: headings inside <nav> (table of contents, argument map), visually
 * hidden headings (GFM's footnote label, class "sr-only"; a focusable link in
 * an invisible heading would be a keyboard trap for sighted users), and headings
 * that already carry an anchor (the transform is idempotent).
 *
 * Information preservation (docs/arquitetura.md §2.4): the transform only adds
 * elements; removing every a.heading-anchor gives back the input tree
 * (stripHeadingAnchors ∘ headingAnchors = id, property-tested).
 */
import type { Element, ElementContent, Root, RootContent } from 'hast';

export const ANCHOR_CLASS = 'heading-anchor';
export const ANCHOR_HOST = 'ft-heading-anchor';

const HEADINGS = new Set(['h2', 'h3', 'h4']);
const HIDDEN_CLASSES = new Set(['sr-only', 'visually-hidden']);

const classes = (e: Element): readonly string[] => {
  const c: unknown = e.properties['className'];
  if (Array.isArray(c)) return c.map(String);
  return typeof c === 'string' ? c.split(/\s+/u) : [];
};

const isAnchor = (n: RootContent | ElementContent): boolean =>
  n.type === 'element' && (n.tagName === ANCHOR_HOST || (n.tagName === 'a' && classes(n).includes(ANCHOR_CLASS)));

/**
 * Text of a heading for its label: the text nodes in order, skipping subtrees
 * hidden from assistive technology (aria-hidden: KaTeX's HTML rendering) and TeX
 * annotations (the MathML form already gives the formula's text), white space collapsed.
 */
export const headingText = (e: Element): string => {
  const parts: string[] = [];
  const walk = (n: ElementContent): void => {
    if (n.type === 'text') parts.push(n.value);
    else if (n.type === 'element') {
      const hidden: unknown = n.properties['ariaHidden'];
      if (hidden === true || hidden === 'true' || n.tagName === 'annotation') return;
      n.children.forEach(walk);
    }
  };
  e.children.forEach(walk);
  return parts.join('').replace(/\s+/gu, ' ').trim();
};

/** Fragment of a URL for an id (percent-encoded like the table of contents' links). */
export const fragmentOf = (id: string): string => `#${encodeURIComponent(id)}`;

const anchorFor = (id: string, label: string): Element => ({
  type: 'element',
  tagName: ANCHOR_HOST,
  properties: {},
  children: [
    {
      type: 'element',
      tagName: 'a',
      properties: { className: [ANCHOR_CLASS], href: fragmentOf(id), ariaLabel: label },
      children: [],
    },
  ],
});

/** Adds the permalinks. `label` builds the accessible name from the heading's text. */
export const headingAnchors = (tree: Root, label: (title: string) => string): Root => {
  const visit = <T extends RootContent | ElementContent>(n: T, inNav: boolean): T => {
    if (n.type !== 'element') return n;
    const nav = inNav || n.tagName === 'nav';
    const children = n.children.map((c) => visit(c, nav));
    const id = n.properties['id'];
    const eligible =
      !nav &&
      HEADINGS.has(n.tagName) &&
      typeof id === 'string' &&
      id !== '' &&
      !classes(n).some((c) => HIDDEN_CLASSES.has(c)) &&
      !n.children.some(isAnchor);
    const withAnchor = eligible ? [...children, anchorFor(id, label(headingText(n)))] : children;
    return { ...n, children: withAnchor };
  };
  return { ...tree, children: tree.children.map((c) => visit(c, false)) };
};

/** Left inverse: removes every permalink with its host element (and nothing else). */
export const stripHeadingAnchors = (tree: Root): Root => {
  const visit = <T extends RootContent | ElementContent>(n: T): T =>
    n.type === 'element' ? { ...n, children: n.children.filter((c) => !isAnchor(c)).map(visit) } : n;
  return { ...tree, children: tree.children.filter((c) => !isAnchor(c)).map(visit) };
};
