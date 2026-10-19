/**
 * llms.txt — a Markdown index of the site for language models (pure builder).
 *
 * Format (https://llmstxt.org/, read 2026-10-19; revalidate — the proposal is not
 * a standard), in this order:
 *   1. an H1 with the name of the site (the only required section);
 *   2. a blockquote with a short summary;
 *   3. zero or more Markdown sections of any kind except headings (details);
 *   4. zero or more H2 sections of "file lists": `- [name](url): notes`;
 *   an H2 named "Optional" holds secondary links that may be skipped.
 * The file lives at the site root (/llms.txt) and is plain Markdown.
 *
 * Escaping: link text escapes "\", "[" and "]" (CommonMark §6.3 link text);
 * URLs percent-encode the characters a CommonMark link destination cannot hold
 * unbracketed (space, "(", ")", "<", ">") so every link parses; notes and
 * summary lines are folded to one line, because a line break would end the item.
 */

export type LlmsLink = { readonly name: string; readonly url: string; readonly notes?: string };
export type LlmsSection = { readonly title: string; readonly links: readonly LlmsLink[] };

export type LlmsDocument = {
  readonly title: string;
  readonly summary: string;
  readonly details: readonly string[];
  readonly sections: readonly LlmsSection[];
  /** The "Optional" section; omitted when empty. */
  readonly optional: readonly LlmsLink[];
};

const oneLine = (s: string): string => s.replace(/\s+/gu, ' ').trim();

export const escapeLinkText = (s: string): string => oneLine(s).replace(/[\\[\]]/gu, (c) => `\\${c}`);

export const escapeDestination = (url: string): string =>
  url.replace(/[ ()<>]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

/** Text that would start a heading or a block quote at the start of a line is kept literal. */
const paragraph = (s: string): string => oneLine(s).replace(/^([#>])/u, '\\$1');

export const llmsLink = (l: LlmsLink): string => {
  const notes = l.notes === undefined ? '' : oneLine(l.notes);
  return `- [${escapeLinkText(l.name)}](${escapeDestination(l.url)})${notes === '' ? '' : `: ${notes}`}`;
};

const section = (title: string, links: readonly LlmsLink[]): string =>
  [`## ${oneLine(title)}`, '', ...links.map(llmsLink)].join('\n');

/** The whole file; sections without links are left out. Ends with one newline. */
export const llmsTxt = (doc: LlmsDocument): string => {
  const blocks = [
    `# ${oneLine(doc.title)}`,
    `> ${oneLine(doc.summary)}`,
    ...doc.details.map(paragraph).filter((d) => d !== ''),
    ...doc.sections.filter((s) => s.links.length > 0).map((s) => section(s.title, s.links)),
    ...(doc.optional.length > 0 ? [section('Optional', doc.optional)] : []),
  ];
  return `${blocks.join('\n\n')}\n`;
};
