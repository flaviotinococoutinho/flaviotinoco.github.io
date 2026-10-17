/**
 * The seed bibliography (bibliography/main.bib): parses cleanly, contains the
 * works the site cites, follows the key convention and renders in both styles.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBibliography, formatDiagnostic } from '../../../src/core/bibliography/index.ts';
import { buildReferenceList } from '../../../src/core/bibliography/cite/engine.ts';
import { toPlainText } from '../../../src/core/bibliography/render/inline.ts';
import { abnt } from '../../../src/core/bibliography/style/abnt.ts';
import { apa } from '../../../src/core/bibliography/style/apa.ts';
import { MAIN_BIB_PATH } from './helpers.ts';

const result = buildBibliography([{ name: 'bibliography/main.bib', text: readFileSync(MAIN_BIB_PATH, 'utf8') }]);

describe('bibliography/main.bib', () => {
  it('parses with no error and no warning', () => {
    expect(result.ok ? [] : result.error.map(formatDiagnostic)).toEqual([]);
    expect(result.ok && result.value.warnings.map(formatDiagnostic)).toEqual([]);
  });

  const index = result.ok ? result.value : undefined;

  it('contains the works required by the specification and cited by the content and the ontology', () => {
    const required = [
      'shannon1948',
      'shannon1949',
      'nyquist1928',
      'whittaker1915',
      'weaver1949',
      'peirce1931',
      'saussure1916',
      'frege1892',
      'huffman1952',
      'cover2006',
      'cooley1965',
      'may1976',
      'feigenbaum1978',
      'lorenz1963',
      'hick1952',
      'hyman1953',
      'kent1964',
      'ranganathan1933',
      'toulmin1958',
      'seco2004',
      'lin1998',
      'resnik1995',
      'gruber1993',
      'w3c2009',
      'w3c2023',
      'bringhurst2004',
      'tufte1990',
      'nelson1965',
      'brysbaert2019',
      'machado2009',
      'szafir2018',
      'sharma2005',
      'bloom1970',
      'kirsch2008',
      'liang1983',
      'knuth1984',
      'bridson2007',
      'kotelnikov1933',
      'godel1931',
      'turing1936',
      'floridi2011',
      'wittgenstein1922',
      'popper1959',
      'king2019',
      'abnt2025',
      'abnt2023',
      'abnt2024',
    ];
    expect(required.filter((k) => index?.has(k) !== true)).toEqual([]);
  });

  it('uses lowercase surname + year keys and gives every entry a language', () => {
    for (const key of index?.keys ?? []) {
      expect(key).toMatch(/^[a-z0-9]+\d{4}[a-z]?$/u);
      expect(index?.get(key)?.language, key).toBeDefined();
    }
  });

  it('renders every entry in both styles without unresolved LaTeX', () => {
    const refs = (index?.keys ?? []).flatMap((k) => (index?.get(k) === undefined ? [] : [index.get(k)!]));
    for (const style of [abnt, apa]) {
      for (const entry of buildReferenceList(refs, style).entries) {
        const text = toPlainText(entry.content);
        expect(text, entry.key).not.toMatch(/[\\{}]/u);
        expect(text.normalize('NFC'), entry.key).toBe(text);
      }
    }
  });

  it('records the Shannon (1948) decision: one entry, two issues, both page ranges', () => {
    const text = toPlainText(abnt.reference(index!.get('shannon1948')!, '')).replace(/\u00A0/gu, ' ');
    expect(text).toContain('v. 27, n. 3-4, p. 379-423, 623-656, jul./out. 1948');
  });
});
