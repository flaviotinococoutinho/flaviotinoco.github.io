/**
 * Compiler: Markdown AST → complete LaTeX document (for the terminal CLI).
 *
 * Input: the mdast the site's latex stage receives — Astro's parse
 * (remark-parse + remark-gfm + remark-smartypants with default options, i.e.
 * `smartypants: true`) + remark-math (singleDollarTextMath: false) +
 * remark-directive — the authoring language BEFORE the site's own stages, with
 * the body text already given typographic punctuation exactly as on the site.
 * (A caller builds it with @astrojs/markdown-remark's createMarkdownProcessor
 * and a remark plugin that captures the tree; see tests/unit/latex/helpers.ts,
 * siteTree.) Text is escaped so that TeX prints every character as itself
 * (tex-escape.ts: no ligature, no quote reinterpreted), so the PDF shows the
 * punctuation the site shows; attribute text, which SmartyPants never sees,
 * goes through smartPunctuation on both sides. Output: a self-contained `.tex`
 * source whose preamble reproduces the site's conventions:
 *
 *   - babel (brazilian | english as main language), csquotes;
 *   - amsthm environments with ONE shared counter and the catalog names
 *     (`\newtheorem{lemma}[theorem]{Lema}`), Halmos tombstone;
 *   - amsmath equations keep their `\label`; `\eqref` works natively; a
 *     labelled display is numbered once, as on the site (rows of a labelled
 *     `align`/`gather`/… without a label get `\notag`);
 *   - ABNT NBR 14724 floats: caption above with an en dash separator
 *     (caption package; the separator is the catalog's, as on the site),
 *     source below (`\ftsource`),
 *     separate counters for Gráfico/Quadro (newfloat);
 *   - biblatex: `style=abnt` (biblatex-abnt) for pt-BR, `style=apa` for en;
 *     Pandoc-style citations become `\parencite`/`\textcite`;
 *   - the site's KaTeX macros, defined mode-safely (see `macroDefinition`).
 *
 * Content is never put where LaTeX loses or rejects it: code in a footnote is
 * saved with fancyvrb's SaveVerbatim; a footnote in a tabular or float becomes
 * \footnotemark + \footnotetext after it; a margin note (or a note) inside a
 * note, tabular or float stays in the text in parentheses, with a warning.
 *
 * It is a pure fold: no I/O, deterministic, total. Anything that cannot be
 * represented is kept as literal text or as a `%` comment and reported in
 * `warnings` — never silently dropped (information preservation).
 */
import type {
  Code,
  Definition,
  FootnoteDefinition,
  Heading,
  Image,
  List,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
  Table,
} from 'mdast';
import type { Position } from 'unist';
import { err, ok, type Result } from '../algebra/result.ts';
import { absurd } from '../algebra/match.ts';
import { parseCitationKey, parseLabel } from '../domain/identifiers.ts';
import { parseLocale, type Locale } from '../domain/locale.ts';
import common from '../i18n/catalogs/common.ts';
import { escapedPositions, scanCitations, type CitationItem, type CitationToken } from './citation-parser.ts';
import { envName, equationName, figureName, longDate, message, proofOfTemplate } from './format.ts';
import { MACROS } from './macros.ts';
import {
  extractLabels,
  findTag,
  hasLabel,
  hoistLeadingLabels,
  isOuterEnvironment,
  numberOnce,
  replaceRefs,
  starAutoNumbered,
} from './math-transform.ts';
import {
  ENV_STYLE,
  FIGURE_KINDS,
  THEOREM_KINDS,
  isEnvKind,
  isFigureKind,
  isTheoremKind,
  type EnvKind,
  type FigureKind,
  type TheoremKind,
} from './model.ts';
import {
  directiveLabelSource,
  hasBracketLabel,
  hasChildren,
  plainText,
  sourceOf,
  type ContainerDirective,
  type Directive,
  type LeafDirective,
  type TextDirective,
} from './nodes.ts';
import { smartPunctuation } from './smart-punctuation.ts';
import { escapeTex, escapeUrl } from './tex-escape.ts';
import { tokenize } from './tex-parser.ts';

// ── input model ─────────────────────────────────────────────────────────────

/** Document metadata the exporter needs (a subset of the content frontmatter). */
export interface ExportMeta {
  readonly lang: Locale;
  readonly title: string;
  readonly subtitle?: string;
  readonly author?: string;
  /** ISO 8601 calendar date (YYYY-MM-DD). */
  readonly date?: string;
  readonly abstract?: string;
  readonly keywords?: readonly string[];
  /** Document-local TeX macros (frontmatter `macros`). */
  readonly macros?: Readonly<Record<string, string>>;
}

export interface ExportOptions {
  /** Bibliography resources for `\addbibresource` (default: bibliography.bib). */
  readonly bibliography?: readonly string[];
  /** The Markdown source (exact restoration of unknown directives, escape-aware citations). */
  readonly source?: string;
  /** Known citation keys; when given, a narrative `@word` is a citation only if it is one. */
  readonly citationKeys?: ReadonlySet<string>;
  /** Absolute site URL used to resolve relative links (e.g. https://example.org/base/). */
  readonly baseUrl?: string;
}

export interface ExportWarning {
  readonly message: string;
  readonly position?: Position;
}

export interface ExportResult {
  readonly tex: string;
  readonly warnings: readonly ExportWarning[];
}

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStringArray = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Parses raw frontmatter into ExportMeta, reporting every problem at once. */
export const parseExportMeta = (frontmatter: unknown): Result<ExportMeta, readonly string[]> => {
  if (!isRecord(frontmatter)) return err(['frontmatter must be an object']);
  const errors: string[] = [];
  const lang = parseLocale(frontmatter['lang']);
  if (!lang.ok) errors.push(lang.error);
  const title = frontmatter['title'];
  if (typeof title !== 'string' || title === '') errors.push('frontmatter.title must be a non-empty string');
  const optionalString = (key: string): string | undefined => {
    const v = frontmatter[key];
    if (v === undefined) return undefined;
    if (typeof v === 'string') return v;
    errors.push(`frontmatter.${key} must be a string`);
    return undefined;
  };
  const subtitle = optionalString('subtitle');
  const author = optionalString('author');
  const abstract = optionalString('abstract');
  const published = frontmatter['published'];
  const date =
    published instanceof Date && !Number.isNaN(published.getTime())
      ? published.toISOString().slice(0, 10)
      : typeof published === 'string' && /^\d{4}-\d{2}-\d{2}/.test(published)
        ? published.slice(0, 10)
        : undefined;
  if (published !== undefined && date === undefined) errors.push('frontmatter.published must be a date (YYYY-MM-DD)');
  const keywords = frontmatter['keywords'];
  if (keywords !== undefined && !isStringArray(keywords)) errors.push('frontmatter.keywords must be a list of strings');
  const macros = frontmatter['macros'];
  const validMacros =
    macros === undefined || (isRecord(macros) && Object.values(macros).every((v) => typeof v === 'string'));
  if (!validMacros) errors.push('frontmatter.macros must map \\names to strings');
  if (errors.length > 0 || !lang.ok || typeof title !== 'string') return err(errors);
  return ok({
    lang: lang.value,
    title,
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(author === undefined ? {} : { author }),
    ...(date === undefined ? {} : { date }),
    ...(abstract === undefined ? {} : { abstract }),
    ...(isStringArray(keywords) ? { keywords } : {}),
    ...(isRecord(macros) ? { macros: macros as Readonly<Record<string, string>> } : {}),
  });
};

// ── fixed vocabulary ────────────────────────────────────────────────────────

/** Float environment per ABNT designation (`frame` is a LaTeX kernel command, hence the ft prefix). */
const FLOAT_ENV: Readonly<Record<FigureKind, string>> = {
  figure: 'figure',
  table: 'table',
  chart: 'ftchart',
  frame: 'ftframe',
};

const BABEL: Readonly<Record<Locale, string>> = { 'pt-BR': 'brazilian', en: 'english' };
/** BCP 47 primary subtag → babel language loaded by the preamble. */
const BABEL_LOADED: Readonly<Record<string, string>> = { pt: 'brazilian', en: 'english' };
const BIBLATEX_STYLE: Readonly<Record<Locale, string>> = { 'pt-BR': 'abnt', en: 'apa' };

const SECTIONING = ['section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph'] as const;

/** Directives of other stages that render as their plain content in print. */
const TRANSPARENT_CONTAINERS = new Set(['stretch', 'scrolly', 'step', 'horizontal', 'panel']);
const QUOTE_CONTAINERS = new Set(['aside', 'epigraph']);
const INTERACTIVE_LEAVES = new Set(['concept-map', 'lab']);

/** Reading locators that take a tie after their abbreviation (NBR 10520: "p. 12" → p.~12). */
const LOCATOR = /\b(p|pp|f|ff|v|t|cap|art|inc|n|sec|ch|vol)\.\s+(?=\S)/g;

/** Heading attribute block of the reading stage: `## Title {#id .claim depends="a,b"}`. */
const HEADING_ATTRIBUTES =
  /\s*\{((?:\s*(?:#[A-Za-z][\w:-]*|\.[A-Za-z][\w-]*|[A-Za-z][\w-]*=(?:"[^"]*"|'[^']*'|[^\s"'{}]+)))+)\s*\}\s*$/;

// ── preamble ────────────────────────────────────────────────────────────────

/**
 * Defines a KaTeX macro for LaTeX without breaking text mode.
 *
 * Several site macros reuse names that LaTeX already gives to TEXT commands
 * (`\H` Hungarian umlaut, `\i` dotless i, `\d` dot-under accent). Redefining
 * them blindly would corrupt text and `\newcommand` would refuse, so the
 * preamble's `\ftmacro` (see FTMACRO) copies the old meaning
 * (`\NewCommandCopy`, LaTeX 2020-10+) and dispatches on `\ifmmode`: math
 * gets the site macro, text keeps the original. Free names get a plain
 * `\newcommand`. Arity = highest `#n` in the body, as KaTeX infers it.
 */
const macroDefinition = (name: string, body: string): string | undefined => {
  if (!/^\\[A-Za-z]+$/.test(name)) return undefined;
  let arity = 0;
  for (const m of body.matchAll(/#([1-9])/g)) arity = Math.max(arity, Number(m[1]));
  return `\\ftmacro{${name}}{${String(arity)}}{${body}}`;
};

/** `\ftmacro{\cs}{arity}{body}` — mode-safe macro definition (TeXbook ch. 20 idioms). */
const FTMACRO = [
  '\\makeatletter',
  '\\newcommand*{\\ftmacro}[3]{%',
  '  \\ifdefined#1%',
  '    \\expandafter\\NewCommandCopy\\csname fttext\\string#1\\endcsname#1%',
  '    \\expandafter\\newcommand\\csname ftmath\\string#1\\endcsname[#2]{#3}%',
  '    \\DeclareRobustCommand{#1}{%',
  '      \\ifmmode\\expandafter\\@firstoftwo\\else\\expandafter\\@secondoftwo\\fi',
  '      {\\csname ftmath\\string#1\\endcsname}{\\csname fttext\\string#1\\endcsname}}%',
  '  \\else',
  '    \\newcommand{#1}[#2]{#3}%',
  '  \\fi}',
  '\\makeatother',
].join('\n');

const preamble = (
  meta: ExportMeta,
  options: ExportOptions,
  warn: (m: string) => void,
  verbatims: readonly string[],
): string => {
  const { lang } = meta;
  const others = Object.values(BABEL).filter((b) => b !== BABEL[lang]);
  const t = (key: Parameters<typeof message>[1]): string => message(lang, key);
  const theorems = (style: 'plain' | 'definition'): string[] =>
    THEOREM_KINDS.filter((k) => ENV_STYLE[k] === style).map((k) =>
      k === 'theorem'
        ? `\\newtheorem{theorem}{${escapeTex(envName(lang, k))}}`
        : `\\newtheorem{${k}}[theorem]{${escapeTex(envName(lang, k))}}`,
    );
  const macros = Object.entries({ ...MACROS, ...meta.macros }).flatMap(([name, body]) => {
    const definition = macroDefinition(name, body);
    if (definition === undefined) warn(`macro ${name} is not a letters-only control word; skipped`);
    return definition === undefined ? [] : [definition];
  });
  const resources = options.bibliography ?? ['bibliography.bib'];
  const abnt = lang === 'pt-BR';
  return [
    '% !TEX program = lualatex',
    '% Generated from Markdown by src/core/latex/export.ts. Edit the Markdown source, not this file.',
    abnt ? '\\documentclass[12pt,a4paper]{article}' : '\\documentclass[11pt,a4paper]{article}',
    '\\usepackage{iftex}',
    '\\ifPDFTeX',
    '  \\usepackage[T1]{fontenc}',
    '  \\usepackage[utf8]{inputenc}',
    '  \\usepackage{lmodern}',
    '\\else',
    '  \\usepackage{fontspec}',
    '\\fi',
    `\\usepackage[${[...others, `main=${BABEL[lang]}`].join(',')}]{babel}`,
    '\\usepackage{csquotes}',
    ...(abnt
      ? [
          '% ABNT NBR 14724:2024 §5.1: A4, margins 3 cm (top, left) and 2 cm (bottom, right), 1.5 line spacing.',
          '\\usepackage[top=3cm,left=3cm,bottom=2cm,right=2cm]{geometry}',
          '\\usepackage{setspace}',
          '\\onehalfspacing',
        ]
      : []),
    '\\usepackage{mathtools}',
    '\\usepackage{amssymb}',
    '\\usepackage{amsthm}',
    '\\usepackage{graphicx}',
    '\\usepackage{booktabs}',
    '\\usepackage{enumitem}',
    '\\usepackage[normalem]{ulem}',
    '\\usepackage{fancyvrb}',
    '\\usepackage{newfloat}',
    '\\usepackage{caption}',
    '% ABNT NBR 14724:2024 §5.8: designation, number, dash and title ABOVE; source below.',
    `\\DeclareCaptionLabelSeparator{ft}{${escapeTex(t('caption.separator'))}}`,
    '\\captionsetup{labelsep=ft,position=top}',
    `\\DeclareFloatingEnvironment[fileext=lgr,name={${escapeTex(figureName(lang, 'chart'))}},listname={${escapeTex(t('tex.listOfCharts'))}}]{ftchart}`,
    `\\DeclareFloatingEnvironment[fileext=lqd,name={${escapeTex(figureName(lang, 'frame'))}},listname={${escapeTex(t('tex.listOfFrames'))}}]{ftframe}`,
    `\\newcommand{\\ftsource}[1]{\\par\\smallskip{\\footnotesize ${escapeTex(t('figure.source'))} #1\\par}}`,
    // Extra verbatim environments, only for listings that contain \end{verbatim} (see `code`).
    ...verbatims.map((name) => `\\DefineVerbatimEnvironment{${name}}{Verbatim}{}`),
    `\\usepackage[backend=biber,style=${BIBLATEX_STYLE[lang]}]{biblatex}`,
    ...resources.map((r) => `\\addbibresource{${r}}`),
    '\\usepackage{hyperref}',
    `\\hypersetup{hidelinks,pdftitle={${escapeTex(meta.title)}},pdfauthor={${escapeTex(meta.author ?? common[lang]['site.name'])}},pdflang={${lang}}}`,
    '',
    '% Theorem-like environments: one shared counter (amsthm \\newtheorem{x}[theorem]).',
    '\\theoremstyle{plain}',
    ...theorems('plain'),
    '\\theoremstyle{definition}',
    ...theorems('definition'),
    '\\theoremstyle{remark}',
    `\\newtheorem*{remark}{${escapeTex(envName(lang, 'remark'))}}`,
    '\\renewcommand{\\qedsymbol}{\\ensuremath{\\blacksquare}}',
    '',
    '% Markup of the abnt stage (semantic wrappers; see docs/guia-latex.md).',
    '\\newcommand{\\ftforeign}[2]{\\textit{#2}}',
    '\\newcommand{\\ftname}[1]{#1}',
    '\\newcommand{\\ftabbr}[2]{#1}',
    '% KaTeX-only HTML extensions degrade to their content.',
    '\\providecommand{\\htmlClass}[2]{#2}',
    '\\providecommand{\\htmlData}[2]{#2}',
    '\\providecommand{\\htmlId}[2]{#2}',
    '\\providecommand{\\htmlStyle}[2]{#2}',
    '',
    '% Site notation (src/core/latex/macros.ts) and document macros.',
    FTMACRO,
    ...macros,
  ].join('\n');
};

// ── document fold ───────────────────────────────────────────────────────────

type LabelKind =
  | { readonly type: 'environment'; readonly kind: EnvKind }
  | { readonly type: 'equation' }
  | { readonly type: 'figure'; readonly kind: FigureKind };

const attributesOf = (node: Directive): Readonly<Record<string, string>> => {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.attributes ?? {})) out[key] = value ?? '';
  return out;
};

const isLabelParagraph = (node: Nodes): node is Paragraph =>
  node.type === 'paragraph' && node.data?.directiveLabel === true;

/** Guards content that would otherwise be read as an optional argument (`\item [x]`, `\\ [x]`). */
const guard = (tex: string): string => (tex.startsWith('[') ? `{}${tex}` : tex);

const optional = (tex: string): string => `[{${tex}}]`;

const comment = (label: string, value: string): string =>
  value
    .split('\n')
    .map((line) => `% ${label}: ${line}`)
    .join('\n');

export const exportLatex = (tree: Root, meta: ExportMeta, options: ExportOptions = {}): ExportResult => {
  const { lang } = meta;
  const { source } = options;
  const warnings: ExportWarning[] = [];
  const warn = (text: string, node?: Nodes): void => {
    warnings.push(node?.position === undefined ? { message: text } : { message: text, position: node.position });
  };

  /**
   * The `#id` of an environment or figure, when it is a valid Label. An
   * invalid one (the site build rejects it) is reported and left out, so it
   * can never inject TeX through `\label{…}`.
   */
  const labelOf = (node: ContainerDirective): string | undefined => {
    const id = attributesOf(node)['id'];
    if (id === undefined || id === '') return undefined;
    if (parseLabel(id).ok) return id;
    warn(`invalid label "${id}" on :::${node.name} (expected prefix:name); \\label omitted`, node);
    return undefined;
  };

  /** fancyvrb environments the body needed (defined in the preamble). */
  const verbatims = new Set<string>();

  /**
   * Where a note is folded. Inside a `\footnote` argument (`footnoteDepth`) a verbatim block, a
   * `\marginpar` or another `\footnote` cannot be typeset (TeX FAQ "verbwithin"; "Not in outer par
   * mode"; a nested footnote's text is lost). Inside a tabular or a float (`trapDepth`) a footnote's
   * text is lost (TeX FAQ "footintab"), so its text waits in `pendingNotes` for the outermost trap
   * to close: `\footnotemark` in place, `\footnotetext` after it.
   */
  let footnoteDepth = 0;
  let trapDepth = 0;
  let pendingNotes: string[] = [];
  /** fancyvrb SaveVerbatim blocks for code inside footnotes, written right after \begin{document}. */
  const savedVerbatims: string[] = [];

  const inFootnote = <T>(fold: () => T): T => {
    footnoteDepth += 1;
    const result = fold();
    footnoteDepth -= 1;
    return result;
  };

  const trapped = <T>(fold: () => T): T => {
    trapDepth += 1;
    const result = fold();
    trapDepth -= 1;
    return result;
  };

  /** A footnote, or — inside a tabular or float — its mark, the text waiting for the trap to close. */
  const footnote = (text: string): string => {
    if (trapDepth === 0) return `\\footnote{${text}}`;
    pendingNotes.push(text);
    return '\\protect\\footnotemark';
  };

  /**
   * The texts of the marks set inside the trap that just closed, numbered like the marks: back
   * to the first mark's number, then one more for each (LaTeX Companion 3rd ed. §3.2.3).
   */
  const releaseNotes = (tex: string): string => {
    if (trapDepth > 0 || pendingNotes.length === 0) return tex;
    const notes = pendingNotes.map(
      (text, i) =>
        `${i === 0 ? (pendingNotes.length > 1 ? `\\addtocounter{footnote}{-${String(pendingNotes.length - 1)}}` : '') : '\\stepcounter{footnote}'}\\footnotetext{${text}}`,
    );
    pendingNotes = [];
    return [tex, ...notes].join('\n');
  };

  // ── pre-pass: label kinds, definitions, footnotes, heading depth ──────────
  const labels = new Map<string, LabelKind>();
  /** Validated `#id` of each environment/figure (validated once, so warnings are not repeated). */
  const ids = new Map<Nodes, string>();
  const definitions = new Map<string, Definition>();
  const footnotes = new Map<string, FootnoteDefinition>();
  let minDepth = 6;
  let hasBibliographyDirective = false;
  const scan = (node: Nodes): void => {
    if (node.type === 'code' || node.type === 'inlineCode' || node.type === 'html') return;
    if (node.type === 'containerDirective') {
      const id = isEnvKind(node.name) || node.name === 'figure' ? labelOf(node) : undefined;
      if (id !== undefined) ids.set(node, id);
      if (id !== undefined && isEnvKind(node.name)) labels.set(id, { type: 'environment', kind: node.name });
      if (id !== undefined && node.name === 'figure') {
        const kind = attributesOf(node)['kind'] ?? 'figure';
        labels.set(id, { type: 'figure', kind: isFigureKind(kind) ? kind : 'figure' });
      }
    } else if (node.type === 'leafDirective' && node.name === 'bibliography') {
      hasBibliographyDirective = true;
    } else if (node.type === 'math') {
      for (const label of extractLabels(node.value).labels) labels.set(label, { type: 'equation' });
    } else if (node.type === 'definition') {
      definitions.set(node.identifier, node);
    } else if (node.type === 'footnoteDefinition') {
      footnotes.set(node.identifier, node);
    } else if (node.type === 'heading') {
      minDepth = Math.min(minDepth, node.depth);
    }
    if (hasChildren(node)) for (const child of node.children as readonly Nodes[]) scan(child);
  };
  scan(tree);

  let citations = 0;

  // ── citations ──────────────────────────────────────────────────────────────
  const notes = (item: CitationItem): string => {
    const post = escapeTex(item.suffix).replace(LOCATOR, '$1.~');
    if (item.prefix !== '') return `${optional(escapeTex(item.prefix))}${optional(post)}`;
    return post === '' ? '' : optional(post);
  };

  const citation = (token: Exclude<CitationToken, { type: 'text' }>, node?: Nodes): string => {
    const keys = token.type === 'narrative' ? [token.item.key] : token.items.map((i) => i.key);
    const invalid = keys.filter((k) => !parseCitationKey(k).ok);
    if (invalid.length > 0) {
      // Pandoc's key grammar admits # $ % & ~, which biblatex keys cannot carry.
      warn(`"${token.raw}": citation key(s) ${invalid.join(', ')} are not BibTeX keys; kept as text`, node);
      return escapeTex(token.raw);
    }
    citations += 1;
    if (token.type === 'narrative') return `\\textcite${notes(token.item)}{${token.item.key}}`;
    const [single, ...rest] = token.items;
    if (single !== undefined && rest.length === 0) {
      return `\\parencite${single.suppressAuthor ? '*' : ''}${notes(single)}{${single.key}}`;
    }
    const plain = token.items.every((i) => i.prefix === '' && i.suffix === '' && !i.suppressAuthor);
    if (plain) return `\\parencite{${token.items.map((i) => i.key).join(',')}}`;
    if (token.items.some((i) => i.suppressAuthor)) {
      warn(`"${token.raw}": author suppression (-@) is not supported inside a multi-citation; author kept`);
    }
    return `\\parencites${token.items.map((i) => `${notes(i)}{${i.key}}`).join('')}`;
  };

  const textWithCitations = (value: string, raw: string | undefined, node?: Nodes): string => {
    const escaped = raw === undefined ? undefined : escapedPositions(value, raw);
    if (raw !== undefined && escaped === undefined && /[[@]/.test(value)) {
      warn('text with character references around "[" or "@": citations in it were left as literal text', node);
      return escapeTex(value);
    }
    const isKey =
      options.citationKeys === undefined ? undefined : (k: string): boolean => options.citationKeys?.has(k) === true;
    const tokens = scanCitations(value, {
      ...(isKey === undefined ? {} : { isKey }),
      ...(escaped === undefined ? {} : { escaped }),
    });
    return tokens
      .map((token, i) => {
        if (token.type !== 'text') return citation(token, node);
        const text = escapeTex(token.raw);
        // A literal "[" right after a citation command would be read as one more optional
        // argument: biblatex's multicite commands scan ahead for "[" and "{" (\parencites{a}[…]),
        // and the bracket could swallow whatever follows, a blockquote included. \relax ends the scan.
        const afterCitation = i > 0 && tokens[i - 1]?.type !== 'text';
        return afterCitation && text.startsWith('[') ? `\\relax${text}` : text;
      })
      .join('');
  };

  // ── phrasing ───────────────────────────────────────────────────────────────

  const KNOWN_TEXT = new Set([
    'ref',
    'eqref',
    'sidenote',
    'marginnote',
    'concept',
    'foreign',
    'name',
    'abbr',
    'raw',
    'sc',
  ]);

  /** Unknown text directives are prose ("10:30"): restore them and merge text runs so citations can be found. */
  const normalize = (nodes: readonly PhrasingContent[]): PhrasingContent[] => {
    const out: PhrasingContent[] = [];
    for (const node of nodes) {
      // Unknown names, and known ones written without [label] ("nota:ref", "10:sc"), are prose.
      const unknown = node.type === 'textDirective' && (!KNOWN_TEXT.has(node.name) || !hasBracketLabel(node, source));
      const raw = unknown
        ? (sourceOf(node, source) ?? `:${node.name}${node.children.length > 0 ? `[${plainText(node)}]` : ''}`)
        : '';
      if (unknown && /[[{]/.test(raw))
        warn(
          `unknown text directive ":${node.type === 'textDirective' ? node.name : ''}" exported as literal text`,
          node,
        );
      const restored: PhrasingContent = unknown
        ? { type: 'text', value: raw, ...(node.position === undefined ? {} : { position: node.position }) }
        : node;
      const previous = out[out.length - 1];
      if (restored.type === 'text' && previous?.type === 'text') {
        const start = previous.position?.start;
        const end = restored.position?.end;
        out[out.length - 1] = {
          type: 'text',
          value: previous.value + restored.value,
          ...(start === undefined || end === undefined ? {} : { position: { start, end } }),
        };
      } else {
        out.push(restored);
      }
    }
    return out;
  };

  /**
   * Inline content in order. A footnote mark attaches to the word before it
   * (no space, as `word\footnote{…}` in LaTeX), even when the Markdown had
   * `word :sidenote[…]`.
   */
  const phrasing = (nodes: readonly PhrasingContent[]): string =>
    normalize(nodes)
      .map(inline)
      .reduce(
        (out, tex) =>
          (tex.startsWith('\\footnote{') || tex.startsWith('\\protect\\footnotemark') ? out.trimEnd() : out) + tex,
        '',
      );

  /**
   * How many links enclose the content being folded. Inside one, references use hyperref's
   * non-linking `\ref*`: a PDF has no nested links, and a `\ref` inside `\href` becomes a second
   * annotation overlapping the first (hyperref logs "Link nesting OFF"; verified with pdfTeX and
   * LuaTeX, TeX Live 2023), so a click on the number lands on either target. The site renders
   * such a reference as a span, and the author's link keeps all of its text, in both outputs.
   */
  let linkDepth = 0;

  /** Link text: escaped, but never scanned for citations (a link label is not running prose). */
  const linkText = (nodes: readonly PhrasingContent[]): string => {
    linkDepth += 1;
    const tex = normalize(nodes)
      .map((n) => (n.type === 'text' ? escapeTex(n.value) : inline(n)))
      .join('');
    linkDepth -= 1;
    return tex;
  };

  /** `\ref{x}` / `\eqref{x}`, or their non-linking forms inside a link (amsmath: `\eqref` = upright `(\ref)`). */
  const refCall = (command: 'ref' | 'eqref', label: string): string => {
    if (linkDepth === 0) return `\\${command}{${label}}`;
    return command === 'ref' ? `\\ref*{${label}}` : `\\textup{(\\ref*{${label}})}`;
  };

  const url = (href: string): string => {
    const base = options.baseUrl;
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || base === undefined;
    return escapeUrl(absolute ? href : `${base.replace(/\/$/, '')}/${href.replace(/^\.?\//, '')}`);
  };

  const includeGraphics = (image: Pick<Image, 'url' | 'alt'>, node: Nodes): string => {
    if (/^https?:/i.test(image.url)) {
      warn(`remote image ${image.url} is linked, not embedded`, node);
      return `\\href{${url(image.url)}}{\\textit{${escapeTex(image.alt ?? image.url)}}}`;
    }
    // pdfTeX/LuaTeX cannot embed SVG/WebP/AVIF/GIF: drop the extension so graphicx
    // picks a converted sibling (.pdf, .png) — the CLI converts, the author is told.
    const unsupported = /\.(?:svg|webp|avif|gif)$/i.exec(image.url);
    if (unsupported !== null) warn(`image ${image.url}: ${unsupported[0]} needs conversion to PDF or PNG`, node);
    const file = unsupported === null ? image.url : image.url.slice(0, unsupported.index);
    return `\\includegraphics[width=\\linewidth,alt={${escapeTex(image.alt ?? '')}}]{${escapeUrl(file)}}`;
  };

  const mathInline = (raw: string): string => {
    const value = linkDepth === 0 ? raw : replaceRefs(raw, (ref) => refCall(ref.command, ref.label));
    // A trailing `%` comment would swallow the closing delimiter: end the line first.
    return tokenize(value).some((t) => t.kind === 'comment') ? `$${value}\n$` : `$${value}$`;
  };

  const reference = (node: TextDirective): string => {
    const raw = directiveLabelSource(node, source).trim();
    if (!parseLabel(raw).ok) {
      warn(`:${node.name}[${raw}] is not a valid label (expected prefix:name); exported as literal text`, node);
      return escapeTex(sourceOf(node, source) ?? `:${node.name}[${raw}]`);
    }
    if (node.name === 'eqref') return refCall('eqref', raw);
    const kind = labels.get(raw);
    if (kind === undefined) {
      warn(`:ref[${raw}] points to no label of this document; exported as a bare \\ref`, node);
      return refCall('ref', raw);
    }
    switch (kind.type) {
      case 'environment':
        return `${escapeTex(envName(lang, kind.kind))}~${refCall('ref', raw)}`;
      case 'figure':
        return `${escapeTex(figureName(lang, kind.kind))}~${refCall('ref', raw)}`;
      case 'equation':
        return `${escapeTex(equationName(lang))}~${refCall('eqref', raw)}`;
      default:
        return absurd(kind);
    }
  };

  /**
   * A side or margin note where LaTeX cannot place one — a footnote inside a footnote, or a
   * \marginpar inside a footnote, tabular or float: its text stays in the flow, in parentheses.
   */
  const noteInNote = (node: TextDirective, content: () => string): string => {
    const where = footnoteDepth > 0 ? 'a footnote' : 'a table or figure';
    warn(`:${node.name} inside ${where} cannot be a note in LaTeX; exported in parentheses`, node);
    return `(${content()})`;
  };

  const textDirective = (node: TextDirective): string => {
    const content = (): string => phrasing(node.children);
    const attributes = attributesOf(node);
    switch (node.name) {
      case 'ref':
      case 'eqref':
        return reference(node);
      case 'sidenote':
        if (footnoteDepth > 0) return noteInNote(node, content);
        return footnote(inFootnote(content));
      case 'marginnote':
        if (footnoteDepth > 0 || trapDepth > 0) return noteInNote(node, content);
        return `\\marginpar{${content()}}`;
      case 'concept':
      case 'raw':
        return content();
      case 'foreign': {
        const tag = attributes['lang'] ?? '';
        const babel = BABEL_LOADED[tag.toLowerCase().split('-')[0] ?? ''];
        return babel === undefined
          ? `\\ftforeign{${escapeTex(tag)}}{${content()}}`
          : `\\foreignlanguage{${babel}}{\\textit{${content()}}}`;
      }
      case 'name':
        // ABNT: proper names are never hyphenated — each word in an unbreakable box.
        return `\\ftname{${plainText(node)
          .split(/\s+/)
          .filter((w) => w !== '')
          .map((w) => `\\mbox{${escapeTex(w)}}`)
          .join(' ')}}`;
      case 'abbr':
        return `\\ftabbr{${content()}}{${escapeTex(attributes['title'] ?? '')}}`;
      case 'sc':
        return `\\textsc{${content()}}`;
      default:
        return escapeTex(sourceOf(node, source) ?? plainText(node));
    }
  };

  function inline(node: PhrasingContent): string {
    switch (node.type) {
      case 'text':
        return textWithCitations(node.value, sourceOf(node, source), node);
      case 'emphasis':
        return `\\emph{${phrasing(node.children)}}`;
      case 'strong':
        return `\\textbf{${phrasing(node.children)}}`;
      case 'delete':
        return `\\sout{${phrasing(node.children)}}`;
      case 'inlineCode':
        return `\\texttt{${escapeTex(node.value)}}`;
      case 'inlineMath':
        return mathInline(node.value);
      case 'break':
        return '\\newline\n';
      case 'link': {
        const label = linkText(node.children);
        return plainText(node) === node.url ? `\\url{${url(node.url)}}` : `\\href{${url(node.url)}}{${label}}`;
      }
      case 'linkReference': {
        const definition = definitions.get(node.identifier);
        if (definition === undefined) return escapeTex(sourceOf(node, source) ?? plainText(node));
        return `\\href{${url(definition.url)}}{${linkText(node.children)}}`;
      }
      case 'image':
        return includeGraphics(node, node);
      case 'imageReference': {
        const definition = definitions.get(node.identifier);
        return definition === undefined
          ? escapeTex(sourceOf(node, source) ?? node.alt ?? '')
          : includeGraphics({ url: definition.url, alt: node.alt ?? null }, node);
      }
      case 'footnoteReference': {
        const definition = footnotes.get(node.identifier);
        if (definition === undefined) {
          warn(`footnote [^${node.identifier}] has no definition`, node);
          return escapeTex(`[^${node.label ?? node.identifier}]`);
        }
        return footnote(inFootnote(() => definition.children.map((child) => block(child, false)).join('\n\n')));
      }
      case 'html':
        // Inline HTML has no print form: kept as a comment on its own line. The
        // `%` before the line break swallows it, so no space is added around it.
        return `%\n% html: ${node.value.replace(/\n/g, ' ')}\n`;
      case 'textDirective':
        return textDirective(node);
      case 'latexInline':
        // Generated by the site's latex stage, which runs AFTER the tree this fold reads.
        return phrasing(node.children);
      default:
        return absurd(node);
    }
  }

  // ── blocks ─────────────────────────────────────────────────────────────────

  const blocks = (nodes: readonly Nodes[], inFloat: boolean): string =>
    nodes
      .map((n) => block(n, inFloat))
      .filter((s) => s !== '')
      .join('\n\n');

  const heading = (node: Heading): string => {
    const level = SECTIONING[Math.min(node.depth - minDepth, SECTIONING.length - 1)] ?? 'subparagraph';
    const last = node.children[node.children.length - 1];
    const m = last?.type === 'text' ? HEADING_ATTRIBUTES.exec(last.value) : null;
    if (m === null || last?.type !== 'text') return `\\${level}{${phrasing(node.children)}}`;
    const children: PhrasingContent[] = [
      ...node.children.slice(0, -1),
      { ...last, value: last.value.slice(0, m.index) },
    ];
    const attributes = m[1] ?? '';
    const id = /#([A-Za-z][\w:-]*)/.exec(attributes)?.[1];
    const rest = attributes.replace(/#[A-Za-z][\w:-]*/, '').trim();
    return [
      `\\${level}{${phrasing(children)}}${id === undefined ? '' : `\\label{${id}}`}`,
      ...(rest === '' ? [] : [comment('attributes', rest)]),
    ].join('\n');
  };

  const list = (node: List): string => {
    const env = node.ordered === true ? 'enumerate' : 'itemize';
    const start =
      node.ordered === true && typeof node.start === 'number' && node.start !== 1
        ? `[start=${String(node.start)}]`
        : '';
    const items = node.children.map((item) => {
      const marker = item.checked === true ? '[$\\boxtimes$]' : item.checked === false ? '[$\\square$]' : '';
      const content = blocks(item.children, false);
      return marker === '' ? `\\item ${guard(content)}` : `\\item${marker} ${content}`;
    });
    return `\\begin{${env}}${start}\n${items.join('\n')}\n\\end{${env}}`;
  };

  const tabular = (node: Table): string => trapped(() => tabularBody(node));

  const tabularBody = (node: Table): string => {
    const columns = Math.max(0, ...node.children.map((row) => row.children.length));
    const align = Array.from({ length: columns }, (_, i) => {
      const a = node.align?.[i];
      return a === 'center' ? 'c' : a === 'right' ? 'r' : 'l';
    }).join('');
    const rows = node.children.map((row) => {
      const cells = Array.from({ length: columns }, (_, i) => {
        const cell = row.children[i];
        return cell === undefined ? '' : phrasing(cell.children);
      });
      return `${cells.join(' & ')} \\\\`;
    });
    const [header, ...body] = rows;
    return [
      `\\begin{tabular}{@{}${align}@{}}`,
      '\\toprule',
      ...(header === undefined ? [] : [header, '\\midrule']),
      ...body,
      '\\bottomrule',
      '\\end{tabular}',
    ].join('\n');
  };

  const code = (node: Code): string => {
    // ```math fences render on the site too (rehype-katex), always unnumbered.
    if (node.lang === 'math') return displayMath(node.value);
    // A verbatim environment ends at the first `\end{<name>}`: pick a name the
    // listing does not contain, so any code — even LaTeX about verbatim — survives.
    let env = 'verbatim';
    for (let n = 1; node.value.includes(`\\end{${env}}`); n += 1) env = `ftverbatim${n === 1 ? '' : String(n)}`;
    const language = node.lang === null || node.lang === undefined ? [] : [`% language: ${node.lang}`];
    if (footnoteDepth > 0) return savedVerbatim(node, language);
    if (env !== 'verbatim') verbatims.add(env);
    return [...language, `\\begin{${env}}`, node.value, `\\end{${env}}`].join('\n');
  };

  /**
   * Code inside a footnote: a verbatim environment cannot sit in a command's argument (its catcode
   * changes come too late; TeX FAQ "verbwithin"), so the listing is saved with fancyvrb's
   * SaveVerbatim at the start of the document and typeset in the note with \UseVerbatim.
   */
  const savedVerbatim = (node: Code, language: readonly string[]): string => {
    if (node.value.includes('\\end{SaveVerbatim}')) {
      warn('code containing \\end{SaveVerbatim} inside a footnote: exported line by line as \\texttt', node);
      return node.value
        .split('\n')
        .map((line) => `\\texttt{${escapeTex(line)}}`)
        .join('\\newline\n');
    }
    const name = `ftcode${String(savedVerbatims.length + 1)}`;
    savedVerbatims.push([...language, `\\begin{SaveVerbatim}{${name}}`, node.value, '\\end{SaveVerbatim}'].join('\n'));
    return `\\par\\UseVerbatim{${name}}`;
  };

  /**
   * Only labelled (or explicitly tagged) displays are numbered, as on the site
   * (ABNT NBR 14724): an unlabelled `align`/`gather`/… is exported starred.
   */
  const displayMath = (raw: string): string => {
    // A blank line is \par, an error in math mode ("Missing $ inserted"); KaTeX
    // ignores it. Collapsing it changes no formula (math mode ignores spaces).
    const value = raw.replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n');
    const numbered = hasLabel(value) || findTag(value) !== undefined;
    // A \label written before the environment goes inside it (wrapping it in `equation` would
    // nest display structures); a labelled multi-row environment is numbered once, as on the site.
    if (isOuterEnvironment(value)) return numbered ? numberOnce(hoistLeadingLabels(value)) : starAutoNumbered(value);
    const env = numbered ? 'equation' : 'equation*';
    return `\\begin{${env}}\n${value}\n\\end{${env}}`;
  };

  const environment = (node: ContainerDirective, kind: EnvKind): string => {
    const attributes = attributesOf(node);
    const first = node.children[0];
    // An attribute never met the site's SmartyPants: it gets the same punctuation as on the site.
    const title =
      attributes['title'] !== undefined && attributes['title'] !== ''
        ? escapeTex(smartPunctuation(attributes['title']))
        : first !== undefined && isLabelParagraph(first)
          ? phrasing(first.children)
          : undefined;
    const id = ids.get(node);
    const label = id === undefined ? '' : `\\label{${id}}`;
    // The site nests a proof inside its statement (::::theorem … :::proof … ::::);
    // in LaTeX a proof FOLLOWS the statement (inside it, it would inherit the
    // statement's italic body font). Direct-child proofs are moved after it.
    const isProof = (child: Nodes): boolean => child.type === 'containerDirective' && child.name === 'proof';
    const children = node.children.filter((c) => !isLabelParagraph(c));
    const hoisted = kind === 'proof' ? [] : children.filter(isProof);
    const body = blocks(
      children.filter((c) => kind === 'proof' || !isProof(c)),
      false,
    );
    let head = title;
    if (kind === 'proof' && title === undefined && attributes['of'] !== undefined && attributes['of'] !== '') {
      const of = attributes['of'];
      const target = labels.get(of);
      if (target?.type === 'environment' && isTheoremKind(target.kind)) {
        const proved: TheoremKind = target.kind;
        head = proofOfTemplate(lang, proved)
          .map((s) => (s.type === 'text' ? escapeTex(s.value) : `${escapeTex(envName(lang, proved))}~\\ref{${of}}`))
          .join('');
      } else {
        warn(`:proof of="${of}" names no theorem-like environment; plain proof exported`, node);
      }
    }
    const env = kind === 'proof' ? 'proof' : kind;
    return [
      `\\begin{${env}}${head === undefined ? '' : optional(head)}${label}\n${body}\n\\end{${env}}`,
      ...hoisted.map((proof) => block(proof, false)),
    ].join('\n\n');
  };

  const figure = (node: ContainerDirective): string => {
    const attributes = attributesOf(node);
    const rawKind = attributes['kind'] ?? 'figure';
    const kind: FigureKind = isFigureKind(rawKind) ? rawKind : 'figure';
    if (!isFigureKind(rawKind))
      warn(`figure kind "${rawKind}" is not one of ${FIGURE_KINDS.join(', ')}; exported as figure`, node);
    const first = node.children[0];
    const id = ids.get(node);
    const source = attributes['source'];
    const env = FLOAT_ENV[kind];
    // A float traps footnotes like a tabular does: their texts follow the float (releaseNotes).
    const float = trapped(() => {
      const caption =
        attributes['title'] !== undefined && attributes['title'] !== ''
          ? escapeTex(smartPunctuation(attributes['title']))
          : first !== undefined && isLabelParagraph(first)
            ? phrasing(first.children)
            : '';
      return [
        `\\begin{${env}}[htbp]`,
        '\\centering',
        `\\caption{${caption}}${id === undefined ? '' : `\\label{${id}}`}`,
        blocks(
          node.children.filter((c) => !isLabelParagraph(c)),
          true,
        ),
        ...(source === undefined || source === ''
          ? []
          : [`\\ftsource{${textWithCitations(smartPunctuation(source), undefined, node)}}`]),
        `\\end{${env}}`,
      ].join('\n');
    });
    return releaseNotes(float);
  };

  const containerDirective = (node: ContainerDirective, inFloat: boolean): string => {
    if (isEnvKind(node.name)) return environment(node, node.name);
    if (node.name === 'figure') return figure(node);
    const attributes = attributesOf(node);
    if (TRANSPARENT_CONTAINERS.has(node.name)) {
      const label = attributes['label'];
      return [...(label === undefined ? [] : [comment(node.name, label)]), blocks(node.children, inFloat)].join('\n');
    }
    if (QUOTE_CONTAINERS.has(node.name)) {
      const attribution = attributes['source'];
      return [
        '\\begin{quote}',
        blocks(node.children, inFloat),
        ...(attribution === undefined ? [] : [`\\par\\hfill ${textWithCitations(attribution, undefined, node)}`]),
        '\\end{quote}',
      ].join('\n');
    }
    warn(`unknown container directive ":::${node.name}" exported as literal text`, node);
    return escapeTex(sourceOf(node, source) ?? plainText(node));
  };

  const leafDirective = (node: LeafDirective): string => {
    if (node.name === 'toc') return '\\tableofcontents';
    if (node.name === 'bibliography') return '\\printbibliography';
    if (INTERACTIVE_LEAVES.has(node.name)) {
      return comment('interactive', `${sourceOf(node, source) ?? `::${node.name}`} (web version only)`);
    }
    warn(`unknown leaf directive "::${node.name}" exported as literal text`, node);
    return escapeTex(sourceOf(node, source) ?? plainText(node));
  };

  function block(node: Nodes, inFloat: boolean): string {
    switch (node.type) {
      case 'paragraph': {
        const [only, ...rest] = node.children;
        if (only?.type === 'image' && rest.length === 0) {
          const graphic = includeGraphics(only, only);
          return inFloat ? graphic : `\\begin{center}\n${graphic}\n\\end{center}`;
        }
        return guard(phrasing(node.children));
      }
      case 'heading':
        return heading(node);
      case 'thematicBreak':
        return '\\begin{center}\n\\rule{0.382\\linewidth}{0.4pt}\n\\end{center}';
      case 'blockquote':
        return `\\begin{quote}\n${blocks(node.children, inFloat)}\n\\end{quote}`;
      case 'list':
        return list(node);
      case 'code':
        return code(node);
      case 'math':
        return displayMath(node.value);
      case 'table':
        return releaseNotes(inFloat ? tabular(node) : `\\begin{center}\n${tabular(node)}\n\\end{center}`);
      case 'html':
        return comment('html', node.value);
      case 'definition':
      case 'footnoteDefinition':
        return '';
      case 'containerDirective':
        return containerDirective(node, inFloat);
      case 'leafDirective':
        return leafDirective(node);
      case 'yaml':
        // Frontmatter is metadata (ExportMeta), not content.
        return '';
      case 'listItem':
        return blocks(node.children, inFloat);
      case 'tableRow':
        return node.children.map((cell) => phrasing(cell.children)).join(' & ');
      case 'tableCell':
      case 'latexInline':
        return phrasing(node.children);
      case 'latexBlock':
        return blocks(node.children, inFloat);
      case 'break':
      case 'delete':
      case 'emphasis':
      case 'footnoteReference':
      case 'image':
      case 'imageReference':
      case 'inlineCode':
      case 'inlineMath':
      case 'link':
      case 'linkReference':
      case 'strong':
      case 'text':
      case 'textDirective':
        // Phrasing where a block is expected (remark-parse never does this; the fold stays total).
        return guard(phrasing([node]));
      case 'root':
        return blocks(node.children, inFloat);
      default:
        return absurd(node);
    }
  }

  // ── assembly ───────────────────────────────────────────────────────────────

  const body = blocks(tree.children, false);
  const head = preamble(meta, options, (m) => warn(m), [...verbatims]);
  const date = meta.date === undefined ? undefined : longDate(lang, meta.date);
  const title =
    meta.subtitle === undefined
      ? escapeTex(meta.title)
      : `${escapeTex(meta.title)}\\\\[0.5ex]\\large ${escapeTex(meta.subtitle)}`;
  const abstract =
    meta.abstract === undefined
      ? []
      : [
          '\\begin{abstract}',
          escapeTex(meta.abstract),
          ...(meta.keywords === undefined || meta.keywords.length === 0
            ? []
            : [
                '',
                `\\noindent\\textbf{${escapeTex(message(lang, 'tex.keywords'))}} ${meta.keywords.map(escapeTex).join('; ')}.`,
              ]),
          '\\end{abstract}',
          '',
        ];
  const tex = [
    head,
    '',
    `\\title{${title}}`,
    `\\author{${escapeTex(meta.author ?? common[lang]['site.name'])}}`,
    `\\date{${date === undefined ? '' : escapeTex(date)}}`,
    '',
    '\\begin{document}',
    ...(savedVerbatims.length === 0
      ? []
      : [
          '% Code used inside footnotes (fancyvrb SaveVerbatim: verbatim cannot sit in a command argument).',
          ...savedVerbatims,
        ]),
    '\\maketitle',
    '',
    ...abstract,
    body,
    ...(citations > 0 && !hasBibliographyDirective ? ['', '\\printbibliography'] : []),
    '',
    '\\end{document}',
    '',
  ].join('\n');
  return { tex, warnings };
};

/** The document only (warnings dropped) — the "pure fold" signature. */
export const toLatex = (tree: Root, meta: ExportMeta, options?: ExportOptions): string =>
  exportLatex(tree, meta, options).tex;
