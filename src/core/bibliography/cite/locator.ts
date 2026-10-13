/**
 * Locators of a citation: "p. 12", "pp. 12–15", "cap. 3", "§ 4" (pure parser).
 *
 * Follows Pandoc's citation suffix convention (Pandoc User's Guide, "Citation
 * syntax"): after the key, a comma introduces an optional locator — a label (in
 * Portuguese or English, abbreviated or not) and a value (numbers or roman
 * numerals, ranges with -, -- or –, lists with ","); a bare number is a page. What
 * does not parse as a locator stays a verbatim suffix ("grifo nosso").
 */

export type LocatorLabel =
  | 'page'
  | 'folio'
  | 'chapter'
  | 'section'
  | 'paragraph'
  | 'volume'
  | 'part'
  | 'note'
  | 'line'
  | 'article'
  | 'location'
  | 'figure'
  | 'slide';

export type LocatorValue = { readonly first: string; readonly last?: string };

export type Locator = {
  readonly label: LocatorLabel;
  readonly values: readonly LocatorValue[];
  /** The symbol used in the source (§ or ¶), reproduced as written. */
  readonly symbol?: '§' | '¶';
};

const LABELS: Readonly<Record<string, LocatorLabel>> = {
  p: 'page',
  pp: 'page',
  pg: 'page',
  pag: 'page',
  pág: 'page',
  page: 'page',
  pages: 'page',
  página: 'page',
  páginas: 'page',
  f: 'folio',
  ff: 'folio',
  fol: 'folio',
  folio: 'folio',
  folha: 'folio',
  folhas: 'folio',
  cap: 'chapter',
  caps: 'chapter',
  chap: 'chapter',
  chaps: 'chapter',
  ch: 'chapter',
  chapter: 'chapter',
  chapters: 'chapter',
  capítulo: 'chapter',
  capítulos: 'chapter',
  sec: 'section',
  secs: 'section',
  section: 'section',
  sections: 'section',
  seção: 'section',
  seções: 'section',
  secção: 'section',
  para: 'paragraph',
  paras: 'paragraph',
  par: 'paragraph',
  paragraph: 'paragraph',
  paragraphs: 'paragraph',
  parágrafo: 'paragraph',
  parágrafos: 'paragraph',
  v: 'volume',
  vol: 'volume',
  vols: 'volume',
  volume: 'volume',
  volumes: 'volume',
  pt: 'part',
  part: 'part',
  parts: 'part',
  parte: 'part',
  n: 'note',
  nn: 'note',
  note: 'note',
  notes: 'note',
  nota: 'note',
  notas: 'note',
  l: 'line',
  ll: 'line',
  line: 'line',
  lines: 'line',
  linha: 'line',
  linhas: 'line',
  art: 'article',
  arts: 'article',
  article: 'article',
  artigo: 'article',
  local: 'location',
  loc: 'location',
  location: 'location',
  fig: 'figure',
  figs: 'figure',
  figure: 'figure',
  figura: 'figure',
  slide: 'slide',
  slides: 'slide',
};

/** Labelled values may be roman numerals (cap. V, p. xi); bare values must be numeric. */
const VALUE = String.raw`(?:\d+[a-z]?|[ivxlcdm]+|[IVXLCDM]+|[eE]\d+)`;
const BARE = String.raw`(?:\d+[a-z]?|[eE]\d+)`;
const range = (v: string): string => String.raw`${v}(?:\s*(?:--?|–|—)\s*${v})?`;
const list = (v: string): string => String.raw`${range(v)}(?:\s*,\s*(?=\d)${range(v)})*`;
const END = String.raw`(?=$|[\s,;.)])`;
const LABELLED = new RegExp(String.raw`^\s*(?:(§§?|¶¶?)\s*|([\p{L}]+)(?:\.\s*|\s+))(${list(VALUE)})${END}`, 'u');
const UNLABELLED = new RegExp(String.raw`^\s*()()(${list(BARE)})${END}`, 'u');

export type ParsedSuffix = { readonly locator?: Locator; readonly rest: string };

const values = (list: string): LocatorValue[] =>
  list.split(/\s*,\s*/u).map((item) => {
    const m = /^(.+?)\s*(?:--?|–|—)\s*(.+)$/u.exec(item);
    return m === null ? { first: item.trim() } : { first: (m[1] as string).trim(), last: (m[2] as string).trim() };
  });

/**
 * Parses the text after a citation key. The suffix must start with "," to
 * carry a locator (Pandoc rule); the remainder after the locator is kept as a
 * verbatim suffix.
 */
export const parseSuffix = (suffix: string): ParsedSuffix => {
  const m = /^\s*,\s*/u.exec(suffix);
  if (m === null) return { rest: suffix };
  const body = suffix.slice(m[0].length);
  const loc = LABELLED.exec(body) ?? UNLABELLED.exec(body);
  if (loc === null) return { rest: suffix };
  const symbol = loc[1] === '' ? undefined : loc[1];
  const word = loc[2] === '' ? undefined : loc[2];
  let label: LocatorLabel = 'page';
  if (word !== undefined) {
    const known = LABELS[word.toLowerCase()];
    if (known === undefined) return { rest: suffix };
    label = known;
  } else if (symbol !== undefined) {
    label = symbol.startsWith('§') ? 'section' : 'paragraph';
  }
  const rest = body.slice(loc[0].length);
  const locator: Locator = {
    label,
    values: values(loc[3] as string),
    ...(symbol !== undefined ? { symbol: symbol.startsWith('§') ? ('§' as const) : ('¶' as const) } : {}),
  };
  return { locator, rest };
};
