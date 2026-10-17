import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  EXCERPT_WORDS,
  escapePagefind,
  excerptFromContent,
  excerptText,
  excerptWindowStart,
  pagefindWords,
  sanitiseExcerpt,
  unescapePagefind,
  type ExcerptSegment,
} from '../../../src/core/chrome/excerpt.ts';
import { copyrightYear, currentness, languageSwitch, utcYearOfEpochSeconds } from '../../../src/core/chrome/nav.ts';

/**
 * Pagefind 1.5.2's own excerpt, transcribed from pagefind.js (`build_excerpt`, whitespace
 * branch) as a test oracle: words of raw_content (only < and > escaped), the matched ones
 * wrapped in <mark>, a window of `length` words joined by single spaces.
 */
const pagefindExcerpt = (content: string, start: number, length: number, locations: readonly number[]): string => {
  const words = escapePagefind(content).split(/[\r\n\s]+/g);
  const n = Math.min(length, words.length);
  const from = Math.max(0, Math.min(start, words.length - n));
  for (const w of locations) {
    if (words[w]?.startsWith('<mark>')) continue;
    words[w] = `<mark>${words[w] ?? ''}</mark>`;
  }
  return words
    .slice(from, from + n)
    .join(' ')
    .trim();
};

/** Our segments rendered the way Pagefind renders an excerpt (escaping, marks, single spaces). */
const asPagefindHtml = (segments: readonly ExcerptSegment[]): string =>
  segments
    .map((s) => (s.marked ? `<mark>${escapePagefind(s.text)}</mark>` : escapePagefind(s.text)))
    .join('')
    .replace(/\s+/g, ' ');

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

/** Page texts: words of letters and HTML-ish punctuation ("&lt;", "R&D", "<b>") between assorted whitespace. */
const wordArb = fc.oneof(
  fc.stringMatching(/^[a-zà-ü]{1,8}[.,;:]?$/),
  fc.constantFrom('&lt;', '&gt;', '&amp;', '<', '>', 'R&D', '<script>', '&#39;', 'a<b', '&nbsp;'),
);
const spaceArb = fc.constantFrom(' ', '  ', '\n', '\n\n', '\t', ' ', ' \r\n ');
const contentArb = fc
  .tuple(fc.boolean(), fc.array(fc.tuple(wordArb, spaceArb), { minLength: 1, maxLength: 80 }), fc.boolean())
  .map(([lead, pairs, trail]) => {
    const body = pairs.map(([w, sp]) => `${w}${sp}`).join('');
    return `${lead ? ' ' : ''}${trail ? body : body.trimEnd()}`;
  });
/** Content plus some of its word indices (Pagefind's `locations`), possibly with junk indices. */
const resultArb = contentArb.chain((content) => {
  const n = content.split(/[\r\n\s]+/g).length;
  return fc.record({
    content: fc.constant(content),
    locations: fc.array(fc.oneof(fc.nat({ max: n - 1 }), fc.integer({ min: -3, max: n + 3 })), { maxLength: 6 }),
    length: fc.integer({ min: 1, max: 40 }),
  });
});

const words = (s: string): readonly string[] => s.split(/\s+/).filter((w) => w.length > 0);

describe('excerpt from the raw page text (information preservation)', () => {
  test.prop([resultArb])(
    'the text is a substring of the page, on word boundaries, and the marks are matched words',
    ({ content, locations, length }) => {
      const segments = excerptFromContent(content, locations, length);
      const text = excerptText(segments);
      expect(content).toContain(text);
      expect(text).toBe(text.trim());
      // A contiguous run of the page's words, at most `length` of them.
      const all = words(content);
      const run = words(text);
      expect(run.length).toBeLessThanOrEqual(length);
      const at = all.findIndex((_, i) => run.every((w, j) => all[i + j] === w));
      expect(run.length === 0 || at >= 0).toBe(true);
      // Every marked segment is one whole matched word.
      const split = content.split(/[\r\n\s]+/g);
      const matchedWords = new Set(locations.map((i) => split[i]).filter((w) => w !== undefined && w !== ''));
      for (const s of segments.filter((x) => x.marked)) {
        expect(s.text).not.toMatch(/\s/);
        expect(matchedWords.has(s.text)).toBe(true);
      }
    },
  );

  test.prop([resultArb])(
    'a page shorter than the excerpt is shown whole, every match marked',
    ({ content, locations }) => {
      const split = content.split(/[\r\n\s]+/g);
      fc.pre(split.length <= EXCERPT_WORDS);
      const segments = excerptFromContent(content, locations);
      expect(excerptText(segments)).toBe(content.trim());
      const expected = [...new Set(locations)]
        .filter((i) => i >= 0 && i < split.length && split[i] !== '')
        .sort((a, b) => a - b)
        .map((i) => split[i]);
      expect(segments.filter((s) => s.marked).map((s) => s.text)).toEqual(expected);
    },
  );

  test.prop([resultArb])(
    'agrees with Pagefind’s own excerpt, word for word and mark for mark, before Pagefind’s escaping',
    ({ content, locations, length }) => {
      const split = content.split(/[\r\n\s]+/g);
      const valid = [...new Set(locations)].filter((i) => i >= 0 && i < split.length && split[i] !== '');
      const start = excerptWindowStart(
        [...valid].sort((a, b) => a - b),
        split.length,
        length,
      );
      expect(asPagefindHtml(excerptFromContent(content, valid, length))).toBe(
        pagefindExcerpt(content, start, length, valid),
      );
    },
  );

  test.prop([contentArb, fc.nat()])('locations index content.split(/[\\r\\n\\s]+/g), as in Pagefind', (content, k) => {
    const split = content.split(/[\r\n\s]+/g);
    const i = k % split.length;
    expect(pagefindWords(content).map((w) => content.slice(w.start, w.end))).toEqual(split);
    fc.pre(split[i] !== '' && split.length <= EXCERPT_WORDS);
    expect(excerptFromContent(content, [i]).filter((s) => s.marked)).toEqual([{ text: split[i], marked: true }]);
  });

  it('shows the page text that Pagefind’s excerpt cannot be decoded back to (review chrome#1)', () => {
    // Pagefind 1.5.2 returned, for this page: "… escreve-se &lt;script&gt; … R&D e a &lt; b e &amp; literal. …"
    const content =
      'Em HTML escreve-se &lt;script&gt; para mostrar a etiqueta; o texto R&D e a < b e &amp; literal. Palavra-chave: zirconiofluxo.';
    const location = content.split(/[\r\n\s]+/g).indexOf('zirconiofluxo.');
    const segments = excerptFromContent(content, [location]);
    expect(excerptText(segments)).toBe(content);
    expect(segments.filter((s) => s.marked)).toEqual([{ text: 'zirconiofluxo.', marked: true }]);
    // The fallback, given only Pagefind's string, has to guess — and guesses "<" for the literal "&lt;".
    const fallback = excerptText(sanitiseExcerpt(pagefindExcerpt(content, 0, EXCERPT_WORDS, [location])));
    expect(fallback).not.toBe(content);
    expect(fallback).toContain('escreve-se <script>');
  });

  it('centres the excerpt on the densest run of matches and keeps the page’s whitespace', () => {
    const content = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    // One match at word 50: the best windows start at 21…50; the middle one starts at 35.
    expect(excerptWindowStart([50], 100, 30)).toBe(35);
    const text = excerptText(excerptFromContent(content, [50]));
    expect(words(text)[0]).toBe('w35');
    expect(words(text)).toHaveLength(30);
    // Two clusters: the one with more matches wins.
    expect(excerptWindowStart([5, 80, 81, 82], 100, 10)).toBeGreaterThanOrEqual(73);
    expect(excerptFromContent('a\n\nb  c', [1])).toEqual([
      { text: 'a\n\n', marked: false },
      { text: 'b', marked: true },
      { text: '  c', marked: false },
    ]);
  });

  it('is total: no text, no words or junk indices give an empty or unmarked excerpt', () => {
    expect(excerptFromContent('', [0])).toEqual([]);
    expect(excerptFromContent('   ', [0, 1])).toEqual([]);
    expect(excerptFromContent('a b', [-1, 2, 0.5, Number.NaN])).toEqual([{ text: 'a b', marked: false }]);
    expect(excerptFromContent('a b', [1], Number.NaN)).toEqual([
      { text: 'a ', marked: false },
      { text: 'b', marked: true },
    ]);
  });
});

describe('excerpt string fallback (Pagefind escaping: < and > only)', () => {
  const segmentsArb = fc.array(
    fc.record({
      text: fc.string({ unit: 'binary', maxLength: 12 }).filter((t) => !/&(lt|gt);/.test(t)),
      marked: fc.boolean(),
    }),
    { maxLength: 8 },
  );
  const render = (segments: readonly ExcerptSegment[]): string =>
    segments.map((s) => (s.marked ? `<mark>${escapePagefind(s.text)}</mark>` : escapePagefind(s.text))).join('');

  test.prop([segmentsArb])(
    'recovers the text and the marked ranges of texts without a literal "&lt;" or "&gt;"',
    (segments) => {
      fc.pre(
        segments.every((s) => !/&(lt|gt);/.test(s.text)) && !/&(lt|gt);/.test(segments.map((s) => s.text).join('')),
      );
      expect(sanitiseExcerpt(render(segments))).toEqual(canonical(segments));
    },
  );

  test.prop([fc.string({ unit: 'binary' }).filter((t) => !/&(lt|gt);/.test(t))])(
    'unescape ∘ escape = id outside the ambiguous texts',
    (s) => {
      expect(unescapePagefind(escapePagefind(s))).toBe(s);
    },
  );

  it('documents the ambiguity: a literal "&lt;" and an escaped "<" are the same string', () => {
    expect(escapePagefind('&lt;')).toBe(escapePagefind('<'));
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

  it('undoes exactly the escaping Pagefind emits; any other reference is page text', () => {
    const segs = sanitiseExcerpt(
      'compare a &lt; b & c &gt; d with <mark>entropy</mark>, R&D, &amp; &quot; &#39; &nbsp;.',
    );
    expect(excerptText(segs)).toBe('compare a < b & c > d with entropy, R&D, &amp; &quot; &#39; &nbsp;.');
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
