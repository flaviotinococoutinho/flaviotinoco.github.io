/**
 * Domain model of the LaTeX layer — data, not code.
 *
 * Pattern: algebraic data types + total lookup tables. Every closed set of the
 * authoring language (docs/arquitetura.md §5.1–5.3) is a `const` tuple whose
 * element type is the union the rest of the layer switches over; adding a
 * member makes every non-exhaustive `switch` (closed with `absurd`) fail to
 * compile.
 *
 * References:
 *   - amsthm (M. Downes, B. Beeton, "Using the amsthm package", AMS, v2.20.6):
 *     theorem styles `plain`, `definition`, `remark`; shared counters through
 *     `\newtheorem{lemma}[theorem]{Lemma}`.
 *   - ABNT NBR 14724:2024 §5.7 (equations), §5.8 (illustrations), §5.9 (tables).
 */
import type { Position } from 'unist';
import type { Label } from '../domain/identifiers.ts';

/** Numbered theorem-like environments: one shared counter per document (amsthm `[theorem]`). */
export const THEOREM_KINDS = [
  'definition',
  'theorem',
  'lemma',
  'proposition',
  'corollary',
  'conjecture',
  'axiom',
  'example',
] as const;
export type TheoremKind = (typeof THEOREM_KINDS)[number];

/** Every environment directive name, numbered or not. */
export const ENV_KINDS = [...THEOREM_KINDS, 'remark', 'proof'] as const;
export type EnvKind = (typeof ENV_KINDS)[number];

/**
 * Visual style of an environment. The first three are amsthm's `\theoremstyle`s;
 * `proof` is amsthm's separate `proof` environment (italic head, upright body, QED).
 */
export type EnvStyle = 'plain' | 'definition' | 'remark' | 'proof';

export const ENV_STYLE: Readonly<Record<EnvKind, EnvStyle>> = {
  theorem: 'plain',
  lemma: 'plain',
  proposition: 'plain',
  corollary: 'plain',
  conjecture: 'plain',
  axiom: 'plain',
  definition: 'definition',
  example: 'definition',
  remark: 'remark',
  proof: 'proof',
};

export const isTheoremKind = (name: string): name is TheoremKind => (THEOREM_KINDS as readonly string[]).includes(name);
export const isEnvKind = (name: string): name is EnvKind => (ENV_KINDS as readonly string[]).includes(name);

/** ABNT NBR 14724 §5.8–5.9 designations, each with its own counter. */
export const FIGURE_KINDS = ['figure', 'chart', 'frame', 'table'] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];
export const isFigureKind = (name: string): name is FigureKind => (FIGURE_KINDS as readonly string[]).includes(name);

/** Directive names claimed by the latex stage (block and inline). */
export const FIGURE_DIRECTIVE = 'figure';
export const REF_DIRECTIVES = ['ref', 'eqref'] as const;
export type RefDirective = (typeof REF_DIRECTIVES)[number];
export const isRefDirective = (name: string): name is RefDirective =>
  (REF_DIRECTIVES as readonly string[]).includes(name);

/** Attributes accepted by each block directive (closed grammar: anything else is an error). */
export const ENV_ATTRIBUTES = ['id', 'title'] as const;
export const PROOF_ATTRIBUTES = ['id', 'title', 'of'] as const;
export const FIGURE_ATTRIBUTES = ['id', 'kind', 'title', 'source'] as const;

/**
 * What a label designates. `number` is the display form: an arabic numeral for
 * counters, or the author's own `\tag{…}` text for equations.
 */
export type Target =
  | { readonly type: 'environment'; readonly kind: TheoremKind; readonly number: string }
  | { readonly type: 'unnumbered'; readonly kind: 'remark' | 'proof' }
  | { readonly type: 'equation'; readonly number: string }
  | { readonly type: 'figure'; readonly kind: FigureKind; readonly number: string };

/** One entry of the document's label table (the `\newlabel` lines of a LaTeX .aux file). */
export interface LabelEntry {
  readonly label: Label;
  /** HTML id (see label-codec.ts). */
  readonly id: string;
  readonly target: Target;
  /**
   * Reading text of the title as rendered, when the item has one (environment note or figure
   * title): references resolved ("Lema 1"), inline math as `$$TeX$$` (see transform.ts, titleText).
   */
  readonly title?: string;
  readonly position?: Position;
}

/**
 * Problems found by the pure transforms. The shell decides how to report them
 * (file.message / file.fail); the core never throws.
 */
export type DiagnosticRule =
  | 'duplicate-label'
  | 'unknown-label'
  | 'invalid-label'
  | 'unnumbered-ref'
  | 'inline-label'
  | 'multiple-labels'
  | 'unknown-attribute'
  | 'invalid-kind'
  | 'missing-title'
  | 'duplicate-title'
  | 'missing-source'
  | 'missing-table'
  | 'proof-target'
  | 'complex-tag'
  | 'eqref-target'
  | 'stray-fence'
  | 'missing-lang';

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  readonly severity: Severity;
  readonly rule: DiagnosticRule;
  readonly message: string;
  readonly position?: Position;
}
