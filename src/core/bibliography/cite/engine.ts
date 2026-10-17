/**
 * The citation engine — style-agnostic author-date processing (pure).
 *
 * Responsibilities shared by every author-date style (NBR 10520:2023 §6.1;
 * APA 7 §8.10–8.21):
 *   - the reference list: ordering with the style's collation key and
 *     Intl.Collator (Unicode Collation Algorithm, UTS #10, locale-tailored),
 *     ties broken deterministically;
 *   - year letters (NBR 10520 §6.1.6, APA §8.19): works whose call would read the
 *     same (same short responsibility and year) get a, b, c… in LIST order, and
 *     the same letters are used in the calls;
 *   - calls: several works in one parenthesis sorted alphabetically (NBR 10520
 *     §6.1.8, APA §8.12), consecutive works of the same responsibility merged
 *     ("Dreyfuss, 1989, 1991", NBR 10520 §6.1.7), suppressed authors ("1948,
 *     p. 3"), prefixes, locators and verbatim suffixes;
 *   - links: every responsibility or year links to its list entry; the first
 *     citation of each work carries an id the list can link back to.
 */
import type { CitationKey } from '../../domain/identifiers.ts';
import type { Reference } from '../model/reference.ts';
import { link, text, toPlainText, type Inline } from '../render/inline.ts';
import { yearLetter } from '../style/shared.ts';
import type { CitationMode, CitationStyle } from '../style/style.ts';
import type { Locator } from './locator.ts';

export type ListEntry = {
  readonly key: CitationKey;
  readonly reference: Reference;
  /** Disambiguation letter, "" when the year is unambiguous. */
  readonly letter: string;
  readonly content: readonly Inline[];
};

export type ReferenceList = {
  readonly entries: readonly ListEntry[];
  readonly letterOf: (key: CitationKey) => string;
};

const collators = (locale: string): ((a: string, b: string) => number) => {
  const base = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const fine = new Intl.Collator(locale, { numeric: true, sensitivity: 'variant' });
  return (a, b) => base.compare(a, b) || fine.compare(a, b);
};

/** The key under which calls would collide: short responsibility + year, as printed. */
const callKey = (ref: Reference, style: CitationStyle): string =>
  `${toPlainText(style.label(ref, 'parenthetical'))}\u0000${style.year(ref, '')}`;

/** Sorts the cited works and assigns year letters (applied to the list AND the calls). */
export const buildReferenceList = (refs: readonly Reference[], style: CitationStyle): ReferenceList => {
  const compare = collators(style.locale);
  const keyed = refs.map((reference) => ({ reference, sortKey: style.sortKey(reference) }));
  const sorted = keyed
    .sort(
      (a, b) =>
        compare(a.sortKey, b.sortKey) ||
        (a.reference.key < b.reference.key ? -1 : a.reference.key > b.reference.key ? 1 : 0),
    )
    .map((k) => k.reference);
  const groups = new Map<string, Reference[]>();
  for (const ref of sorted) {
    const k = callKey(ref, style);
    groups.set(k, [...(groups.get(k) ?? []), ref]);
  }
  const letters = new Map<CitationKey, string>();
  for (const members of groups.values()) {
    if (members.length > 1) members.forEach((ref, i) => letters.set(ref.key, yearLetter(i)));
  }
  const letterOf = (key: CitationKey): string => letters.get(key) ?? '';
  return {
    entries: sorted.map((reference) => ({
      key: reference.key,
      reference,
      letter: letterOf(reference.key),
      content: style.reference(reference, letterOf(reference.key)),
    })),
    letterOf,
  };
};

/** One cited work of a call, resolved against the bibliography. */
export type CiteRef = {
  readonly reference: Reference;
  readonly prefix: string;
  readonly suppressAuthor: boolean;
  readonly locator?: Locator;
  readonly suffix: string;
};

export type RenderContext = {
  readonly style: CitationStyle;
  readonly letterOf: (key: CitationKey) => string;
  /** Target of the link to a list entry, e.g. "#ref-shannon1948". */
  readonly href: (key: CitationKey) => string;
  /** Id for the link of this citation, when it is the first citation of the work (for backlinks). */
  readonly anchorId: (key: CitationKey) => string | undefined;
};

/**
 * Verbatim suffix after the locator: kept as written when it starts with
 * punctuation (", grifo nosso"), otherwise separated by one space (Pandoc).
 */
const suffixText = (suffix: string): string => {
  const t = suffix.trim();
  if (t === '') return '';
  return /^[,;.:]/u.test(t) ? t : ` ${t}`;
};

const anchor = (ctx: RenderContext, key: CitationKey, children: readonly Inline[]): Inline =>
  link(ctx.href(key), children, ctx.anchorId(key));

/** "1948a, p. 379, grifo nosso" — the part after the responsibility. */
const yearPart = (item: CiteRef, ctx: RenderContext, linked: boolean): Inline[] => {
  const year = ctx.style.year(item.reference, ctx.letterOf(item.reference.key));
  return [
    linked ? anchor(ctx, item.reference.key, [text(year)]) : text(year),
    ...(item.locator === undefined ? [] : [text(ctx.style.call.locator + ctx.style.locator(item.locator))]),
    ...(item.suffix === '' ? [] : [text(suffixText(item.suffix))]),
  ];
};

const labelText = (item: CiteRef, ctx: RenderContext, mode: CitationMode): string =>
  toPlainText(ctx.style.label(item.reference, mode));

/** Renders one citation (a call) as inline nodes. */
export const renderCitation = (
  mode: CitationMode,
  items: readonly CiteRef[],
  ctx: RenderContext,
): readonly Inline[] => {
  const { style } = ctx;
  if (mode === 'narrative') {
    const item = items[0];
    if (item === undefined) return [];
    return [
      anchor(ctx, item.reference.key, style.label(item.reference, 'narrative')),
      text(` ${style.call.open}`),
      ...yearPart(item, ctx, false),
      text(style.call.close),
    ];
  }
  const compare = collators(style.locale);
  const ordered =
    items.length < 2
      ? items
      : items
          .map((item, index) => ({
            item,
            index,
            label: labelText(item, ctx, 'parenthetical'),
            year: style.year(item.reference, ctx.letterOf(item.reference.key)),
          }))
          .sort((a, b) => compare(a.label, b.label) || compare(a.year, b.year) || a.index - b.index)
          .map((x) => x.item);
  // Merge runs of the same responsibility: (Dreyfuss, 1989, 1991).
  const runs: CiteRef[][] = [];
  for (const item of ordered) {
    const last = runs.at(-1);
    const head = last?.[0];
    const mergeable =
      last !== undefined &&
      head !== undefined &&
      !head.suppressAuthor &&
      !item.suppressAuthor &&
      item.prefix.trim() === '' &&
      labelText(head, ctx, 'parenthetical') === labelText(item, ctx, 'parenthetical');
    if (mergeable) last.push(item);
    else runs.push([item]);
  }
  const rendered = runs.map((run): Inline[] => {
    const [first, ...rest] = run as [CiteRef, ...CiteRef[]];
    const prefix = first.prefix.trim() === '' ? [] : [text(`${first.prefix.trim()} `)];
    const years = rest.flatMap((item) => [text(style.call.years), ...yearPart(item, ctx, true)]);
    if (first.suppressAuthor) return [...prefix, ...yearPart(first, ctx, true), ...years];
    return [
      ...prefix,
      anchor(ctx, first.reference.key, style.label(first.reference, 'parenthetical')),
      text(style.call.authorYear),
      ...yearPart(first, ctx, false),
      ...years,
    ];
  });
  return [
    text(style.call.open),
    ...rendered.flatMap((r, k) => (k === 0 ? r : [text(style.call.items), ...r])),
    text(style.call.close),
  ];
};
