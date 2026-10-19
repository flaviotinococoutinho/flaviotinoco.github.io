/**
 * The "how to cite" box of an essay or lab (pure): the work as a reference in the
 * style of its language, the two in-text forms and the biblatex entry, each as
 * HTML (for display) and as plain text (what the copy button puts on the clipboard).
 *
 * Everything is produced by citeSelf (src/core/bibliography/self.ts), i.e. by the
 * same style objects as the reference lists, so the box cannot drift from them.
 * The date of the work is printed in full in both styles:
 *   - ABNT NBR 6023:2025 §7.20 (= NBR 6023:2018 + Emenda 1), Exemplo 10, prints the
 *     day, month and year of an online document ("Poder 360, 6 abr. 2023.";
 *     docs/research/abnt.md, website example);
 *   - APA 7 §9.14 / §10.16 dates webpages "(2026, May 3)".
 * The access date is injected by the shell (src/adapters/astro/build-clock.ts).
 */
import type { Result } from '../algebra/result.ts';
import { map } from '../algebra/result.ts';
import type { Locale } from '../domain/locale.ts';
import type { CalendarDate } from '../bibliography/model/reference.ts';
import { toHtml, toPlainText, type Inline } from '../bibliography/render/inline.ts';
import { citeSelf, type SiteWork } from '../bibliography/self.ts';
import { styleFor } from '../bibliography/style/styles.ts';

/** One copyable form: HTML for the page, plain text for the clipboard. */
export type CopyableForm = { readonly html: string; readonly text: string };

export type CiteBoxModel = {
  /** Citation key of the work, e.g. "tinoco2026-amostrar-e-decidir". */
  readonly key: string;
  readonly style: 'abnt' | 'apa';
  readonly reference: CopyableForm;
  readonly parenthetical: CopyableForm;
  readonly narrative: CopyableForm;
  readonly bibtex: string;
  readonly accessed: CalendarDate;
};

export type CiteBoxOptions = {
  readonly siteName: string;
  /** Canonical absolute URL of the work. */
  readonly url: string;
  readonly accessed: CalendarDate;
};

/**
 * The clipboard text is the plain-text interpretation of the same inline tree, so
 * it reads exactly as the page shows it (no-break spaces of the style included:
 * they keep "p. 12" and "v. 3" together in the reader's document too).
 */
const form = (nodes: readonly Inline[]): CopyableForm => ({ html: toHtml(nodes), text: toPlainText(nodes) });

export const citeBox = (
  work: SiteWork,
  locale: Locale,
  options: CiteBoxOptions,
): Result<CiteBoxModel, readonly string[]> => {
  const style = styleFor(locale);
  return map(
    citeSelf(work, style, { siteName: options.siteName, url: options.url, accessed: options.accessed, date: 'full' }),
    (c): CiteBoxModel => ({
      key: c.key,
      style: style.id,
      reference: form(c.entry),
      parenthetical: form(c.parenthetical),
      narrative: form(c.narrative),
      bibtex: c.bibtex.trim(),
      accessed: options.accessed,
    }),
  );
};
