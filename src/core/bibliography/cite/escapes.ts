/**
 * Backslash escapes of citation markers, recovered from the Markdown source.
 *
 * micromark removes the backslash of `\[@k]` (CommonMark §2.4, backslash
 * escapes), so a text node's value cannot tell an escaped bracket from a real
 * one. The source slice of the node can: the k-th marker character ("[", "]" or
 * "@") of the value corresponds to the k-th marker of the slice, and it is
 * escaped there when an odd number of backslashes precedes it. When the counts
 * differ (a character reference such as &#64; produced a marker), there is no
 * faithful correspondence and the caller must leave the text alone.
 */

const MARKERS = new Set(['[', ']', '@']);

/** Indices (in `value`) of the marker characters that were escaped in `raw`; undefined when unmappable. */
export const escapedMarkers = (value: string, raw: string): ReadonlySet<number> | undefined => {
  const inValue: number[] = [];
  for (let i = 0; i < value.length; i++) if (MARKERS.has(value[i] as string)) inValue.push(i);
  const inRaw: { readonly char: string; readonly escaped: boolean }[] = [];
  let backslashes = 0;
  for (const c of raw) {
    if (MARKERS.has(c)) inRaw.push({ char: c, escaped: backslashes % 2 === 1 });
    backslashes = c === '\\' ? backslashes + 1 : 0;
  }
  if (inRaw.length !== inValue.length) return undefined;
  const escaped = new Set<number>();
  for (let k = 0; k < inValue.length; k++) {
    const at = inValue[k] as number;
    const marker = inRaw[k];
    if (marker === undefined || marker.char !== value[at]) return undefined;
    if (marker.escaped) escaped.add(at);
  }
  return escaped;
};
