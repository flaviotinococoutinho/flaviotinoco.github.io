/**
 * smartPunctuation (src/core/latex/smart-punctuation.ts) against worked examples and against the
 * site's own SmartyPants (Astro's processor: remark-smartypants with default options) on
 * title-like text.
 */
import { describe, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { it } from 'vitest';
import { smartPunctuation } from '../../../src/core/latex/smart-punctuation.ts';
import { smartypants } from './helpers.ts';

describe('worked examples (SmartyPants rules)', () => {
  it('educates quotes, dashes, ellipses and double backticks like the body text', () => {
    expect(smartPunctuation('"aspas" -- e travessão')).toBe('“aspas” — e travessão');
    expect(smartPunctuation("'simples', d'água, Shannon's e o '80s")).toBe('‘simples’, d’água, Shannon’s e o ’80s');
    expect(smartPunctuation('Nyquist--Shannon')).toBe('Nyquist—Shannon');
    expect(smartPunctuation('três... e quatro.... pontos')).toBe('três… e quatro… pontos');
    expect(smartPunctuation('a . . . b e . . fim')).toBe('a … b e . . fim');
    expect(smartPunctuation("``crases'' e ''fim''")).toBe('“crases” e ”fim”');
    expect(smartPunctuation(`He said, "'Quoted' words."`)).toBe('He said, “‘Quoted’ words.”');
  });

  it('leaves what SmartyPants leaves: --- and ----, single hyphens, typographic characters', () => {
    expect(smartPunctuation('a---b ---- c-d')).toBe('a---b ---- c-d');
    expect(smartPunctuation('-')).toBe('-');
    expect(smartPunctuation('Nyquist–Shannon, “já” — ok…')).toBe('Nyquist–Shannon, “já” — ok…');
    expect(smartPunctuation('')).toBe('');
  });
});

describe("agreement with the site's SmartyPants", () => {
  const word = fc.constantFrom('Nyquist', 'shannon', 'água', 'd', 's', '80s', '1948', 'p', 'cf', 'e', 'g', 'Lin');
  const other = fc.constantFrom(' ', ' ', '"', "'", '--', '---', '...', '. . .', '-', '.', ',', ';', ':', '(', ')');
  const rare = fc.constantFrom('?', '!', '&', '/', '…', '``', "''", '“', '’');
  const titleLike = fc
    .array(fc.oneof({ weight: 6, arbitrary: word }, { weight: 6, arbitrary: other }, { weight: 1, arbitrary: rare }), {
      minLength: 1,
      maxLength: 14,
    })
    .map((parts) => parts.join(''))
    // What Markdown reads as block syntax (list item, thematic break) or as code is not a paragraph of text.
    .filter(
      (s) =>
        s.trim() === s &&
        s !== '' &&
        !/^\d+[.)]/.test(s) &&
        !/^[-+*](?:\s|$)/.test(s) &&
        !/^(?:-[ \t]*){3,}$/.test(s) &&
        !/`/.test(s.replace(/``/g, '')) &&
        !/``[^`]*``/.test(s),
    );

  test.prop([titleLike], { numRuns: 400 })('gives the same characters as remark-smartypants', async (text) => {
    expect(smartPunctuation(text)).toBe(await smartypants(text));
  });
});
