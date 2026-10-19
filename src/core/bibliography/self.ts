/**
 * "Como citar / How to cite" — the site's own essays and labs as references (pure).
 *
 * A work of this site is an online document (NBR 6023:2025 §7.20; APA 7 §10.16),
 * so it is modelled as an `online` Reference and formatted by the SAME style
 * objects as every other reference: the box under an essay can never drift from
 * the reference lists. Output:
 *
 *   ABNT  TINOCO, Flávio. Título: subtítulo. **Nome do site**, 2026. Disponível em:
 *         URL. Acesso em: 17 out. 2026.     (destaque on the site name, NBR 6023
 *         §7.20 Ex. 10; with `date: 'full'` the day and month are printed too)
 *   APA   Tinoco, F. (2026, October 17). *Title: Subtitle*. Site Name. URL
 *         (the site name is dropped when it repeats the author, APA §10.16)
 *   calls (Tinoco, 2026) / Tinoco (2026)    (NBR 10520:2023 §6.1.3–6.1.4; APA §8.11)
 *   BibTeX a biblatex @online entry: author, title, subtitle, organization (site),
 *         date, url, urldate, langid — which the site's own parser reads back
 *         into the same reference (property-tested).
 *
 * The access date is an argument: the functional core has no clock.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { parseCitationKey, type CitationKey } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import { toBibtex } from './bibtex/encode.ts';
import { marked, type MarkedText, type Range } from './bibtex/latex.ts';
import { EMPTY_NAMES } from './bibtex/names.ts';
import { renderCitation } from './cite/engine.ts';
import type { CalendarDate, Month, Online } from './model/reference.ts';
import { unlink, type Inline } from './render/inline.ts';
import type { CitationStyle } from './style/style.ts';

/** A person responsible for a work of the site. */
export type SiteAuthor = { readonly given: string; readonly family: string };

/** The author of the site's works (surname Tinoco, given name Flávio). */
export const SITE_AUTHOR: SiteAuthor = { given: 'Flávio', family: 'Tinoco' };

/** What the shell knows about a work of the site (from its frontmatter and route). */
export type SiteWork = {
  readonly title: string;
  readonly subtitle?: string;
  /** Language of the work (frontmatter `lang`). */
  readonly lang: Locale;
  /** Date of first publication (frontmatter `published`). */
  readonly published: CalendarDate;
  /** Stable identifier used in the citation key, e.g. the slug ("amostrar-e-decidir"). */
  readonly id: string;
  /** Defaults to [SITE_AUTHOR]. */
  readonly authors?: readonly SiteAuthor[];
};

export type SelfCitationOptions = {
  /** Name of the website, e.g. "Flávio Tinoco" (the site's own catalog, key site.name). */
  readonly siteName: string;
  /** Canonical absolute URL of the work. */
  readonly url: string;
  /** Date of access (NBR 6023 §6.6 "Acesso em") — injected by the shell. */
  readonly accessed: CalendarDate;
  /**
   * Date of the work in the reference: the year (default for ABNT, the template
   * "Nome do site, ano") or day, month and year (default for APA, §9.14).
   */
  readonly date?: 'year' | 'full';
};

export type SelfCitation = {
  readonly key: CitationKey;
  /** The work as a reference of the model (what `entry` was formatted from). */
  readonly reference: Online;
  /** The reference-list entry in the given style. */
  readonly entry: readonly Inline[];
  /** In-text calls without links: "(Tinoco, 2026)" and "Tinoco (2026)". */
  readonly parenthetical: readonly Inline[];
  readonly narrative: readonly Inline[];
  /** biblatex @online entry (UTF-8). */
  readonly bibtex: string;
};

/** Absolute http(s) URL without characters that would break a BibTeX brace group or an HTML attribute. */
const URL_PATTERN = /^https?:\/\/[^\s<>"{}\\]+$/u;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const isMonth = (n: number): n is Month => Number.isInteger(n) && n >= 1 && n <= 12;
const isCalendarDate = (d: CalendarDate): boolean => {
  if (!Number.isInteger(d.year) || d.year < 1 || d.year > 9999 || !isMonth(d.month)) return false;
  const leap = d.year % 4 === 0 && (d.year % 100 !== 0 || d.year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][d.month - 1] ?? 31;
  return Number.isInteger(d.day) && d.day >= 1 && d.day <= days;
};

/** "Tinoco" → "tinoco", "Gödel" → "godel": the ASCII skeleton used in keys. */
const keyPart = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/gu, '');

/**
 * Case protection of a title (Patashnik, "BibTeXing", 1988, §4: BibTeX styles
 * never re-case text inside braces). The site's titles are already in their
 * intended case, so every word that a sentence-casing style could damage — one
 * with a capital letter other than the initial of the field ("SKOS",
 * "Nyquist–Shannon", "iPhone") — is protected, while ordinary words stay free
 * (APA still capitalises the first word of a subtitle, §6.17). The spans are
 * protected in the MODEL, so the BibTeX export (bibtex/encode.ts) writes them
 * as brace groups and the formatted reference and the exported entry read back
 * always agree.
 */
const protectedWords = (s: string): readonly Range[] =>
  [...s.matchAll(/\S+/gu)]
    .filter((m) => /\p{Lu}/u.test(m.index === 0 ? [...m[0]].slice(1).join('') : m[0]))
    .map((m) => ({ start: m.index, end: m.index + m[0].length }));

/** A title as marked text with its case-protected words. */
const markedTitle = (s: string): MarkedText => ({ text: s, protected: protectedWords(s), italic: [] });

/**
 * "Título: subtítulo" without a separate subtitle is split at the first ": "
 * outside a protected word — the rule the model applies to .bib titles
 * (model/from-entry.ts; NBR 6023 §8.2), so the work and its BibTeX export agree.
 */
const splitTitle = (t: string): { readonly main: string; readonly sub?: string } => {
  const words = protectedWords(t);
  for (const m of t.matchAll(/:\s/gu)) {
    if (words.some((r) => r.start <= m.index && m.index < r.end)) continue;
    const main = t.slice(0, m.index).trim();
    const sub = t.slice(m.index + 1).trim();
    if (main !== '' && sub !== '') return { main, sub };
    break;
  }
  return { main: t };
};

/**
 * NFC, with runs of TeX white space as one space (TeX collapses them, TeXbook
 * ch. 8) and no white space at the ends (the model trims field values); a
 * no-break space inside the text is content and stays.
 */
const collapse = (s: string): string =>
  s
    .normalize('NFC')
    .replace(/[ \t\n\r\f\v]+/gu, ' ')
    .trim();

/** Formats a work of the site as a reference, in-text calls and a BibTeX entry. */
export const citeSelf = (
  work: SiteWork,
  style: CitationStyle,
  options: SelfCitationOptions,
): Result<SelfCitation, readonly string[]> => {
  const problems: string[] = [];
  const given = work.subtitle === undefined ? splitTitle(collapse(work.title)) : { main: collapse(work.title) };
  const title = given.main;
  const subtitle = work.subtitle === undefined ? given.sub : collapse(work.subtitle);
  const siteName = collapse(options.siteName);
  const authors = (work.authors ?? [SITE_AUTHOR]).map((a) => ({
    given: collapse(a.given),
    family: collapse(a.family),
  }));
  if (title === '') problems.push('the title is empty');
  if (subtitle === '') problems.push('the subtitle is empty (omit it instead)');
  if (siteName === '') problems.push('the site name is empty');
  if (authors.length === 0 || authors.some((a) => a.family === '' || a.given === ''))
    problems.push('every author needs a given name and a surname');
  if (!URL_PATTERN.test(options.url)) problems.push(`url "${options.url}" must be an absolute http(s) URL`);
  if (!ID.test(work.id)) problems.push(`id "${work.id}" must be a slug (lowercase words joined by hyphens)`);
  if (!isCalendarDate(work.published)) problems.push('the date of publication is not a calendar date');
  if (!isCalendarDate(options.accessed)) problems.push('the date of access is not a calendar date');
  const first = authors[0];
  const key =
    problems.length === 0 && first !== undefined
      ? parseCitationKey(`${keyPart(first.family)}${work.published.year}-${work.id}`)
      : undefined;
  if (key !== undefined && !key.ok)
    problems.push(`no citation key can be derived from the surname "${first?.family ?? ''}" (${key.error})`);
  if (problems.length > 0 || key === undefined || !key.ok) return err(problems);

  const date = options.date ?? (style.id === 'abnt' ? 'year' : 'full');
  const reference: Online = {
    type: 'online',
    key: key.value,
    authors: {
      names: authors.map((a) => ({ kind: 'person', given: marked(a.given), family: marked(a.family) })),
      others: false,
    },
    title:
      subtitle === undefined ? { main: markedTitle(title) } : { main: markedTitle(title), sub: markedTitle(subtitle) },
    issued:
      date === 'full'
        ? { year: work.published.year, month: work.published.month, day: work.published.day }
        : { year: work.published.year },
    language: work.lang,
    translators: EMPTY_NAMES,
    editors: EMPTY_NAMES,
    editorRole: 'editor',
    site: marked(siteName),
    imprint: {},
    url: options.url,
    accessed: options.accessed,
  };

  const ctx = {
    style,
    letterOf: () => '',
    href: () => '',
    anchorId: () => undefined,
  };
  const item = { reference, prefix: '', suppressAuthor: false, suffix: '' };
  // The export always carries the full date of publication, whatever the reference prints.
  const bibtex = toBibtex({
    ...reference,
    issued: { year: work.published.year, month: work.published.month, day: work.published.day },
  });

  return ok({
    key: key.value,
    reference,
    entry: style.reference(reference, ''),
    parenthetical: unlink(renderCitation('parenthetical', [item], ctx)),
    narrative: unlink(renderCitation('narrative', [item], ctx)),
    bibtex,
  });
};
