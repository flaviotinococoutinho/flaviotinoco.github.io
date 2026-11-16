/**
 * The pipeline of the essay "O pipeline não cria informação" (src/content/essays/{pt,en}/…), run on an
 * exact distribution so that the data processing inequality can be watched stage by stage.
 *
 *   source   a sale X = (shop, period, payment, amount), four fields of 4, 4, 3 and 3 values, with an
 *            explicit joint distribution of 144 outcomes in which the fields depend on one another;
 *   stages   a word over the alphabet of STAGE_CODE: drop a field, coarsen the period to day/night,
 *            corrupt the shop (a typing error, a noisy channel) or reformat (a bijection);
 *   question the field Q of the source a consumer of the output wants to know.
 *
 * Each stage reads only the output of the previous one, so X → Y₁ → … → Yₙ is a Markov chain and
 * I(X; Y_k) never increases with k (Cover & Thomas 2006, Theorem 2.8.1). The stage is sufficient for the
 * question when I(Q; Yₙ) = I(Q; X) = H(Q) (ibid., §2.9). Everything is exact: the joint distribution of
 * (X, Y_k) is carried through the pipeline as a table, not sampled.
 */
import { absurd } from '../algebra/match.ts';

export const FIELDS = ['shop', 'period', 'payment', 'amount'] as const;
export type Field = (typeof FIELDS)[number];

/** The values of each field; `daytime` and `nighttime` exist only after a coarsening stage. */
export const VALUES = {
  shop: ['north', 'south', 'east', 'west'],
  period: ['morning', 'afternoon', 'evening', 'night', 'daytime', 'nighttime'],
  payment: ['cash', 'card', 'instant'],
  amount: ['low', 'medium', 'high'],
} as const satisfies Readonly<Record<Field, readonly string[]>>;

/** How many values each field has at the source (the coarse periods are not source values). */
export const SOURCE_SIZE: Readonly<Record<Field, number>> = { shop: 4, period: 4, payment: 3, amount: 3 };

export const STAGES = ['dropPayment', 'dropPeriod', 'dropAmount', 'dropShop', 'coarsen', 'typo', 'reformat'] as const;
export type Stage = (typeof STAGES)[number];

/** One letter per stage: the lab's state, permalink and scrolly steps are words over this alphabet. */
export const STAGE_CODE: Readonly<Record<Stage, string>> = {
  dropPayment: 'p',
  dropPeriod: 't',
  dropAmount: 'v',
  dropShop: 's',
  coarsen: 'd',
  typo: 'e',
  reformat: 'f',
};
export const STAGE_ALPHABET = STAGES.map((s) => STAGE_CODE[s]).join('');
/** Longest pipeline the lab keeps. */
export const MAX_STAGES = 6;
/** Probability that the typing-error stage records another shop (uniformly one of the other three). */
export const TYPO_RATE = 0.1;

export const stagesOf = (code: string): readonly Stage[] =>
  [...code].flatMap((letter) => {
    const stage = STAGES.find((s) => STAGE_CODE[s] === letter);
    return stage === undefined ? [] : [stage];
  });

export const codeOfStages = (stages: readonly Stage[]): string => stages.map((s) => STAGE_CODE[s]).join('');

/** The default pipeline of the essay's table: extraction drops the payment; the sum per shop drops the rest. */
export const ESSAY_PIPELINE = 'ptv';

/** A record as it travels: one value index per field, or null where a stage dropped the field. */
export type SaleRecord = readonly [
  shop: number | null,
  period: number | null,
  payment: number | null,
  amount: number | null,
];

const SHOP_WEIGHTS = [0.4, 0.3, 0.2, 0.1] as const;
const PERIOD_BASE = [0.35, 0.35, 0.2, 0.1] as const;
const AMOUNT_WEIGHTS = [0.5, 0.35, 0.15] as const;
/** p(payment | amount): small sales are paid in cash more often, large ones by card. */
const PAYMENT_GIVEN_AMOUNT = [
  [0.5, 0.3, 0.2],
  [0.2, 0.5, 0.3],
  [0.05, 0.7, 0.25],
] as const;

/**
 * The source distribution p(x) over the 144 sales, in the order shop, period, payment, amount (the last
 * index varies fastest). Each shop has its own busy hours (the base profile rotated by the shop's index),
 * and the payment depends on the amount: the fields are not independent, so dropping one also loses part
 * of what it said about the others.
 */
export const SOURCE: readonly { readonly record: SaleRecord; readonly p: number }[] = (() => {
  const out: { record: SaleRecord; p: number }[] = [];
  for (let s = 0; s < 4; s += 1) {
    for (let t = 0; t < 4; t += 1) {
      const period = PERIOD_BASE[(t + s) % 4] ?? 0;
      for (let a = 0; a < 3; a += 1) {
        for (let m = 0; m < 3; m += 1) {
          const p = (SHOP_WEIGHTS[s] ?? 0) * period * (AMOUNT_WEIGHTS[m] ?? 0) * (PAYMENT_GIVEN_AMOUNT[m]?.[a] ?? 0);
          out.push({ record: [s, t, a, m], p });
        }
      }
    }
  }
  return out;
})();

const keyOf = (r: SaleRecord): string => r.map((v) => (v === null ? '-' : String(v))).join(',');

/** What one stage does to one record: a list of (output, probability) — one pair unless the stage is noisy. */
export const applyStage = (stage: Stage, r: SaleRecord): readonly (readonly [SaleRecord, number])[] => {
  const [shop, period, payment, amount] = r;
  switch (stage) {
    case 'dropPayment':
      return [[[shop, period, null, amount], 1]];
    case 'dropPeriod':
      return [[[shop, null, payment, amount], 1]];
    case 'dropAmount':
      return [[[shop, period, payment, null], 1]];
    case 'dropShop':
      return [[[null, period, payment, amount], 1]];
    case 'coarsen':
      // morning, afternoon → daytime (4); evening, night → nighttime (5); already coarse or dropped: unchanged.
      return [[[shop, period === null || period > 3 ? period : period < 2 ? 4 : 5, payment, amount], 1]];
    case 'typo':
      if (shop === null) return [[r, 1]];
      return [
        [r, 1 - TYPO_RATE],
        ...[0, 1, 2, 3]
          .filter((s) => s !== shop)
          .map((s) => [[s, period, payment, amount] as SaleRecord, TYPO_RATE / 3] as const),
      ];
    case 'reformat':
      // A change of representation that can be undone: the same information, written differently.
      return [[r, 1]];
    default:
      return absurd(stage);
  }
};

/** The joint distribution of (X, Y): for each source outcome (by index in SOURCE), its outputs and their probability. */
export type Joint = readonly ReadonlyMap<string, { readonly record: SaleRecord; readonly p: number }>[];

const initialJoint = (): Joint => SOURCE.map(({ record, p }) => new Map([[keyOf(record), { record, p }]]));

const step = (joint: Joint, stage: Stage): Joint =>
  joint.map((row) => {
    const next = new Map<string, { record: SaleRecord; p: number }>();
    for (const { record, p } of row.values()) {
      for (const [out, q] of applyStage(stage, record)) {
        const key = keyOf(out);
        const prev = next.get(key);
        next.set(key, { record: out, p: (prev?.p ?? 0) + p * q });
      }
    }
    return next;
  });

/** Shannon entropy in bits of a list of probabilities (zeros contribute nothing). */
export const entropyOf = (ps: Iterable<number>): number => {
  let h = 0;
  for (const p of ps) if (p > 0) h -= p * Math.log2(p);
  return Math.max(0, h);
};

/** The groups of source outcomes that share an answer to the question (Q is a function of X). */
const answerOf = (question: Field, index: number): number => SOURCE[index]?.record[FIELDS.indexOf(question)] ?? 0;

/**
 * I(A; Y) in bits, where A is a function of the source outcome (the outcome itself, or the answer to a
 * question): Σ p(a, y) log₂ p(a, y) / (p(a) p(y)).
 */
const mutualOf = (joint: Joint, group: (index: number) => number): number => {
  const pa = new Map<number, number>();
  const py = new Map<string, number>();
  const pay = new Map<string, number>();
  joint.forEach((row, index) => {
    const a = group(index);
    for (const [key, { p }] of row) {
      pa.set(a, (pa.get(a) ?? 0) + p);
      py.set(key, (py.get(key) ?? 0) + p);
      pay.set(`${String(a)}|${key}`, (pay.get(`${String(a)}|${key}`) ?? 0) + p);
    }
  });
  let i = 0;
  for (const [k, p] of pay) {
    if (p <= 0) continue;
    const bar = k.indexOf('|');
    const a = Number(k.slice(0, bar));
    const y = k.slice(bar + 1);
    i += p * Math.log2(p / ((pa.get(a) ?? 0) * (py.get(y) ?? 0)));
  }
  return Math.max(0, i);
};

/**
 * The joint distribution as a dense row-major matrix, rows = source outcomes (or answers to the
 * question), columns = distinct outputs — the layout `information.wasm` takes for its mutual information.
 */
export const jointMatrix = (
  joint: Joint,
  question: Field | null,
): { readonly matrix: readonly number[]; readonly rows: number; readonly cols: number } => {
  const columns = new Map<string, number>();
  for (const row of joint) for (const key of row.keys()) if (!columns.has(key)) columns.set(key, columns.size);
  const rows = question === null ? joint.length : SOURCE_SIZE[question];
  const cols = Math.max(1, columns.size);
  const matrix = Array.from({ length: rows * cols }, () => 0);
  joint.forEach((row, index) => {
    const r = question === null ? index : answerOf(question, index);
    for (const [key, { p }] of row) {
      const c = columns.get(key) ?? 0;
      matrix[r * cols + c] = (matrix[r * cols + c] ?? 0) + p;
    }
  });
  return { matrix, rows, cols };
};

export interface StageResult {
  /** The stage that produced this output; null for the source itself (Y₀ = X). */
  readonly stage: Stage | null;
  readonly joint: Joint;
  /** Distinct outputs this stage can write. */
  readonly outcomes: number;
  /** I(X; Y_k) in bits. */
  readonly aboutSource: number;
  /** I(Q; Y_k) in bits. */
  readonly aboutQuestion: number;
}

export interface PipelineRun {
  readonly stages: readonly Stage[];
  readonly question: Field;
  /** H(X) = I(X; X): everything the source says. */
  readonly sourceEntropy: number;
  /** H(Q) = I(Q; X): everything the source says about the question. */
  readonly questionEntropy: number;
  /** Y₀ = X, then one entry per stage. */
  readonly results: readonly StageResult[];
  /** I(Q; Yₙ) = H(Q): the output still answers the question as well as the source did. */
  readonly sufficient: boolean;
  /** 1-based index of the first stage after which the question can no longer be answered as well; null if never. */
  readonly firstLoss: number | null;
}

/** Tolerance of the floating-point comparisons (sums of 144 products of probabilities). */
export const EPSILON = 1e-9;

export const run = (stages: readonly Stage[], question: Field): PipelineRun => {
  const results: StageResult[] = [];
  let joint = initialJoint();
  const record = (stage: Stage | null): void => {
    const outputs = new Set<string>();
    for (const row of joint) for (const key of row.keys()) outputs.add(key);
    results.push({
      stage,
      joint,
      outcomes: outputs.size,
      aboutSource: mutualOf(joint, (i) => i),
      aboutQuestion: mutualOf(joint, (i) => answerOf(question, i)),
    });
  };
  record(null);
  for (const stage of stages.slice(0, MAX_STAGES)) {
    joint = step(joint, stage);
    record(stage);
  }
  const sourceEntropy = entropyOf(SOURCE.map((s) => s.p));
  const pq = new Map<number, number>();
  SOURCE.forEach(({ p }, i) => pq.set(answerOf(question, i), (pq.get(answerOf(question, i)) ?? 0) + p));
  const questionEntropy = entropyOf(pq.values());
  const lossAt = results.findIndex((r) => r.aboutQuestion < questionEntropy - EPSILON);
  const last = results.at(-1);
  return {
    stages: stages.slice(0, MAX_STAGES),
    question,
    sourceEntropy,
    questionEntropy,
    results,
    sufficient: last !== undefined && last.aboutQuestion >= questionEntropy - EPSILON,
    firstLoss: lossAt === -1 ? null : lossAt,
  };
};
