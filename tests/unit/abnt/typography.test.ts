import { describe, expect, it } from 'vitest';
import { detectDates, detectInitials, detectLocators, detectUnits } from '../../../src/core/abnt/typography.ts';

const spans = (text: string, ds: readonly { start: number; end: number }[]): readonly string[] =>
  ds.map((d) => text.slice(d.start, d.end));

describe('non-breaking groups', () => {
  it('value + unit symbol (SI §5.4.3) and currency', () => {
    const t = 'a 10 kHz, 3,5 mm, 30,2 °C, 25 %, 1\u202f000 Hz, 8 bit/s, R$ 5,00 e 44,1 kHz';
    expect(spans(t, detectUnits(t))).toEqual([
      '10 kHz',
      '3,5 mm',
      '30,2 °C',
      '25 %',
      '1\u202f000 Hz',
      '8 bit/s',
      '44,1 kHz',
      'R$ 5,00',
    ]);
    expect(detectUnits('10 kHzs, A10 kHz, 3 mais')).toEqual([]);
  });

  it('locators (NBR 10520:2023 §7.1.3) per locale', () => {
    const pt = 'Ver p. 12, pp. 3, v. 27, n. 3, f. 8-9, cap. V, § 5, nº 4 e Fig. 2.';
    expect(spans(pt, detectLocators(pt, 'pt-BR'))).toEqual([
      'p. 12',
      'v. 27',
      'n. 3',
      'f. 8-9',
      'cap. V',
      '§ 5',
      'nº 4',
      'Fig. 2',
    ]);
    const en = 'See pp. 12–15, vol. 3, no. 5, ch. 4 and § 2.';
    expect(spans(en, detectLocators(en, 'en'))).toEqual(['pp. 12–15', 'vol. 3', 'no. 5', 'ch. 4', '§ 2']);
  });

  it('dates (NBR 5892:2019; NBR 6023:2025 Annex A — "maio" is never abbreviated)', () => {
    const pt = 'Em 3 maio 2024, 7 abr. 2023, 3 de maio de 2024, 1º de maio e 12 de outubro; não 3 maiores.';
    expect(spans(pt, detectDates(pt, 'pt-BR'))).toEqual([
      '3 maio 2024',
      '7 abr. 2023',
      '3 de maio de 2024',
      '1º de maio',
      '12 de outubro',
    ]);
    const en = 'On 3 May 2024, May 3, 2024 and Sept. 9.';
    expect(spans(en, detectDates(en, 'en'))).toEqual(['3 May 2024', 'May 3, 2024', 'Sept. 9']);
  });

  it('initials + surname', () => {
    const t = 'C. E. Shannon, J.-P. Sartre, F. de Saussure e W. V. O. Quine; não "A Teoria".';
    expect(spans(t, detectInitials(t))).toEqual(['C. E. Shannon', 'J.-P. Sartre', 'F. de Saussure', 'W. V. O. Quine']);
  });
});
