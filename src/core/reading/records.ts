/**
 * Private records the reading stage leaves on mdast nodes (`node.data.*`) for
 * the stages that run after it (meta fold, table of contents) and for the
 * left inverse (recover.ts). They never reach the HTML: mdast-util-to-hast
 * only reads hName / hProperties / hChildren.
 */
import type { ArgumentKind } from './argument.ts';

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

/** Ids the reading stage itself emits; headings never receive them. */
export const readingIds = (sidenotes: number, marginnotes: number): readonly string[] => [
  'toc',
  ...Array.from({ length: sidenotes }, (_, i) => `sn-${i + 1}`),
  ...Array.from({ length: sidenotes }, (_, i) => `sn-ref-${i + 1}`),
  ...Array.from({ length: marginnotes }, (_, i) => `mn-${i + 1}`),
];

export const isHeadingRecord = (v: unknown): v is HeadingRecord =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as { id?: unknown }).id === 'string' &&
  Array.isArray((v as { depends?: unknown }).depends) &&
  typeof (v as { inToc?: unknown }).inToc === 'boolean';
