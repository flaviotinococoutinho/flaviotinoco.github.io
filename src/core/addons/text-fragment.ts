/**
 * Text fragments — links to a passage of a page (WICG, "URL Fragment Text
 * Directives", https://wicg.github.io/scroll-to-text-fragment/, read 2026-10-19;
 * revalidate when the draft changes):
 *
 *   #:~:text=[prefix-,]start[,end][,-suffix]
 *
 * §3.3.3 (grammar): a directive term is a sequence of TextDirectiveExplicitChar
 *   [a-zA-Z0-9] ! $ ' ( ) * + . / : ; = ? @ _ ~
 * or of PercentEncodedByte ("%" HEX HEX). Everything else — in particular the
 * syntax characters "-", "," and "&" (§3.2), the space and every non-ASCII code
 * point — is percent-encoded as the UTF-8 bytes of the code point. Terms are
 * percent-decoded before matching (§3.2), so the codec law is
 *
 *   decodeTerm(encodeTerm(s)) = s     for every well-formed Unicode string s
 *
 * (property-tested). The fragment directive is appended after any existing
 * fragment with the delimiter ":~:" (§3.3).
 */
import { err, ok, type Result } from '../algebra/result.ts';

const EXPLICIT = /[A-Za-z0-9!$'()*+./:;=?@_~]/u;

const utf8 = (codePoint: number): readonly number[] => {
  if (codePoint < 0x80) return [codePoint];
  if (codePoint < 0x800) return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  if (codePoint < 0x10000)
    return [0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)];
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
};

const percent = (byte: number): string => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;

/**
 * Percent-encodes one directive term. A lone surrogate (not a Unicode scalar
 * value, so it has no UTF-8 form) is encoded as U+FFFD, as the WHATWG
 * "UTF-8 encode" algorithm does.
 */
export const encodeTerm = (term: string): string => {
  let out = '';
  for (const ch of term) {
    if (EXPLICIT.test(ch)) {
      out += ch;
      continue;
    }
    const cp = ch.codePointAt(0) ?? 0xfffd;
    const scalar = cp >= 0xd800 && cp <= 0xdfff ? 0xfffd : cp;
    out += utf8(scalar).map(percent).join('');
  }
  return out;
};

/** Inverse of encodeTerm: strict percent-decoding of a UTF-8 term (malformed input is an error). */
export const decodeTerm = (encoded: string): Result<string, string> => {
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const ch = encoded[i] ?? '';
    if (ch === '%') {
      const hex = encoded.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/u.test(hex)) return err(`malformed percent escape at ${i}`);
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
    } else if (EXPLICIT.test(ch)) {
      bytes.push(ch.charCodeAt(0));
    } else {
      return err(`character "${ch}" at ${i} must be percent-encoded`);
    }
  }
  return utf8Decode(bytes);
};

/** Strict UTF-8 decoding (RFC 3629): no overlongs, no surrogates, nothing above U+10FFFF. */
const utf8Decode = (bytes: readonly number[]): Result<string, string> => {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] ?? 0;
    const length =
      b0 < 0x80 ? 1 : b0 >= 0xc2 && b0 < 0xe0 ? 2 : b0 >= 0xe0 && b0 < 0xf0 ? 3 : b0 >= 0xf0 && b0 < 0xf5 ? 4 : 0;
    if (length === 0) return err(`invalid UTF-8 lead byte at ${i}`);
    let cp = length === 1 ? b0 : b0 & (0xff >> (length + 1));
    for (let k = 1; k < length; k++) {
      const b = bytes[i + k];
      if (b === undefined || (b & 0xc0) !== 0x80) return err(`truncated UTF-8 sequence at ${i}`);
      cp = (cp << 6) | (b & 0x3f);
    }
    const minimum = [0, 0, 0x80, 0x800, 0x10000][length] ?? 0;
    if (cp < minimum || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return err(`invalid code point at ${i}`);
    out += String.fromCodePoint(cp);
    i += length;
  }
  return ok(out);
};

export type TextDirective = {
  readonly start: string;
  readonly end?: string;
  readonly prefix?: string;
  readonly suffix?: string;
};

/** "text=…" (without the delimiter). Empty terms are not valid (§3.4), so they are omitted. */
export const encodeTextDirective = (d: TextDirective): string => {
  const parts = [
    ...(d.prefix !== undefined && d.prefix !== '' ? [`${encodeTerm(d.prefix)}-`] : []),
    encodeTerm(d.start),
    ...(d.end !== undefined && d.end !== '' ? [encodeTerm(d.end)] : []),
    ...(d.suffix !== undefined && d.suffix !== '' ? [`-${encodeTerm(d.suffix)}`] : []),
  ];
  return `text=${parts.join(',')}`;
};

/** Parses "text=…" back into its terms (the inverse of encodeTextDirective on non-empty terms). */
export const decodeTextDirective = (directive: string): Result<TextDirective, string> => {
  if (!directive.startsWith('text=')) return err('a text directive starts with "text="');
  const parts = directive.slice(5).split(',');
  const first = parts[0] ?? '';
  const prefixRaw = first.endsWith('-') ? first.slice(0, -1) : undefined;
  const rest = prefixRaw === undefined ? parts : parts.slice(1);
  const last = rest.at(-1) ?? '';
  const suffixRaw = rest.length > 1 && last.startsWith('-') ? last.slice(1) : undefined;
  const terms = suffixRaw === undefined ? rest : rest.slice(0, -1);
  if (terms.length < 1 || terms.length > 2) return err('a text directive has a start and at most one end term');
  const decoded = [prefixRaw, ...terms, suffixRaw].map((t) => (t === undefined ? ok(undefined) : decodeTerm(t)));
  const failed = decoded.find((r) => !r.ok);
  if (failed !== undefined && !failed.ok) return failed;
  const values = decoded.map((r) => (r.ok ? r.value : undefined));
  const [prefix, start, ...others] = values;
  const end = terms.length === 2 ? others[0] : undefined;
  const suffix = values.at(-1);
  if (start === undefined || start === '') return err('the start term is empty');
  return ok({
    start,
    ...(end !== undefined ? { end } : {}),
    ...(prefix !== undefined ? { prefix } : {}),
    ...(suffixRaw !== undefined && suffix !== undefined ? { suffix } : {}),
  });
};

/** Runs of white space (as rendered text collapses them) become one space; ends trimmed. */
export const collapseWhitespace = (s: string): string => s.replace(/\s+/gu, ' ').trim();

/** Words kept from each end of a long quotation (start,end form). */
const EDGE_WORDS = 6;
/** Quotations up to this many words are linked whole (exact match). */
const WHOLE_WORDS = 12;

/**
 * The directive for a selected passage. A short passage is linked whole; a
 * longer one, or one that spans blocks (its lines, as Selection.toString()
 * joins blocks with line breaks), by its first and last words, because a term
 * "will only match text that is continuous (i.e. uninterrupted by a block-level
 * container)" (§3.6.1, "find a string in range") while start,end spans blocks.
 * Matching is case- and accent-insensitive, so the terms need no normalisation
 * beyond collapsing white space.
 */
export const directiveForQuote = (selected: string): Result<TextDirective, string> => {
  const lines = selected
    .split(/\n+/u)
    .map(collapseWhitespace)
    .filter((l) => l !== '');
  const firstLine = lines[0];
  const lastLine = lines.at(-1);
  if (firstLine === undefined || lastLine === undefined) return err('the selection is empty');
  const firstWords = firstLine.split(' ');
  const lastWords = lastLine.split(' ');
  if (lines.length === 1 && firstWords.length <= WHOLE_WORDS) return ok({ start: firstLine });
  const start = firstWords.slice(0, EDGE_WORDS).join(' ');
  const end = lastWords.slice(-EDGE_WORDS).join(' ');
  return ok({ start, end });
};

/** The page URL with its fragment replaced by the text directive (any previous fragment is dropped). */
export const withTextFragment = (url: string, directive: TextDirective): string => {
  const hash = url.indexOf('#');
  const base = hash < 0 ? url : url.slice(0, hash);
  return `${base}#:~:${encodeTextDirective(directive)}`;
};
