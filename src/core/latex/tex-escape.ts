/**
 * Codec: plain text ⇄ LaTeX text-mode source that PRINTS that text.
 *
 * `escapeTex` makes any string safe as LaTeX text: the ten characters with a
 * category code other than "letter/other" in plain LaTeX (`# $ % & ~ _ ^ \ { }`,
 * cf. The TeXbook ch. 7 and LaTeX Companion 3rd ed. §2.1) are replaced by
 * their text commands. More are escaped because they would not print as
 * themselves: `<` `>` `|` print other glyphs in the OT1 encoding, and `"` is an
 * active shorthand character under babel's Portuguese; `'` and `` ` `` are the
 * right and left quotes of TeX's fonts (The TeXbook ch. 2), so a straight
 * apostrophe or grave accent needs \textquotesingle / \textasciigrave; and
 * the font ligatures `--` (en dash), `---` (em dash), `,,` („) and `<<` `>>`
 * (« », also from \textless\textless in T1) are broken by `\/` between the two
 * characters. `{}` would do for pdfTeX but not for LuaTeX, whose ligaturing
 * ignores empty groups; `\kern0pt` would do for both but leaks into hyperref's
 * PDF strings (pdftitle), where `\/` is dropped. Verified with pdfLaTeX and
 * LuaLaTeX (TeX Live 2023: T1 + lmodern, and fontspec). With those, every
 * character prints as itself, so the PDF shows the characters the site shows:
 * `--` stays two hyphens unless SmartyPants (which runs on the site's input,
 * see export.ts) already made it a dash.
 *
 * Law (tested with fast-check): unescapeTex ∘ escapeTex = id. Every escape is
 * a distinct, prefix-free control sequence, and `\/` occurs only as a ligature
 * break (a literal backslash is always escaped), so decoding is unambiguous.
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
  "'": '\\textquotesingle{}',
  '`': '\\textasciigrave{}',
};

/** Characters that form a font ligature with themselves: `--`, `,,`, `<<`, `>>`. */
const LIGATURE_START = new Set(['-', ',', '<', '>']);
/** TeX's italic correction: a node between the two characters, dropped from PDF strings. */
const LIGATURE_BREAK = '\\/';

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

export const escapeTex = (text: string): string => {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charAt(i);
    out += ESCAPES[c] ?? c;
    if (LIGATURE_START.has(c) && text.charAt(i + 1) === c) out += LIGATURE_BREAK;
  }
  return out;
};

export const unescapeTex = (tex: string): string =>
  tex.replaceAll(LIGATURE_BREAK, '').replace(ESCAPED, (e) => UNESCAPES[e] ?? e);

/**
 * Escaping for URLs inside `\href{…}` / `\url{…}` / `\includegraphics{…}`:
 * hyperref reads the URL almost verbatim, but `#`, `%`, `\`, `{`, `}` and `~`
 * still have to be protected when the command sits inside another command's
 * argument (hyperref manual, §4 "\href"), and `&` inside a tabular cell
 * would end the cell.
 */
export const escapeUrl = (url: string): string => url.replace(/[\\#%{}~&]/g, (c) => `\\${c}`);
