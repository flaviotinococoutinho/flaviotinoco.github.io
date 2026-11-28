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
 * marks, the contents) and the page's sprite of kinds — a single source of truth.
 */
import { type Brand, unsafeBrand } from '../algebra/brand.ts';
import { absurd } from '../algebra/match.ts';
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';

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
  isArgumentKind(v) ? ok(v) : err(`unknown argument kind "${show(v)}" (expected one of ${ARGUMENT_KINDS.join(', ')})`);

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

/** One path of a glyph, in a 16×16 view box centred on (8, 8): stroked, filled too, or stroked wider (dots). */
export interface GlyphPath {
  readonly d: string;
  readonly filled: boolean;
  /** Stroke width when it differs from the shared one (GLYPH_PAINT). */
  readonly width?: number;
}
export const GLYPH_VIEWBOX = '0 0 16 16';

/** Paint shared by every glyph, set once on its container and inherited by its paths (hast property names). */
export const GLYPH_PAINT = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Id of the SVG <symbol> of a kind in the page's sprite of kinds (src/components/reading/ArgumentGlyphs.astro). */
export const glyphSymbolId = (kind: ArgumentKind): `arg-${ArgumentKind}` => `arg-${kind}`;

/** What a path adds to the shared paint (hast property names; the sprite writes them in SVG spelling). */
export const pathPaint = (p: GlyphPath): { readonly fill?: 'currentColor'; readonly strokeWidth?: number } => ({
  ...(p.filled ? { fill: 'currentColor' as const } : {}),
  ...(p.width === undefined ? {} : { strokeWidth: p.width }),
});

/**
 * Points `size` units across: the dots of ?, ≔, ∵ and ∴. Each is a 0.01-unit segment whose round caps make a
 * disc as wide as the stroke, the idiom of icon sets for dots (Lucide's "?" is `M12 17h.01`); one path per sign,
 * however many dots.
 */
const dots = (size: number, ...at: readonly (readonly [x: number, y: number])[]): GlyphPath => ({
  d: at.map(([x, y]) => `M${String(x)} ${String(y)}h.01`).join(''),
  filled: false,
  width: size,
});
const stroke = (d: string): GlyphPath => ({ d, filled: false });

/**
 * The marks of the argument roles are the signs of logic and of the mathematical page, not geometric
 * figures. The site's geometric primitives — the point, the segment, the triangle and the tetrahedron —
 * are the signs of the four strata (src/components/Glyphs.astro), and an essay shows its stratum and its
 * argument roles on the same screen: a filled disc for the claim and an outline triangle for the premise
 * (the previous marks) said "philosophy" and "formal" to a reader who had learnt the bridge. These are
 * conventional symbols (Peirce's sense) that the site's readers already know, in pairs:
 *
 *   premise    ∵ because                 conclusion  ∴ therefore      (the inference, read across)
 *   claim      ⊢ asserted (Frege 1879)   application ⊨ holds in a model (Tarski: satisfaction in practice)
 *   objection  ¬ not so                  reply       ¬¬ the objection negated
 *   question   ? at issue                proof       ∎ settled (Halmos's tombstone)
 *   definition ≔ is defined as           example     ∈ an instance of the general
 *
 * ∵ and ∴ are three points with no edge between them; among the site's marks only the simplices join
 * points with edges. Strokes are 1.5 units in a 16-unit box with round ends, like the rest of the set.
 */
export const GLYPHS: Readonly<Record<ArgumentKind, readonly GlyphPath[]>> = {
  question: [stroke('M5.3 5.4a2.7 2.7 0 1 1 3.8 2.5C8.4 8.3 8 8.9 8 9.9'), dots(2.5, [8, 12.8])],
  definition: [dots(2.5, [3.4, 5.8], [3.4, 10.2]), stroke('M6.6 5.8h6.9M6.6 10.2h6.9')],
  premise: [dots(3.3, [3.8, 4.8], [12.2, 4.8], [8, 11.4])],
  claim: [stroke('M4.2 2.8v10.4M4.2 8h8.8')],
  proof: [{ d: 'M4.6 2.8h6.8v10.4H4.6Z', filled: true }],
  example: [stroke('M12.6 3.4H8.4a4.6 4.6 0 0 0 0 9.2h4.2M3.8 8h8.6')],
  objection: [stroke('M3 6h10v4.6')],
  reply: [stroke('M1.6 6h5.2v4.6M9.2 6h5.2v4.6')],
  application: [stroke('M4.2 2.8v10.4M4.2 6.3h8.8M4.2 9.7h8.8')],
  conclusion: [dots(3.3, [8, 4.6], [3.8, 11.2], [12.2, 11.2])],
};

/** Identifier of a section (the id of its heading). Pandoc-compatible, Unicode letters allowed. */
export type SectionId = Brand<string, 'SectionId'>;
const SECTION_ID = /^[\p{L}\p{N}_][\p{L}\p{N}_:.-]*$/u;
export const parseSectionId = (v: unknown): Result<SectionId, string> =>
  typeof v === 'string' && SECTION_ID.test(v)
    ? ok(unsafeBrand<string, 'SectionId'>(v))
    : err(`invalid section id "${show(v)}" (letters, digits, _ : . - ; must not start with punctuation)`);

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
 * depth-first search with three colours (Cormen et al., *Introduction to
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
  // Adjacency in the direction of dependency (node → what it rests on) to find cycles;
  // the dependencies of a duplicated id are merged, so no cycle hides behind a duplicate.
  const rests = new Map<SectionId, readonly SectionId[]>();
  for (const n of nodes) {
    rests.set(n.id, [...(rests.get(n.id) ?? []), ...n.depends.filter((d) => index.has(d) && d !== n.id)]);
  }
  const colour = new Map<SectionId, 'grey' | 'black'>();
  const seen = new Set<string>();
  const order = (id: SectionId): number => index.get(id) ?? 0;
  const visit = (id: SectionId, stack: readonly SectionId[]): void => {
    colour.set(id, 'grey');
    for (const next of rests.get(id) ?? []) {
      const c = colour.get(next);
      if (c === 'grey') {
        const cycle = stack.slice(stack.indexOf(next));
        const start = cycle.reduce((best, x) => (order(x) < order(best) ? x : best), next);
        const k = cycle.indexOf(start);
        const rotated: readonly SectionId[] = [...cycle.slice(k), ...cycle.slice(0, k), start];
        const key = [...new Set(rotated)].sort().join('\u0000');
        if (!seen.has(key)) {
          seen.add(key);
          errors.push({ type: 'cycle', path: rotated });
        }
      } else if (c === undefined) visit(next, [...stack, next]);
    }
    colour.set(id, 'black');
  };
  for (const n of nodes) if (!colour.has(n.id)) visit(n.id, [n.id]);
  return errors.length > 0 ? err(errors) : ok({ nodes, edges });
};
