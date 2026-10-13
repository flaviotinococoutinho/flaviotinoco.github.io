/**
 * Codec: plain text ⇄ LaTeX text-mode source.
 *
 * `escapeTex` makes any string safe as LaTeX text: the ten characters with a
 * category code other than "letter/other" in plain LaTeX (`# $ % & ~ _ ^ \ { }`,
 * cf. The TeXbook ch. 7 and LaTeX Companion 3rd ed. §2.1) are replaced by
 * their text commands. Four more are escaped because they misbehave with
 * common setups: `<` `>` `|` print other glyphs in the OT1 encoding, and `"`
 * is an active shorthand character under babel's Portuguese.
 *
 * Law (tested with fast-check): unescapeTex ∘ escapeTex = id. Every escape is
 * a distinct, prefix-free control sequence, so decoding is unambiguous.
 */

const ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  '#': '\\#',
  $: '\\$',
  '%': '\\%',
  '&': '\\&',
  _: '\\_',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
  '"': '\\textquotedbl{}',
};

const SPECIALS = /[\\{}#$%&_~^<>|"]/g;

const UNESCAPES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ESCAPES).map(([plain, escaped]) => [escaped, plain]),
);

const ESCAPED = new RegExp(
  Object.values(ESCAPES)
    .sort((a, b) => b.length - a.length)
    .map((e) => e.replace(/[\\{}$^|]/g, (c) => `\\${c}`))
    .join('|'),
  'g',
);

export const escapeTex = (text: string): string => text.replace(SPECIALS, (c) => ESCAPES[c] ?? c);

export const unescapeTex = (tex: string): string => tex.replace(ESCAPED, (e) => UNESCAPES[e] ?? e);

/**
 * Escaping for URLs inside `\href{…}` / `\url{…}`: hyperref reads the URL
 * almost verbatim, but `#`, `%`, `\`, `{`, `}` and `~` still have to be
 * protected when the command sits inside another command's argument
 * (hyperref manual, §4 "\href").
 */
export const escapeUrl = (url: string): string => url.replace(/[\\#%{}~]/g, (c) => `\\${c}`);
