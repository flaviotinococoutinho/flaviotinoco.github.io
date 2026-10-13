/**
 * The argument graph — sections of an essay declared as nodes of a reasoning
 * structure, after S. Toulmin, *The Uses of Argument* (Cambridge UP, 1958).
 *
 *   ## Entropia como medida {#def-entropia .definition}
 *   ## O canal é ruidoso    {#premissa-ruido .premise}
 *   ## Logo, há limite      {#tese .claim depends="def-entropia,premissa-ruido"}
 *
 * Each kind is drawn with a distinct SHAPE and always accompanied by its label,
 * so the encoding never relies on colour (WCAG 1.4.1). Shapes are pure data
 * (SVG path geometry in a 16×16 box) shared by the Markdown stage (heading
 * marks) and the argument-map component — a single source of truth.
 */
import { type Brand, unsafeBrand } from '../algebra/brand.ts';
import { absurd } from '../algebra/match.ts';
import { err, ok, type Result } from '../algebra/result.ts';

export const ARGUMENT_KINDS = [
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
] as const;
export type ArgumentKind = (typeof ARGUMENT_KINDS)[number];

export const isArgumentKind = (v: unknown): v is ArgumentKind =>
  typeof v === 'string' && (ARGUMENT_KINDS as readonly string[]).includes(v);

export const parseArgumentKind = (v: unknown): Result<ArgumentKind, string> =>
  isArgumentKind(v)
    ? ok(v)
    : err(`unknown argument kind "${String(v)}" (expected one of ${ARGUMENT_KINDS.join(', ')})`);

/**
 * Toulmin's six elements (Data, Claim, Warrant, Backing, Qualifier, Rebuttal)
 * and how each kind maps onto them. `null` marks kinds outside the 1958 layout:
 * the question at issue (classical stasis) and the practical application
 * (the "value" stratum of the site).
 */
export type ToulminRole = 'data' | 'claim' | 'warrant' | 'backing' | 'qualifier' | 'rebuttal';
export const TOULMIN: Readonly<Record<ArgumentKind, ToulminRole | null>> = {
  question: null,
  definition: 'warrant',
  premise: 'data',
  claim: 'claim',
  proof: 'backing',
  example: 'data',
  objection: 'rebuttal',
  reply: 'qualifier',
  application: null,
  conclusion: 'claim',
};

/** One stroke-or-fill path of a glyph, in a 16×16 view box centred on (8, 8). */
export interface GlyphPath {
  readonly d: string;
  readonly filled: boolean;
}
export const GLYPH_VIEWBOX = '0 0 16 16';

const CIRCLE = 'M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11Z';
const SQUARE = 'M3 3h10v10H3Z';
const DIAMOND = 'M8 1.8 14.2 8 8 14.2 1.8 8Z';

/**
 * Shapes, chosen so that open/filled pairs share a meaning:
 *   question ○ (open: an issue not yet settled)   claim ● (the settled position)
 *   definition □ (a frame)                        proof ■ (Halmos' tombstone ∎)
 *   premise △ (a foundation)                      example ▽ (from the general down to a case)
 *   objection ◇ (a turn against)                  reply ◆ (the turn answered)
 *   application ⬡ (a tool: the hexagonal nut)     conclusion ◎ (the target reached)
 */
export const GLYPHS: Readonly<Record<ArgumentKind, readonly GlyphPath[]>> = {
  question: [{ d: CIRCLE, filled: false }],
  definition: [{ d: SQUARE, filled: false }],
  premise: [{ d: 'M8 2.2 13.8 13H2.2Z', filled: false }],
  claim: [{ d: CIRCLE, filled: true }],
  proof: [{ d: SQUARE, filled: true }],
  example: [{ d: 'M2.2 3h11.6L8 13.8Z', filled: false }],
  objection: [{ d: DIAMOND, filled: false }],
  reply: [{ d: DIAMOND, filled: true }],
  application: [{ d: 'M5 2.6h6l3 5.4-3 5.4H5L2 8Z', filled: false }],
  conclusion: [
    { d: CIRCLE, filled: false },
    { d: 'M8 5.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4Z', filled: true },
  ],
};

/** Identifier of a section (the id of its heading). Pandoc-compatible, Unicode letters allowed. */
export type SectionId = Brand<string, 'SectionId'>;
const SECTION_ID = /^[\p{L}\p{N}_][\p{L}\p{N}_:.-]*$/u;
export const parseSectionId = (v: unknown): Result<SectionId, string> =>
  typeof v === 'string' && SECTION_ID.test(v)
    ? ok(unsafeBrand<string, 'SectionId'>(v))
    : err(`invalid section id "${String(v)}" (letters, digits, _ : . - ; must not start with punctuation)`);

export interface ArgumentNode {
  readonly id: SectionId;
  readonly kind: ArgumentKind;
  /** Visible heading text. */
  readonly title: string;
  /** Sections this one rests on, in the author's order. */
  readonly depends: readonly SectionId[];
}

/** Edge from a dependency to the section that rests on it (premise → claim). */
export interface ArgumentEdge {
  readonly from: SectionId;
  readonly to: SectionId;
}

export interface ArgumentGraph {
  readonly nodes: readonly ArgumentNode[];
  readonly edges: readonly ArgumentEdge[];
}

export type GraphError =
  | { readonly type: 'missing'; readonly node: SectionId; readonly target: SectionId }
  | { readonly type: 'self'; readonly node: SectionId }
  | { readonly type: 'duplicate'; readonly node: SectionId }
  | { readonly type: 'cycle'; readonly path: readonly SectionId[] };

export const describeGraphError = (e: GraphError): string => {
  switch (e.type) {
    case 'missing':
      return `section "${e.node}" depends on "${e.target}", which is not an argument node of this document`;
    case 'self':
      return `section "${e.node}" depends on itself`;
    case 'duplicate':
      return `argument node "${e.node}" is declared twice`;
    case 'cycle':
      return `circular dependency (petitio principii): ${e.path.join(' → ')}`;
    default:
      return absurd(e);
  }
};

/**
 * Builds the graph and proves it is a DAG (a cycle would be circular
 * reasoning). Every problem is reported, not just the first. Cycle detection:
 * iterative-in-spirit DFS with three colours (Cormen et al., *Introduction to
 * Algorithms*, §22.3); each cycle is reported once, rotated to start at its
 * earliest node in document order.
 */
export const argumentGraph = (nodes: readonly ArgumentNode[]): Result<ArgumentGraph, readonly GraphError[]> => {
  const errors: GraphError[] = [];
  const index = new Map<string, number>();
  nodes.forEach((n, i) => {
    if (index.has(n.id)) errors.push({ type: 'duplicate', node: n.id });
    else index.set(n.id, i);
  });
  const edges: ArgumentEdge[] = [];
  for (const n of nodes) {
    for (const d of n.depends) {
      if (d === n.id) errors.push({ type: 'self', node: n.id });
      else if (!index.has(d)) errors.push({ type: 'missing', node: n.id, target: d });
      else edges.push({ from: d, to: n.id });
    }
  }
  // Adjacency in the direction of dependency (node → what it rests on) to find cycles.
  const rests = new Map<string, readonly string[]>(
    nodes.map((n) => [n.id, n.depends.filter((d) => index.has(d) && d !== n.id)]),
  );
  const colour = new Map<string, 'grey' | 'black'>();
  const seen = new Set<string>();
  const visit = (id: string, stack: readonly string[]): void => {
    colour.set(id, 'grey');
    for (const next of rests.get(id) ?? []) {
      const c = colour.get(next);
      if (c === 'grey') {
        const cycle = stack.slice(stack.indexOf(next));
        const start = cycle.reduce((best, x) => ((index.get(x) ?? 0) < (index.get(best) ?? 0) ? x : best), next);
        const k = cycle.indexOf(start);
        const rotated = [...cycle.slice(k), ...cycle.slice(0, k), start];
        const key = [...new Set(rotated)].sort().join('\u0000');
        if (!seen.has(key)) {
          seen.add(key);
          errors.push({ type: 'cycle', path: rotated as readonly SectionId[] });
        }
      } else if (c === undefined) visit(next, [...stack, next]);
    }
    colour.set(id, 'black');
  };
  for (const n of nodes) if (!colour.has(n.id)) visit(n.id, [n.id]);
  return errors.length > 0 ? err(errors) : ok({ nodes, edges });
};
