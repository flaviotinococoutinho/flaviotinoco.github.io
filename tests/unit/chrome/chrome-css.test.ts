/**
 * The chrome stylesheet against the house rule "spacing from --space-*"
 * (CLAUDE.md rule 5): every margin, padding, gap and inset is built from
 * the space scale (or the layout's --gutter / --margin, themselves built from
 * it), plus 0, auto and percentages. A literal length (0.4em, 12vh, 8px) in a
 * spacing property fails, with its line, so the scale stays the only source.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const FILE = 'src/styles/components/chrome.css';
const css = readFileSync(fileURLToPath(new URL(`../../../${FILE}`, import.meta.url)), 'utf8');

const SPACING =
  /^(?:margin|padding|gap|row-gap|column-gap|inset|scroll-margin|scroll-padding|top|right|bottom|left)(?:-[a-z-]+)?$/;
const ALLOWED_VARS = /var\(--(?:space-n?\d|gutter|margin)\)/g;
const LITERAL_LENGTH =
  /(?<![\w-])\d*\.?\d+(?:px|r?em|r?ex|r?ch|r?lh|cap|ic|[dsl]?v(?:h|w|i|b|min|max)|cq(?:w|h|i|b|min|max)|cm|mm|q|in|pt|pc)\b/i;

interface Declaration {
  readonly line: number;
  readonly property: string;
  readonly value: string;
}

/** Declarations of a stylesheet (comments blanked out so that line numbers stay right). */
const declarations = (source: string): readonly Declaration[] => {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
  return [...text.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)].map((m) => ({
    line: text.slice(0, m.index).split('\n').length,
    property: m[1] ?? '',
    value: (m[2] ?? '').trim(),
  }));
};

/** The literal lengths of a spacing value once the scale's tokens are removed. */
const literalSpacing = (value: string): string | undefined => LITERAL_LENGTH.exec(value.replace(ALLOWED_VARS, ''))?.[0];

describe(`${FILE}: spacing from the --space-* scale only`, () => {
  it('finds the declarations it checks', () => {
    expect(declarations(css).filter((d) => SPACING.test(d.property)).length).toBeGreaterThan(50);
  });

  it('accepts tokens, 0, auto, percentages and multipliers; rejects literal lengths', () => {
    for (const ok of [
      'var(--space-n2)',
      '0 var(--gutter)',
      'var(--space-2) auto auto',
      '100%',
      'calc(-1 * var(--space-n1))',
    ])
      expect(literalSpacing(ok)).toBeUndefined();
    for (const [bad, found] of [
      ['0.4em', '0.4em'],
      ['min(12vh, var(--space-4)) auto', '12vh'],
      ['var(--space-0) 8px', '8px'],
      ['.5rem', '.5rem'],
      ['1dvh', '1dvh'],
    ] as const)
      expect(literalSpacing(bad)).toBe(found);
  });

  it('uses no literal length in margins, paddings, gaps or insets', () => {
    const offending = declarations(css)
      .filter((d) => SPACING.test(d.property) && literalSpacing(d.value) !== undefined)
      .map((d) => `${FILE}:${d.line} ${d.property}: ${d.value}`);
    expect(offending).toEqual([]);
  });
});
