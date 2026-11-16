/**
 * Run-in lists: items set on one line and parted by a middle dot ("a · b · c"), as in a running head or a
 * catalogue entry.
 *
 * The dot belongs to the item before it. A no-break space ties it there and an ordinary space follows it, so the
 * only break opportunity is after the dot: a wrapped line may end with "·", which says the list goes on, but never
 * begins with one, where the dot would read as a bullet, the mark of a new item in a vertical list. The CSS
 * separators of the site follow the same rule (`::after` on the item before, never `::before` on the next).
 */

/** No-break space, middle dot, space. */
export const RUN_IN_SEPARATOR = '\u00a0·\u0020';

export const runIn = (items: readonly string[]): string => items.join(RUN_IN_SEPARATOR);
