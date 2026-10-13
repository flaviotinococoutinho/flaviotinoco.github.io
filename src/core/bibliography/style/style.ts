/**
 * Citation style — the Strategy interface (Gamma et al., "Design Patterns", 1994).
 *
 * The citation engine (cite/engine.ts) is style-agnostic: ordering, year letters,
 * grouping and linking are the same for every author-date style. A style object
 * supplies only what its norm prescribes — the reference templates, the short
 * labels used inside calls, locator terms and the punctuation of a call. ABNT
 * (NBR 6023:2025 + NBR 10520:2023) and APA 7 are two values of this type.
 */
import type { Locale } from '../../domain/locale.ts';
import type { Locator } from '../cite/locator.ts';
import type { Reference } from '../model/reference.ts';
import type { Inline } from '../render/inline.ts';

export type CitationMode = 'parenthetical' | 'narrative';

export type CitationStyle = {
  readonly id: 'abnt' | 'apa';
  /** Language of the documents this style serves; also the collation locale. */
  readonly locale: Locale;
  /** Full reference-list entry; `suffix` is the disambiguation letter ("a", "b"…), or "". */
  readonly reference: (ref: Reference, suffix: string) => readonly Inline[];
  /** Responsibility as sorted in the list (plain text), e.g. "SHANNON, Claude Elwood". */
  readonly sortAuthor: (ref: Reference) => string;
  /** Short responsibility used in calls: "Shannon", "Clarac; Bonnin", "Maciel et al.". */
  readonly label: (ref: Reference, mode: CitationMode) => readonly Inline[];
  /** Year as printed in calls and in the list, e.g. "1948a", "1931-1958". */
  readonly year: (ref: Reference, suffix: string) => string;
  readonly locator: (locator: Locator) => string;
  /** Punctuation of a parenthetical call. */
  readonly call: {
    readonly open: string;
    readonly close: string;
    /** Between works: "; ". */
    readonly items: string;
    /** Between responsibility and year: ", ". */
    readonly authorYear: string;
    /** Between years of the same responsibility: ", " → (Dreyfuss, 1989, 1991). */
    readonly years: string;
    /** Before the locator and the suffix: ", ". */
    readonly locator: string;
  };
};
