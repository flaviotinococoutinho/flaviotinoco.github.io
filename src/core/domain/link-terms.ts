/**
 * Link terms — one taxonomy of the abstract relations by which the site links ideas about different things
 * (concepts, works, agents, tools, claims), named with the terms philosophy has for them.
 *
 * Why one vocabulary: a link between a film and a theorem, or between a tool and a value, is only
 * informative if its type says HOW they are related; and two links are comparable only if their types are
 * comparable. The terms form a forest (a taxonomy with depth, read as "is a kind of"): a query for a general
 * mode (e.g. `causation`) finds every specific link under it (e.g. `influenced`, `made`).
 *
 * Levels keep comparison honest. Every linked thing lives at exactly one ontological LEVEL; similarity is
 * computed only within a level (`comparable`), and a link across levels must have a type whose signature
 * declares that pair of levels. Analogy is the deliberate exception: it may join any two levels, and must
 * then state the shared structure (`ratio`, "A : B :: C : D").
 *
 * Sources (BibTeX keys; see bibliography/*.bib):
 *   predication  — Aristotle, Topics I 4–5 (the predicables) and Porphyry's Isagoge (genus, species, difference,
 *                  property, accident; the "Porphyrian tree" is the original taxonomy with depth);
 *   opposition   — Aristotle, Categories 10, 11b15–13b35 (contraries, contradictories, relatives, privation);
 *   mereology    — Simons, Parts (1987);
 *   dependence   — Husserl, Logical Investigations III; Correia, "Ontological Dependence" (2008);
 *   causation    — Aristotle, Physics II 3, 194b16–195a3 (material, formal, efficient, final cause);
 *   signification— Peirce, Collected Papers 2.247–249 (icon, index, symbol);
 *   instantiation— Peirce, CP 4.537 (type and token); Putnam, "Psychological Predicates" (1967) for realization;
 *   analogy      — Aristotle, Poetics 21, 1457b16–33 (proportional analogy); Gentner, "Structure-Mapping" (1983);
 *   axiology     — Korsgaard, "Two Distinctions in Goodness" (1983); Chang (ed.), Incommensurability (1997);
 *   dialectic    — Toulmin (1958); Pollock, "Defeasible Reasoning" (1987); Dung (1995); Walton (1988).
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';

/** Ontological levels of the things the site links. Comparison (similarity) is defined within a level only. */
export const LEVELS = ['concept', 'work', 'agent', 'tool', 'claim'] as const;
export type Level = (typeof LEVELS)[number];

/** Shape of an entry as written below; `parent`/`converse` are checked to be term ids by `danglingReferences`. */
interface TermEntry {
  /** The more general term, or null for a root mode. */
  readonly parent: string | null;
  /** Converse term (stored once, derived the other way); a symmetric term is its own converse. */
  readonly converse: string | null;
  readonly symmetric: boolean;
  readonly transitive: boolean;
  /** No chain of links of this type may return to its start. */
  readonly acyclic: boolean;
  /** Allowed (from, to) level pairs; empty = inherited from the parent; roots declare their own. */
  readonly signature: readonly (readonly [Level | '*', Level | '*'])[];
  /** The link must state the shared structure in a `ratio` (analogies). */
  readonly needsRatio?: boolean;
  /** The link must say what good, for whom, in a `note` (axiology). */
  readonly needsNote?: boolean;
}

const same = (levels: readonly Level[]): readonly (readonly [Level, Level])[] => levels.map((l) => [l, l] as const);
const ANY: readonly (readonly ['*', '*'])[] = [['*', '*']];

export const LINK_TERMS = {
  // ── predication: how one thing is said of another ───────────────────────────────────────────────────
  predication: {
    parent: null,
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: same(['concept', 'work', 'agent', 'tool']),
  },
  'genus-of': {
    parent: 'predication',
    converse: 'species-of',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: [],
  },
  'species-of': {
    parent: 'predication',
    converse: 'genus-of',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: [],
  },
  /** "sabor": same essence, different accidents (a dialect, a profile, a variant). */
  'variety-of': {
    parent: 'species-of',
    converse: 'has-variety',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [],
  },
  'has-variety': {
    parent: 'genus-of',
    converse: 'variety-of',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [],
  },
  /** Co-species under the nearest genus: what "similar, within the same layer" means. */
  'coordinate-with': {
    parent: 'predication',
    converse: 'coordinate-with',
    symmetric: true,
    transitive: false,
    acyclic: false,
    signature: [],
  },
  /** Inheres contingently: a tool in a work, a quality in a subject. */
  'accident-of': {
    parent: 'predication',
    converse: 'has-accident',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['tool', 'work'],
      ['tool', 'concept'],
    ],
  },
  'has-accident': {
    parent: 'predication',
    converse: 'accident-of',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['work', 'tool'],
      ['concept', 'tool'],
    ],
  },

  // ── opposition (Categories 10) ──────────────────────────────────────────────────────────────────────
  opposition: {
    parent: null,
    converse: 'opposition',
    symmetric: true,
    transitive: false,
    acyclic: false,
    signature: same(['concept', 'claim']),
  },
  'contrary-of': {
    parent: 'opposition',
    converse: 'contrary-of',
    symmetric: true,
    transitive: false,
    acyclic: false,
    signature: [],
  },
  'contradictory-of': {
    parent: 'opposition',
    converse: 'contradictory-of',
    symmetric: true,
    transitive: false,
    acyclic: false,
    signature: [],
  },
  'correlative-of': {
    parent: 'opposition',
    converse: 'correlative-of',
    symmetric: true,
    transitive: false,
    acyclic: false,
    signature: [],
  },
  'privation-of': {
    parent: 'opposition',
    converse: 'possession-of',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [],
  },
  'possession-of': {
    parent: 'opposition',
    converse: 'privation-of',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [],
  },

  // ── mereology ───────────────────────────────────────────────────────────────────────────────────────
  mereology: {
    parent: null,
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [...same(['concept', 'work', 'agent', 'tool']), ['agent', 'agent']],
  },
  'part-of': {
    parent: 'mereology',
    converse: 'has-part',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: same(['concept', 'work', 'tool', 'agent']),
  },
  'has-part': {
    parent: 'mereology',
    converse: 'part-of',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: same(['concept', 'work', 'tool', 'agent']),
  },
  'member-of': {
    parent: 'mereology',
    converse: 'has-member',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [['agent', 'agent']],
  },
  'has-member': {
    parent: 'mereology',
    converse: 'member-of',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [['agent', 'agent']],
  },

  // ── dependence ──────────────────────────────────────────────────────────────────────────────────────
  dependence: {
    parent: null,
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [...same(['concept', 'tool', 'work', 'claim'])],
  },
  /** Notional dependence: understanding X requires Y (the ontology's prerequisite relation). */
  presupposes: {
    parent: 'dependence',
    converse: 'presupposed-by',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: same(['concept', 'claim']),
  },
  'presupposed-by': {
    parent: 'dependence',
    converse: 'presupposes',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: same(['concept', 'claim']),
  },
  /** Existential dependence: X cannot exist (run, hold) without Y. */
  requires: {
    parent: 'dependence',
    converse: 'required-by',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: same(['tool', 'work']),
  },
  'required-by': {
    parent: 'dependence',
    converse: 'requires',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: same(['tool', 'work']),
  },

  // ── causation (the four causes) ─────────────────────────────────────────────────────────────────────
  causation: { parent: null, converse: null, symmetric: false, transitive: false, acyclic: false, signature: ANY },
  /** That out of which (the PMEST "Matter" of a tool). */
  'material-cause-of': {
    parent: 'causation',
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [],
  },
  /** The form or account: a specification of its implementations; a formal theory of what it formalizes. */
  'formal-cause-of': {
    parent: 'causation',
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [],
  },
  formalizes: {
    parent: 'formal-cause-of',
    converse: 'formalized-by',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [['concept', 'concept']],
  },
  'formalized-by': {
    parent: 'causation',
    converse: 'formalizes',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [['concept', 'concept']],
  },
  /** The primary source of change. */
  'efficient-cause-of': {
    parent: 'causation',
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [],
  },
  /** Historical influence, a weak efficient cause: it must be sourced. */
  influenced: {
    parent: 'efficient-cause-of',
    converse: 'influenced-by',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['agent', 'agent'],
      ['agent', 'work'],
      ['work', 'work'],
      ['work', 'agent'],
      ['concept', 'concept'],
      ['work', 'concept'],
      ['agent', 'concept'],
    ],
  },
  'influenced-by': {
    parent: 'causation',
    converse: 'influenced',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['agent', 'agent'],
      ['work', 'agent'],
      ['work', 'work'],
      ['agent', 'work'],
      ['concept', 'concept'],
      ['concept', 'work'],
      ['concept', 'agent'],
    ],
  },
  /** Authorship, creation, foundation (agent → work, tool or organization). */
  made: {
    parent: 'efficient-cause-of',
    converse: 'made-by',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['agent', 'work'],
      ['agent', 'tool'],
      ['agent', 'agent'],
    ],
  },
  'made-by': {
    parent: 'causation',
    converse: 'made',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['work', 'agent'],
      ['tool', 'agent'],
      ['agent', 'agent'],
    ],
  },
  /** That for the sake of which. */
  'final-cause-of': {
    parent: 'causation',
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [],
  },

  // ── signification (Peirce) ──────────────────────────────────────────────────────────────────────────
  signification: { parent: null, converse: null, symmetric: false, transitive: false, acyclic: false, signature: ANY },
  /** By resemblance of structure: a model, a diagram, a simulation. */
  'icon-of': {
    parent: 'signification',
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [],
  },
  /** By a real connection: a citation, a symptom, a measurement. */
  'index-of': {
    parent: 'signification',
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [],
  },
  'refers-to': {
    parent: 'index-of',
    converse: 'referred-by',
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [],
  },
  'referred-by': {
    parent: 'signification',
    converse: 'refers-to',
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [],
  },
  measures: {
    parent: 'index-of',
    converse: 'measured-by',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['concept', 'concept'],
      ['tool', 'concept'],
    ],
  },
  'measured-by': {
    parent: 'signification',
    converse: 'measures',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['concept', 'concept'],
      ['concept', 'tool'],
    ],
  },
  /** By convention or law. */
  'symbol-of': {
    parent: 'signification',
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [],
  },

  // ── instantiation ───────────────────────────────────────────────────────────────────────────────────
  instantiation: {
    parent: null,
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['work', 'concept'],
      ['tool', 'concept'],
      ['agent', 'concept'],
      ['claim', 'concept'],
      ['concept', 'concept'],
    ],
  },
  /** Token of a type, case of a universal. */
  'instance-of': {
    parent: 'instantiation',
    converse: 'has-instance',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [],
  },
  'has-instance': {
    parent: 'instantiation',
    converse: 'instance-of',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['concept', 'work'],
      ['concept', 'tool'],
      ['concept', 'agent'],
      ['concept', 'claim'],
      ['concept', 'concept'],
    ],
  },
  /** Functional realization; the converse is not functional (multiple realizability). */
  realizes: {
    parent: 'instantiation',
    converse: 'realized-by',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['tool', 'concept'],
      ['work', 'concept'],
    ],
  },
  'realized-by': {
    parent: 'instantiation',
    converse: 'realizes',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [
      ['concept', 'tool'],
      ['concept', 'work'],
    ],
  },
  /** A theory applied to a domain where it is instantiated (the ontology's appliesTo). */
  'applies-to': {
    parent: 'instantiation',
    converse: 'applied-from',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [['concept', 'concept']],
  },
  'applied-from': {
    parent: 'instantiation',
    converse: 'applies-to',
    symmetric: false,
    transitive: false,
    acyclic: true,
    signature: [['concept', 'concept']],
  },

  // ── analogy ─────────────────────────────────────────────────────────────────────────────────────────
  analogy: {
    parent: null,
    converse: 'analogy',
    symmetric: true,
    transitive: false,
    acyclic: false,
    signature: ANY,
    needsRatio: true,
  },
  /** A : B :: C : D — the shared relational structure is stated in `ratio`. */
  'analogous-to': {
    parent: 'analogy',
    converse: 'analogous-to',
    symmetric: true,
    transitive: false,
    acyclic: false,
    signature: [],
    needsRatio: true,
  },
  /** A structure-preserving bijection is stated (the formal limit of analogy). */
  'isomorphic-to': {
    parent: 'analogy',
    converse: 'isomorphic-to',
    symmetric: true,
    transitive: true,
    acyclic: false,
    signature: [['concept', 'concept']],
    needsRatio: true,
  },

  // ── axiology: the terms of value ────────────────────────────────────────────────────────────────────
  axiology: { parent: null, converse: null, symmetric: false, transitive: false, acyclic: false, signature: ANY },
  /** X is valuable as a means to Y (instrumental value; Korsgaard 1983). */
  'means-to': {
    parent: 'axiology',
    converse: 'end-of',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: [],
  },
  'end-of': {
    parent: 'final-cause-of',
    converse: 'means-to',
    symmetric: false,
    transitive: true,
    acyclic: true,
    signature: [],
  },
  /** "beneficiou": X brought a good to Y (cui bono) — the note says what good and for whom. */
  benefits: {
    parent: 'axiology',
    converse: 'benefited-from',
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [
      ['agent', 'agent'],
      ['work', 'agent'],
      ['tool', 'agent'],
      ['concept', 'agent'],
      ['agent', 'work'],
      ['tool', 'work'],
      ['concept', 'work'],
    ],
    needsNote: true,
  },
  'benefited-from': {
    parent: 'axiology',
    converse: 'benefits',
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [
      ['agent', 'agent'],
      ['agent', 'work'],
      ['agent', 'tool'],
      ['agent', 'concept'],
      ['work', 'agent'],
      ['work', 'tool'],
      ['work', 'concept'],
    ],
    needsNote: true,
  },
  harms: {
    parent: 'axiology',
    converse: 'harmed-by',
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [
      ['agent', 'agent'],
      ['work', 'agent'],
      ['tool', 'agent'],
      ['concept', 'agent'],
      ['tool', 'work'],
    ],
    needsNote: true,
  },
  'harmed-by': {
    parent: 'axiology',
    converse: 'harms',
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [
      ['agent', 'agent'],
      ['agent', 'work'],
      ['agent', 'tool'],
      ['agent', 'concept'],
      ['work', 'tool'],
    ],
    needsNote: true,
  },
  /** Gaining one costs the other; the values may be incommensurable (Chang 1997). */
  'trades-off-with': {
    parent: 'axiology',
    converse: 'trades-off-with',
    symmetric: true,
    transitive: false,
    acyclic: false,
    signature: same(['concept', 'tool', 'work']),
    needsNote: true,
  },

  // ── dialectic: support and attack between claims ────────────────────────────────────────────────────
  dialectic: {
    parent: null,
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [['claim', 'claim']],
  },
  supports: { parent: 'dialectic', converse: null, symmetric: false, transitive: false, acyclic: true, signature: [] },
  attacks: { parent: 'dialectic', converse: null, symmetric: false, transitive: false, acyclic: false, signature: [] },
  /** One case satisfying the antecedent and falsifying the consequent of a universal claim. */
  counterexample: {
    parent: 'attacks',
    converse: null,
    symmetric: false,
    transitive: false,
    acyclic: false,
    signature: [],
  },
  /** Assuming the claim, a contradiction or an absurd consequence follows. */
  reductio: { parent: 'attacks', converse: null, symmetric: false, transitive: false, acyclic: false, signature: [] },
  /** "invalida": attacks the inference (warrant), not the conclusion — Pollock's undercutting defeater. */
  undercut: { parent: 'attacks', converse: null, symmetric: false, transitive: false, acyclic: false, signature: [] },
  /** "derruba": a stronger reason for the contrary conclusion — Pollock's rebutting defeater. */
  rebut: { parent: 'attacks', converse: null, symmetric: false, transitive: false, acyclic: false, signature: [] },
  /** "desmente": contrary empirical evidence for a factual claim. */
  disconfirm: { parent: 'attacks', converse: null, symmetric: false, transitive: false, acyclic: false, signature: [] },
  /** "ônus da prova": the proponent has not discharged the burden the dialogue assigns to them. */
  burden: { parent: 'attacks', converse: null, symmetric: false, transitive: false, acyclic: false, signature: [] },
} as const satisfies Readonly<Record<string, TermEntry>>;

export type LinkTermId = keyof typeof LINK_TERMS;
export const LINK_TERM_IDS = Object.keys(LINK_TERMS) as readonly LinkTermId[];

export const isLinkTerm = (v: unknown): v is LinkTermId => typeof v === 'string' && Object.hasOwn(LINK_TERMS, v);

export const parseLinkTerm = (v: unknown): Result<LinkTermId, string> =>
  isLinkTerm(v) ? ok(v) : err(`unknown link term "${show(v)}"`);

export const isLevel = (v: unknown): v is Level => typeof v === 'string' && (LEVELS as readonly string[]).includes(v);

export interface LinkTermSpec extends Omit<TermEntry, 'parent' | 'converse'> {
  readonly parent: LinkTermId | null;
  readonly converse: LinkTermId | null;
}

/** References in the table that are not term ids (empty by construction; asserted by a test). */
export const danglingReferences = (): readonly string[] =>
  Object.entries(LINK_TERMS as Readonly<Record<string, TermEntry>>).flatMap(([id, e]) =>
    [e.parent, e.converse].filter((r): r is string => r !== null && !isLinkTerm(r)).map((r) => `${id} → ${r}`),
  );

// Sound because danglingReferences() is empty (tested): every parent/converse is a LinkTermId.
export const spec = (t: LinkTermId): LinkTermSpec => LINK_TERMS[t];

/** The root modes, in declaration order. */
export const ROOTS: readonly LinkTermId[] = LINK_TERM_IDS.filter((t) => spec(t).parent === null);

/** Ancestors of a term, nearest first (excluding the term). */
export const ancestors = (t: LinkTermId): readonly LinkTermId[] => {
  const out: LinkTermId[] = [];
  const seen = new Set<LinkTermId>([t]);
  let p = spec(t).parent;
  while (p !== null && !seen.has(p)) {
    out.push(p);
    seen.add(p);
    p = spec(p).parent;
  }
  return out;
};

/** The root mode of a term. */
export const modeOf = (t: LinkTermId): LinkTermId => ancestors(t).at(-1) ?? t;

/** Subsumption: `t` is `general` or a kind of it. */
export const isA = (t: LinkTermId, general: LinkTermId): boolean => t === general || ancestors(t).includes(general);

/** Direct children, in declaration order. */
export const children = (t: LinkTermId): readonly LinkTermId[] => LINK_TERM_IDS.filter((c) => spec(c).parent === t);

/** Depth in the taxonomy (roots have depth 0). */
export const depth = (t: LinkTermId): number => ancestors(t).length;

/** Effective signature: the term's own, or the nearest ancestor's that declares one. */
export const signatureOf = (t: LinkTermId): readonly (readonly [Level | '*', Level | '*'])[] => {
  for (const s of [t, ...ancestors(t)]) {
    const sig = spec(s).signature;
    if (sig.length > 0) return sig;
  }
  return [];
};

/** May a link of type `t` join a thing at level `from` to one at level `to`? */
export const admits = (t: LinkTermId, from: Level, to: Level): boolean =>
  signatureOf(t).some(([a, b]) => (a === '*' || a === from) && (b === '*' || b === to));

/** Whether a link of type `t` must state a ratio (analogy) or a note (axiology), inherited down the taxonomy. */
export const needsRatio = (t: LinkTermId): boolean => [t, ...ancestors(t)].some((s) => spec(s).needsRatio === true);
export const needsNote = (t: LinkTermId): boolean => [t, ...ancestors(t)].some((s) => spec(s).needsNote === true);

/**
 * Comparable things: same level and, for concepts, the same ontological category. Similarity measures are
 * defined only between comparable things; anything else is linked by a typed term, never scored.
 */
export const comparable = (
  a: { readonly level: Level; readonly category?: string },
  b: { readonly level: Level; readonly category?: string },
): boolean => a.level === b.level && (a.level !== 'concept' || a.category === b.category);

export interface LinkInput {
  readonly type: unknown;
  readonly from: Level;
  readonly to: Level;
  readonly ratio?: unknown;
  readonly note?: unknown;
}

const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;

/** Validates one link against the taxonomy: known term, admitted levels, required ratio/note. All errors. */
export const checkLink = (link: LinkInput): Result<LinkTermId, readonly string[]> => {
  const t = parseLinkTerm(link.type);
  if (!t.ok) return err([t.error]);
  const errors: string[] = [];
  if (!admits(t.value, link.from, link.to)) {
    const allowed = signatureOf(t.value)
      .map(([a, b]) => `${a} → ${b}`)
      .join(', ');
    errors.push(`"${t.value}" cannot link a ${link.from} to a ${link.to} (allowed: ${allowed})`);
  }
  if (needsRatio(t.value) && !nonEmpty(link.ratio)) {
    errors.push(`"${t.value}" needs a ratio stating the shared structure ("A : B :: C : D")`);
  }
  if (needsNote(t.value) && !nonEmpty(link.note)) {
    errors.push(`"${t.value}" needs a note saying what good or harm, and for whom`);
  }
  return errors.length === 0 ? ok(t.value) : err(errors);
};
