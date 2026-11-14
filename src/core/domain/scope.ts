/**
 * Scope of the site (ADR 0013): what a work must be about to belong here.
 *
 * The domain facet (facets.ts) is split in two tiers. CORE disciplines are the
 * subject of the site; FOUNDATIONS are supporting fields, admitted only as far
 * as a core discipline depends on them — `SUPPORTS` says which, so "why is this
 * here?" always has an answer in data. Three rules follow, all decidable:
 *
 *   R1  every domain is core or foundation, and every foundation supports at
 *       least one core discipline (by type: `SUPPORTS` is a total record of
 *       non-empty tuples);
 *   R2  every essay declares at least one core discipline (`checkEssayScope`;
 *       enforced by the content schema, so an out-of-scope essay fails the build);
 *   R3  at least SCOPE_MIN_CORE_SHARE of the works (essays and labs) declare a
 *       core discipline (`checkCorpusScope`): foundations may not outgrow what
 *       they are foundations of.
 *
 * The same classification derives the coverage matrix discipline × stratum
 * shown on the scope pages: the declared scope and the corpus are measured by
 * one function, so the page cannot claim what the corpus does not hold.
 */
import { absurd } from '../algebra/match.ts';
import { err, ok, type Result } from '../algebra/result.ts';
import { CORE_DOMAINS, FOUNDATION_DOMAINS, type CoreDomain, type Domain, type FoundationDomain } from './facets.ts';
import { STRATA, type Stratum } from './strata.ts';

/** Lines of inquiry: the groups in which the core disciplines are presented. */
export const AXES = ['software', 'optimization', 'systems', 'signals', 'philosophy'] as const;
export type Axis = (typeof AXES)[number];

export const AXIS_OF: Readonly<Record<CoreDomain, Axis>> = {
  'software-engineering': 'software',
  'software-architecture': 'software',
  'systems-design': 'software',
  'computer-science': 'optimization',
  'systems-optimization': 'optimization',
  'information-systems': 'systems',
  'information-technology': 'systems',
  'data-engineering': 'systems',
  'information-theory': 'signals',
  'signal-processing': 'signals',
  'applied-philosophy': 'philosophy',
};

/**
 * What each foundation is a foundation of. The pairs follow the editorial
 * programme (docs/programa-editorial.md §2): e.g. probability enters through
 * noise and codes, dynamics through signals, behaviour through the cost of
 * choosing (Hick–Hyman) and the people a system is designed for.
 */
export const SUPPORTS: Readonly<Record<FoundationDomain, readonly [CoreDomain, ...CoreDomain[]]>> = {
  ontology: ['applied-philosophy', 'information-systems'],
  epistemology: ['applied-philosophy'],
  semiotics: ['applied-philosophy', 'information-theory'],
  logic: ['computer-science', 'applied-philosophy'],
  mathematics: ['computer-science', 'systems-optimization', 'information-theory', 'signal-processing'],
  probability: ['information-theory', 'signal-processing'],
  'dynamical-systems': ['signal-processing'],
  behavior: ['systems-design', 'information-theory'],
  methodology: ['software-engineering', 'information-technology'],
  design: ['systems-design'],
  product: ['software-engineering', 'information-systems'],
};

export const isCoreDomain = (d: Domain): d is CoreDomain => (CORE_DOMAINS as readonly Domain[]).includes(d);

/** Core disciplines of a line of inquiry, in display order. */
export const disciplinesOf = (axis: Axis): readonly CoreDomain[] => CORE_DOMAINS.filter((d) => AXIS_OF[d] === axis);

/** Foundations a core discipline depends on, in display order. */
export const foundationsOf = (discipline: CoreDomain): readonly FoundationDomain[] =>
  FOUNDATION_DOMAINS.filter((f) => SUPPORTS[f].includes(discipline));

const inDisplayOrder = (present: ReadonlySet<CoreDomain>): readonly CoreDomain[] =>
  CORE_DOMAINS.filter((d) => present.has(d));

/**
 * Scope class of a list of domains (the first one is the primary domain):
 *   core        the item declares core disciplines — it is about them;
 *   foundation  it declares foundations only — it is in scope as a foundation
 *               of the disciplines its PRIMARY domain supports;
 *   none        the list is empty (the content schema rejects it earlier).
 */
export type ScopeClass =
  | { readonly tier: 'core'; readonly disciplines: readonly CoreDomain[] }
  | { readonly tier: 'foundation'; readonly supports: readonly CoreDomain[] }
  | { readonly tier: 'none' };

export const classify = (domains: readonly Domain[]): ScopeClass => {
  const core = new Set(domains.filter(isCoreDomain));
  if (core.size > 0) return { tier: 'core', disciplines: inDisplayOrder(core) };
  const primary = domains[0];
  if (primary === undefined || isCoreDomain(primary)) return { tier: 'none' };
  return { tier: 'foundation', supports: inDisplayOrder(new Set(SUPPORTS[primary])) };
};

/** Rule R2: an essay must be about at least one core discipline. */
export const checkEssayScope = (domains: readonly Domain[]): Result<readonly CoreDomain[], string> => {
  const c = classify(domains);
  return c.tier === 'core'
    ? ok(c.disciplines)
    : err(
        `out of scope: an essay must declare at least one core discipline (${CORE_DOMAINS.join(', ')}); ` +
          `found only [${domains.join(', ')}] (ADR 0013)`,
      );
};

/** What the scope rules need to know about a work. */
export interface ScopedWork {
  readonly id: string;
  readonly form: 'essay' | 'lab';
  readonly domains: readonly Domain[];
}

/** Rule R3: minimum share of works that declare a core discipline. */
export const SCOPE_MIN_CORE_SHARE = 0.75;

/** Share of the works that declare a core discipline (1 for an empty corpus: nothing is out of scope). */
export const coreShare = (works: readonly ScopedWork[]): number =>
  works.length === 0 ? 1 : works.filter((w) => classify(w.domains).tier === 'core').length / works.length;

export type ScopeProblem =
  | { readonly kind: 'essay-out-of-scope'; readonly id: string; readonly reason: string }
  | { readonly kind: 'work-without-domain'; readonly id: string }
  | { readonly kind: 'core-share-below-minimum'; readonly share: number; readonly minimum: number };

/** Every violation of R2 and R3 in a corpus (all of them, so the author sees the whole picture). */
export const checkCorpusScope = (works: readonly ScopedWork[]): readonly ScopeProblem[] => {
  const problems: ScopeProblem[] = [];
  for (const w of works) {
    if (classify(w.domains).tier === 'none') problems.push({ kind: 'work-without-domain', id: w.id });
    else if (w.form === 'essay') {
      const r = checkEssayScope(w.domains);
      if (!r.ok) problems.push({ kind: 'essay-out-of-scope', id: w.id, reason: r.error });
    }
  }
  const share = coreShare(works);
  if (share < SCOPE_MIN_CORE_SHARE) {
    problems.push({ kind: 'core-share-below-minimum', share, minimum: SCOPE_MIN_CORE_SHARE });
  }
  return problems;
};

export const formatScopeProblem = (p: ScopeProblem): string => {
  switch (p.kind) {
    case 'essay-out-of-scope':
      return `${p.id}: ${p.reason}`;
    case 'work-without-domain':
      return `${p.id}: no domain declared`;
    case 'core-share-below-minimum':
      return (
        `only ${(p.share * 100).toFixed(1)} % of the works declare a core discipline ` +
        `(minimum ${(p.minimum * 100).toFixed(0)} %, ADR 0013): foundations are outgrowing the scope`
      );
    default:
      return absurd(p);
  }
};

/** Anything located on the bridge and classified by domain: a work, a concept, a formula. */
export interface ScopedItem {
  readonly stratum: Stratum;
  readonly domains: readonly Domain[];
}

export interface CoverageCell {
  /** Items that declare the discipline. */
  readonly direct: number;
  /** Foundation-only items whose primary domain supports the discipline. */
  readonly supporting: number;
}

export type Coverage = Readonly<Record<CoreDomain, Readonly<Record<Stratum, CoverageCell>>>>;

/** The disciplines an item is listed under, and in which role. */
export const listing = (
  domains: readonly Domain[],
): { readonly role: 'direct' | 'supporting'; readonly disciplines: readonly CoreDomain[] } => {
  const c = classify(domains);
  if (c.tier === 'core') return { role: 'direct', disciplines: c.disciplines };
  return { role: 'supporting', disciplines: c.tier === 'foundation' ? c.supports : [] };
};

/** Coverage matrix discipline × stratum of a list of items (a fold; every cell present, zeros included). */
export const coverage = (items: readonly ScopedItem[]): Coverage => {
  const cells = new Map<string, { direct: number; supporting: number }>();
  const cell = (d: CoreDomain, s: Stratum): { direct: number; supporting: number } => {
    const key = `${d}\u0000${s}`;
    const found = cells.get(key);
    if (found !== undefined) return found;
    const fresh = { direct: 0, supporting: 0 };
    cells.set(key, fresh);
    return fresh;
  };
  for (const item of items) {
    const { role, disciplines } = listing(item.domains);
    for (const d of disciplines) cell(d, item.stratum)[role] += 1;
  }
  return Object.fromEntries(
    CORE_DOMAINS.map((d) => [d, Object.fromEntries(STRATA.map((s) => [s, { ...cell(d, s) }]))]),
  ) as Coverage;
};

/** Totals of a discipline's row. */
export const rowTotal = (row: Readonly<Record<Stratum, CoverageCell>>): CoverageCell =>
  STRATA.reduce<CoverageCell>(
    (acc, s) => ({ direct: acc.direct + row[s].direct, supporting: acc.supporting + row[s].supporting }),
    { direct: 0, supporting: 0 },
  );

/** Core disciplines with no item that declares them: the gaps the scope page must show as gaps. */
export const uncovered = (c: Coverage): readonly CoreDomain[] =>
  CORE_DOMAINS.filter((d) => rowTotal(c[d]).direct === 0);
