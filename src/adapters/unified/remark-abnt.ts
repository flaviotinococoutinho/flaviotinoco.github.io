/**
 * Remark stage "abnt" — lexicon-driven normative marking (see pipeline.ts).
 *
 * Runs after citations/reading/concepts/embeds and before meta/integrity. It is
 * a thin shell around the pure engine of src/core/abnt:
 *
 *  1. MARK. Walks the tree and visits TEXT nodes only. Never descends into code,
 *     inlineCode, math, inlineMath, html, definitions or images (link URLs are
 *     attributes, never visited; link TEXT is processed), nor into nodes that an
 *     earlier stage rendered as i/abbr/cite/code (data.hName), nor between raw
 *     inline HTML tags such as <i lang>…</i>, nor into unclaimed directives
 *     (the integrity stage restores those verbatim), nor into the explicit
 *     directives of this stage (:foreign, :name, :abbr, :raw, :sc, :nowrap),
 *     which it claims. Precedence: explicit directive > frontmatter
 *     (lexicon.ignore / lexicon.foreign) > dictionary.
 *     Each text node is analysed on an NFC copy and split into text pieces and
 *     mark nodes. A mark node is the very directive an author could have
 *     written (`:foreign[software]{lang=en}` …) with data.hName/hProperties set,
 *     so the automatic marking is a macro expansion into the explicit language:
 *     plain text is unchanged and a second run is a no-op.
 *  2. LINT. Projects the marked tree into a DocView (block texts + occurrences)
 *     and reports the findings of the lint rules as warnings
 *     (file.message, ruleId "abnt:<rule>"). Nothing is rewritten.
 *  3. STATS. Exports frontmatter.lexiconStats (counts per kind) for the CLI/QA.
 *     The name is not `lexicon`: that frontmatter field holds the author's
 *     overrides, and overwriting it would destroy information.
 */
import type {} from '@astrojs/markdown-remark';
import type { Emphasis, Parent, PhrasingContent, Root, RootContent, Text } from 'mdast';
import { toString } from 'mdast-util-to-string';
import type { Point, Position } from 'unist';
import { SKIP, visit } from 'unist-util-visit';
import type { VFile } from 'vfile';
import type { DocBlock, DocView, MessageKey, Occurrence } from '../../core/abnt/document.ts';
import { analyseText, type Proposal, runLints, type Surround } from '../../core/abnt/engine.ts';
import type { Segment } from '../../core/abnt/intervals.ts';
import {
  isMarkName,
  type Mark,
  markToDirective,
  markToHast,
  type MarkName,
  parseDirectiveMark,
} from '../../core/abnt/marks.ts';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../../core/domain/locale.ts';
import abntMessages from '../../core/i18n/catalogs/abnt.ts';
import { type Params, translator } from '../../core/i18n/messages.ts';
import { NO_OVERRIDES, parseOverrides } from '../../core/lexicon/activation.ts';
import { primaryLanguage } from '../../core/lexicon/language-tag.ts';
import type { Engine, Matcher } from '../../core/lexicon/matcher.ts';
import type { AcronymEntry, ForeignEntry, HomographEntry, LatinEntry } from '../../core/lexicon/types.ts';
import type { PipelineContext } from './context.ts';
import type { LexiconRuntime } from './load-lexicon.ts';

export interface RemarkAbntOptions {
  readonly context: PipelineContext;
}

type TextDirective = Extract<RootContent, { type: 'textDirective' }>;
type AnyNode = Root | RootContent;

/** Counts exported as frontmatter.lexiconStats. */
export interface LexiconStats {
  readonly engine: Engine | 'none';
  readonly foreign: number;
  readonly locution: number;
  readonly properName: number;
  readonly acronym: number;
  readonly nowrap: number;
  readonly smallCaps: number;
  readonly raw: number;
  /** Unmarked homograph occurrences (linted). */
  readonly homograph: number;
}

/** Node types whose content is never prose (or whose text is an attribute). */
const OPAQUE = new Set([
  'code',
  'inlineCode',
  'math',
  'inlineMath',
  'html',
  'yaml',
  'toml',
  'definition',
  'footnoteReference',
  'image',
  'imageReference',
  'break',
  'thematicBreak',
]);

/** Elements whose content must not be re-marked (rendered by an earlier stage or raw HTML). */
const PROTECTED_ELEMENTS = new Set([
  'i',
  'abbr',
  'cite',
  'code',
  'kbd',
  'samp',
  'var',
  'pre',
  'math',
  'svg',
  'script',
  'style',
]);

const BLOCK_KINDS: Readonly<Record<string, DocBlock['kind']>> = {
  paragraph: 'paragraph',
  heading: 'heading',
  tableCell: 'cell',
};

const isDirectiveNode = (node: AnyNode): node is Extract<RootContent, { type: `${string}Directive` }> =>
  node.type === 'textDirective' || node.type === 'leafDirective' || node.type === 'containerDirective';

const hName = (node: AnyNode): string | undefined => node.data?.hName;

const isOwnMark = (node: AnyNode): node is TextDirective =>
  node.type === 'textDirective' && isMarkName(node.name) && node.data?.hName !== undefined;

/** Tracks raw inline HTML tags (open/close) among siblings: "<i lang=de>", "</i>". */
const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input', 'wbr', 'meta', 'link', 'area', 'base', 'col', 'source']);
const updateHtmlStack = (stack: readonly string[], html: string): readonly string[] => {
  let next = [...stack];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/gu)) {
    const [, closing, rawName, selfClosing] = m;
    const name = (rawName ?? '').toLowerCase();
    if (VOID_ELEMENTS.has(name) || selfClosing === '/') continue;
    if (closing === '/') {
      const at = next.lastIndexOf(name);
      if (at >= 0) next = next.slice(0, at);
    } else next.push(name);
  }
  return next;
};

/** Point at code-unit offset k inside a text node whose source slice equals its value. */
const pointWithin = (start: Point, value: string, k: number): Point => {
  const before = value.slice(0, k);
  const lines = before.split('\n');
  const last = lines[lines.length - 1] ?? '';
  return {
    line: start.line + lines.length - 1,
    column: lines.length === 1 ? start.column + k : last.length + 1,
    ...(start.offset === undefined ? {} : { offset: start.offset + k }),
  };
};

export function remarkAbnt(options: RemarkAbntOptions) {
  // `{} as PipelineContext` in other stages' tests: no lexicon → explicit directives only.
  const runtime = options.context.lexicon as LexiconRuntime | undefined;
  const lexiconRuntime = runtime !== undefined && typeof runtime.matcherFor === 'function' ? runtime : undefined;

  return (tree: Root, file: VFile): void => {
    const astro = file.data.astro ?? {};
    file.data.astro = astro;
    const frontmatter: Record<string, unknown> = astro.frontmatter ?? {};
    astro.frontmatter = frontmatter;
    const rawLang = frontmatter['lang'];
    const locale: Locale | undefined = isLocale(rawLang) ? rawLang : undefined;
    const t = translator(abntMessages, locale ?? DEFAULT_LOCALE);
    const say = (key: MessageKey, params: Params, place: AnyNode | Position | undefined, rule: string): void => {
      const where = place === undefined ? undefined : 'type' in place ? place.position : place;
      file.message(t(key, params), { place: where, source: 'abnt', ruleId: rule });
    };
    const source = String(file.value);

    if (locale === undefined) say('stage.noLang', {}, undefined, 'no-lang');
    const { overrides, problems } =
      locale === undefined ? { overrides: NO_OVERRIDES, problems: [] } : parseOverrides(frontmatter['lexicon'], locale);
    for (const p of problems)
      say('frontmatter.problem', { reason: p.reason, detail: p.detail }, undefined, 'frontmatter');
    const matcher: Matcher | undefined =
      locale !== undefined && lexiconRuntime !== undefined ? lexiconRuntime.matcherFor(locale, overrides) : undefined;

    // Side tables filled by the marking pass and read by the lint pass.
    const autoAcronyms = new WeakMap<TextDirective, AcronymEntry>();
    interface HomographHit {
      readonly start: number;
      readonly end: number;
      readonly entry: HomographEntry;
      readonly position: Position | undefined;
    }
    const homographHits = new WeakMap<Text, HomographHit[]>();
    const handItalics = new WeakMap<Emphasis, ForeignEntry | LatinEntry>();
    let homographCount = 0;

    /* ------------------------------------------------------------ marking */

    const markNode = (mark: Mark, children: PhrasingContent[], position: Position | undefined): TextDirective => {
      const { name, attributes } = markToDirective(mark);
      const { tagName, properties } = markToHast(mark);
      return {
        type: 'textDirective',
        name,
        attributes: { ...attributes },
        children,
        data: { hName: tagName, hProperties: { ...properties } as Record<string, string | string[]> },
        ...(position === undefined ? {} : { position }),
      };
    };

    const claimExplicit = (node: TextDirective & { name: MarkName }): void => {
      const text = toString(node);
      const parsed = parseDirectiveMark(node.name, node.attributes ?? {});
      if (!parsed.ok) {
        const problem = parsed.error;
        switch (problem.kind) {
          case 'missing-lang':
            return file.fail(t('directive.missingLang', { text }), node, 'abnt:directive');
          case 'bad-lang':
            return file.fail(
              t('directive.badLang', { name: node.name, text, detail: problem.detail }),
              node,
              'abnt:directive',
            );
          case 'bad-category':
            say('directive.badCategory', { text, value: problem.value }, node, 'directive');
            break;
          case 'unknown-attribute':
            break;
        }
      }
      const result = parsed.ok
        ? parsed.value
        : { mark: { name: 'name', category: undefined, lang: undefined } as const, warnings: [] };
      for (const w of result.warnings) {
        if (w.kind === 'unknown-attribute') {
          say('directive.unknownAttribute', { name: node.name, text, attribute: w.attribute }, node, 'directive');
        }
      }
      let mark = result.mark;
      if (mark.name === 'abbr' && mark.title === undefined) {
        const entry = lexiconRuntime?.acronym(text);
        if (entry === undefined) say('directive.abbrNoTitle', { text }, node, 'directive');
        else {
          mark = { name: 'abbr', title: entry.expansion[locale ?? DEFAULT_LOCALE] };
          autoAcronyms.set(node, entry);
        }
      }
      const { tagName, properties } = markToHast(mark);
      node.data = { ...node.data, hName: tagName, hProperties: { ...properties } as Record<string, string | string[]> };
    };

    const markText = (node: Text, surround: Surround): readonly PhrasingContent[] | undefined => {
      if (locale === undefined) return undefined;
      const analysis = analyseText(node.value, { locale, matcher }, surround);
      if (analysis.nfcUnavailable) say('stage.nfcUnavailable', {}, node, 'nfc');
      const marked = analysis.segments.some((s) => s.kind === 'mark');
      if (!marked && analysis.homographs.length === 0) return undefined;
      const pos = node.position;
      const exact =
        pos?.start.offset !== undefined &&
        pos.end.offset !== undefined &&
        source.slice(pos.start.offset, pos.end.offset) === node.value;
      const span = (start: number, end: number): Position | undefined =>
        pos === undefined
          ? undefined
          : exact
            ? { start: pointWithin(pos.start, node.value, start), end: pointWithin(pos.start, node.value, end) }
            : pos;
      const build = (segments: readonly Segment<Proposal>[]): PhrasingContent[] =>
        segments.map((s) => {
          if (s.kind === 'text') {
            const piece: Text = { type: 'text', value: node.value.slice(s.start, s.end) };
            const where = span(s.start, s.end);
            if (where !== undefined) piece.position = where;
            const hits = analysis.homographs
              .filter((h) => h.start >= s.start && h.end <= s.end)
              .map((h) => ({
                start: h.start - s.start,
                end: h.end - s.start,
                entry: h.entry,
                position: span(h.start, h.end),
              }));
            if (hits.length > 0) {
              homographHits.set(piece, hits);
              homographCount += hits.length;
            }
            return piece;
          }
          const directive = markNode(s.value.mark, build(s.children), span(s.start, s.end));
          if (s.value.entry?.kind === 'acronym') autoAcronyms.set(directive, s.value.entry);
          return directive;
        });
      return build(analysis.segments);
    };

    const noteHandItalic = (node: Emphasis): void => {
      if (matcher === undefined) return;
      const text = toString(node).normalize('NFC');
      const matches = matcher.match(text);
      const only = matches.length === 1 ? matches[0] : undefined;
      if (only !== undefined && only.start === 0 && only.end === text.length) {
        if (only.entry.kind === 'foreign' || only.entry.kind === 'latin') handItalics.set(node, only.entry);
      }
    };

    /**
     * Walks the children of `parent`. Inside a block (paragraph, heading, table
     * cell) `block` holds the block's plain text and the running offset, with
     * mdast-util-to-string semantics, so every text node is analysed together
     * with its real neighbouring characters (boundaries across inline nodes).
     */
    interface BlockCursor {
      readonly text: string;
      pos: number;
    }
    const CONTEXT = 2; // code units: one code point, surrogate pairs included
    const walk = (parent: Parent, block: BlockCursor | undefined): void => {
      let html: readonly string[] = [];
      const skip = (node: AnyNode): void => {
        if (block !== undefined) block.pos += toString(node).length;
      };
      for (let i = 0; i < parent.children.length; i++) {
        const child = parent.children[i];
        if (child === undefined) continue;
        if (BLOCK_KINDS[child.type] !== undefined && 'children' in child) {
          walk(child, { text: toString(child), pos: 0 });
          continue;
        }
        if (child.type === 'html') {
          html = updateHtmlStack(html, child.value);
          skip(child);
          continue;
        }
        if (html.some((tag) => PROTECTED_ELEMENTS.has(tag)) || OPAQUE.has(child.type)) {
          skip(child);
          continue;
        }
        if (child.type === 'textDirective' && isMarkName(child.name)) {
          if (hName(child) === undefined) claimExplicit(child as TextDirective & { name: MarkName });
          skip(child);
          continue;
        }
        const element = hName(child);
        if (
          (element !== undefined && PROTECTED_ELEMENTS.has(element)) ||
          (isDirectiveNode(child) && element === undefined)
        ) {
          skip(child);
          continue;
        }
        if (child.type === 'text') {
          const at = block?.pos ?? 0;
          const surround: Surround =
            block === undefined
              ? { before: '', after: '' }
              : {
                  before: block.text.slice(Math.max(0, at - CONTEXT), at),
                  after: block.text.slice(at + child.value.length, at + child.value.length + CONTEXT),
                };
          skip(child);
          const replacement = markText(child, surround);
          if (replacement !== undefined) {
            parent.children.splice(i, 1, ...(replacement as RootContent[]));
            i += replacement.length - 1;
          }
          continue;
        }
        if (child.type === 'emphasis') noteHandItalic(child);
        if ('children' in child) walk(child, block);
        else skip(child);
      }
    };
    walk(tree, undefined);

    /* -------------------------------------------------------------- lint */

    const anchors: (AnyNode | Position | undefined)[] = [];
    const anchor = (place: AnyNode | Position | undefined): number => anchors.push(place) - 1;
    const blocks: DocBlock[] = [];
    visit(tree, (node) => {
      const kind = BLOCK_KINDS[node.type];
      if (kind === undefined) return undefined;
      let text = '';
      const occurrences: Occurrence[] = [];
      // Nodes rebuilt by earlier stages (citations split text) may lack a position:
      // report at the nearest positioned ancestor instead of nowhere.
      const go = (n: AnyNode, near: Position | undefined): void => {
        const here = n.position ?? near;
        if (isOwnMark(n) && n.name === 'abbr') {
          const value = toString(n);
          const entry = autoAcronyms.get(n) ?? lexiconRuntime?.acronym(value);
          const title = n.attributes?.['title'];
          occurrences.push({
            kind: 'acronym',
            anchor: anchor(here),
            start: text.length,
            end: text.length + value.length,
            term: autoAcronyms.get(n)?.term ?? value.normalize('NFC'),
            entry,
            title: typeof title === 'string' ? title : undefined,
          });
        }
        if (n.type === 'emphasis') {
          const entry = handItalics.get(n);
          if (entry !== undefined) {
            const value = toString(n);
            occurrences.push({
              kind: 'hand-italic',
              anchor: anchor(here),
              start: text.length,
              end: text.length + value.length,
              surface: value,
              entry,
            });
          }
        }
        if ('value' in n && typeof n.value === 'string') {
          if (n.type === 'text') {
            for (const h of homographHits.get(n) ?? []) {
              occurrences.push({
                kind: 'homograph',
                anchor: anchor(h.position ?? here),
                start: text.length + h.start,
                end: text.length + h.end,
                surface: n.value.slice(h.start, h.end),
                entry: h.entry,
              });
            }
          }
          text += n.value;
          return;
        }
        if ((n.type === 'image' || n.type === 'imageReference') && typeof n.alt === 'string') {
          text += n.alt;
          return;
        }
        if ('children' in n) for (const c of n.children) go(c, here);
      };
      go(node, undefined);
      blocks.push({ kind, anchor: anchor(node), text, occurrences });
      return SKIP;
    });
    if (locale !== undefined) {
      const doc: DocView = { locale, blocks };
      for (const f of runLints(doc)) {
        say(f.message, f.params, anchors[f.anchor], f.ruleId.toLowerCase());
      }
    }

    /* ------------------------------------------------------------- stats */

    const counts = { foreign: 0, locution: 0, properName: 0, acronym: 0, nowrap: 0, smallCaps: 0, raw: 0 };
    visit(tree, 'textDirective', (node) => {
      if (!isOwnMark(node)) return;
      switch (node.name) {
        case 'foreign': {
          const lang = node.attributes?.['lang'];
          if (typeof lang === 'string' && primaryLanguage(lang) === 'la') counts.locution++;
          else counts.foreign++;
          break;
        }
        case 'name':
          counts.properName++;
          break;
        case 'abbr':
          counts.acronym++;
          break;
        case 'nowrap':
          counts.nowrap++;
          break;
        case 'sc':
          counts.smallCaps++;
          break;
        case 'raw':
          counts.raw++;
          break;
        default:
          break;
      }
    });
    const stats: LexiconStats = { engine: matcher?.engine ?? 'none', ...counts, homograph: homographCount };
    frontmatter['lexiconStats'] = stats;
  };
}
