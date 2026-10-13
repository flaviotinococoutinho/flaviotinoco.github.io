/**
 * Left inverse of the reading stages on plain text (docs/arquitetura.md §2.4).
 *
 *   recoverText(transformReading(x).tree) = plainText(x)
 *
 * The transforms only ADD structure, except for three kinds of change, each of
 * which is recorded so it can be undone here:
 *   - generated text (sidenote numbers, translated labels, the table of
 *     contents) is marked `readingGenerated` and skipped;
 *   - a heading attribute block removed from the visible title is kept in
 *     `readingAttrs` (and in the data-attrs HTML attribute) and re-appended;
 *   - content moved before/after its siblings (an epigraph's source) carries a
 *     `readingPermutation` giving the original reading order of the children.
 */
import { childrenOf, isGenerated, type MdNode } from '../fold/tree.ts';
import { ATTRS_RECORD, PERMUTATION_RECORD } from './records.ts';

const permuted = (node: MdNode): readonly MdNode[] => {
  const kids = childrenOf(node);
  const perm = node.data?.[PERMUTATION_RECORD];
  if (!Array.isArray(perm) || perm.length !== kids.length) return kids;
  return perm.map((i: unknown) => kids[Number(i)]).filter((k): k is MdNode => k !== undefined);
};

export const recoverText = (node: MdNode): string => {
  if (isGenerated(node)) return '';
  if (typeof node.value === 'string') return node.value;
  const alt = node['alt'];
  if (typeof alt === 'string' && alt.length > 0) return alt;
  const inner = permuted(node).map(recoverText).join('');
  const attrs = node.data?.[ATTRS_RECORD];
  return typeof attrs === 'string' ? inner + attrs : inner;
};
