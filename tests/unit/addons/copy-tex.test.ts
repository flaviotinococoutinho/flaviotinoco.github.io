/**
 * Copy as TeX: formulas become their TeX source between the site's own $$
 * delimiters, blocks become line breaks, display formulas stand on their own lines.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { delimitTex, displayTex, plainTextWithTex, type CopyNode } from '../../../src/core/addons/copy-tex.ts';

const text = (value: string): CopyNode => ({ kind: 'text', value });
const math = (tex: string, display = false): CopyNode => ({ kind: 'math', tex, display });
const block = (...children: CopyNode[]): CopyNode => ({ kind: 'block', children });

describe('plainTextWithTex', () => {
  it('replaces an inline formula by $$TeX$$', () => {
    expect(plainTextWithTex([text('A energia '), math('E = mc^2'), text(' conserva-se.')])).toBe(
      'A energia $$E = mc^2$$ conserva-se.',
    );
  });

  it('separates blocks and puts display formulas on their own lines', () => {
    expect(
      plainTextWithTex([block(text('Primeiro.')), block(math('\\sum_i x_i\n\\tag{1}', true)), block(text('Depois.'))]),
    ).toBe('Primeiro.\n$$\n\\sum_i x_i\n\\tag{1}\n$$\nDepois.');
  });

  it('keeps inline wrappers transparent', () => {
    expect(plainTextWithTex([{ kind: 'inline', children: [text('a'), math('b')] }])).toBe('a$$b$$');
  });

  it('trims the TeX source inside the delimiters', () => {
    expect(delimitTex('  x^2 \n')).toBe('$$x^2$$');
    expect(displayTex('\nx\n')).toBe('$$\nx\n$$');
  });

  test.prop([
    fc.array(
      fc.string().filter((s) => !s.includes('\n')),
      { maxLength: 6 },
    ),
  ])('without formulas or blocks it is the concatenated text', (parts) => {
    expect(plainTextWithTex(parts.map(text))).toBe(parts.join(''));
  });
});
