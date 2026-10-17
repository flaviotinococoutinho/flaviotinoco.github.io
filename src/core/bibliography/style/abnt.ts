/**
 * ABNT style: references per NBR 6023:2025 (3rd ed. = 2018 + Emenda 1) and
 * author-date calls per NBR 10520:2023 (pure; data + templates).
 *
 * Rules applied (ids from docs/research/abnt.md §2):
 *   REF-06/09  SOBRENOME, Prenome — given names as in the data, never abbreviated;
 *              lower-case particles drop after the given names (SILVA, João da);
 *              kinship suffixes stay with the surname (ASSAF NETO).
 *   REF-07     1–3 authors all listed with "; "; 4+ → policy `etAl` (default 'all',
 *              listing everyone; 'first' prints the first + et al.), one policy
 *              per document.
 *   REF-10     editors as entry: "LEVI, G.; SCHMIDT, J. (org.)".
 *   REF-12     corporate authors: first hierarchical segment in capitals.
 *   REF-05/H3  entry by title: first word (plus the next after an article or
 *              monosyllable) in capitals, no destaque.
 *   REF-14/H1  destaque (rendered <cite>, bold by CSS) on the title of the
 *              bibliographic unit — book/thesis title, journal, host book or
 *              proceedings — never on the subtitle.
 *   REF-16     "2. ed."; REF-17/18 "[S. l.]", "[s. n.]", "[S. l.: s. n.]" as
 *              <i lang="la">; REF-19 "[1933]" for inferred years; REF-20 months
 *              per Anexo A (jan. … maio … dez.); REF-22 "p. 379-423" (hyphen);
 *              REF-29 e-locator in the page position; REF-37 "DOI: https://doi.org/…";
 *              REF-04 "Disponível em: URL. Acesso em: 3 maio 2024." as last elements.
 *   CIT-07…18  calls in upper/lower case: (Shannon, 1948, p. 379) / Shannon (1948,
 *              p. 379); (Clarac; Bonnin, 1985) / Clarac e Bonnin (1985); 4+ →
 *              Maciel <i lang="la">et al.</i>; works without author by title
 *              (Anteprojeto [...], 1987).
 *
 * Non-breaking spaces join abbreviations to their numbers ("p. 12", "v. 27") and
 * the parts of a date, as recommended in docs/research/abnt.md §3.5.
 */
import { absurd } from '../../algebra/match.ts';
import type { Locator, LocatorLabel } from '../cite/locator.ts';
import type { Name, NameList, PersonName } from '../bibtex/names.ts';
import type {
  CalendarDate,
  Edition,
  EditorRole,
  Imprint,
  Issued,
  Reference,
  Series,
  Title,
} from '../model/reference.ts';
import { inLang, latin, link, text, time, title, toPlainText, type Inline } from '../render/inline.ts';
import {
  NBSP,
  block,
  doiUrl,
  foreign,
  fromMarked,
  hasNames,
  highlighted,
  intervals,
  isoDate,
  joinInline,
  joinList,
  plain,
  sentences,
  titleParts,
  transformMarked,
  yearText,
  type Block,
} from './shared.ts';
import type { CitationMode, CitationStyle } from './style.ts';
import { MONTHS_PT, leadingWords } from './terms.ts';

const LOCALE = 'pt-BR';
const DASH = '-';

export type AbntOptions = {
  /** Reference list with 4+ authors: list them all (default, "convém") or first + et al. (NBR 6023 §8.1.1.2). */
  readonly etAl?: 'all' | 'first';
};

const ROLE_ABBREVIATION: Readonly<Record<EditorRole, string>> = {
  editor: 'ed.',
  organizer: 'org.',
  coordinator: 'coord.',
  compiler: 'comp.',
};

/** Other responsibilities after the title, in direct order (NBR 6023 §8.1.1.6). */
const ROLE_LABEL: Readonly<Record<EditorRole, string>> = {
  editor: 'Edição',
  organizer: 'Organização',
  coordinator: 'Coordenação',
  compiler: 'Compilação',
};

const LOCATOR_TERMS: Readonly<Record<LocatorLabel, string>> = {
  page: 'p.',
  folio: 'f.',
  chapter: 'cap.',
  section: 'seção',
  paragraph: 'par.',
  volume: 'v.',
  part: 'pt.',
  note: 'n.',
  line: 'l.',
  article: 'art.',
  location: 'local.',
  figure: 'fig.',
  slide: 'slide',
};

const upper = (s: string): string => s.toLocaleUpperCase(LOCALE);
const nb = (label: string, value: string): string => `${label}${NBSP}${value}`;

// ------------------------------------------------------------------- names

/**
 * Surname in capitals. NBR 6023 §8.1.1 mandates upper case for the entry
 * surname, so braces in NAME fields are read as BibTeX's word-grouping device
 * ({López de Mántaras}) and do not block the capitals — the original case stays
 * in the structured name and is what citations print (docs/guia-citacoes.md).
 */
const personEntry = (n: PersonName): string => {
  const family = [n.family.text, n.suffix?.text]
    .filter((s) => s !== undefined)
    .map(upper)
    .join(' ');
  const given = [n.given?.text, n.particle?.text].filter((s) => s !== undefined).join(' ');
  return given === '' ? family : `${family}, ${given}`;
};

/** End of the first hierarchical segment of a corporate name ("Brasil. Ministério…", "Instituto… (Brasil)"). */
const firstSegmentEnd = (name: string): number => {
  const cut = [name.indexOf('. '), name.indexOf(' (')].filter((i) => i > 0);
  return cut.length === 0 ? name.length : Math.min(...cut);
};

/** Corporate author: the first hierarchical segment in capitals (BRASIL. Ministério da Justiça), NBR 6023 §8.1.2. */
const corporateEntry = (name: string): string => {
  const end = firstSegmentEnd(name);
  return upper(name.slice(0, end)) + name.slice(end);
};

const nameEntry = (n: Name): string => (n.kind === 'person' ? personEntry(n) : corporateEntry(n.name.text));

/** Given name first: "Charles Bally" (secondary responsibilities). */
const nameDirect = (n: Name): string =>
  n.kind === 'person'
    ? [n.given?.text, n.particle?.text, n.family.text, n.suffix?.text].filter((s) => s !== undefined).join(' ')
    : n.name.text;

/**
 * Responsibility as cited, in upper/lower case (NBR 10520 §6.1.1.1): the surname;
 * for a corporate author its first hierarchical segment — the jurisdiction of a
 * government body, "(Brasil, 1995)" (§6.1.1.3), or the whole name of an entity.
 */
const nameCited = (n: Name): string =>
  n.kind === 'person'
    ? [n.family.text, n.suffix?.text].filter((s) => s !== undefined).join(' ')
    : n.name.text.slice(0, firstSegmentEnd(n.name.text));

/** What the entry starts with: names (authors, or editors of a collection), or the title itself. */
type Responsibility =
  { readonly kind: 'names'; readonly list: NameList; readonly role?: EditorRole } | { readonly kind: 'title' };

const responsibility = (ref: Reference): Responsibility => {
  if (hasNames(ref.authors)) return { kind: 'names', list: ref.authors };
  if ((ref.type === 'book' || ref.type === 'online') && hasNames(ref.editors)) {
    return { kind: 'names', list: ref.editors, role: ref.editorRole };
  }
  return { kind: 'title' };
};

// ------------------------------------------------------------------- dates

const abntYear = (d: Issued, letter: string): string => {
  const span = yearText(d, DASH, false) + letter;
  return d.inferred === true ? `[${span}]` : span;
};

/** "jul. 1948", "jul./out. 1948", "10 jun. 1976", "nov. 1936/jan. 1937", or the year. */
const periodDate = (d: Issued, letter: string): Inline[] => {
  const year = abntYear(d, letter);
  if (d.month === undefined) return [text(year)];
  const start = MONTHS_PT[d.month];
  if (d.endMonth !== undefined) {
    const end = MONTHS_PT[d.endMonth];
    return d.endYear === undefined
      ? [text(nb(`${start}/${end}`, year))]
      : [text(`${nb(start, String(d.year))}/${nb(end, String(d.endYear))}${letter}`)];
  }
  const shown = d.day === undefined ? nb(start, year) : nb(String(d.day), nb(start, year));
  return d.endYear === undefined && d.inferred !== true
    ? [time(isoDate(d.year, d.month, d.day), [text(shown)])]
    : [text(shown)];
};

const calendar = (c: CalendarDate): Inline =>
  time(isoDate(c.year, c.month, c.day), [text(nb(String(c.day), nb(MONTHS_PT[c.month], String(c.year))))]);

// ------------------------------------------------------------------- elements

const edition = (e: Edition | undefined): Block | undefined =>
  e === undefined ? undefined : e.kind === 'ordinal' ? block(text(nb(`${e.n}.`, 'ed.'))) : block(fromMarked(e.text));

/** "Rio de Janeiro: Jorge Zahar, 1999" with [S. l.] / [s. n.] / [S. l.: s. n.] when unknown (NBR 6023 §8.4–8.5). */
const imprint = (im: Imprint, date: readonly Inline[]): Block => {
  const where = im.place === undefined ? undefined : fromMarked(im.place);
  const who = im.publisher === undefined ? undefined : fromMarked(im.publisher);
  const head: readonly Inline[] =
    where === undefined && who === undefined
      ? [latin('[S. l.: s. n.]')]
      : [...(where ?? [latin('[S. l.]')]), text(': '), ...(who ?? [latin('[s. n.]')])];
  return block(head, text(', '), date);
};

const series = (s: Series | undefined): Block | undefined =>
  s === undefined
    ? undefined
    : block(text('('), fromMarked(s.title), s.number === undefined ? undefined : text(`, ${s.number}`), text(')'));

const directNames = (list: NameList): string => {
  const parts = list.names.map((n) => [text(nameDirect(n))]);
  return toPlainText(joinList(parts, ', ', ' e ')) + (list.others ? ' et al.' : '');
};

/** Tail shared by every type: DOI, availability and access, note (NBR 6023 §6.6, REF-37). */
const tail = (ref: Reference): readonly (Block | undefined)[] => [
  ref.doi === undefined ? undefined : block(text('DOI: '), link(doiUrl(ref.doi), [text(doiUrl(ref.doi))])),
  ref.url === undefined ? undefined : block(text('Disponível em: '), link(ref.url, [text(ref.url)])),
  ref.accessed === undefined ? undefined : block(text('Acesso em: '), calendar(ref.accessed)),
  ref.note === undefined ? undefined : block(fromMarked(ref.note)),
];

const physical = (parts: readonly (string | undefined)[]): Block | undefined => {
  const present = parts.filter((p): p is string => p !== undefined);
  return present.length === 0 ? undefined : block(text(present.join(', ')));
};

const pagesText = (ref: {
  readonly pages?: readonly { first: string; last?: string }[];
  readonly eid?: string;
}): string | undefined => {
  if (ref.pages !== undefined) return nb('p.', intervals(ref.pages, DASH));
  if (ref.eid === undefined) return undefined;
  // NBR 6023:2025 §7.7.6 prints the e-locator bare (e03304); a purely numeric
  // article number would read as a page, so it gets the norm's own "art." label.
  return /^\d+$/u.test(ref.eid) ? nb('art.', ref.eid) : ref.eid;
};

export const abntStyle = (options: AbntOptions = {}): CitationStyle => {
  const etAl = options.etAl ?? 'all';

  const names = (list: NameList, role?: EditorRole): Inline[] => {
    const shown = etAl === 'first' && list.names.length >= 4 ? list.names.slice(0, 1) : list.names;
    const truncated = shown.length < list.names.length || list.others;
    const joined = shown.map(nameEntry).join('; ');
    return [
      text(joined),
      ...(truncated ? [text(' '), latin('et al.')] : []),
      ...(role === undefined ? [] : [text(` (${ROLE_ABBREVIATION[role]})`)]),
    ];
  };

  /** The entry element and whether it consumed the title. */
  const entry = (ref: Reference): { readonly head: Block; readonly titleUsed: boolean } => {
    const r = responsibility(ref);
    if (r.kind === 'names') return { head: block(names(r.list, r.role)), titleUsed: false };
    const lead = leadingWords(ref.title.main, ref.language);
    const main = transformMarked(ref.title.main, 0, lead.end, upper);
    return {
      head: block(titleParts({ ...ref.title, main }, { highlight: plain, lang: foreign(ref.language, LOCALE) })),
      titleUsed: true,
    };
  };

  const workTitle = (t: Title, lang: string | undefined, highlight: boolean): Block =>
    block(titleParts(t, { highlight: highlight ? highlighted : plain, lang }));

  /** Secondary responsibilities after the title: translators, editors of an authored work. */
  const contributors = (ref: Reference): readonly (Block | undefined)[] => [
    hasNames(ref.translators) ? block(text(`Tradução: ${directNames(ref.translators)}`)) : undefined,
    (ref.type === 'book' || ref.type === 'online') && hasNames(ref.authors) && hasNames(ref.editors)
      ? block(text(`${ROLE_LABEL[ref.editorRole]}: ${directNames(ref.editors)}`))
      : undefined,
  ];

  const reference = (ref: Reference, letter: string): readonly Inline[] => {
    const lang = foreign(ref.language, LOCALE);
    const { head, titleUsed } = entry(ref);
    const ownTitle = (highlight: boolean): Block | undefined =>
      titleUsed ? undefined : workTitle(ref.title, lang, highlight);
    const year = [text(abntYear(ref.issued, letter))];
    switch (ref.type) {
      case 'book':
        return sentences([
          head,
          ownTitle(true),
          ...contributors(ref),
          edition(ref.edition),
          imprint(ref.imprint, year),
          physical([
            ref.volume === undefined ? undefined : nb('v.', ref.volume),
            ref.volumes === undefined ? undefined : nb(String(ref.volumes), 'v.'),
          ]),
          series(ref.series),
          ...tail(ref),
        ]);
      case 'chapter': {
        const host = hasNames(ref.bookAuthors)
          ? names(ref.bookAuthors)
          : hasNames(ref.editors)
            ? names(ref.editors, ref.editorRole)
            : undefined;
        return sentences([
          head,
          ownTitle(false),
          ...contributors(ref),
          host === undefined
            ? block(latin('In'), text(': '), titleParts(ref.container, { highlight: highlighted, lang }))
            : block(latin('In'), text(': '), host),
          host === undefined ? undefined : workTitle(ref.container, lang, true),
          edition(ref.edition),
          imprint(ref.imprint, year),
          physical([
            ref.volume === undefined ? undefined : nb('v.', ref.volume),
            ref.chapter === undefined ? undefined : nb('cap.', ref.chapter),
            ref.pages === undefined ? undefined : nb('p.', intervals(ref.pages, DASH)),
          ]),
          series(ref.series),
          ...tail(ref),
        ]);
      }
      case 'article': {
        const parts: (Inline | readonly Inline[])[] = [titleParts(ref.journal, { highlight: highlighted, lang })];
        const more = [
          ref.place === undefined ? undefined : fromMarked(ref.place),
          ref.volume === undefined ? undefined : [text(nb('v.', ref.volume))],
          ref.number === undefined ? undefined : [text(nb('n.', ref.number))],
          (() => {
            const p = pagesText(ref);
            return p === undefined ? undefined : [text(p)];
          })(),
          periodDate(ref.issued, letter),
        ].filter((x): x is Inline[] => x !== undefined);
        for (const m of more) parts.push(text(', '), m);
        return sentences([head, ownTitle(false), ...contributors(ref), block(...parts), ...tail(ref)]);
      }
      case 'inproceedings': {
        const event = ref.event;
        const inHead: readonly Inline[] =
          event !== undefined
            ? [
                ...fromMarked(transformMarked(event.title, 0, event.title.text.length, upper)),
                ...(event.number === undefined
                  ? []
                  : [text(`, ${event.number}${/^\d+$/u.test(event.number) ? '.' : ''}`)]),
                text(`, ${event.year ?? ref.issued.year}`),
                ...(event.venue === undefined ? [] : [text(', '), ...fromMarked(event.venue)]),
              ]
            : hasNames(ref.editors)
              ? names(ref.editors, ref.editorRole)
              : [];
        return sentences([
          head,
          ownTitle(false),
          ...contributors(ref),
          inHead.length === 0
            ? block(latin('In'), text(': '), titleParts(ref.container, { highlight: highlighted, lang }))
            : block(latin('In'), text(': '), inHead),
          inHead.length === 0 ? undefined : workTitle(ref.container, lang, true),
          imprint(ref.imprint, year),
          physical([ref.volume === undefined ? undefined : nb('v.', ref.volume), pagesText(ref)]),
          series(ref.series),
          ...tail(ref),
        ]);
      }
      case 'thesis': {
        const kind =
          ref.thesisType === undefined
            ? [text(ref.degree === 'phd' ? 'Tese (Doutorado)' : 'Dissertação (Mestrado)')]
            : fromMarked(ref.thesisType);
        return sentences([
          head,
          ownTitle(true),
          ...contributors(ref),
          block(year),
          ref.leaves === undefined ? undefined : block(text(nb(String(ref.leaves), 'f.'))),
          block(
            kind,
            text(' – '),
            fromMarked(ref.institution),
            ref.place === undefined ? undefined : [text(', '), ...fromMarked(ref.place)],
            text(`, ${ref.issued.year}`),
          ),
          ...tail(ref),
        ]);
      }
      case 'report':
        return sentences([
          head,
          ownTitle(true),
          ...contributors(ref),
          imprint({ ...(ref.place !== undefined ? { place: ref.place } : {}), publisher: ref.institution }, year),
          ref.reportType === undefined && ref.number === undefined
            ? undefined
            : block(
                text('('),
                ref.reportType === undefined ? undefined : fromMarked(ref.reportType),
                ref.reportType !== undefined && ref.number !== undefined ? text(', ') : undefined,
                ref.number === undefined ? undefined : text(nb('n.', ref.number)),
                text(')'),
              ),
          ...tail(ref),
        ]);
      case 'online': {
        const date = periodDate(ref.issued, letter);
        const site = ref.site;
        return sentences([
          head,
          ownTitle(site === undefined),
          ...contributors(ref),
          ref.version === undefined ? undefined : block(text(`Versão ${ref.version}`)),
          site !== undefined
            ? block(
                title(fromMarked(site)),
                ref.imprint.place === undefined ? undefined : [text(', '), ...fromMarked(ref.imprint.place)],
                text(', '),
                date,
              )
            : ref.imprint.publisher !== undefined
              ? imprint(ref.imprint, date)
              : block(
                  ref.imprint.place === undefined ? latin('[S. l.]') : fromMarked(ref.imprint.place),
                  text(', '),
                  date,
                ),
          ...tail(ref),
        ]);
      }
      case 'software':
        return sentences([
          head,
          ownTitle(true),
          ...contributors(ref),
          ref.version === undefined ? undefined : block(text(`Versão ${ref.version}`)),
          ref.imprint.publisher !== undefined
            ? imprint(ref.imprint, year)
            : block(
                ref.imprint.place === undefined ? latin('[S. l.]') : fromMarked(ref.imprint.place),
                text(', '),
                year,
              ),
          ...tail(ref),
        ]);
      default:
        return absurd(ref);
    }
  };

  const label = (ref: Reference, mode: CitationMode): readonly Inline[] => {
    const r = responsibility(ref);
    if (r.kind === 'title') {
      const lead = leadingWords(ref.title.main, ref.language);
      const words = lead.whole ? ref.title.main.text : `${ref.title.main.text.slice(0, lead.end)} [...]`;
      const lang = foreign(ref.language, LOCALE);
      return inLang(lang, [text(words)]);
    }
    const cited = r.list.names.map(nameCited);
    if (cited.length >= 4 || (r.list.others && cited.length > 0)) return [text(`${cited[0] ?? ''} `), latin('et al.')];
    const parts = cited.map((c) => [text(c)]);
    return mode === 'parenthetical' ? joinInline(parts, '; ') : joinList(parts, ', ', ' e ');
  };

  const locator = (l: Locator): string => {
    const term = l.symbol ?? LOCATOR_TERMS[l.label];
    return nb(term, intervals(l.values, DASH));
  };

  return {
    id: 'abnt',
    locale: 'pt-BR',
    reference,
    sortKey: (ref) => toPlainText(reference(ref, '')),
    label,
    year: (ref, letter) => abntYear(ref.issued, letter),
    locator,
    call: { open: '(', close: ')', items: '; ', authorYear: ', ', years: ', ', locator: ', ' },
  };
};

/** The ABNT style with the default policy (all authors listed in references). */
export const abnt: CitationStyle = abntStyle();
