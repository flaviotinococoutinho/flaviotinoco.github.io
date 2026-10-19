/**
 * Minimal, dependency-free HTML scanner for build-output checks.
 *
 * Not a full HTML5 parser (the frozen lockfile provides none at the root): it
 * recognises start tags and their attributes, skips comments, doctype and end
 * tags, and treats the contents of raw-text elements (<script>, <style>,
 * <textarea>, <title>) as text, per the tokenizer states of the WHATWG HTML
 * standard §13.2.5 (Data, Tag open, Attribute name/value, RAWTEXT/RCDATA). That
 * is exactly the subset needed to read href/src/id from Astro's output.
 */

export interface Tag {
  /** Lower-cased tag name. */
  readonly name: string;
  /** Attributes with lower-cased names and entity-decoded values (first occurrence wins, as in HTML). */
  readonly attrs: ReadonlyMap<string, string>;
}

export interface RawText {
  readonly tag: Tag;
  readonly text: string;
}

export interface ScannedHtml {
  readonly tags: readonly Tag[];
  /** Contents of <script>/<style> elements, with their start tag. */
  readonly rawTexts: readonly RawText[];
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/** Decodes numeric character references and the named entities that occur in attribute values. */
export const decodeEntities = (value: string): string =>
  value.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const TAG_NAME = /[a-zA-Z][^\s/>]*/y;
const ATTRIBUTE = /[\s/]*([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;

export const scanHtml = (html: string): ScannedHtml => {
  const tags: Tag[] = [];
  const rawTexts: RawText[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html[lt + 1] === '!' || html[lt + 1] === '?' || html[lt + 1] === '/') {
      const end = html.indexOf('>', lt + 1);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    TAG_NAME.lastIndex = lt + 1;
    const nameMatch = TAG_NAME.exec(html);
    if (nameMatch === null) {
      i = lt + 1;
      continue;
    }
    const name = nameMatch[0].toLowerCase();
    const attrs = new Map<string, string>();
    let j = TAG_NAME.lastIndex;
    for (;;) {
      ATTRIBUTE.lastIndex = j;
      const m = ATTRIBUTE.exec(html);
      if (m === null || m[0].length === 0) break;
      const attrName = (m[1] ?? '').toLowerCase();
      if (!attrs.has(attrName)) attrs.set(attrName, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
      j = ATTRIBUTE.lastIndex;
    }
    const close = html.indexOf('>', j);
    const tag: Tag = { name, attrs };
    tags.push(tag);
    i = close === -1 ? html.length : close + 1;
    if (RAW_TEXT.has(name)) {
      const endTag = new RegExp(`</${name}[\\s>/]`, 'ig');
      endTag.lastIndex = i;
      const end = endTag.exec(html);
      const stop = end === null ? html.length : end.index;
      if (name === 'script' || name === 'style') rawTexts.push({ tag, text: html.slice(i, stop) });
      i = stop;
    }
  }
  return { tags, rawTexts };
};
