/**
 * Text fragments (WICG URL Fragment Text Directives): the term codec is a
 * bijection on well-formed Unicode strings and emits only the grammar's
 * TextDirectiveExplicitChar or percent-encoded bytes (src/core/addons/text-fragment.ts).
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  collapseWhitespace,
  decodeTerm,
  decodeTextDirective,
  directiveForQuote,
  encodeTerm,
  encodeTextDirective,
  withTextFragment,
} from '../../../src/core/addons/text-fragment.ts';

/** Full Unicode strings without lone surrogates (they have no UTF-8 form). */
const unicode = fc.string({ unit: 'binary' }).filter((s) => s.isWellFormed());
const nonEmpty = unicode.filter((s) => s.length > 0);

/** §3.3.3 TextDirectiveString: explicit characters or "%" HEX HEX. */
const TERM = /^(?:[A-Za-z0-9!$'()*+./:;=?@_~]|%[0-9A-F]{2})*$/u;

describe('term codec', () => {
  test.prop([unicode])('decodeTerm ∘ encodeTerm = id', (s) => {
    expect(decodeTerm(encodeTerm(s))).toEqual({ ok: true, value: s });
  });

  test.prop([unicode])('emits only the grammar of a directive term (no raw "-", ",", "&", "#" or space)', (s) => {
    const e = encodeTerm(s);
    expect(e).toMatch(TERM);
    expect(e).not.toMatch(/[-,&# ]/u);
  });

  test.prop([unicode])('agrees with the UTF-8 percent-encoding of encodeURIComponent on the bytes it encodes', (s) => {
    // encodeURIComponent leaves - _ . ! ~ * ' ( ) unencoded; the directive must also encode "-".
    expect(decodeURIComponent(encodeTerm(s))).toBe(s);
  });

  it('encodes the syntax characters and non-ASCII text', () => {
    expect(encodeTerm('a-b, c & d')).toBe('a%2Db%2C%20c%20%26%20d');
    expect(encodeTerm('informação')).toBe('informa%C3%A7%C3%A3o');
    expect(encodeTerm('R$ 5,00')).toBe('R$%205%2C00');
    expect(encodeTerm('𝔼')).toBe('%F0%9D%94%BC');
  });

  it('encodes a lone surrogate as U+FFFD (WHATWG UTF-8 encode)', () => {
    expect(encodeTerm('a\uD800b')).toBe('a%EF%BF%BDb');
  });

  it('rejects malformed input', () => {
    expect(decodeTerm('%E').ok).toBe(false);
    expect(decodeTerm('%ZZ').ok).toBe(false);
    expect(decodeTerm('a b').ok).toBe(false);
    expect(decodeTerm('%C0%80').ok).toBe(false); // overlong NUL
    expect(decodeTerm('%ED%A0%80').ok).toBe(false); // surrogate
    expect(decodeTerm('%F4%90%80%80').ok).toBe(false); // above U+10FFFF
    expect(decodeTerm('%C3').ok).toBe(false); // truncated
    expect(decodeTerm('%80').ok).toBe(false); // continuation byte as lead
  });
});

describe('text directive', () => {
  test.prop([
    nonEmpty,
    fc.option(nonEmpty, { nil: undefined }),
    fc.option(nonEmpty, { nil: undefined }),
    fc.option(nonEmpty, { nil: undefined }),
  ])('decodeTextDirective ∘ encodeTextDirective = id', (start, end, prefix, suffix) => {
    const d = {
      start,
      ...(end !== undefined ? { end } : {}),
      ...(prefix !== undefined ? { prefix } : {}),
      ...(suffix !== undefined ? { suffix } : {}),
    };
    expect(decodeTextDirective(encodeTextDirective(d))).toEqual({ ok: true, value: d });
  });

  it('writes the four parts in the order of the grammar', () => {
    expect(encodeTextDirective({ prefix: 'antes', start: 'início', end: 'fim', suffix: 'depois' })).toBe(
      'text=antes-,in%C3%ADcio,fim,-depois',
    );
    expect(encodeTextDirective({ start: 'só', end: '' })).toBe('text=s%C3%B3');
  });

  it('rejects what is not a text directive', () => {
    expect(decodeTextDirective('txt=a').ok).toBe(false);
    expect(decodeTextDirective('text=').ok).toBe(false);
    expect(decodeTextDirective('text=a,b,c').ok).toBe(false);
  });
});

describe('the directive of a quotation', () => {
  it('links a short passage whole, white space collapsed', () => {
    expect(directiveForQuote('  a  informação\tnão é  o sinal ')).toEqual({
      ok: true,
      value: { start: 'a informação não é o sinal' },
    });
  });

  it('links a long passage by its first and last six words', () => {
    const words = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(directiveForQuote(words)).toEqual({
      ok: true,
      value: { start: 'w0 w1 w2 w3 w4 w5', end: 'w24 w25 w26 w27 w28 w29' },
    });
  });

  it('links a passage across blocks by the start of its first and the end of its last block', () => {
    expect(directiveForQuote('Primeiro parágrafo curto.\n\nSegundo, também.')).toEqual({
      ok: true,
      value: { start: 'Primeiro parágrafo curto.', end: 'Segundo, também.' },
    });
  });

  it('refuses an empty selection', () => {
    expect(directiveForQuote(' \n\t ').ok).toBe(false);
  });

  it('replaces any fragment of the page URL', () => {
    expect(withTextFragment('https://x.org/pt/a/#secao', { start: 'um-dois' })).toBe(
      'https://x.org/pt/a/#:~:text=um%2Ddois',
    );
    expect(withTextFragment('https://x.org/pt/a/', { start: 'a', end: 'b' })).toBe('https://x.org/pt/a/#:~:text=a,b');
  });

  test.prop([unicode])('collapseWhitespace leaves no runs and no ends', (s) => {
    const c = collapseWhitespace(s);
    expect(c).not.toMatch(/\s\s|^\s|\s$/u);
  });
});
