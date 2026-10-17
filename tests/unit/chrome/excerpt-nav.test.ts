import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  decodeEntities,
  escapeHtml,
  excerptText,
  sanitiseExcerpt,
  type ExcerptSegment,
} from '../../../src/core/chrome/excerpt.ts';
import { copyrightYear, currentness, languageSwitch, utcYearOfEpochSeconds } from '../../../src/core/chrome/nav.ts';

/** Builds a Pagefind-like excerpt from segments: escaped text, <mark> around marked runs. */
const render = (segments: readonly ExcerptSegment[]): string =>
  segments.map((s) => (s.marked ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text))).join('');

/** Canonical form: merge neighbours with the same flag, drop empties (what the parser returns). */
const canonical = (segments: readonly ExcerptSegment[]): readonly ExcerptSegment[] => {
  const out: ExcerptSegment[] = [];
  for (const s of segments) {
    if (s.text.length === 0) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.marked === s.marked)
      out[out.length - 1] = { text: prev.text + s.text, marked: s.marked };
    else out.push(s);
  }
  return out;
};

const segmentsArb = fc.array(fc.record({ text: fc.string({ unit: 'binary', maxLength: 12 }), marked: fc.boolean() }), {
  maxLength: 8,
});

describe('excerpt sanitiser (information preservation)', () => {
  test.prop([segmentsArb])('recovers exactly the text and the marked ranges', (segments) => {
    expect(sanitiseExcerpt(render(segments))).toEqual(canonical(segments));
  });

  test.prop([fc.string({ unit: 'binary' })])('decode ∘ escape = id', (s) => {
    expect(decodeEntities(escapeHtml(s))).toBe(s);
  });

  test.prop([fc.string({ unit: 'binary' })])('never yields markup: output is text only', (html) => {
    const segments = sanitiseExcerpt(html);
    for (const s of segments) {
      expect(typeof s.text).toBe('string');
      expect(s.text.length).toBeGreaterThan(0);
    }
  });

  it('drops every element except mark', () => {
    const html = 'a <script>alert(1)</script><img src=x onerror=alert(1)> <mark>b</mark> <b>c</b>';
    expect(sanitiseExcerpt(html)).toEqual([
      { text: 'a alert(1) ', marked: false },
      { text: 'b', marked: true },
      { text: ' c', marked: false },
    ]);
  });

  it('handles the escaping Pagefind 1.5 actually emits (< and > escaped, & raw)', () => {
    const segs = sanitiseExcerpt('compare a &lt; b & c &gt; d with <mark>entropy</mark>.');
    expect(excerptText(segs)).toBe('compare a < b & c > d with entropy.');
    expect(segs.filter((s) => s.marked).map((s) => s.text)).toEqual(['entropy']);
  });

  it('degrades gracefully on unbalanced marks', () => {
    expect(sanitiseExcerpt('x</mark>y')).toEqual([{ text: 'xy', marked: false }]);
    expect(sanitiseExcerpt('x<mark>y')).toEqual([
      { text: 'x', marked: false },
      { text: 'y', marked: true },
    ]);
    expect(sanitiseExcerpt('<mark><MARK>a</MARK>b</mark>c')).toEqual([
      { text: 'ab', marked: true },
      { text: 'c', marked: false },
    ]);
  });

  it('keeps unknown or invalid references verbatim', () => {
    expect(decodeEntities('&bogus; &#0; &#xD800; &#x1F600; &eacute')).toBe('&bogus; &#0; &#xD800; 😀 &eacute');
  });
});

describe('navigation helpers', () => {
  it('marks the current page and its section', () => {
    expect(currentness('/b/pt/ensaios/', '/b/pt/ensaios/')).toBe('page');
    expect(currentness('/b/pt/ensaios/x/', '/b/pt/ensaios/')).toBe('true');
    expect(currentness('/b/pt/ensaios', '/b/pt/ensaios/')).toBe('page');
    expect(currentness('/b/pt/ensaios-velhos/', '/b/pt/ensaios/')).toBeNull();
    expect(currentness('/b/pt/ensaios/', '/b/pt/', true)).toBeNull();
    expect(currentness('/b/pt/', '/b/pt/', true)).toBe('page');
  });

  it('switches to the alternate, or to the other home and says so', () => {
    expect(languageSwitch({ en: '/b/en/essays/x/' }, 'en', '/b/en/')).toEqual({
      locale: 'en',
      href: '/b/en/essays/x/',
      isTranslation: true,
    });
    expect(languageSwitch({}, 'en', '/b/en/')).toEqual({ locale: 'en', href: '/b/en/', isTranslation: false });
    expect(languageSwitch({ en: '' }, 'en', '/b/en/').isTranslation).toBe(false);
  });

  test.prop([fc.integer({ min: 0, max: 253402300799 })])('epoch → year agrees with the platform calendar', (s) => {
    expect(utcYearOfEpochSeconds(s)).toBe(new Date(s * 1000).getUTCFullYear());
  });

  it('honours SOURCE_DATE_EPOCH and falls back otherwise', () => {
    expect(copyrightYear('1767225600', 1999)).toBe(2026); // 2026-01-01T00:00:00Z
    expect(copyrightYear('1767225599', 1999)).toBe(2025);
    expect(copyrightYear(undefined, 2031)).toBe(2031);
    expect(copyrightYear('soon', 2031)).toBe(2031);
  });
});
