/**
 * ABNT and typographic rules AS DATA.
 *
 * A rule is a value — identifier, normative references, description, the
 * locales it applies to, and its behaviour (`detect`, plus `apply` for marking
 * rules) — not an `if` buried in a visitor. The engine (engine.ts) folds the
 * list; adding, removing or re-ordering a rule is a data change, and the
 * editorial guide (docs/guia-editorial.md) documents the same table.
 *
 *   type "mark"  adds structure only (the text is never changed);
 *                list order = priority when two proposals cross.
 *   type "lint"  reports a finding (file.message), never rewrites.
 *
 * IDs follow docs/research/abnt.md where a row exists there (CIT-02, CIT-11,
 * CIT-23, ACAD-06); the others are local.
 */
import { LOCALES, type Locale } from '../domain/locale.ts';
import type { Match } from '../lexicon/resolve.ts';
import { primaryLanguage } from '../lexicon/language-tag.ts';
import type { LexiconEntry } from '../lexicon/types.ts';
import type { DocView, Finding } from './document.ts';
import {
  lintAcronymFirstUse,
  lintEmphasisNotes,
  lintEtAlPolicy,
  lintFinalPeriod,
  lintHandItalics,
  lintHomographs,
} from './lints.ts';
import type { Mark } from './marks.ts';
import { detectDates, detectInitials, detectLocators, detectUnits } from './typography.ts';

export interface RuleReference {
  /** Norm or style authority, e.g. "ABNT NBR 10520:2023". */
  readonly source: string;
  /** Section, clause or table, when one exists. */
  readonly section?: string;
}

interface RuleMeta {
  readonly id: string;
  readonly description: string;
  readonly references: readonly RuleReference[];
  readonly appliesTo: readonly Locale[];
}

/** What a marking rule sees: the NFC text of one text node and the dictionary matches in it. */
export interface MarkInput {
  readonly locale: Locale;
  readonly matches: readonly Match[];
}

export interface MarkDetection {
  readonly start: number;
  readonly end: number;
  readonly entry: LexiconEntry | undefined;
}

export interface MarkRule extends RuleMeta {
  readonly type: 'mark';
  readonly detect: (text: string, input: MarkInput) => readonly MarkDetection[];
  readonly apply: (detection: MarkDetection, input: MarkInput) => Mark | undefined;
}

export interface LintRule extends RuleMeta {
  readonly type: 'lint';
  readonly detect: (doc: DocView) => readonly Finding[];
}

export type AbntRule = MarkRule | LintRule;

const byKind =
  (kind: LexiconEntry['kind']) =>
  (_text: string, input: MarkInput): readonly MarkDetection[] =>
    input.matches.filter((m) => m.entry.kind === kind);

const plain = (ds: readonly { readonly start: number; readonly end: number }[]): readonly MarkDetection[] =>
  ds.map((d) => ({ start: d.start, end: d.end, entry: undefined }));

const BOTH: readonly Locale[] = LOCALES;
const PT: readonly Locale[] = ['pt-BR'];

const WCAG_312: RuleReference = { source: 'W3C WCAG 2.2', section: 'SC 3.1.2 Language of Parts (AA)' };
const BRINGHURST: RuleReference = {
  source: 'R. Bringhurst, The Elements of Typographic Style',
  // Cited at section level from memory (section title, not rule numbers): verify against the edition used.
  section: '§2.4 "Etiquette of Hyphenation & Pagination"',
};

export const ABNT_RULES: readonly AbntRule[] = [
  {
    type: 'mark',
    id: 'MARK-ACRONYM',
    description: 'Acronym from lexicon/siglas.tsv → <abbr class="acronym" title="expansion in the document language">.',
    references: [
      { source: 'HTML Living Standard', section: 'The abbr element (title = expansion)' },
      { source: 'ABNT NBR 14724:2024', section: '5.6 (siglas)' },
      { source: 'Senado Federal, Manual de Comunicação', section: 'Siglas' },
    ],
    appliesTo: BOTH,
    detect: byKind('acronym'),
    apply: (d, input) =>
      d.entry?.kind === 'acronym' ? { name: 'abbr', title: d.entry.expansion[input.locale] } : undefined,
  },
  {
    type: 'mark',
    id: 'MARK-NAME',
    description:
      'Proper name from lexicon/nomes-proprios.tsv → <span class="proper-name" translate="no"> (works: <cite>); no lang (exempt), no hyphenation.',
    references: [
      WCAG_312,
      { source: 'HTML Living Standard', section: 'The translate attribute' },
      BRINGHURST,
      { source: 'Acordo Ortográfico da Língua Portuguesa (1990)', section: 'Base XIX (títulos de obras em grifo)' },
    ],
    appliesTo: BOTH,
    detect: byKind('proper'),
    apply: (d, input) =>
      d.entry?.kind === 'proper'
        ? {
            name: 'name',
            category: d.entry.category,
            // A title of a work in another language is text in that language (SC 3.1.2).
            lang:
              d.entry.category === 'work' && primaryLanguage(d.entry.lang) !== primaryLanguage(input.locale)
                ? d.entry.lang
                : undefined,
          }
        : undefined,
  },
  {
    type: 'mark',
    id: 'MARK-LATIN',
    description: 'Latin locution from lexicon/latim.tsv → <i lang="la" class="locution">.',
    references: [
      { source: 'ABNT NBR 10520:2023', section: 'typesetting of et al., apud, Id., Ibid., op. cit., passim (italic)' },
      { source: 'FUNAG, Manual de Revisão', section: 'Uso de itálico' },
    ],
    appliesTo: BOTH,
    detect: byKind('latin'),
    apply: (d) => (d.entry === undefined ? undefined : { name: 'foreign', lang: d.entry.lang }),
  },
  {
    type: 'mark',
    id: 'MARK-FOREIGN',
    description:
      'Foreign term from lexicon/estrangeirismos.tsv (language ≠ document language) → <i lang="xx" class="foreign">.',
    references: [
      { source: 'HTML Living Standard', section: 'The i element' },
      WCAG_312,
      { source: 'Manual de Redação da Presidência da República, 3. ed. (2018)', section: 'estrangeirismos em itálico' },
      { source: 'ABNT NBR 6023:2025', section: 'typesetting of online, e-mail, e-book (italic)' },
    ],
    appliesTo: BOTH,
    detect: byKind('foreign'),
    apply: (d) => (d.entry === undefined ? undefined : { name: 'foreign', lang: d.entry.lang }),
  },
  {
    type: 'mark',
    id: 'NOWRAP-LOCATOR',
    description: 'Locators "p. 12", "v. 27", "n. 3", "§ 5", "cap. V" → <span class="nowrap">.',
    references: [{ source: 'ABNT NBR 10520:2023', section: '6.2.4, 7.1.3' }, BRINGHURST],
    appliesTo: BOTH,
    detect: (text, input) => plain(detectLocators(text, input.locale)),
    apply: () => ({ name: 'nowrap' }),
  },
  {
    type: 'mark',
    id: 'NOWRAP-DATE',
    description: 'Dates "3 maio 2024", "7 abr. 2023", "3 de maio de 2024", "May 3, 2024" → <span class="nowrap">.',
    references: [
      { source: 'ABNT NBR 5892:2019', section: '3.1' },
      { source: 'ABNT NBR 6023:2025', section: '8.6.2–8.6.3, Anexo A' },
    ],
    appliesTo: BOTH,
    detect: (text, input) => plain(detectDates(text, input.locale)),
    apply: () => ({ name: 'nowrap' }),
  },
  {
    type: 'mark',
    id: 'NOWRAP-UNIT',
    description: 'Value + unit symbol "10 kHz", "30,2 °C", "25 %", and currency "R$ 5,00" → <span class="nowrap">.',
    references: [
      { source: 'BIPM, The International System of Units (SI), 9th ed.', section: '5.4.3' },
      { source: 'Inmetro, Quadro Geral de Unidades de Medida (Portaria 615/2023)', section: '3.4.1' },
      BRINGHURST,
    ],
    appliesTo: BOTH,
    detect: (text) => plain(detectUnits(text)),
    apply: () => ({ name: 'nowrap' }),
  },
  {
    type: 'mark',
    id: 'NOWRAP-INITIALS',
    description: 'Initials + surname "C. E. Shannon", "J.-P. Sartre" → <span class="nowrap">.',
    references: [{ source: 'ABNT NBR 6023:2025', section: '8.1.1 (prenomes abreviados)' }, BRINGHURST],
    appliesTo: BOTH,
    detect: (text) => plain(detectInitials(text)),
    apply: () => ({ name: 'nowrap' }),
  },
  {
    type: 'lint',
    id: 'CIT-02',
    description: 'Final period goes after the citation call, not inside the closing quotation mark.',
    references: [{ source: 'ABNT NBR 10520:2023', section: '5.2, 7.1.2' }],
    appliesTo: PT,
    detect: lintFinalPeriod,
  },
  {
    type: 'lint',
    id: 'CIT-23',
    description:
      '"grifo nosso" / "tradução nossa" are the last elements of the call (locator → tradução → grifo); no "grifo do autor", no "destaque nosso".',
    references: [{ source: 'ABNT NBR 10520:2023', section: '7.1.5, 7.1.6' }],
    appliesTo: PT,
    detect: lintEmphasisNotes,
  },
  {
    type: 'lint',
    id: 'CIT-11',
    description: 'One et al. policy per document (et al. for 4+ authors, or every author listed).',
    references: [{ source: 'ABNT NBR 10520:2023', section: '6.1.2' }],
    appliesTo: PT,
    detect: lintEtAlPolicy,
  },
  {
    type: 'lint',
    id: 'ACAD-06',
    description: 'First occurrence of an acronym must come with its full form nearby (same paragraph).',
    references: [
      { source: 'ABNT NBR 14724:2024', section: '5.6' },
      { source: 'APA Publication Manual, 7th ed.', section: '6.25' },
    ],
    appliesTo: BOTH,
    detect: lintAcronymFirstUse,
  },
  {
    type: 'lint',
    id: 'LEX-HOMOGRAPH',
    description: 'Homographs (foreign in one sense, native in another) are never marked automatically; report them.',
    references: [WCAG_312, { source: 'docs/research/lexicon.md', section: '§4 homograph strategy' }],
    appliesTo: BOTH,
    detect: lintHomographs,
  },
  {
    type: 'lint',
    id: 'LEX-HAND-ITALIC',
    description: 'A dictionary term italicised by hand with *…* is redundant (and declares no language).',
    references: [WCAG_312, { source: 'docs/arquitetura.md', section: '§5.6 (precedence)' }],
    appliesTo: BOTH,
    detect: lintHandItalics,
  },
];

export const MARK_RULES: readonly MarkRule[] = ABNT_RULES.filter((r): r is MarkRule => r.type === 'mark');
export const LINT_RULES: readonly LintRule[] = ABNT_RULES.filter((r): r is LintRule => r.type === 'lint');
