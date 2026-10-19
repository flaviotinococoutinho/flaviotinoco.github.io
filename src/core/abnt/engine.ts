/**
 * The rule engine — pure appliers folded over the rule table.
 *
 *   analyseText : string × context → marks forest over the ORIGINAL text
 *   runLints    : DocView × rules  → findings
 *
 * `analyseText` normalises a COPY of the text to NFC (nfcView), runs the
 * dictionary matcher and every applicable marking rule on that copy, maps each
 * proposal back to the author's code units (proposals whose ends fall inside a
 * recomposed character are dropped), nests them (intervals.ts) and returns a
 * forest whose text leaves tile the original string — the plain text is
 * unchanged by construction (law in tests/unit/abnt/engine.test.ts).
 * Homograph matches are returned separately: they are linted, never marked.
 *
 * Context: a text node is a slice of a longer line of text (its paragraph). The
 * characters just before and after it (`surround`) take part in the boundary
 * look-arounds but can never be marked, so "soft" in "*soft*ware" is not a word,
 * and "et al." followed by "software" stays unmatched whether the two are one
 * text node or two — which is what makes the stage idempotent.
 */
import type { Locale } from '../domain/locale.ts';
import type { Matcher } from '../lexicon/matcher.ts';
import { nfcView } from '../lexicon/text.ts';
import type { HomographEntry, LexiconEntry } from '../lexicon/types.ts';
import type { DocView, Finding } from './document.ts';
import { nestSpans, type Segment, type Span, toSegments } from './intervals.ts';
import type { Mark } from './marks.ts';
import { LINT_RULES, type LintRule, MARK_RULES, type MarkRule } from './rules.ts';

export interface MarkContext {
  readonly locale: Locale;
  /** Dictionary matcher of the document (undefined: no automatic dictionary marking). */
  readonly matcher: Matcher | undefined;
  readonly rules?: readonly MarkRule[];
}

/** A mark proposal kept in the forest: the mark, the rule that made it and its dictionary entry, if any. */
export interface Proposal {
  readonly mark: Mark;
  readonly ruleId: string;
  readonly entry: LexiconEntry | undefined;
}

export interface TextAnalysis {
  readonly segments: readonly Segment<Proposal>[];
  readonly homographs: readonly { readonly start: number; readonly end: number; readonly entry: HomographEntry }[];
  /** True when the NFC view could not be mapped back; the text is then left untouched. */
  readonly nfcUnavailable: boolean;
}

/** Neighbouring text (a few code units) that only informs boundaries. */
export interface Surround {
  readonly before: string;
  readonly after: string;
}

const NO_SURROUND: Surround = { before: '', after: '' };

export const analyseText = (text: string, context: MarkContext, surround: Surround = NO_SURROUND): TextAnalysis => {
  const padded = surround.before + text + surround.after;
  const view = nfcView(padded);
  if (view === undefined) {
    return { segments: [{ kind: 'text', start: 0, end: text.length }], homographs: [], nfcUnavailable: true };
  }
  const offset = surround.before.length;
  /** Maps an NFC offset to the text's own coordinates; undefined outside the text or inside a recomposition. */
  const local = (i: number): number | undefined => {
    const o = view.toOriginal(i);
    return o === undefined || o < offset || o > offset + text.length ? undefined : o - offset;
  };
  const rules = (context.rules ?? MARK_RULES).filter((r) => r.appliesTo.includes(context.locale));
  const matches = context.matcher?.match(view.nfc) ?? [];
  const input = { locale: context.locale, matches };
  const proposals: Span<Proposal>[] = [];
  rules.forEach((rule, priority) => {
    for (const d of rule.detect(view.nfc, input)) {
      const mark = rule.apply(d, input);
      const start = local(d.start);
      const end = local(d.end);
      if (mark === undefined || start === undefined || end === undefined) continue;
      proposals.push({ start, end, priority, value: { mark, ruleId: rule.id, entry: d.entry } });
    }
  });
  const homographs = matches.flatMap((m) => {
    const start = local(m.start);
    const end = local(m.end);
    return m.entry.kind === 'homograph' && start !== undefined && end !== undefined
      ? [{ start, end, entry: m.entry }]
      : [];
  });
  const { accepted } = nestSpans(text.length, proposals);
  return { segments: toSegments(text.length, accepted), homographs, nfcUnavailable: false };
};

/** Runs the lint rules applicable to the document's locale. */
export const runLints = (doc: DocView, rules: readonly LintRule[] = LINT_RULES): readonly Finding[] =>
  rules.filter((r) => r.appliesTo.includes(doc.locale)).flatMap((r) => r.detect(doc));
