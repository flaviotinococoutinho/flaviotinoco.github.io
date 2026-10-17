/**
 * Pure scanners used by the corpus checks (syntax.test.ts). They are small
 * re-implementations of the *recognisers* of the authoring language
 * (docs/arquitetura.md §5), written independently of the production stages so
 * that the content can be validated while those stages are developed in
 * parallel. Each one is property-tested in checkers.test.ts.
 */
import type { Nodes, Root } from 'mdast';
import { visit } from 'unist-util-visit';

// ---------------------------------------------------------------------------
// Closed vocabularies (the contract with the other workstreams)
// ---------------------------------------------------------------------------

/** BibTeX keys provided by the bibliography workstream (bibliography/*.bib). */
export const CITATION_KEYS: ReadonlySet<string> = new Set([
  'shannon1948',
  'shannon1949',
  'nyquist1928',
  'whittaker1915',
  'weaver1949',
  'peirce1931',
  'saussure1916',
  'frege1892',
  'huffman1952',
  'cover2006',
  'cooley1965',
  'may1976',
  'feigenbaum1978',
  'lorenz1963',
  'hick1952',
  'hyman1953',
  'kent1964',
  'ranganathan1933',
  'toulmin1958',
  'seco2004',
  'lin1998',
  'resnik1995',
  'gruber1993',
  'bringhurst2004',
  'tufte1990',
  'nelson1965',
  'brysbaert2019',
  'machado2009',
  'szafir2018',
  'bloom1970',
  'kirsch2008',
  'liang1983',
  'knuth1984',
  'bridson2007',
  'kotelnikov1933',
  'godel1931',
  'turing1936',
  'floridi2011',
  'wittgenstein1922',
  'popper1959',
]);

/** SKOS concept ids provided by the ontology workstream (src/content/concepts/*.json). */
export const CONCEPT_IDS: ReadonlySet<string> = new Set([
  'being',
  'ontology',
  'epistemology',
  'knowledge',
  'sign',
  'symbol',
  'meaning',
  'sense-and-reference',
  'inference',
  'argument',
  'information',
  'entropy',
  'mutual-information',
  'channel',
  'channel-capacity',
  'redundancy',
  'signal',
  'noise',
  'frequency',
  'model',
  'fourier-transform',
  'fourier-series',
  'gibbs-phenomenon',
  'sampling-theorem',
  'aliasing',
  'fast-fourier-transform',
  'prefix-code',
  'huffman-code',
  'kraft-inequality',
  'logistic-map',
  'deterministic-chaos',
  'lyapunov-exponent',
  'bifurcation',
  'central-limit-theorem',
  'decision',
  'hick-hyman-law',
  'cognitive-load',
  'value',
  'product',
  'interface',
]);

export const WIDGETS: ReadonlySet<string> = new Set(['fourier', 'sampling', 'entropy', 'channel', 'logistic', 'clt']);

/** Argument-node kinds (Toulmin, 1958) accepted by the reading stage. */
export const ARGUMENT_KINDS: ReadonlySet<string> = new Set([
  'question',
  'definition',
  'premise',
  'claim',
  'proof',
  'example',
  'objection',
  'reply',
  'application',
  'conclusion',
]);

/** amsthm-style environments handled by the latex stage. */
export const ENVIRONMENTS: ReadonlySet<string> = new Set([
  'definition',
  'theorem',
  'lemma',
  'proposition',
  'corollary',
  'conjecture',
  'axiom',
  'example',
  'remark',
  'proof',
]);

/** Every directive name of the closed authoring language, by directive kind. */
export const DIRECTIVES = {
  containerDirective: new Set([
    ...ENVIRONMENTS,
    'figure',
    'stretch',
    'scrolly',
    'step',
    'horizontal',
    'panel',
    'epigraph',
    'aside',
  ]),
  leafDirective: new Set(['bibliography', 'toc', 'concept-map', 'lab']),
  textDirective: new Set(['ref', 'eqref', 'sidenote', 'marginnote', 'concept', 'foreign', 'name', 'abbr', 'raw', 'sc']),
} as const satisfies Record<string, ReadonlySet<string>>;

/** Cross-reference label (src/core/domain/identifiers.ts, parseLabel). */
export const LABEL = /^[a-z]+:[a-z0-9][a-z0-9-]*$/;
/** Heading ids: lowercase ASCII words joined by single hyphens. */
export const HEADING_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** BCP 47 shape (RFC 5646 §2.1, simplified). */
export const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

// ---------------------------------------------------------------------------
// Citations (Pandoc syntax, docs/arquitetura.md §5.4)
// ---------------------------------------------------------------------------

export interface CitationUse {
  readonly key: string;
  /** Inside a bracketed cluster ([@k, p. 3; @j]) rather than narrative (@k [p. 3]). */
  readonly bracketed: boolean;
  readonly offset: number;
}

/**
 * Pandoc citation keys: start with a letter, digit or "_", continue with
 * alphanumerics and internal punctuation that is followed by an alphanumeric
 * (so the period ending a sentence is not part of the key).
 */
const CITE = /(?<![\p{L}\p{N}_@])-?@([\p{L}\p{N}_]+(?:[:./-][\p{L}\p{N}_]+)*)/gu;

/** Finds every citation-shaped token in a run of prose. */
export const citationsIn = (text: string): readonly CitationUse[] => {
  const out: CitationUse[] = [];
  for (const m of text.matchAll(CITE)) {
    const offset = m.index;
    const before = text.slice(0, offset);
    const open = before.lastIndexOf('[');
    const bracketed = open > before.lastIndexOf(']');
    out.push({ key: m[1] ?? '', bracketed, offset });
  }
  return out;
};

/** Removes citation clusters and narrative citations from prose (for word counts). */
export const stripCitations = (text: string): string => text.replace(/\[[^\]]*@[^\]]*\]/gu, ' ').replace(CITE, ' ');

// ---------------------------------------------------------------------------
// Single-dollar math (forbidden: only $$…$$ is math)
// ---------------------------------------------------------------------------

/**
 * Offsets of "$" signs that are neither inside one of the given ranges (math,
 * code, html nodes), nor backslash-escaped, nor part of the currency sign R$.
 */
export const strayDollars = (source: string, allowed: readonly (readonly [number, number])[]): readonly number[] => {
  const out: number[] = [];
  for (let i = source.indexOf('$'); i !== -1; i = source.indexOf('$', i + 1)) {
    if (allowed.some(([s, e]) => i >= s && i < e)) continue;
    let slashes = 0;
    for (let k = i - 1; k >= 0 && source[k] === '\\'; k -= 1) slashes += 1;
    if (slashes % 2 === 1) continue;
    if (source[i - 1] === 'R') continue;
    out.push(i);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Heading attributes (Pandoc header_attributes)
// ---------------------------------------------------------------------------

export interface HeadingAttributes {
  readonly ids: readonly string[];
  readonly classes: readonly string[];
  readonly pairs: Readonly<Record<string, string>>;
}

const ATTR_BLOCK = /\s\{([^{}]*)\}\s*$/u;
const ATTR_ITEM = /#([^\s{}]+)|\.([^\s{}.#]+)|([A-Za-z_][\w-]*)=(?:["“”]([^"“”]*)["“”]|([^\s"“”{}]+))/gu;

/** Parses a trailing {#id .kind key="v"} block, or returns null when there is none. */
export const headingAttributes = (text: string): HeadingAttributes | null => {
  const block = ATTR_BLOCK.exec(text);
  if (block === null) return null;
  const inner = block[1] ?? '';
  const ids: string[] = [];
  const classes: string[] = [];
  const pairs: Record<string, string> = {};
  let consumed = '';
  for (const m of inner.matchAll(ATTR_ITEM)) {
    consumed += m[0];
    if (m[1] !== undefined) ids.push(m[1]);
    else if (m[2] !== undefined) classes.push(m[2]);
    else if (m[3] !== undefined) pairs[m[3]] = m[4] ?? m[5] ?? '';
  }
  // Every non-space character of the block must belong to an item.
  if (consumed.replace(/\s/gu, '') !== inner.replace(/\s/gu, '') || consumed.length === 0) return null;
  return { ids, classes, pairs };
};

/** Inverse of headingAttributes, for tests. */
export const renderHeadingAttributes = (a: HeadingAttributes): string =>
  `{${[...a.ids.map((i) => `#${i}`), ...a.classes.map((c) => `.${c}`), ...Object.entries(a.pairs).map(([k, v]) => `${k}="${v}"`)].join(' ')}}`;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** Word count by Unicode word segmentation (UAX #29 through Intl.Segmenter). */
export const countWords = (text: string, locale: string): number => {
  let n = 0;
  for (const s of new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)) if (s.isWordLike) n += 1;
  return n;
};

const NON_PROSE: ReadonlySet<string> = new Set(['math', 'inlineMath', 'code', 'inlineCode', 'html']);

/** Readable prose of a tree: text nodes outside math, code and html; citations removed. */
export const proseText = (tree: Root): string => {
  const parts: string[] = [];
  visit(tree, (node: Nodes) => {
    if (NON_PROSE.has(node.type)) return 'skip';
    if (node.type === 'text') parts.push(node.value);
    return undefined;
  });
  return stripCitations(parts.join(' '));
};
