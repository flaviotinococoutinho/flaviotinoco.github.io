/**
 * The site preamble (src/core/latex/macros.ts) against the KaTeX version the
 * site pins (0.19, pnpm override): every macro renders, strictness and trust
 * behave as documented.
 */
import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { KATEX_OPTIONS, MACROS } from '../../../src/core/latex/macros.ts';

const render = (tex: string): string =>
  katex.renderToString(tex, { ...KATEX_OPTIONS, macros: { ...MACROS }, throwOnError: true, displayMode: true });

describe('site macros', () => {
  /** Arguments a macro consumes indirectly: \KL expands to …\infdivx, which takes two. */
  const INDIRECT: Readonly<Record<string, number>> = { '\\KL': 2 };

  it.each(Object.entries(MACROS))('%s renders under the site options', (name, body) => {
    const arity = INDIRECT[name] ?? Math.max(0, ...[...body.matchAll(/#([1-9])/g)].map((m) => Number(m[1])));
    const args = Array.from({ length: arity }, (_, i) => `{x_${String(i + 1)}}`).join('');
    expect(() => render(`${name}${args}`)).not.toThrow();
  });

  it('composes: the Kullback–Leibler divergence and expectation', () => {
    expect(render('\\KL{P}{Q} = \\E[\\log P - \\log Q]')).toContain('KL');
  });
});

describe('KaTeX options', () => {
  it('fails on LaTeX-compatibility issues except trusted HTML extensions', () => {
    expect(KATEX_OPTIONS.strict('unicodeTextInMathMode')).toBe('error');
    expect(KATEX_OPTIONS.strict('htmlExtension')).toBe('ignore');
    expect(() => render('é')).toThrow();
  });

  it('trusts only \\htmlClass and \\htmlData, never links', () => {
    expect(KATEX_OPTIONS.trust({ command: '\\htmlClass' })).toBe(true);
    expect(KATEX_OPTIONS.trust({ command: '\\htmlData' })).toBe(true);
    expect(KATEX_OPTIONS.trust({ command: '\\href' })).toBe(false);
    expect(KATEX_OPTIONS.trust({ command: '\\url' })).toBe(false);
    expect(render('\\htmlClass{ft-term}{x}')).toContain('ft-term');
  });

  it('keeps the original TeX for assistive technology (MathML annotation)', () => {
    expect(KATEX_OPTIONS.output).toBe('htmlAndMathml');
    expect(render('a^2')).toContain('<annotation encoding="application/x-tex">a^2</annotation>');
  });
});
