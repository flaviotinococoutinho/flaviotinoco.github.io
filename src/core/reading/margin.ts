/**
 * Margin layout of side- and margin notes (Tufte's sidenotes).
 *
 * Each note wants to sit level with its reference mark; consecutive marks on
 * nearby lines would make notes overlap. Notes are therefore stacked in
 * document order: a note keeps its desired position unless the previous note
 * still occupies it, in which case it starts one gap below that note's end —
 * the greedy "first fit" placement used by Tufte CSS-style implementations,
 * which is optimal here because the order of notes is fixed (each note is as
 * close to its mark as the notes before it allow).
 */

export interface NoteBox {
  /** Desired top (level with the reference mark), in any consistent unit. */
  readonly top: number;
  readonly height: number;
}

/**
 * Resolved tops, in input (document) order. Laws (tests/unit/reading/scroll.test.ts):
 *   - never above the desired position: result[i] ≥ top[i];
 *   - no overlap: result[i] ≥ result[i−1] + height[i−1] + gap;
 *   - tight: result[i] equals one of those two bounds;
 *   - idempotent.
 */
export const stackNotes = (notes: readonly NoteBox[], gap: number): readonly number[] => {
  const out: number[] = [];
  let floor = Number.NEGATIVE_INFINITY;
  for (const n of notes) {
    const top = Math.max(n.top, floor);
    out.push(top);
    floor = top + Math.max(0, n.height) + Math.max(0, gap);
  }
  return out;
};
