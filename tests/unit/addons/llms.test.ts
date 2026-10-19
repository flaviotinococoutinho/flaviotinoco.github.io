/**
 * llms.txt (https://llmstxt.org/): section order (H1, blockquote, details, H2
 * file lists, Optional), the link item form "- [name](url): notes", and escaping
 * that keeps every item a single, well-formed CommonMark link.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { escapeDestination, escapeLinkText, llmsLink, llmsTxt } from '../../../src/core/addons/llms.ts';

const doc = {
  title: 'Flávio Tinoco',
  summary: 'Ensaios, laboratórios e uma ontologia,\nem português e inglês.',
  details: ['O site é bilíngue.', '# não é título'],
  sections: [
    {
      title: 'Ensaios (pt-BR)',
      links: [{ name: 'Do signo [à] informação', url: 'https://x.org/pt/ensaios/a/', notes: 'Peirce,\nShannon.' }],
    },
    { title: 'Vazia', links: [] },
  ],
  optional: [{ name: 'Feed', url: 'https://x.org/pt/rss.xml' }],
};

const ITEM = /^- \[(?:[^\\[\]]|\\.)*\]\([^\s()<>]+\)(?:: .+)?$/u;

describe('llms.txt', () => {
  const text = llmsTxt(doc);
  const lines = text.split('\n');

  it('starts with the H1 and the blockquote summary, on one line each', () => {
    expect(lines[0]).toBe('# Flávio Tinoco');
    expect(lines[2]).toBe('> Ensaios, laboratórios e uma ontologia, em português e inglês.');
  });

  it('keeps detail paragraphs from becoming headings', () => {
    expect(text).toContain('\n\nO site é bilíngue.\n\n');
    expect(text).toContain('\n\n\\# não é título\n\n');
    expect(lines.filter((l) => l.startsWith('#')).map((l) => l.split(' ')[0])).toEqual(['#', '##', '##']);
  });

  it('lists links as "- [name](url): notes", escaped, and drops empty sections', () => {
    expect(text).toContain(
      '## Ensaios (pt-BR)\n\n- [Do signo \\[à\\] informação](https://x.org/pt/ensaios/a/): Peirce, Shannon.',
    );
    expect(text).not.toContain('Vazia');
    expect(text.endsWith('## Optional\n\n- [Feed](https://x.org/pt/rss.xml)\n')).toBe(true);
    for (const l of lines.filter((x) => x.startsWith('- '))) expect(l).toMatch(ITEM);
  });

  test.prop([fc.string(), fc.webUrl(), fc.option(fc.string(), { nil: undefined })])(
    'every item is one line and one well-formed link',
    (name, url, notes) => {
      const line = llmsLink({ name: name.trim() === '' ? 'x' : name, url, ...(notes !== undefined ? { notes } : {}) });
      expect(line).not.toContain('\n');
      expect(line).toMatch(/^- \[(?:[^\\[\]]|\\.)*\]\(/u);
    },
  );

  test.prop([fc.webUrl({ withQueryParameters: true, withFragments: true })])(
    'destinations hold no space or parenthesis',
    (url) => {
      expect(escapeDestination(url)).not.toMatch(/[\s()<>]/u);
      expect(decodeURIComponent(escapeDestination(url).replace(/%(?![0-9A-F]{2})/gu, '%25'))).toBeDefined();
    },
  );

  it('escapes link text brackets and backslashes', () => {
    expect(escapeLinkText('a\\b [c]')).toBe('a\\\\b \\[c\\]');
  });
});
