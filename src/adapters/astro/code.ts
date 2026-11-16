/**
 * Code blocks (Shiki): one theme of the site's own, typographic rather than chromatic.
 *
 * Hue is a reserved signifier on this site: the four strata, links, focus and the selection mark
 * (docs/arquitetura.md §6, "Signos"). Third-party themes paint tokens in blue, purple, red, orange and green on a
 * background of their own; in an essay a blue keyword reads as a link and an orange string as the value stratum,
 * and the white or near-black block is a hole in the paper. Colour highlighting also buys little: a controlled
 * experiment found no effect of it on novices' comprehension (Hannebauer, Hesenius and Gruhn, "Does syntax
 * highlighting help programming novices?", Empirical Software Engineering 23(5), 2018,
 * doi:10.1007/s10664-017-9579-0).
 *
 * So code is set the way publication languages set it, with the site's tokens only:
 * - reserved words in bold, after the reference language of the ALGOL 60 report (Naur et al., 1963) and Knuth's
 *   WEB (Literate Programming, 1984); bold only on words, never on operator symbols (`=`, `=>`, `&&`);
 * - comments and docstrings in the secondary ink (`--ink-muted`): annotation, not code;
 * - everything else in the body ink, on the sunken paper of the page.
 * Strings keep only their quotes, which already delimit them. There is no italic: the mono face ships roman
 * only, and the site sets `font-synthesis: none`.
 *
 * The values are CSS custom properties, so one theme serves every colour scheme (light, dark, more contrast)
 * and forced colours keep the weight. tests/unit/guardrails/code-contrast.test.ts renders samples in ten
 * languages with this configuration and checks that nothing else comes out, and the contrast of what does.
 */
import type { ShikiConfig } from '@astrojs/markdown-remark';

type Theme = Exclude<NonNullable<ShikiConfig['theme']>, string>;
type Transformer = NonNullable<ShikiConfig['transformers']>[number];

/** The only values a code block may carry: every one is a token the palette verification measures. */
export const CODE_INK = {
  text: 'var(--ink)',
  comment: 'var(--ink-muted)',
  background: 'var(--paper-sunken)',
} as const;

/**
 * TextMate scopes of reserved words. `storage.type` names keywords in most grammars (`const`, `class`, `fn`)
 * but every type name in Java's and the string prefixes of Python's (`f`, `rb`), so those are taken back and
 * only Java's primitives stay.
 */
const RESERVED = [
  'keyword',
  'storage.modifier',
  'storage.type',
  'constant.language',
  'variable.language',
  'support.type.primitive',
] as const;

const THEME = {
  name: 'reading',
  type: 'light',
  fg: CODE_INK.text,
  bg: CODE_INK.background,
  settings: [
    { settings: { foreground: CODE_INK.text, background: CODE_INK.background } },
    {
      scope: ['comment', 'punctuation.definition.comment', 'string.quoted.docstring'],
      settings: { foreground: CODE_INK.comment },
    },
    { scope: [...RESERVED], settings: { fontStyle: 'bold' } },
    { scope: ['storage.type.java', 'storage.type.generic.java', 'storage.type.string'], settings: { fontStyle: '' } },
    { scope: ['storage.type.primitive.java'], settings: { fontStyle: 'bold' } },
  ],
} as const satisfies Theme;

/** Shiki's `FontStyle.Bold` bit (@shikijs/types). */
const BOLD = 2;

/**
 * One or more words (SQL's `PRIMARY KEY`, `GROUP BY` are single tokens): letters first, then letters, digits or
 * underscores; `@`, `#` or `!` may lead (`@media`, `#include`, `!important`).
 */
const WORD = /^[@#!]?\p{L}[\p{L}\p{N}_]*(?:\s+\p{L}[\p{L}\p{N}_]*)*$/u;

/** Keeps bold on words only: `keyword.operator` covers `new` and `and`, but also `=` and `=>`. */
const boldWordsOnly: Transformer = {
  name: 'bold-words-only',
  tokens(lines) {
    return lines.map((line) =>
      line.map((token) =>
        token.fontStyle !== undefined && (token.fontStyle & BOLD) !== 0 && !WORD.test(token.content.trim())
          ? { ...token, fontStyle: token.fontStyle & ~BOLD }
          : token,
      ),
    );
  },
};

export const SHIKI_CONFIG = {
  theme: THEME,
  transformers: [boldWordsOnly],
} as const satisfies ShikiConfig;
