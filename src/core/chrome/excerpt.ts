/**
 * Search-excerpt sanitiser (parser: string → segments).
 *
 * Pagefind returns excerpts as an HTML string whose only markup is <mark>
 * around matched words (it escapes "<" and ">" of the page text; verified on
 * Pagefind 1.5.2, where raw_content = content with < → &lt;, > → &gt;).
 * Instead of trusting that string with innerHTML, the excerpt is parsed into
 * plain-text segments flagged as marked or not; the shell renders them with
 * text nodes and <mark> elements only. Any other tag is dropped, so the output
 * cannot contain markup by construction (allow-list of exactly one element).
 *
 * Text is decoded with the HTML character-reference rules a browser would
 * apply (named subset + numeric), so the reader sees the same characters as in
 * the page. Law (information preservation): for any text t and any set of
 * marked ranges, sanitiseExcerpt(escapeHtml-with-marks(t)) concatenates back
 * to t and marks exactly those ranges (tests/unit/chrome/excerpt.test.ts).
 */

export interface ExcerptSegment {
  readonly text: string;
  readonly marked: boolean;
}

const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodes character references; unknown or invalid references stay verbatim (as in HTML). */
export const decodeEntities = (s: string): string =>
  s.replace(/&(#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      const valid = Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body] ?? whole;
  });

/** Escapes text for HTML (the inverse direction, used by tests and fixtures). */
export const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => `&${({ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' } as const)[c as '&']};`,
  );

// A start or end tag (or comment / doctype). Anything that is not a tag is text.
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^<>]*>|<!--[\s\S]*?-->|<![^<>]*>/g;

/**
 * Parses an excerpt into segments. Adjacent segments with the same flag are
 * merged; empty segments are dropped. Nested <mark> counts as one level;
 * unbalanced tags degrade gracefully (an unclosed <mark> marks the rest).
 */
export const sanitiseExcerpt = (html: string): readonly ExcerptSegment[] => {
  const out: ExcerptSegment[] = [];
  let depth = 0;
  let last = 0;
  const push = (raw: string): void => {
    const text = decodeEntities(raw);
    if (text.length === 0) return;
    const marked = depth > 0;
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.marked === marked) out[out.length - 1] = { text: prev.text + text, marked };
    else out.push({ text, marked });
  };
  for (const m of html.matchAll(TAG)) {
    push(html.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2]?.toLowerCase() === 'mark') depth = m[1] === '/' ? Math.max(0, depth - 1) : depth + 1;
  }
  push(html.slice(last));
  return out;
};

/** Plain text of an excerpt (what a screen reader would read). */
export const excerptText = (segments: readonly ExcerptSegment[]): string => segments.map((s) => s.text).join('');
