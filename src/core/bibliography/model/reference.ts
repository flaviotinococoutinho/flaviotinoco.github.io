/**
 * The reference model — an algebraic data type with one variant per kind of work.
 *
 * Formatters pattern-match on `type` (exhaustively, with `absurd`), so adding a
 * variant is a compile error everywhere it is not yet handled. Fields are typed
 * values, never raw strings: names are structured (NameList), years are numbers,
 * page ranges are intervals, dates are calendar triples. Text fields keep their
 * case-protected and italic spans (MarkedText) so nothing decoded from LaTeX is
 * lost on the way to HTML.
 */
import type { CitationKey } from '../../domain/identifiers.ts';
import type { MarkedText } from '../bibtex/latex.ts';
import type { NameList } from '../bibtex/names.ts';

/** Title proper and optional subtitle (NBR 6023 §8.2: separated by ": "). */
export type Title = {
  readonly main: MarkedText;
  readonly sub?: MarkedText;
};

/** Publication year or span of years (multi-volume works: 1931–1958). */
export type Year = { readonly start: number; readonly end?: number };

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** Calendar date (ISO 8601 calendar), used for access dates and dated web documents. */
export type CalendarDate = { readonly year: number; readonly month: Month; readonly day: number };

/** A numbered interval (pages 379–423, issue 3–4) or a single designation (page xi). */
export type Interval = { readonly first: string; readonly last?: string };

export type Edition = { readonly kind: 'ordinal'; readonly n: number } | { readonly kind: 'text'; readonly text: MarkedText };

/** Role of the responsible persons of a collection (NBR 6023 §8.1.1.4: org., ed., coord., comp.). */
export type EditorRole = 'editor' | 'organizer' | 'coordinator' | 'compiler';

export type Series = { readonly title: MarkedText; readonly number?: string };

export type Imprint = {
  /** Place of publication (city), as in the document. */
  readonly place?: MarkedText;
  readonly publisher?: MarkedText;
};

/** Fields every reference has. */
export type Common = {
  readonly key: CitationKey;
  readonly authors: NameList;
  readonly title: Title;
  readonly year: Year;
  readonly month?: Month;
  readonly day?: number;
  /** BCP 47 tag of the work's language (from `langid`/`language`), for `lang` attributes. */
  readonly language?: string;
  readonly translators: NameList;
  readonly doi?: string;
  readonly url?: string;
  readonly accessed?: CalendarDate;
  readonly note?: MarkedText;
};

export type Book = Common & {
  readonly type: 'book';
  readonly editors: NameList;
  readonly editorRole: EditorRole;
  readonly edition?: Edition;
  readonly volume?: string;
  /** Number of physical volumes of a multi-volume work. */
  readonly volumes?: number;
  readonly series?: Series;
  readonly imprint: Imprint;
};

/** A part of a book: @incollection (edited host) or @inbook (authored host). */
export type Chapter = Common & {
  readonly type: 'chapter';
  readonly container: Title;
  readonly bookAuthors: NameList;
  readonly editors: NameList;
  readonly editorRole: EditorRole;
  readonly edition?: Edition;
  readonly volume?: string;
  readonly chapter?: string;
  readonly pages?: readonly Interval[];
  readonly series?: Series;
  readonly imprint: Imprint;
};

export type Article = Common & {
  readonly type: 'article';
  readonly journal: Title;
  readonly place?: MarkedText;
  readonly volume?: Interval;
  readonly number?: Interval;
  /** Page ranges, or an electronic locator (article number) — never both. */
  readonly pages?: readonly Interval[];
  readonly eid?: string;
};

export type Event = {
  readonly title: MarkedText;
  readonly number?: string;
  readonly year?: number;
  readonly venue?: MarkedText;
};

export type Paper = Common & {
  readonly type: 'inproceedings';
  readonly container: Title;
  readonly editors: NameList;
  readonly editorRole: EditorRole;
  readonly event?: Event;
  readonly volume?: string;
  readonly series?: Series;
  readonly pages?: readonly Interval[];
  readonly eid?: string;
  readonly imprint: Imprint;
};

export type Thesis = Common & {
  readonly type: 'thesis';
  readonly degree: 'phd' | 'masters';
  /** Explicit type line, e.g. "Tese (Doutorado em Física)"; defaults per style when absent. */
  readonly thesisType?: MarkedText;
  readonly institution: MarkedText;
  readonly place?: MarkedText;
  /** Number of leaves (f.) of the deposited copy. */
  readonly leaves?: number;
};

export type Report = Common & {
  readonly type: 'report';
  readonly institution: MarkedText;
  readonly place?: MarkedText;
  readonly reportType?: MarkedText;
  readonly number?: string;
};

/** A document consulted online only (web page, blog post, W3C Recommendation). */
export type Online = Common & {
  readonly type: 'online';
  readonly editors: NameList;
  readonly editorRole: EditorRole;
  /** Name of the website or blog the page belongs to (rendered as the highlighted unit). */
  readonly site?: MarkedText;
  readonly imprint: Imprint;
  readonly version?: string;
  readonly url: string;
  readonly accessed: CalendarDate;
};

export type Software = Common & {
  readonly type: 'software';
  readonly version?: string;
  readonly imprint: Imprint;
};

export type Reference = Book | Chapter | Article | Paper | Thesis | Report | Online | Software;

export type ReferenceType = Reference['type'];
