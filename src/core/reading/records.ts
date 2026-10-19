/**
 * Private records the reading stage leaves on mdast nodes (`node.data.*`) for
 * the stages that run after it (meta fold, table of contents) and for the
 * left inverse (recover.ts). They never reach the HTML: mdast-util-to-hast
 * only reads hName / hProperties / hChildren.
 */
import { ARGUMENT_KINDS, glyphSymbolId, type ArgumentKind } from './argument.ts';

/** What the reading stage records on every heading it processed. */
export interface HeadingRecord {
  readonly id: string;
  readonly kind: ArgumentKind | null;
  readonly depends: readonly string[];
  /** Whether the heading belongs to the main flow (and so to the table of contents). */
  readonly inToc: boolean;
}

/** `data.readingHeading`: HeadingRecord. */
export const HEADING_RECORD = 'readingHeading';
/** `data.readingToc`: { depth } on the ::toc placeholder, filled by the meta stage. */
export const TOC_RECORD = 'readingToc';
/** `data.readingAttrs`: the exact attribute block removed from a heading title. */
export const ATTRS_RECORD = 'readingAttrs';
/** `data.readingPermutation`: original reading order of a node's children. */
export const PERMUTATION_RECORD = 'readingPermutation';
/**
 * `data.epigraphSource = true`: contract with the citations stage (which runs
 * BEFORE reading). A child of an `:::epigraph` carrying this flag is its
 * source line (e.g. the rendered citation of `source="@key"`); the reading
 * stage moves it into the <figcaption> unchanged.
 */
export const EPIGRAPH_SOURCE = 'epigraphSource';

/** Id of the ::toc landmark and of its title. */
export const TOC_ID = 'toc';
export const TOC_TITLE_ID = 'toc-title';

/** Ids of the n-th sidenote, of its reference mark, and of the n-th margin note. */
export const sidenoteId = (n: number): string => `sn-${n}`;
export const sidenoteRefId = (n: number): string => `sn-ref-${n}`;
export const marginnoteId = (n: number): string => `mn-${n}`;

/** Ids the reading stage itself emits; headings never receive them. */
export const readingIds = (sidenotes: number, marginnotes: number): readonly string[] => [
  TOC_ID,
  TOC_TITLE_ID,
  ...Array.from({ length: sidenotes }, (_, i) => sidenoteId(i + 1)),
  ...Array.from({ length: sidenotes }, (_, i) => sidenoteRefId(i + 1)),
  ...Array.from({ length: marginnotes }, (_, i) => marginnoteId(i + 1)),
];

/**
 * Ids used by the page around a Markdown document, which a heading must
 * never take (an id is unique per page): the essay and lab views (src/views/EssayView.astro,
 * src/views/LabView.astro), the site chrome (SVG symbols of the strata and forms), the argument-map
 * sprite and remark-rehype's GFM footnotes section. Heading slugs that collide get the "-1" suffix.
 */
export const PAGE_IDS: readonly string[] = [
  'content',
  'essay-title',
  'essay-abstract',
  'essay-status',
  'essay-article',
  'essay-revisions',
  'essay-concepts',
  'essay-next',
  'lab-title',
  'lab-abstract',
  'lab-status',
  'lab-article',
  'lab-concepts',
  'argument-map',
  'argument-map-title',
  'footnote-label',
  'simplex-0',
  'simplex-1',
  'simplex-2',
  'simplex-3',
  'form-essay',
  'form-note',
  'form-lab',
  'form-concept',
  'form-map',
  // Site chrome (header, command palette, preferences): fixed ids known at the time of writing.
  'site-nav-list',
  'ft-palette',
  'ft-palette-title',
  'ft-palette-input',
  'ft-palette-list',
  'ft-palette-hint',
  'ft-prefs',
  'ft-prefs-title',
  'ui-arrow',
  'ui-close',
  'ui-feed',
  'ui-language',
  'ui-menu',
  'ui-prefs',
  'ui-search',
  ...ARGUMENT_KINDS.map(glyphSymbolId),
];

export const isHeadingRecord = (v: unknown): v is HeadingRecord =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { id?: unknown }).id === 'string' &&
  Array.isArray((v as { depends?: unknown }).depends) &&
  typeof (v as { inToc?: unknown }).inToc === 'boolean';
