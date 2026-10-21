/** Locale-aware readouts of the labs: fixed and loose decimals, hertz/kilohertz, percentages, lists. */
import { describe, expect, it } from 'vitest';
import { capitalize, fixed, frequency, list, percent, upTo } from '../../../src/core/labs/format.ts';

describe('numbers', () => {
  it('prints fixed decimals with the locale separator, and −0 as 0', () => {
    expect(fixed('pt-BR', 3.14159, 2)).toBe('3,14');
    expect(fixed('en', 3.14159, 2)).toBe('3.14');
    expect(fixed('pt-BR', 2, 3)).toBe('2,000');
    expect(fixed('en', -0, 1)).toBe('0.0');
    expect(fixed('pt-BR', Number.NaN, 2)).toBe('—');
    expect(fixed('en', Number.POSITIVE_INFINITY, 2)).toBe('—');
  });

  it('drops trailing zeros with upTo', () => {
    expect(upTo('en', 2.5, 3)).toBe('2.5');
    expect(upTo('pt-BR', 1234.5678, 2)).toBe('1.234,57');
    expect(upTo('en', -0, 2)).toBe('0');
    expect(upTo('pt-BR', Number.NaN, 2)).toBe('—');
  });
});

describe('units', () => {
  it('switches to kilohertz from 1000 Hz', () => {
    expect(frequency('en', 440)).toBe('440 Hz');
    expect(frequency('en', 1000)).toBe('1 kHz');
    expect(frequency('pt-BR', 2500)).toBe('2,5 kHz');
    expect(frequency('pt-BR', 999.96)).toBe('1.000 Hz');
    expect(frequency('en', Number.NaN)).toBe('—');
  });

  it('prints a fraction as a percentage with the locale spacing', () => {
    expect(percent('pt-BR', 0.0895, 2)).toBe('8,95 %');
    expect(percent('en', 0.5)).toBe('50.0%');
    expect(percent('en', Number.NaN)).toBe('—');
  });

  it('joins lists in the locale conjunction style and capitalises', () => {
    expect(list('pt-BR', ['3', '7', '19'])).toBe('3, 7 e 19');
    expect(list('en', ['3', '7', '19'])).toBe('3, 7, and 19');
    expect(capitalize('ação')).toBe('Ação');
    expect(capitalize('')).toBe('');
  });
});
