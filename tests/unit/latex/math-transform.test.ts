import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  appendTag,
  extractLabels,
  findRefs,
  findTag,
  isOuterEnvironment,
  replaceRefs,
  starAutoNumbered,
} from '../../../src/core/latex/math-transform.ts';

describe('extractLabels', () => {
  it('removes \\label{…} and returns its argument', () => {
    expect(extractLabels('a = b \\label{eq:x}')).toEqual({ tex: 'a = b ', labels: ['eq:x'], malformed: 0 });
    expect(extractLabels('a \\label { eq:x } = b')).toEqual({ tex: 'a  = b', labels: ['eq:x'], malformed: 0 });
  });

  it('ignores comments and escaped backslashes, as TeX does', () => {
    expect(extractLabels('a % \\label{eq:x}').labels).toEqual([]);
    expect(extractLabels('a \\\\label{eq:x}').labels).toEqual([]);
  });

  it('counts \\label without a braced argument as malformed and keeps it', () => {
    expect(extractLabels('a \\label eq').malformed).toBe(1);
    expect(extractLabels('a \\label eq').tex).toBe('a \\label eq');
  });

  test.prop([fc.string({ maxLength: 120 })], { numRuns: 500 })('is the identity on formulas without \\label', (s) => {
    fc.pre(!s.includes('\\label'));
    expect(extractLabels(s).tex).toBe(s);
  });
});

describe('tags', () => {
  it('finds the author tag, starred or not', () => {
    expect(findTag('x \\tag{A.1}')).toEqual({ text: 'A.1', starred: false });
    expect(findTag('x \\tag*{B}')).toEqual({ text: 'B', starred: true });
    expect(findTag('x % \\tag{C}')).toBeUndefined();
  });

  it('appends \\tag on its own line so a trailing comment cannot swallow it', () => {
    expect(appendTag('x % note', '3')).toBe('x % note\n\\tag{3}');
  });

  it('detects environments that cannot nest inside equation', () => {
    expect(isOuterEnvironment('\\begin{align}a&=b\\end{align}')).toBe(true);
    expect(isOuterEnvironment('\\begin{aligned}a&=b\\end{aligned}')).toBe(false);
  });
});

describe('references in math', () => {
  it('finds and replaces \\ref and \\eqref', () => {
    expect(findRefs('\\eqref{eq:a} + \\ref{thm:b} % \\ref{x}')).toEqual([
      { command: 'eqref', label: 'eq:a' },
      { command: 'ref', label: 'thm:b' },
    ]);
    expect(replaceRefs('y = \\eqref{eq:a}', (r) => (r.label === 'eq:a' ? '\\text{(1)}' : undefined))).toBe(
      'y = \\text{(1)}',
    );
  });

  it('keeps unresolved references verbatim', () => {
    expect(replaceRefs('y = \\eqref{eq:z}', () => undefined)).toBe('y = \\eqref{eq:z}');
  });
});

describe('starAutoNumbered', () => {
  it('stars the environments KaTeX would number with its own counter', () => {
    expect(starAutoNumbered('\\begin{align}a&=b\\end{align}')).toBe('\\begin{align*}a&=b\\end{align*}');
    expect(starAutoNumbered('\\begin{equation}x\\end{equation}')).toBe('\\begin{equation*}x\\end{equation*}');
    expect(starAutoNumbered('\\begin{gather}x\\end{gather}')).toBe('\\begin{gather*}x\\end{gather*}');
    expect(starAutoNumbered('\\begin{alignat}{2}x\\end{alignat}')).toBe('\\begin{alignat*}{2}x\\end{alignat*}');
  });

  it('leaves starred, inner and unknown environments, comments and escapes alone', () => {
    for (const tex of [
      '\\begin{align*}a\\end{align*}',
      '\\begin{aligned}a\\end{aligned}',
      '\\begin{cases}a\\end{cases}',
      '% \\begin{align}',
      '\\\\begin{align}',
    ]) {
      expect(starAutoNumbered(tex)).toBe(tex);
    }
  });

  test.prop([fc.string({ maxLength: 120 })], { numRuns: 500 })(
    'is the identity on formulas without \\begin/\\end',
    (s) => {
      fc.pre(!s.includes('\\begin') && !s.includes('\\end'));
      expect(starAutoNumbered(s)).toBe(s);
    },
  );

  test.prop([fc.string({ maxLength: 120 })], { numRuns: 500 })('is idempotent', (s) => {
    expect(starAutoNumbered(starAutoNumbered(s))).toBe(starAutoNumbered(s));
  });
});
