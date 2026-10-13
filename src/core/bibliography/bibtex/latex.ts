/**
 * LaTeX → Unicode decoding of BibTeX field values (pure, total).
 *
 * Covers the subset of LaTeX that occurs in bibliographic data (cf. "The LaTeX
 * Companion", 2nd ed., §7.10; L. Lamport, "LaTeX", 1994, §3.2.1 and Table 3.1):
 *
 *   - accents with or without braces and with dotless letters: \'e  \'{e}  {\'e}
 *     {\'\i}  \c c  \c{c}  \v{s}  \u{a}  \H{o}  \r{a}  \k{a}  \=a  \.z  \~n  \^o  \`a  \"u;
 *   - special letters (\ss \o \O \ae \AE \oe \OE \l \L \aa \AA \i \j …);
 *   - TeX ligatures: -- → – (en dash), --- → — (em dash), `` '' ` ' → “ ” ‘ ’;
 *   - ~ → U+00A0 (no-break space), \& \% \$ \_ \# \{ \} → the literal character;
 *   - font commands: \emph \textit \textsl and the declarations \em \it \itshape
 *     are recorded as ITALIC spans; \textbf \textsc \textrm … keep their content;
 *   - case-protecting braces ({NASA}, {F}ourier) are removed but RECORDED as
 *     protected spans, so formatters never re-case them (Patashnik, "BibTeXing",
 *     §4: a brace group at level 1 not starting with "\" protects its case);
 *   - TeX spacing: whitespace runs collapse to one space; a control word swallows
 *     the spaces after it (\ss x → ßx), exactly as TeX's tokenizer does.
 *
 * Anything else (unknown commands, math $…$) is kept VERBATIM and reported as a
 * warning: no text is ever silently dropped.
 *
 * The output is Unicode NFC (UAX #15). Composing "accent + letter" naively is NOT
 * NFC: {\'e} would be "e" + U+0301, and {\'\i} would be dotless "ı" + U+0301,
 * which never composes to "í". Both are fixed here, so "Estatística" decoded from
 * BibTeX equals the precomposed string and dictionary/regex matching works.
 */

export type Range = { readonly start: number; readonly end: number };

/** Decoded text plus the spans that carry meaning beyond the characters. */
export type MarkedText = {
  /** NFC-normalised text. */
  readonly text: string;
  /** Case-protected spans (never re-cased by formatters). Sorted, disjoint. */
  readonly protected: readonly Range[];
  /** Spans set in italics in the source (\emph, \textit, {\em …}). Sorted, disjoint. */
  readonly italic: readonly Range[];
};

export type LatexProblem = {
  readonly code: 'latex:unknown-command' | 'latex:math-verbatim' | 'latex:unbalanced-brace';
  readonly message: string;
};

export type Decoded = { readonly value: MarkedText; readonly problems: readonly LatexProblem[] };

export const marked = (text: string): MarkedText => ({ text: text.normalize('NFC'), protected: [], italic: [] });

/** Combining marks of the accent commands (Unicode block U+0300–U+036F). */
const ACCENTS: Readonly<Record<string, string>> = {
  '`': '̀',
  "'": '́',
  '^': '̂',
  '~': '̃',
  '=': '̄',
  u: '̆',
  '.': '̇',
  '"': '̈',
  r: '̊',
  H: '̋',
  v: '̌',
  d: '̣',
  c: '̧',
  k: '̨',
  b: '̱',
  t: '͡',
};

/** Marks rendered above the base letter: a dotless ı/ȷ under them is the dotted i/j. */
const ABOVE = new Set(['̀', '́', '̂', '̃', '̄', '̆', '̇', '̈', '̊', '̋', '̌', '͡']);

const LETTERS: Readonly<Record<string, string>> = {
  ss: 'ß',
  SS: 'SS',
  o: 'ø',
  O: 'Ø',
  ae: 'æ',
  AE: 'Æ',
  oe: 'œ',
  OE: 'Œ',
  l: 'ł',
  L: 'Ł',
  aa: 'å',
  AA: 'Å',
  i: 'ı',
  j: 'ȷ',
  dh: 'ð',
  DH: 'Ð',
  th: 'þ',
  TH: 'Þ',
  ng: 'ŋ',
  NG: 'Ŋ',
  dj: 'đ',
  DJ: 'Đ',
};

/** Control symbols (\ + one non-letter) that stand for a character. */
const SYMBOLS: Readonly<Record<string, string>> = {
  '&': '&',
  '%': '%',
  $: '$',
  _: '_',
  '#': '#',
  '{': '{',
  '}': '}',
  ' ': ' ',
  ',': ' ', // thin space → narrow no-break space
  '-': '­', // discretionary hyphen → soft hyphen (invisible, but not lost)
  '/': '', // italic correction: no character
  '@': '', // spacing factor: no character
  '\\': ' ', // forced line break inside a field: a space in running text
};

/** Control words that stand for a fixed string. */
const WORDS: Readonly<Record<string, string>> = {
  textendash: '–',
  textemdash: '—',
  ldots: '…',
  dots: '…',
  textellipsis: '…',
  textquoteleft: '‘',
  textquoteright: '’',
  textquotedblleft: '“',
  textquotedblright: '”',
  guillemotleft: '«',
  guillemotright: '»',
  guillemetleft: '«',
  guillemetright: '»',
  textregistered: '®',
  textcopyright: '©',
  copyright: '©',
  textsection: '§',
  S: '§',
  textparagraph: '¶',
  P: '¶',
  textdegree: '°',
  textordmasculine: 'º',
  textordfeminine: 'ª',
  textbackslash: '\\',
  textasciitilde: '~',
  textasciicircum: '^',
  textunderscore: '_',
  textbar: '|',
  textless: '<',
  textgreater: '>',
  textbullet: '•',
  textperiodcentered: '·',
  TeX: 'TeX',
  LaTeX: 'LaTeX',
  LaTeXe: 'LaTeX2ε',
  BibTeX: 'BibTeX',
  relax: '',
};

const ITALIC_COMMANDS = new Set(['emph', 'textit', 'textsl']);
const TRANSPARENT_COMMANDS = new Set([
  'textrm',
  'textup',
  'textnormal',
  'textmd',
  'textsf',
  'texttt',
  'textbf',
  'textsc',
  'mbox',
  'hbox',
  'text',
]);
const ITALIC_DECLARATIONS = new Set(['em', 'it', 'itshape', 'sl', 'slshape']);
const NOOP_DECLARATIONS = new Set(['rm', 'upshape', 'normalfont', 'bf', 'bfseries', 'sc', 'scshape', 'tt', 'ttfamily', 'sf', 'sffamily', 'mdseries']);
const VERBATIM_COMMANDS = new Set(['url', 'path']);

const isLetter = (c: string | undefined): boolean => c !== undefined && /[A-Za-z]/.test(c);
const isTexSpace = (c: string | undefined): boolean => c !== undefined && /[ \t\n\r\f\v]/.test(c);

/** Applies a combining mark to the first code point of `s`, fixing dotless i/j. */
const accent = (s: string, mark: string): string => {
  const cp = s.codePointAt(0);
  if (cp === undefined) return mark;
  const first = String.fromCodePoint(cp);
  const rest = s.slice(first.length);
  const base = ABOVE.has(mark) && first === 'ı' ? 'i' : ABOVE.has(mark) && first === 'ȷ' ? 'j' : first;
  return `${base}${mark}`.normalize('NFC') + rest;
};

/** Merges overlapping/adjacent ranges and drops empty ones. */
const normaliseRanges = (ranges: readonly Range[]): Range[] => {
  const sorted = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last !== undefined && r.start <= last.end) out[out.length - 1] = { start: last.start, end: Math.max(last.end, r.end) };
    else out.push(r);
  }
  return out;
};

const DOTLESS_BEFORE_MARK = /[ıȷ](?=[̀-ͯ])/gu;

/**
 * NFC normalisation that keeps ranges consistent: each slice between range
 * boundaries is normalised on its own; if that is not globally NFC (a mark
 * straddling a boundary), the whole string is normalised and offsets are remapped
 * through prefix lengths (monotone, so ranges stay ordered).
 */
const normalise = (text: string, groups: readonly (readonly Range[])[]): { text: string; groups: Range[][] } => {
  const fixed = text.replace(DOTLESS_BEFORE_MARK, (c) => (c === 'ı' ? 'i' : 'j'));
  const cuts = [...new Set([0, fixed.length, ...groups.flatMap((g) => g.flatMap((r) => [r.start, r.end]))])].sort(
    (a, b) => a - b,
  );
  const map = new Map<number, number>();
  let built = '';
  for (let k = 0; k < cuts.length; k++) {
    const at = cuts[k] as number;
    map.set(at, built.length);
    const next = cuts[k + 1];
    if (next !== undefined) built += fixed.slice(at, next).normalize('NFC');
  }
  if (built.normalize('NFC') === built) {
    return { text: built, groups: groups.map((g) => g.map((r) => ({ start: map.get(r.start) ?? 0, end: map.get(r.end) ?? 0 }))) };
  }
  const whole = fixed.normalize('NFC');
  const remap = (o: number): number => Math.min(whole.length, fixed.slice(0, o).normalize('NFC').length);
  return { text: whole, groups: groups.map((g) => g.map((r) => ({ start: remap(r.start), end: remap(r.end) }))) };
};

/** Decodes a raw BibTeX field value (outer delimiters already removed). */
export const decodeLatex = (raw: string): Decoded => {
  let out = '';
  let pending = false;
  const protectedRanges: Range[] = [];
  const italicRanges: Range[] = [];
  const problems: LatexProblem[] = [];
  let i = 0;

  const emit = (s: string): void => {
    if (s === '') return;
    if (pending && out.length > 0) out += ' ';
    pending = false;
    out += s;
  };
  /** Position where the next emitted content will start. */
  const mark = (): { readonly at: number; readonly pending: boolean } => ({ at: out.length, pending });
  const rangeFrom = (m: { readonly at: number; readonly pending: boolean }): Range => ({
    start: m.pending && out.length > m.at && m.at > 0 ? m.at + 1 : m.at,
    end: out.length,
  });

  /** Index just after the balanced group that opens at `from` (raw[from] === '{'). */
  const groupEnd = (from: number): number => {
    let depth = 0;
    for (let j = from; j < raw.length; j++) {
      if (raw[j] === '{') depth++;
      else if (raw[j] === '}') {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    return raw.length;
  };

  const skipSpaces = (): void => {
    while (isTexSpace(raw[i])) i++;
  };

  /** Reads one TeX argument: a {group} (content returned raw) or a single token. */
  const readArgument = (): string => {
    skipSpaces();
    if (raw[i] === '{') {
      const end = groupEnd(i);
      const content = raw.slice(i + 1, raw[end - 1] === '}' ? end - 1 : end);
      i = end;
      return content;
    }
    if (raw[i] === '\\') {
      const start = i;
      i++;
      if (isLetter(raw[i])) while (isLetter(raw[i])) i++;
      else i++;
      return raw.slice(start, i);
    }
    const cp = raw.codePointAt(i);
    if (cp === undefined) return '';
    const ch = String.fromCodePoint(cp);
    i += ch.length;
    return ch;
  };

  /** Decodes a fragment in isolation (accent and command arguments). */
  const sub = (fragment: string): MarkedText => {
    const r = decodeLatex(fragment);
    problems.push(...r.problems);
    return r.value;
  };

  /** Emits a decoded fragment, shifting its marks into the current output. */
  const emitMarked = (m: MarkedText, italic: boolean): void => {
    if (m.text === '') return;
    const before = mark();
    emit(m.text);
    const base = rangeFrom(before).start;
    for (const r of m.protected) protectedRanges.push({ start: base + r.start, end: base + r.end });
    for (const r of m.italic) italicRanges.push({ start: base + r.start, end: base + r.end });
    if (italic) italicRanges.push({ start: base, end: base + m.text.length });
  };

  const command = (italicStack: { italicFrom: { at: number; pending: boolean } | undefined }): void => {
    // raw[i] === '\\'
    const start = i;
    i++;
    if (i >= raw.length) {
      emit('\\');
      problems.push({ code: 'latex:unknown-command', message: 'dangling "\\" at the end of the value kept verbatim' });
      return;
    }
    let name: string;
    let isWord = false;
    if (isLetter(raw[i])) {
      const s = i;
      while (isLetter(raw[i])) i++;
      name = raw.slice(s, i);
      isWord = true;
    } else {
      const cp = raw.codePointAt(i) ?? 0;
      name = String.fromCodePoint(cp);
      i += name.length;
    }
    const nameEnd = i;
    // TeX's tokenizer swallows the spaces after a control word (TeXbook, ch. 8).
    if (isWord) skipSpaces();

    const accentMark = ACCENTS[name];
    if (accentMark !== undefined && (!isWord || name.length === 1)) {
      const arg = sub(readArgument());
      emit(accent(arg.text, accentMark));
      return;
    }
    if (isWord) {
      const letter = LETTERS[name];
      if (letter !== undefined) {
        emit(letter);
        return;
      }
      const word = WORDS[name];
      if (word !== undefined) {
        emit(word);
        return;
      }
      if (ITALIC_COMMANDS.has(name) || TRANSPARENT_COMMANDS.has(name)) {
        emitMarked(sub(readArgument()), ITALIC_COMMANDS.has(name));
        return;
      }
      if (VERBATIM_COMMANDS.has(name)) {
        emit(readArgument());
        return;
      }
      if (ITALIC_DECLARATIONS.has(name)) {
        italicStack.italicFrom ??= mark();
        return;
      }
      if (NOOP_DECLARATIONS.has(name)) return;
    } else {
      const symbol = SYMBOLS[name];
      if (symbol !== undefined) {
        emit(symbol);
        return;
      }
    }
    // Unknown: keep the command and its brace arguments verbatim (source spacing included).
    problems.push({ code: 'latex:unknown-command', message: `unknown LaTeX command "\\${name}" kept verbatim` });
    if (raw[i] === '{') {
      let j = i;
      while (raw[j] === '{') j = groupEnd(j);
      emit(raw.slice(start, j));
      i = j;
    } else {
      emit(raw.slice(start, nameEnd));
      i = nameEnd;
    }
  };

  /** Parses a sequence until the closing brace of the current group (or the end). */
  const sequence = (depth: number): void => {
    const italicStack: { italicFrom: { at: number; pending: boolean } | undefined } = { italicFrom: undefined };
    while (i < raw.length) {
      const c = raw[i] as string;
      if (c === '}') {
        if (depth > 0) break;
        problems.push({ code: 'latex:unbalanced-brace', message: 'unbalanced "}" kept verbatim' });
        emit('}');
        i++;
        continue;
      }
      if (c === '{') {
        const special = raw[i + 1] === '\\';
        const before = mark();
        i++;
        sequence(depth + 1);
        if (raw[i] === '}') i++;
        if (depth === 0 && !special) protectedRanges.push(rangeFrom(before));
        continue;
      }
      if (c === '\\') {
        command(italicStack);
        continue;
      }
      if (isTexSpace(c)) {
        pending = true;
        i++;
        continue;
      }
      if (c === '~') {
        emit(' ');
        i++;
        continue;
      }
      if (c === '-') {
        if (raw.startsWith('---', i)) {
          emit('—');
          i += 3;
        } else if (raw.startsWith('--', i)) {
          emit('–');
          i += 2;
        } else {
          emit('-');
          i++;
        }
        continue;
      }
      if (c === '`') {
        if (raw[i + 1] === '`') {
          emit('“');
          i += 2;
        } else {
          emit('‘');
          i++;
        }
        continue;
      }
      if (c === "'") {
        if (raw[i + 1] === "'") {
          emit('”');
          i += 2;
        } else {
          emit('’');
          i++;
        }
        continue;
      }
      if (c === '$') {
        let j = i + 1;
        while (j < raw.length && !(raw[j] === '$' && raw[j - 1] !== '\\')) j++;
        const end = Math.min(raw.length, j + 1);
        emit(raw.slice(i, end));
        problems.push({ code: 'latex:math-verbatim', message: `math "${raw.slice(i, end)}" kept verbatim` });
        i = end;
        continue;
      }
      const cp = raw.codePointAt(i) ?? 0;
      const ch = String.fromCodePoint(cp);
      emit(ch);
      i += ch.length;
    }
    if (italicStack.italicFrom !== undefined) italicRanges.push(rangeFrom(italicStack.italicFrom));
  };

  sequence(0);
  const n = normalise(out, [normaliseRanges(protectedRanges), normaliseRanges(italicRanges)]);
  return {
    value: {
      text: n.text,
      protected: normaliseRanges(n.groups[0] ?? []),
      italic: normaliseRanges(n.groups[1] ?? []),
    },
    problems,
  };
};

/** Concatenates marked texts, shifting ranges. */
export const concatMarked = (parts: readonly MarkedText[], separator = ''): MarkedText => {
  let text = '';
  const prot: Range[] = [];
  const ital: Range[] = [];
  parts.forEach((p, k) => {
    if (k > 0) text += separator;
    const base = text.length;
    text += p.text;
    for (const r of p.protected) prot.push({ start: base + r.start, end: base + r.end });
    for (const r of p.italic) ital.push({ start: base + r.start, end: base + r.end });
  });
  return { text, protected: normaliseRanges(prot), italic: normaliseRanges(ital) };
};

/** Applies `f` (e.g. upper-casing) to the text OUTSIDE protected spans only. */
export const recase = (m: MarkedText, f: (s: string) => string): string => {
  let result = '';
  let at = 0;
  for (const r of m.protected) {
    result += f(m.text.slice(at, r.start)) + m.text.slice(r.start, r.end);
    at = r.end;
  }
  return result + f(m.text.slice(at));
};
