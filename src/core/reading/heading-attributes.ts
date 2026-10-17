/**
 * Parser for Pandoc-style heading attributes (Pandoc User's Guide,
 * "Extension: header_attributes"):
 *
 *   ## Título {#id .claim depends="a,b"}
 *
 * Only a FINAL `{…}` that is a syntactically valid attribute list counts; any
 * other trailing brace (a set "{1, 2}", a word "{x}", a block glued to the
 * title "Título{#x}") is ordinary text and is left untouched, so a heading can
 * never lose characters by accident. Math and code at the end of a heading are
 * separate mdast nodes and never reach this parser.
 *
 * Grammar (whitespace-separated items, at least one):
 *   block  := WS+ "{" WS* item (WS+ item)* WS* "}" WS*  — at the end of the text
 *   item   := "#" IDENT | "." CLASS | KEY "=" VALUE
 *   VALUE  := quoted | bare        quoted := "…" | '…' (also the curly pairs
 *             produced by SmartyPants, which runs before every remark stage)
 *
 * Laws (tests/unit/reading/heading-attributes.test.ts):
 *   - text without a trailing valid block ⇒ `null` (plain headings untouched);
 *   - parse(title + render(attrs)) = (title, attrs)            (codec round trip);
 *   - text = result.text + result.block                         (nothing is lost).
 */

export interface HeadingAttributes {
  /** Value of `#id`, if present (the last one wins in Pandoc; duplicates are reported by the stage). */
  readonly ids: readonly string[];
  readonly classes: readonly string[];
  readonly pairs: readonly (readonly [key: string, value: string])[];
}

export interface HeadingAttributeSplit {
  /** Heading text without the block and the whitespace that preceded it. */
  readonly text: string;
  /** The exact removed suffix, leading whitespace included: text + block = input. */
  readonly block: string;
  readonly attributes: HeadingAttributes;
}

const OPEN_QUOTES: Readonly<Record<string, string>> = {
  '"': '"“”',
  '“': '"“”',
  '”': '"“”',
  "'": "'‘’",
  '‘': "'‘’",
  '’': "'‘’",
};
const QUOTE_CHARS = `"'“”‘’`;
const isSpace = (c: string): boolean => /\s/u.test(c);
const isTokenChar = (c: string): boolean => !isSpace(c) && !'{}='.includes(c) && !QUOTE_CHARS.includes(c);
const KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

type Scan = { readonly items: HeadingAttributes } | null;

/** Scans the interior of a candidate block (between the braces). */
const scanItems = (inner: string): Scan => {
  const ids: string[] = [];
  const classes: string[] = [];
  const pairs: (readonly [string, string])[] = [];
  let i = 0;
  const n = inner.length;
  const skipSpace = (): void => {
    while (i < n && isSpace(inner[i] ?? '')) i += 1;
  };
  const token = (): string => {
    const start = i;
    while (i < n && isTokenChar(inner[i] ?? '')) i += 1;
    return inner.slice(start, i);
  };
  skipSpace();
  if (i >= n) return null;
  while (i < n) {
    const c = inner[i] ?? '';
    if (c === '#') {
      i += 1;
      const id = token();
      if (id.length === 0) return null;
      ids.push(id);
    } else if (c === '.') {
      i += 1;
      const cls = token();
      if (cls.length === 0 || cls.includes('.') || cls.includes('#')) return null;
      classes.push(cls);
    } else {
      const key = token();
      if (!KEY.test(key) || inner[i] !== '=') return null;
      i += 1;
      const q = inner[i] ?? '';
      const closers = OPEN_QUOTES[q];
      if (closers !== undefined) {
        i += 1;
        const start = i;
        while (i < n && !closers.includes(inner[i] ?? '')) i += 1;
        if (i >= n) return null;
        pairs.push([key, inner.slice(start, i)]);
        i += 1;
      } else {
        const value = token();
        if (value.length === 0) return null;
        pairs.push([key, value]);
      }
    }
    // Items must be separated by whitespace (or end the block).
    if (i < n && !isSpace(inner[i] ?? '')) return null;
    skipSpace();
  }
  return { items: { ids, classes, pairs } };
};

/**
 * Splits a trailing attribute block off a heading's final text segment.
 * Returns null when the text does not end with a valid block — the common case.
 */
export const splitHeadingAttributes = (text: string): HeadingAttributeSplit | null => {
  const trimmed = text.replace(/\s+$/u, '');
  if (!trimmed.endsWith('}')) return null;
  // The block cannot contain braces, so it starts at the last "{".
  const open = trimmed.lastIndexOf('{');
  if (open <= 0) return null;
  // Pandoc requires the block to be separated from the title by whitespace.
  // (A leading space of the segment counts: "*Ênfase* {#x}" → segment " {#x}".)
  if (!isSpace(trimmed[open - 1] ?? '')) return null;
  const scanned = scanItems(trimmed.slice(open + 1, -1));
  if (scanned === null) return null;
  // The title may be empty here when it lives in earlier phrasing nodes
  // ("## *Ênfase* {#x}"); the stage checks that the whole heading keeps a title.
  const title = trimmed.slice(0, open).replace(/\s+$/u, '');
  return { text: title, block: text.slice(title.length), attributes: scanned.items };
};

/** Inverse direction (for tests and documentation): renders attributes as a block. */
export const renderHeadingAttributes = (a: HeadingAttributes): string => {
  const items = [
    ...a.ids.map((id) => `#${id}`),
    ...a.classes.map((c) => `.${c}`),
    ...a.pairs.map(([k, v]) => `${k}="${v}"`),
  ];
  return `{${items.join(' ')}}`;
};

/**
 * True when the raw Markdown source of the heading ends with a block whose
 * opening brace is backslash-escaped (`\{.claim}`): the author asked for the
 * literal text. remark resolves escapes, so the decision needs the source.
 * ATX closing sequences (`## T {#x} ##`) and setext underlines are ignored.
 */
export const isEscapedInSource = (rawHeading: string): boolean => {
  const lines = rawHeading.split('\n');
  const last = lines[lines.length - 1] ?? '';
  const body = lines.length > 1 && /^\s*(=+|-+)\s*$/.test(last) ? lines.slice(0, -1).join('\n') : rawHeading;
  const tail = body.replace(/\s+#+\s*$/u, '').replace(/\s+$/u, '');
  if (!tail.endsWith('}')) return true; // e.g. the brace came from a character reference (&#125;)
  const open = tail.lastIndexOf('{');
  if (open < 0) return true;
  let slashes = 0;
  for (let k = open - 1; k >= 0 && tail[k] === '\\'; k -= 1) slashes += 1;
  return slashes % 2 === 1;
};
