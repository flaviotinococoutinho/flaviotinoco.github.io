/**
 * APA 7 style for English documents (Publication Manual of the American
 * Psychological Association, 7th ed., 2020, ch. 8–10) — pure; data + templates.
 *
 * References (§9.4–9.50, ch. 10): Author, A. A., & Author, B. B. (Year). Title of
 * work: Capital after colon. *Source, Volume*(Issue), pages. https://doi.org/…
 *   - initials for given names; "&" before the last of 2–20 authors; 21+ → first
 *     19, an ellipsis and the last (§9.8);
 *   - titles of stand-alone works in italics (<cite>, italic by default), parts
 *     in plain text; the first word of a subtitle is capitalised (§6.17);
 *     titles are otherwise printed as written — never re-cased automatically;
 *   - DOI as https://doi.org/… with no final period (§9.34–9.35); no publisher
 *     location (§9.29); retrieval dates omitted for stable documents (§9.16).
 * Calls (§8.10–8.18): (Shannon, 1948, p. 379) / Shannon (1948, p. 379);
 * (Clarac & Bonnin, 1985) / Clarac and Bonnin (1985); 3+ → Maciel et al.
 * (not italicised in APA); several works alphabetical, separated by "; ".
 */
import { absurd } from '../../algebra/match.ts';
import type { Locator, LocatorLabel } from '../cite/locator.ts';
import type { MarkedText } from '../bibtex/latex.ts';
import type { Name, NameList } from '../bibtex/names.ts';
import type { Edition, EditorRole, Issued, Reference, Title } from '../model/reference.ts';
import { inLang, italic, link, text, title, toPlainText, type Inline } from '../render/inline.ts';
import {
  NBSP,
  block,
  capitalizeFirst,
  doiHref,
  doiUrl,
  foreign,
  fromMarked,
  hasNames,
  initials,
  intervals,
  isPlural,
  joinList,
  plain,
  sentences,
  titleParts,
  yearText,
  type Block,
} from './shared.ts';
import type { CitationMode, CitationStyle } from './style.ts';
import { MONTHS_EN } from './terms.ts';

const LOCALE = 'en';
const DASH = '–';

const ORDINAL_SUFFIX = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
};

const LOCATOR_TERMS: Readonly<Record<LocatorLabel, readonly [singular: string, plural: string]>> = {
  page: ['p.', 'pp.'],
  folio: ['fol.', 'fols.'],
  chapter: ['Chapter', 'Chapters'],
  section: ['Section', 'Sections'],
  paragraph: ['para.', 'paras.'],
  volume: ['Vol.', 'Vols.'],
  part: ['Part', 'Parts'],
  note: ['n.', 'nn.'],
  line: ['line', 'lines'],
  article: ['Article', 'Articles'],
  location: ['loc.', 'locs.'],
  figure: ['Figure', 'Figures'],
  slide: ['Slide', 'Slides'],
};

const ROLE: Readonly<Record<EditorRole, readonly [singular: string, plural: string]>> = {
  editor: ['Ed.', 'Eds.'],
  organizer: ['Ed.', 'Eds.'],
  coordinator: ['Ed.', 'Eds.'],
  compiler: ['Comp.', 'Comps.'],
};

const nb = (label: string, value: string): string => `${label}${NBSP}${value}`;
/** A numeric range used as a designation takes the en dash in APA ("3–4"); identifiers ("s2-42") do not. */
const dashed = (s: string): string => (/^\d+-\d+$/u.test(s) ? s.replace('-', DASH) : s);

/** Surname with its particle as the bearer writes it (van Beethoven), plus Jr. */
const familyWithParticle = (n: Name): string =>
  n.kind === 'person' ? [n.particle?.text, n.family.text].filter((s) => s !== undefined).join(' ') : n.name.text;

/** "Shannon, C. E.", "Ford, H., Jr.", "World Wide Web Consortium" (§9.8). */
const nameInverted = (n: Name): string => {
  if (n.kind === 'corporate') return n.name.text;
  const given = n.given === undefined ? '' : initials(n.given.text);
  const head = given === '' ? familyWithParticle(n) : `${familyWithParticle(n)}, ${given}`;
  return n.suffix === undefined ? head : `${head}, ${n.suffix.text}`;
};

/** "C. E. Shannon" (editors and translators in direct order, §9.10). */
const nameDirect = (n: Name): string => {
  if (n.kind === 'corporate') return n.name.text;
  const given = n.given === undefined ? '' : `${initials(n.given.text)} `;
  return `${given}${familyWithParticle(n)}${n.suffix === undefined ? '' : `, ${n.suffix.text}`}`;
};

/** Author list of the entry (§9.8): "A, B, & C"; 21+ → 19 names, "…", the last. */
const authorList = (list: NameList): string => {
  const all = list.names.map(nameInverted);
  if (all.length === 0) return '';
  if (list.others) return `${all.join(', ')}, et al.`;
  if (all.length === 1) return all[0] ?? '';
  if (all.length === 2) return `${all[0] ?? ''}, & ${all[1] ?? ''}`;
  if (all.length <= 20) return `${all.slice(0, -1).join(', ')}, & ${all.at(-1) ?? ''}`;
  return `${all.slice(0, 19).join(', ')}, . . . ${all.at(-1) ?? ''}`;
};

/** "C. Bally & A. Sechehaye" (direct order, §9.10). */
const directList = (list: NameList): string =>
  toPlainText(
    joinList(
      list.names.map((n) => [text(nameDirect(n))]),
      ', ',
      list.names.length > 2 ? ', & ' : ' & ',
    ),
  ) + (list.others ? ', et al.' : '');

const roleOf = (role: EditorRole, count: number): string => ROLE[role][count === 1 ? 0 : 1];

const editionText = (e: Edition): string =>
  e.kind === 'ordinal' ? nb(`${e.n}${ORDINAL_SUFFIX(e.n)}`, 'ed.') : e.text.text;

const apaYear = (d: Issued, letter: string): string => yearText(d, DASH, false) + letter;

/** "(1948)", "(1931–1958)", "(2019, November 5)" — month and day only for web documents (§9.14). */
const dateBlock = (ref: Reference, letter: string): Block => {
  const year = apaYear(ref.issued, letter);
  const d = ref.issued;
  const withDay = ref.type === 'online' && d.month !== undefined && d.endYear === undefined;
  const shown =
    withDay && d.month !== undefined ? `${year}, ${MONTHS_EN[d.month]}${d.day === undefined ? '' : ` ${d.day}`}` : year;
  return block(text(`(${shown})`));
};

/** Title with the first word of its subtitle capitalised (§6.17). */
const apaTitle = (t: Title): Title => (t.sub === undefined ? t : { main: t.main, sub: capitalizeFirst(t.sub, LOCALE) });

/** Title of a part (article, chapter, paper): plain text (§9.19), subtitle capitalised. */
const partTitle = (t: Title, lang: string | undefined, notes: readonly string[]): Block =>
  block(
    titleParts(apaTitle(t), { highlight: plain, lang }),
    notes.length === 0 ? undefined : text(` (${notes.join(', ')})`),
  );

/** Stand-alone title (italic as a whole, subtitle included) — the APA rule differs from ABNT's here. */
const standaloneTitle = (t: Title, lang: string | undefined, notes: readonly string[], bracket?: string): Block => {
  const full = apaTitle(t);
  const content: Inline[] =
    full.sub === undefined ? fromMarked(full.main) : [...fromMarked(full.main), text(': '), ...fromMarked(full.sub)];
  const cited = [title(content, lang)];
  return block(
    cited,
    notes.length === 0 ? undefined : text(` (${notes.join(', ')})`),
    bracket === undefined ? undefined : text(` [${bracket}]`),
  );
};

/** Names of the authors as written in running text ("Flávio Tinoco", "World Wide Web Consortium"). */
const authorNames = (ref: Reference): readonly string[] =>
  ref.authors.names.map((n) =>
    n.kind === 'corporate'
      ? n.name.text
      : [n.given?.text, n.particle?.text, n.family.text, n.suffix?.text].filter((s) => s !== undefined).join(' '),
  );

/**
 * The publisher (or site name) element — omitted when it repeats the author,
 * APA 7 §9.24 ("When the author and publisher are the same, omit the publisher")
 * and §10.16 (webpages: "When the author and site name are the same, omit the
 * site name").
 */
const publisherBlock = (ref: Reference, publisher: MarkedText | undefined): Block | undefined => {
  if (publisher === undefined) return undefined;
  const same = (a: string): boolean => a.localeCompare(publisher.text, LOCALE, { sensitivity: 'base' }) === 0;
  return authorNames(ref).some(same) ? undefined : block(fromMarked(publisher));
};

const doiOrUrl = (ref: Reference): readonly (Block | undefined)[] =>
  ref.doi !== undefined
    ? [{ content: [link(doiHref(ref.doi), [text(doiUrl(ref.doi))])], terminal: 'none' }]
    : ref.url !== undefined
      ? [{ content: [link(ref.url, [text(ref.url)])], terminal: 'none' }]
      : [];

const pagesNote = (pages: readonly { first: string; last?: string }[] | undefined): string | undefined =>
  pages === undefined ? undefined : nb(isPlural(pages) ? 'pp.' : 'p.', intervals(pages, DASH));

export const apaStyle = (): CitationStyle => {
  type Head = { readonly head: readonly Block[]; readonly titleUsed: boolean };

  /** Author element (or editors as authors, or the title moved to the author position, §9.12). */
  const entryHead = (ref: Reference, letter: string, standalone: boolean, notes: readonly string[]): Head => {
    const lang = foreign(ref.language, LOCALE);
    if (hasNames(ref.authors))
      return { head: [block(text(authorList(ref.authors))), dateBlock(ref, letter)], titleUsed: false };
    if ((ref.type === 'book' || ref.type === 'online') && hasNames(ref.editors)) {
      const role = roleOf(ref.editorRole, ref.editors.names.length);
      return { head: [block(text(`${authorList(ref.editors)} (${role})`)), dateBlock(ref, letter)], titleUsed: false };
    }
    const t = standalone ? standaloneTitle(ref.title, lang, notes) : partTitle(ref.title, lang, notes);
    return { head: [t, dateBlock(ref, letter)], titleUsed: true };
  };

  const reference = (ref: Reference, letter: string): readonly Inline[] => {
    const lang = foreign(ref.language, LOCALE);
    const translators = hasNames(ref.translators) ? [`${directList(ref.translators)}, Trans.`] : [];
    switch (ref.type) {
      case 'book': {
        const editors =
          hasNames(ref.authors) && hasNames(ref.editors)
            ? [`${directList(ref.editors)}, ${roleOf(ref.editorRole, ref.editors.names.length)}`]
            : [];
        const notes = [
          ...editors,
          ...translators,
          ...(ref.edition === undefined ? [] : [editionText(ref.edition)]),
          ...(ref.volume !== undefined
            ? [nb('Vol.', ref.volume)]
            : ref.volumes !== undefined
              ? [nb('Vols.', `1${DASH}${ref.volumes}`)]
              : []),
        ];
        const { head, titleUsed } = entryHead(ref, letter, true, notes);
        return sentences([
          ...head,
          titleUsed ? undefined : standaloneTitle(ref.title, lang, notes),
          publisherBlock(ref, ref.imprint.publisher),
          ...doiOrUrl(ref),
        ]);
      }
      case 'chapter':
      case 'inproceedings': {
        const { head, titleUsed } = entryHead(ref, letter, false, translators);
        const hostNames =
          ref.type === 'chapter' && hasNames(ref.bookAuthors)
            ? directList(ref.bookAuthors)
            : hasNames(ref.editors)
              ? `${directList(ref.editors)} (${roleOf(ref.editorRole, ref.editors.names.length)})`
              : undefined;
        const notes = [
          ...(ref.type === 'chapter' && ref.edition !== undefined ? [editionText(ref.edition)] : []),
          ...(ref.volume === undefined ? [] : [nb('Vol.', ref.volume)]),
          ...(pagesNote(ref.pages) === undefined ? [] : [pagesNote(ref.pages) ?? '']),
          ...(ref.type === 'inproceedings' && ref.eid !== undefined ? [nb('Article', ref.eid)] : []),
        ];
        const container = standaloneTitle(ref.container, lang, notes);
        return sentences([
          ...head,
          titleUsed ? undefined : partTitle(ref.title, lang, translators),
          block(text(hostNames === undefined ? 'In ' : `In ${hostNames}, `), container.content),
          ref.imprint.publisher === undefined ? undefined : block(fromMarked(ref.imprint.publisher)),
          ...doiOrUrl(ref),
        ]);
      }
      case 'article': {
        const { head, titleUsed } = entryHead(ref, letter, false, translators);
        const journal = apaTitle(ref.journal);
        const journalName: Inline[] =
          journal.sub === undefined
            ? fromMarked(journal.main)
            : [...fromMarked(journal.main), text(': '), ...fromMarked(journal.sub)];
        const source: (Inline | readonly Inline[] | undefined)[] = [
          title(journalName, lang),
          ref.volume === undefined ? undefined : [text(', '), italic([text(dashed(ref.volume))])],
          // Issue in parentheses after the volume; without a volume it follows a comma (§9.25).
          ref.number === undefined ? undefined : text(`${ref.volume === undefined ? ', ' : ''}(${dashed(ref.number)})`),
          ref.pages !== undefined
            ? text(`, ${intervals(ref.pages, DASH)}`)
            : ref.eid !== undefined
              ? text(`, ${nb('Article', ref.eid)}`)
              : undefined,
        ];
        return sentences([
          ...head,
          titleUsed ? undefined : partTitle(ref.title, lang, translators),
          block(...source),
          ...doiOrUrl(ref),
        ]);
      }
      case 'thesis': {
        const kind =
          ref.thesisType !== undefined
            ? ref.thesisType.text
            : ref.degree === 'phd'
              ? 'Doctoral dissertation'
              : "Master's thesis";
        const bracket = `${kind}, ${ref.institution.text}`;
        const { head, titleUsed } = entryHead(ref, letter, true, translators);
        return sentences([
          ...head,
          titleUsed ? undefined : standaloneTitle(ref.title, lang, translators, bracket),
          ...doiOrUrl(ref),
        ]);
      }
      case 'report': {
        const designation =
          ref.number === undefined
            ? []
            : [`${ref.reportType === undefined ? 'Report' : ref.reportType.text} No. ${ref.number}`];
        const { head, titleUsed } = entryHead(ref, letter, true, [...translators, ...designation]);
        return sentences([
          ...head,
          titleUsed ? undefined : standaloneTitle(ref.title, lang, [...translators, ...designation]),
          publisherBlock(ref, ref.institution),
          ...doiOrUrl(ref),
        ]);
      }
      case 'online': {
        const notes = [...translators, ...(ref.version === undefined ? [] : [`Version ${ref.version}`])];
        const { head, titleUsed } = entryHead(ref, letter, true, notes);
        return sentences([
          ...head,
          titleUsed ? undefined : standaloneTitle(ref.title, lang, notes),
          publisherBlock(ref, ref.site ?? ref.imprint.publisher),
          ...doiOrUrl(ref),
        ]);
      }
      case 'software': {
        const notes = [...translators, ...(ref.version === undefined ? [] : [`Version ${ref.version}`])];
        const { head, titleUsed } = entryHead(ref, letter, true, notes);
        return sentences([
          ...head,
          titleUsed ? undefined : standaloneTitle(ref.title, lang, notes, 'Computer software'),
          publisherBlock(ref, ref.imprint.publisher),
          ...doiOrUrl(ref),
        ]);
      }
      default:
        return absurd(ref);
    }
  };

  /** Sort key (§9.44–9.47): authors as listed, then year, then title. */
  const sortKey = (ref: Reference): string => {
    const who = hasNames(ref.authors)
      ? authorList(ref.authors)
      : (ref.type === 'book' || ref.type === 'online') && hasNames(ref.editors)
        ? authorList(ref.editors)
        : ref.title.main.text;
    return [who, apaYear(ref.issued, ''), ref.title.main.text].join('\u0001');
  };

  const label = (ref: Reference, mode: CitationMode): readonly Inline[] => {
    const list = hasNames(ref.authors)
      ? ref.authors
      : (ref.type === 'book' || ref.type === 'online') && hasNames(ref.editors)
        ? ref.editors
        : undefined;
    if (list === undefined) {
      const lang = foreign(ref.language, LOCALE);
      const t = ref.title.main;
      const standalone = ref.type !== 'article' && ref.type !== 'chapter' && ref.type !== 'inproceedings';
      return standalone ? [title(fromMarked(t), lang)] : [text('“'), ...inLang(lang, fromMarked(t)), text('”')];
    }
    const cited = list.names.map(familyWithParticle);
    if (cited.length >= 3 || list.others) return [text(`${cited[0] ?? ''} et al.`)];
    if (cited.length === 1) return [text(cited[0] ?? '')];
    return [text(`${cited[0] ?? ''} ${mode === 'parenthetical' ? '&' : 'and'} ${cited[1] ?? ''}`)];
  };

  const locator = (l: Locator): string => {
    const plural = isPlural(l.values);
    const term = l.symbol ?? LOCATOR_TERMS[l.label][plural ? 1 : 0];
    return nb(term, intervals(l.values, DASH));
  };

  return {
    id: 'apa',
    locale: 'en',
    reference,
    sortKey,
    label,
    year: (ref, letter) => apaYear(ref.issued, letter),
    locator,
    call: { open: '(', close: ')', items: '; ', authorYear: ', ', years: ', ', locator: ', ' },
  };
};

export const apa: CitationStyle = apaStyle();
