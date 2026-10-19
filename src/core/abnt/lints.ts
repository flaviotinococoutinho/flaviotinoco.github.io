/**
 * Lint detectors — pure functions of the document view. They REPORT and never
 * rewrite: the author decides (information preservation; a normative rule
 * applied blindly to prose can destroy meaning, e.g. moving a period that
 * belongs to an abbreviation).
 */
import { translator } from '../i18n/messages.ts';
import abntMessages from '../i18n/catalogs/abnt.ts';
import { primaryLanguage } from '../lexicon/language-tag.ts';
import { fold, normalizeSpaces } from '../lexicon/text.ts';
import type { DocBlock, DocView, Finding, MessageKey, Occurrence } from './document.ts';

const EXCERPT_MAX = 80;

const excerpt = (s: string): string => {
  const t = normalizeSpaces(s).trim();
  return t.length <= EXCERPT_MAX ? t : `${t.slice(0, EXCERPT_MAX - 1)}…`;
};

/** The match plus up to `before` characters of preceding context (cut at a word start). */
const withContext = (text: string, index: number, match: string, before = 40): string => {
  if (index <= before) return excerpt(text.slice(0, index) + match);
  const head = text.slice(index - before, index);
  const cut = head.search(/\s/u);
  return `…${excerpt(head.slice(cut < 0 ? 0 : cut + 1) + match)}`;
};

const finding = (
  ruleId: string,
  anchor: number,
  message: MessageKey,
  params: Readonly<Record<string, string | number>>,
): Finding => ({ ruleId, anchor, message, params });

const proseBlocks = (doc: DocView): readonly DocBlock[] => doc.blocks.filter((b) => b.kind !== 'heading');

const allMatches = (re: RegExp, text: string): readonly RegExpExecArray[] => {
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const out: RegExpExecArray[] = [];
  for (let m = r.exec(text); m !== null; m = r.exec(text)) {
    out.push(m);
    if (m[0].length === 0) r.lastIndex++;
  }
  return out;
};

/** A parenthetical author-date call: "(…, 2019, p. 3)" — the year makes it a call (docs/research/abnt.md R1). */
const CALL = /\(([^()]*?\d{4}[a-z]?[^()]*)\)/gu;

/**
 * CIT-02 (NBR 10520:2023 §5.2, §7.1.2): "O ponto final deve ser usado para
 * encerrar a frase e não a citação." Detects a period inside the closing
 * quotation mark followed by a call: “… morta.” (Clarac; Bonnin, 1985, p. 72).
 * "?" and "!" belong to the quotation and are left alone.
 */
export const lintFinalPeriod = (doc: DocView): readonly Finding[] =>
  proseBlocks(doc).flatMap((b) =>
    allMatches(/[^.!?…]\.(["”’'»])\s*\([^()]*?\d{4}[a-z]?[^()]*?\)/gu, b.text).map((m) =>
      finding('CIT-02', b.anchor, 'lint.cit02', { excerpt: withContext(b.text, m.index, m[0]) }),
    ),
  );

/**
 * CIT-23 (NBR 10520:2023 §7.1.5–7.1.6): "grifo nosso" / "grifo próprio" and
 * "tradução nossa" / "tradução própria" are the LAST elements of the call, in
 * the order locator → tradução → grifo; "grifo do autor" is no longer used and
 * "destaque nosso" is not in the norm.
 */
export const lintEmphasisNotes = (doc: DocView): readonly Finding[] =>
  proseBlocks(doc).flatMap((b) => {
    const out: Finding[] = [];
    for (const m of allMatches(CALL, b.text)) {
      const inside = m[1] ?? '';
      const ex = excerpt(m[0]);
      if (/grifo do autor/iu.test(inside)) out.push(finding('CIT-23', b.anchor, 'lint.cit23.author', { excerpt: ex }));
      if (/destaque nosso/iu.test(inside)) {
        out.push(finding('CIT-23', b.anchor, 'lint.cit23.notInNorm', { excerpt: ex }));
      }
      const notLast = /(grifo (?:nosso|próprio))\s*[,;]/iu.exec(inside);
      if (notLast !== null) {
        out.push(finding('CIT-23', b.anchor, 'lint.cit23.last', { excerpt: ex, suffix: notLast[1] ?? '' }));
      }
      if (/tradução (?:nossa|própria)\s*,\s*(?:p|f|v|t|local|cap|art|inc)\.\s/iu.test(inside)) {
        out.push(finding('CIT-23', b.anchor, 'lint.cit23.order', { excerpt: ex }));
      }
    }
    for (const m of allMatches(/\)\s*\((grifo (?:nosso|próprio)|tradução (?:nossa|própria))\)/giu, b.text)) {
      out.push(finding('CIT-23', b.anchor, 'lint.cit23.outside', { excerpt: excerpt(m[0]), suffix: m[1] ?? '' }));
    }
    return out;
  });

const NAME = "\\p{Lu}[\\p{L}\\p{M}'’-]+";
const ET_AL = new RegExp(`${NAME}\\s+et al\\.(?:,\\s*\\d{4}[a-z]?|\\s*\\(\\d{4}[a-z]?[^()]*\\))`, 'u');
const NARRATIVE_FULL = new RegExp(`${NAME}(?:,\\s+${NAME}){2,}\\s+e\\s+${NAME}\\s*\\(\\d{4}`, 'u');

/** First "full list" citation (4+ authors written out) in a text: parenthetical or narrative. */
const firstFullList = (text: string): { readonly index: number; readonly text: string } | undefined => {
  const candidates: { index: number; text: string }[] = [];
  for (const m of allMatches(/\(([^()]*?),\s*\d{4}[a-z]?[^()]*\)/gu, text)) {
    const authors = (m[1] ?? '').split(';').map((a) => a.trim());
    if (authors.length >= 4 && authors.every((a) => /^\p{Lu}/u.test(a)))
      candidates.push({ index: m.index, text: m[0] });
  }
  const narrative = NARRATIVE_FULL.exec(text);
  if (narrative !== null) candidates.push({ index: narrative.index, text: narrative[0] });
  return candidates.sort((a, b) => a.index - b.index)[0];
};

/**
 * CIT-11 (NBR 10520:2023 §6.1.2): with four or more authors, "et al." is
 * allowed, but the option chosen must be uniform throughout the document.
 * Reported once, where the second style first appears.
 */
export const lintEtAlPolicy = (doc: DocView): readonly Finding[] => {
  type Seen = { readonly block: number; readonly index: number; readonly anchor: number; readonly text: string };
  let etAl: Seen | undefined;
  let full: Seen | undefined;
  for (const [block, b] of proseBlocks(doc).entries()) {
    const e = ET_AL.exec(b.text);
    if (etAl === undefined && e !== null) etAl = { block, index: e.index, anchor: b.anchor, text: e[0] };
    const f = firstFullList(b.text);
    if (full === undefined && f !== undefined) full = { block, index: f.index, anchor: b.anchor, text: f.text };
  }
  if (etAl === undefined || full === undefined) return [];
  const etAlFirst = etAl.block < full.block || (etAl.block === full.block && etAl.index < full.index);
  const second = etAlFirst ? full : etAl;
  return [finding('CIT-11', second.anchor, 'lint.cit11.mixed', { excerpt: excerpt(second.text) })];
};

const contains = (haystack: string, needle: string): boolean =>
  fold(normalizeSpaces(haystack.normalize('NFC'))).includes(fold(normalizeSpaces(needle.normalize('NFC'))));

/**
 * ACAD-06 (NBR 14724:2024 §5.6; APA 7th ed. §6.25): on FIRST use, an acronym
 * is preceded by its full form ("Associação Brasileira de Normas Técnicas
 * (ABNT)"). The engine never inserts the expansion (that would alter the
 * author's text): it reports a first occurrence whose paragraph does not
 * contain any known full form. Headings neither count as first use nor are
 * checked (a title is not the place for definitions).
 */
export const lintAcronymFirstUse = (doc: DocView): readonly Finding[] => {
  const t = translator(abntMessages, doc.locale);
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const b of proseBlocks(doc)) {
    for (const o of b.occurrences) {
      if (o.kind !== 'acronym') continue;
      const key = fold(o.term);
      if (seen.has(key)) continue;
      seen.add(key);
      const expansions = [o.entry?.expansion['pt-BR'], o.entry?.expansion.en, o.title].filter(
        (x): x is string => x !== undefined && x !== '',
      );
      if (expansions.length === 0 || expansions.some((x) => contains(b.text, x))) continue;
      const expansion = o.entry?.expansion[doc.locale] ?? o.title ?? '';
      const origin = o.entry === undefined ? '' : primaryLanguage(o.entry.expansionLang);
      const original =
        o.entry === undefined
          ? undefined
          : origin === 'en'
            ? o.entry.expansion.en
            : origin === 'pt'
              ? o.entry.expansion['pt-BR']
              : undefined;
      if (o.entry !== undefined && original !== undefined && origin !== primaryLanguage(doc.locale)) {
        const originKey: MessageKey = origin === 'en' ? 'language.en' : 'language.pt-BR';
        out.push(
          finding('ACAD-06', o.anchor, 'lint.acad06.firstUseForeign', {
            term: o.term,
            expansion,
            originLanguage: t(originKey),
            original,
            originTag: o.entry.expansionLang,
          }),
        );
      } else out.push(finding('ACAD-06', o.anchor, 'lint.acad06.firstUse', { term: o.term, expansion }));
    }
  }
  return out;
};

/**
 * LEX-HOMOGRAPH: a homograph (foreign in one sense, native in another — en
 * "data" vs pt "data") is never marked automatically; each one is reported
 * once per document with its number of unmarked occurrences.
 */
export const lintHomographs = (doc: DocView): readonly Finding[] => {
  const groups = new Map<string, Extract<Occurrence, { kind: 'homograph' }>[]>();
  for (const b of doc.blocks) {
    for (const o of b.occurrences) {
      if (o.kind !== 'homograph') continue;
      const list = groups.get(o.entry.id);
      if (list === undefined) groups.set(o.entry.id, [o]);
      else list.push(o);
    }
  }
  return [...groups.values()].flatMap((list) => {
    const first = list[0];
    if (first === undefined) return [];
    return [
      finding('LEX-HOMOGRAPH', first.anchor, 'lint.lex01.homograph', {
        term: first.entry.term,
        note: first.entry.note,
        count: list.length,
        lang: first.entry.lang,
      }),
    ];
  });
};

/**
 * LEX-HAND-ITALIC: *Zeitgeist* written by hand duplicates what the dictionary
 * already does — and worse, the manual emphasis declares no language (WCAG 2.2
 * SC 3.1.2). The stage still marks the term inside the emphasis.
 */
export const lintHandItalics = (doc: DocView): readonly Finding[] => {
  const t = translator(abntMessages, doc.locale);
  return doc.blocks.flatMap((b) =>
    b.occurrences.flatMap((o) =>
      o.kind === 'hand-italic'
        ? [
            finding('LEX-HAND-ITALIC', o.anchor, 'lint.lex02.handItalic', {
              term: o.surface,
              kindLabel: t(o.entry.kind === 'latin' ? 'kind.latin' : 'kind.foreign'),
              lang: o.entry.lang,
            }),
          ]
        : [],
    ),
  );
};
