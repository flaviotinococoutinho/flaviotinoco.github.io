/**
 * Left inverse of the reading transform on text (docs/arquitetura.md §2.4).
 *
 *   recoverText(transformReading(x).tree) = recoverText(x)
 *
 * On a source tree (no reading records, no generated nodes) `recoverText` is
 * the plain text of the document as the reader will see it: mdast-util-to-string
 * semantics, except that a text directive which is really prose ("10:30" read
 * as `:30`) contributes its source slice, exactly what the integrity stage
 * restores. The transform only ADDS structure, except for three kinds of
 * change, each of which is recorded so it can be undone here:
 *   - generated text (sidenote numbers, translated labels, the table of
 *     contents) is marked `readingGenerated` and skipped;
 *   - a heading attribute block removed from the visible title is kept in
 *     `readingAttrs` (and in the data-attrs HTML attribute) and re-appended;
 *   - content moved before/after its siblings (an epigraph's source) carries a
 *     `readingPermutation` giving the original reading order of the children.
 */
import { childrenOf, isGenerated, isProseDirective, sourceOf, type MdNode } from '../fold/tree.ts';
import { ATTRS_RECORD, PERMUTATION_RECORD } from './records.ts';

const permuted = (node: MdNode): readonly MdNode[] => {
  const kids = childrenOf(node);
  const perm = node.data?.[PERMUTATION_RECORD];
  if (!Array.isArray(perm) || perm.length !== kids.length) return kids;
  return perm.map((i: unknown) => kids[Number(i)]).filter((k): k is MdNode => k !== undefined);
};

export const recoverText = (node: MdNode, source: string | null = null): string => {
  if (isGenerated(node)) return '';
  if (isProseDirective(node, source)) return sourceOf(node, source) ?? '';
  if (typeof node.value === 'string') return node.value;
  const alt = node['alt'];
  if (typeof alt === 'string' && alt.length > 0) return alt;
  const inner = permuted(node)
    .map((c) => recoverText(c, source))
    .join('');
  const attrs = node.data?.[ATTRS_RECORD];
  return typeof attrs === 'string' ? inner + attrs : inner;
};
