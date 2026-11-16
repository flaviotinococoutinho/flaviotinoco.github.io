/**
 * The pipeline lab (src/core/labs/pipeline.ts): the data processing inequality as a property of every
 * pipeline the lab can build (Cover & Thomas 2006, Theorem 2.8.1), sufficiency, and the stage codec.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  EPSILON,
  ESSAY_PIPELINE,
  FIELDS,
  MAX_STAGES,
  SOURCE,
  STAGES,
  STAGE_ALPHABET,
  codeOfStages,
  entropyOf,
  jointMatrix,
  run,
  stagesOf,
  type Stage,
} from '../../../src/core/labs/pipeline.ts';

const stage = fc.constantFrom(...STAGES);
const pipeline = fc.array(stage, { maxLength: MAX_STAGES });
const question = fc.constantFrom(...FIELDS);

/** Reference mutual information of a dense joint matrix, computed independently of the model. */
const mutual = (matrix: readonly number[], rows: number, cols: number): number => {
  const total = matrix.reduce((a, b) => a + b, 0);
  const pr = Array.from(
    { length: rows },
    (_, r) => matrix.slice(r * cols, r * cols + cols).reduce((a, b) => a + b, 0) / total,
  );
  const pc = Array.from(
    { length: cols },
    (_, c) => Array.from({ length: rows }, (_, r) => matrix[r * cols + c] ?? 0).reduce((a, b) => a + b, 0) / total,
  );
  let i = 0;
  matrix.forEach((v, k) => {
    const p = v / total;
    if (p > 0) i += p * Math.log2(p / ((pr[Math.floor(k / cols)] ?? 0) * (pc[k % cols] ?? 0)));
  });
  return i;
};

describe('source', () => {
  it('is a probability distribution over 144 sales', () => {
    expect(SOURCE).toHaveLength(144);
    expect(SOURCE.reduce((a, s) => a + s.p, 0)).toBeCloseTo(1, 12);
    expect(SOURCE.every((s) => s.p > 0)).toBe(true);
  });

  it('has fields that depend on one another: the payment still says something about the amount', () => {
    // I(payment; amount) > 0: knowing the amount says something about how it was paid.
    const r = run(['dropPeriod', 'dropShop', 'dropAmount'], 'amount');
    expect(r.results.at(-1)?.aboutQuestion ?? 0).toBeGreaterThan(0.05);
  });
});

describe('the data processing inequality', () => {
  test.prop([pipeline, question])('no stage increases what the output says about the source', (stages, q) => {
    const { results } = run(stages, q);
    for (let k = 1; k < results.length; k++) {
      expect(results[k]?.aboutSource ?? 0).toBeLessThanOrEqual((results[k - 1]?.aboutSource ?? 0) + EPSILON);
      expect(results[k]?.aboutQuestion ?? 0).toBeLessThanOrEqual((results[k - 1]?.aboutQuestion ?? 0) + EPSILON);
    }
  });

  test.prop([pipeline, question])('nothing says more about the question than the source did', (stages, q) => {
    const r = run(stages, q);
    expect(r.results[0]?.aboutSource).toBeCloseTo(r.sourceEntropy, 9);
    expect(r.results[0]?.aboutQuestion).toBeCloseTo(r.questionEntropy, 9);
    for (const s of r.results) {
      expect(s.aboutQuestion).toBeLessThanOrEqual(s.aboutSource + EPSILON);
      expect(s.aboutQuestion).toBeLessThanOrEqual(r.questionEntropy + EPSILON);
    }
  });

  test.prop([pipeline, fc.integer({ min: 0, max: MAX_STAGES }), question])(
    'a reversible stage loses nothing: equality holds',
    (stages, at, q) => {
      fc.pre(stages.length < MAX_STAGES);
      const withIt: Stage[] = [...stages.slice(0, at), 'reformat', ...stages.slice(at)];
      const a = run(stages, q).results.at(-1);
      const b = run(withIt, q).results.at(-1);
      expect(b?.aboutSource).toBeCloseTo(a?.aboutSource ?? 0, 9);
      expect(b?.aboutQuestion).toBeCloseTo(a?.aboutQuestion ?? 0, 9);
    },
  );

  test.prop([pipeline, question])(
    'the dense matrix gives the same mutual information (the kernel layout)',
    (stages, q) => {
      const r = run(stages, q);
      const last = r.results.at(-1);
      if (last === undefined) return;
      const x = jointMatrix(last.joint, null);
      const y = jointMatrix(last.joint, q);
      expect(mutual(x.matrix, x.rows, x.cols)).toBeCloseTo(last.aboutSource, 9);
      expect(mutual(y.matrix, y.rows, y.cols)).toBeCloseTo(last.aboutQuestion, 9);
    },
  );
});

describe('sufficiency is relative to the question', () => {
  it('the essay pipeline keeps everything about the shop and nothing else', () => {
    const stages = stagesOf(ESSAY_PIPELINE);
    expect(run(stages, 'shop').sufficient).toBe(true);
    for (const q of ['period', 'payment', 'amount'] as const) expect(run(stages, q).sufficient).toBe(false);
  });

  it('names the stage that lost the question', () => {
    expect(run(stagesOf('ptv'), 'payment').firstLoss).toBe(1);
    expect(run(stagesOf('ptv'), 'amount').firstLoss).toBe(3);
    expect(run(stagesOf('ptv'), 'shop').firstLoss).toBeNull();
  });

  it('coarsening the period keeps day versus night but not the hour', () => {
    const r = run(['coarsen'], 'period');
    expect(r.sufficient).toBe(false);
    expect(r.results.at(-1)?.aboutQuestion ?? 0).toBeGreaterThan(0.5);
  });

  it('a typing error makes the output insufficient for the shop, without removing any field', () => {
    const r = run(['typo'], 'shop');
    expect(r.sufficient).toBe(false);
    expect(r.results.at(-1)?.outcomes).toBe(144);
  });

  test.prop([pipeline, question])('sufficient means the question was never lost', (stages, q) => {
    const r = run(stages, q);
    expect(r.sufficient).toBe(r.firstLoss === null);
  });
});

describe('stage codec', () => {
  test.prop([pipeline])('decode ∘ encode = id', (stages) => {
    expect(stagesOf(codeOfStages(stages))).toEqual(stages);
  });

  test.prop([fc.string()])('decoding keeps only letters of the alphabet', (text) => {
    expect(codeOfStages(stagesOf(text))).toBe([...text].filter((c) => STAGE_ALPHABET.includes(c)).join(''));
  });

  test.prop([fc.array(fc.double({ min: 0, max: 1, noNaN: true }))])('entropy is never negative', (ps) => {
    expect(entropyOf(ps)).toBeGreaterThanOrEqual(0);
  });
});
