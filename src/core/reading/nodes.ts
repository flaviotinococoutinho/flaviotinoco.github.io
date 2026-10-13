/**
 * Smart constructors for the nodes the reading stages emit.
 *
 * Every emitted node is an ordinary mdast-shaped object whose `data.hName` /
 * `data.hProperties` / `data.hChildren` tell mdast-util-to-hast which element
 * to produce. Nodes that carry text the author did not write (a sidenote
 * number, a translated label, a table of contents) are marked
 * `data.readingGenerated = true`, so the left inverse (recover.ts) can strip
 * them and prove that the author's text survives unchanged.
 */
import type { Position } from 'unist';
import { GENERATED, type HastChild, type HastElement, type HastProperties, type MdNode } from '../fold/tree.ts';
import { GLYPHS, GLYPH_VIEWBOX, type ArgumentKind } from './argument.ts';

/** Node type of wrappers created by the reading stages (rendered through hName). */
export const READING_NODE = 'readingElement';

interface ElementOptions {
  readonly generated?: boolean;
  readonly position?: Position | undefined;
  readonly extra?: Readonly<Record<string, unknown>>;
}

/** Drops undefined values so hast properties stay clean (and exactOptionalPropertyTypes holds). */
export const props = (p: Readonly<Record<string, HastProperties[string]>>): HastProperties =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined));

export const element = (
  hName: string,
  hProperties: HastProperties,
  children: readonly MdNode[],
  options: ElementOptions = {},
): MdNode => ({
  type: READING_NODE,
  children,
  data: {
    hName,
    hProperties: props(hProperties),
    ...(options.generated === true ? { [GENERATED]: true } : {}),
    ...options.extra,
  },
  ...(options.position !== undefined ? { position: options.position } : {}),
});

export const text = (value: string, generated = false): MdNode =>
  generated ? { type: 'text', value, data: { [GENERATED]: true } } : { type: 'text', value };

export const link = (url: string, children: readonly MdNode[], hProperties: HastProperties = {}): MdNode => ({
  type: 'link',
  url,
  title: null,
  children,
  data: { hProperties: props(hProperties) },
});

/** Re-tags an existing node (a directive, typically) as an element, keeping its identity fields. */
export const claim = (
  node: MdNode,
  hName: string,
  hProperties: HastProperties,
  children: readonly MdNode[],
  extra: Readonly<Record<string, unknown>> = {},
): MdNode => ({
  ...node,
  children,
  data: { ...node.data, hName, hProperties: props(hProperties), ...extra },
});

/** SVG glyph of an argument kind as hast (inline, self-contained: works in any view). */
export const glyphHast = (kind: ArgumentKind, className = 'arg-glyph'): HastElement => ({
  type: 'element',
  tagName: 'svg',
  properties: {
    className: [className],
    viewBox: GLYPH_VIEWBOX,
    width: 16,
    height: 16,
    ariaHidden: 'true',
    focusable: 'false',
  },
  children: GLYPHS[kind].map(
    (p): HastChild => ({
      type: 'element',
      tagName: 'path',
      properties: {
        d: p.d,
        fill: p.filled ? 'currentColor' : 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinejoin: 'round',
      },
      children: [],
    }),
  ),
});
