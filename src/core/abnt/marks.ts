/**
 * Marks — the closed set of inline structures the "abnt" stage may add.
 *
 * A mark only ADDS structure around existing text; it never inserts, deletes or
 * replaces characters (information preservation, docs/arquitetura.md §2.4).
 * Each mark has exactly one explicit authoring form (a text directive of the
 * closed language, §5.6) and one HTML rendering; an automatic mark is the same
 * value an author would get by writing the directive, so serialising the tree
 * back to Markdown yields valid explicit syntax and re-running the stage is a
 * no-op (idempotence).
 *
 *   :foreign[Zeitgeist]{lang=de}  → <i lang="de" class="foreign">        (lang "la" → class="locution")
 *   :name[Saussure]               → <span class="proper-name" translate="no">
 *   :name[Tractatus]{category=work lang=la} → <cite class="proper-name work" translate="no" lang="la">
 *   :abbr[FFT]{title="…"}         → <abbr class="acronym" title="…">
 *   :nowrap[10 kHz]               → <span class="nowrap">
 *   :sc[texto]                    → <span class="sc">
 *   :raw[data]                    → <span>                (suppresses automatic marking inside)
 *
 * HTML semantics: the `i` element represents "a span of text in an alternate
 * voice or mood", e.g. "an idiomatic phrase from another language" (HTML Living
 * Standard, "The i element"); with `lang` it satisfies WCAG 2.2 SC 3.1.2
 * Language of Parts and gives browsers the right hyphenation dictionary. Proper
 * names get no `lang` (SC 3.1.2 exempts proper names) but `translate="no"`
 * (HTML Living Standard, "The translate attribute").
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { absurd } from '../algebra/match.ts';
import { type LanguageTag, parseLanguageTag, primaryLanguage } from '../lexicon/language-tag.ts';
import { PROPER_CATEGORIES, type ProperCategory } from '../lexicon/types.ts';

export const MARK_NAMES = ['foreign', 'name', 'abbr', 'nowrap', 'sc', 'raw'] as const;
export type MarkName = (typeof MARK_NAMES)[number];

export type Mark =
  | { readonly name: 'foreign'; readonly lang: LanguageTag }
  | {
      readonly name: 'name';
      readonly category: ProperCategory | undefined;
      /** Only for titles of works in another language (persons and places get no lang: SC 3.1.2 exemption). */
      readonly lang: LanguageTag | undefined;
    }
  | { readonly name: 'abbr'; readonly title: string | undefined }
  | { readonly name: 'nowrap' }
  | { readonly name: 'sc' }
  | { readonly name: 'raw' };

export const isMarkName = (name: string): name is MarkName => (MARK_NAMES as readonly string[]).includes(name);

/** The HTML element of a mark, as hast tagName + properties (property names in hast spelling). */
export interface HastShape {
  readonly tagName: string;
  readonly properties: Readonly<Record<string, string | readonly string[]>>;
}

export const markToHast = (mark: Mark): HastShape => {
  switch (mark.name) {
    case 'foreign':
      return {
        tagName: 'i',
        properties: { lang: mark.lang, className: [primaryLanguage(mark.lang) === 'la' ? 'locution' : 'foreign'] },
      };
    case 'name': {
      const lang = mark.lang === undefined ? {} : { lang: mark.lang };
      return mark.category === 'work'
        ? { tagName: 'cite', properties: { className: ['proper-name', 'work'], translate: 'no', ...lang } }
        : { tagName: 'span', properties: { className: ['proper-name'], translate: 'no', ...lang } };
    }
    case 'abbr':
      return mark.title === undefined
        ? { tagName: 'abbr', properties: { className: ['acronym'] } }
        : { tagName: 'abbr', properties: { className: ['acronym'], title: mark.title } };
    case 'nowrap':
      return { tagName: 'span', properties: { className: ['nowrap'] } };
    case 'sc':
      return { tagName: 'span', properties: { className: ['sc'] } };
    case 'raw':
      return { tagName: 'span', properties: {} };
    default:
      return absurd(mark);
  }
};

/** The explicit directive equivalent of a mark (name + attributes as an author would write them). */
export const markToDirective = (
  mark: Mark,
): { readonly name: MarkName; readonly attributes: Readonly<Record<string, string>> } => {
  switch (mark.name) {
    case 'foreign':
      return { name: 'foreign', attributes: { lang: mark.lang } };
    case 'name':
      return {
        name: 'name',
        attributes: {
          ...(mark.category === 'work' ? { category: 'work' } : {}),
          ...(mark.lang === undefined ? {} : { lang: mark.lang }),
        },
      };
    case 'abbr':
      return { name: 'abbr', attributes: mark.title === undefined ? {} : { title: mark.title } };
    case 'nowrap':
    case 'sc':
    case 'raw':
      return { name: mark.name, attributes: {} };
    default:
      return absurd(mark);
  }
};

export type DirectiveProblem =
  | { readonly kind: 'missing-lang' }
  | { readonly kind: 'bad-lang'; readonly detail: string }
  | { readonly kind: 'bad-category'; readonly value: string }
  | { readonly kind: 'unknown-attribute'; readonly attribute: string };

const ALLOWED: Readonly<Record<MarkName, readonly string[]>> = {
  foreign: ['lang'],
  name: ['category', 'lang'],
  abbr: ['title'],
  nowrap: [],
  sc: [],
  raw: [],
};

/**
 * Reads an explicit directive into a mark. Fatal problems (a `:foreign` without
 * a valid BCP 47 `lang`) are errors; unknown attributes are reported as
 * warnings alongside a valid mark (they are ignored, never rendered).
 */
export const parseDirectiveMark = (
  name: MarkName,
  attributes: Readonly<Record<string, string | null | undefined>>,
): Result<{ readonly mark: Mark; readonly warnings: readonly DirectiveProblem[] }, DirectiveProblem> => {
  const warnings: DirectiveProblem[] = Object.keys(attributes)
    .filter((a) => !ALLOWED[name].includes(a))
    .map((attribute) => ({ kind: 'unknown-attribute', attribute }));
  const value = (key: string): string | undefined => {
    const v = attributes[key];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };
  switch (name) {
    case 'foreign': {
      const raw = value('lang');
      if (raw === undefined) return err({ kind: 'missing-lang' });
      const lang = parseLanguageTag(raw);
      if (!lang.ok) return err({ kind: 'bad-lang', detail: lang.error });
      return ok({ mark: { name, lang: lang.value }, warnings });
    }
    case 'name': {
      const raw = value('category');
      if (raw !== undefined && !(PROPER_CATEGORIES as readonly string[]).includes(raw)) {
        return err({ kind: 'bad-category', value: raw });
      }
      const rawLang = value('lang');
      const lang = rawLang === undefined ? undefined : parseLanguageTag(rawLang);
      if (lang !== undefined && !lang.ok) return err({ kind: 'bad-lang', detail: lang.error });
      return ok({ mark: { name, category: raw as ProperCategory | undefined, lang: lang?.value }, warnings });
    }
    case 'abbr':
      return ok({ mark: { name, title: value('title')?.normalize('NFC') }, warnings });
    case 'nowrap':
    case 'sc':
    case 'raw':
      return ok({ mark: { name }, warnings });
    default:
      return absurd(name);
  }
};
