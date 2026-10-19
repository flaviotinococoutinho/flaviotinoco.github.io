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

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/**
 * Date of issue. Covers what NBR 6023 §8.6 and APA §9.14 distinguish:
 * a year, a span of years (multi-volume works: 1931-1958), a month or a span of
 * months (a paper printed in two issues: jul./out. 1948), a full date (web pages,
 * weeklies) and a year inferred by the cataloguer, printed in brackets: [1933].
 */
export type Issued = {
  readonly year: number;
  readonly endYear?: number;
  readonly month?: Month;
  readonly endMonth?: Month;
  readonly day?: number;
  readonly inferred?: true;
};

/** Calendar date (ISO 8601 calendar), used for access dates. */
export type CalendarDate = { readonly year: number; readonly month: Month; readonly day: number };

/** A numbered interval (pages 379–423) or a single designation (page xi). */
export type Interval = { readonly first: string; readonly last?: string };

export type Edition =
  { readonly kind: 'ordinal'; readonly n: number } | { readonly kind: 'text'; readonly text: MarkedText };

/** Role of the persons responsible for a collection (NBR 6023 §8.1.1.4: org., ed., coord., comp.). */
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
  readonly issued: Issued;
  /** BCP 47 tag of the work's language (from `langid`/`language`), for `lang` attributes. */
  readonly language?: string;
  readonly translators: NameList;
  readonly doi?: string;
  readonly url?: string;
  readonly accessed?: CalendarDate;
  readonly note?: MarkedText;
};

/** Persons responsible for the work as a whole (the entry when there is no author). */
export type Editors = { readonly editors: NameList; readonly editorRole: EditorRole };

export type Book = Common &
  Editors & {
    readonly type: 'book';
    readonly edition?: Edition;
    /** Volume of a multi-volume work that this reference is about. */
    readonly volume?: string;
    /** Number of physical volumes of a multi-volume work. */
    readonly volumes?: number;
    readonly series?: Series;
    readonly imprint: Imprint;
  };

/** A part of a book: @incollection (edited host) or @inbook (authored host, biblatex semantics). */
export type Chapter = Common &
  Editors & {
    readonly type: 'chapter';
    readonly container: Title;
    readonly bookAuthors: NameList;
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
  readonly volume?: string;
  readonly number?: string;
  /** Page ranges, or an electronic locator (article number) — never both (NBR 6023:2025 §7.7.6). */
  readonly pages?: readonly Interval[];
  readonly eid?: string;
};

export type Event = {
  readonly title: MarkedText;
  readonly number?: string;
  readonly year?: number;
  readonly venue?: MarkedText;
};

export type Paper = Common &
  Editors & {
    readonly type: 'inproceedings';
    readonly container: Title;
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
export type Online = Common &
  Editors & {
    readonly type: 'online';
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
