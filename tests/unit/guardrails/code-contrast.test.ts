/**
 * Code blocks: the site's typographic highlighting (src/adapters/astro/code.ts) and its contrast.
 *
 * Hue is reserved on this site (strata, links, focus, the selection mark), so a code block may carry only the
 * body ink, the secondary ink, the sunken paper and bold. This guard renders samples in the languages the site
 * writes about with the very configuration of the build and checks that
 * - nothing else comes out (a third-party colour or a new property would be a silent change of the sign system);
 * - the grammar is applied in every language: reserved words in bold, comments in the secondary ink;
 * - bold falls on words only, never on operator symbols;
 * - the two inks reach WCAG 2.2 AAA (SC 1.4.6, 7:1) on the sunken paper in all four colour schemes.
 *
 * It replaces a guard over third-party themes, which had to exist because the defect was silent:
 * `github-dark` drew comments at 3.05:1 and `github-light` drew variables at 3.49:1.
 */
import { readFileSync } from 'node:fs';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';
import { CODE_INK, SHIKI_CONFIG } from '../../../src/adapters/astro/code.ts';
import { parseTokens, type ColorScheme, type ColorTable } from '../../../src/core/design/tokens.ts';

/** Minimum contrast of the inks (SC 1.4.6, AAA): the level the site promises for text. */
const AAA = 7;

/** One snippet per language, each with comments, strings, keywords, numbers, names and calls. */
const SAMPLES: Readonly<Record<string, string>> = {
  java: [
    '// a comment',
    '@Override',
    'public final class Player<T extends Event> implements Machine {',
    '    private static final int LIMIT = 42;',
    '    /** A doc comment. */',
    '    Optional<State> next(State state, T event) throws IllegalStateException {',
    '        return switch (state) { case STOPPED -> Optional.of(State.PLAYING); default -> Optional.empty(); };',
    '    }',
    '    String name = "text" + \'c\' + this.toString() + null + true;',
    '}',
  ].join('\n'),
  typescript: [
    '// a comment',
    "import { type Result, ok } from './result.ts';",
    'export const next = <S extends string>(state: S, event: Event): Result<S, string> => {',
    '  const table: Readonly<Record<string, number>> = { a: 1, b: 2.5 };',
    '  if (state === undefined || /^[a-z]+$/u.test(state)) return ok(state);',
    '  for (const key of Object.keys(table)) console.log(`${key}: ${String(table[key])}`);',
    '  return new Map<string, S>().get(event.name) as never;',
    '};',
    'interface Event { readonly name: string; }',
    'class Machine extends Base implements Runnable { static #count = 0; }',
  ].join('\n'),
  rust: [
    '// a comment',
    '#[derive(Debug, Clone, Copy)]',
    'pub enum State { Stopped, Playing }',
    "pub fn next<'a>(state: &'a State, event: u8) -> Option<State> {",
    '    let limit: usize = 42;',
    '    match (state, event) { (State::Stopped, 1) => Some(State::Playing), _ => None }',
    '}',
    'const NAME: &str = "text";',
  ].join('\n'),
  python: [
    '# a comment',
    'from dataclasses import dataclass',
    '@dataclass(frozen=True)',
    'class State:',
    '    """A docstring."""',
    '    name: str = "stopped"',
    'def step(state: State, event: int) -> State | None:',
    '    return None if event > 42 else State(name=f"{state.name}!")',
  ].join('\n'),
  sql: [
    '-- a comment',
    "CREATE TABLE payment (id BIGINT PRIMARY KEY, state VARCHAR(32) NOT NULL DEFAULT 'NEW', version INT);",
    "UPDATE payment SET state = 'CAPTURED', version = version + 1 WHERE id = 42 AND version = 7;",
    'SELECT state, COUNT(*) AS n FROM payment GROUP BY state HAVING COUNT(*) > 1;',
  ].join('\n'),
  json: '{ "state": "PLAYING", "count": 42, "ratio": 0.5, "active": true, "next": null, "list": [1, "a"] }',
  yaml: ['# a comment', 'state: PLAYING', 'count: 42', 'active: true', 'list:', '  - "a"', '  - b: &anchor 1.5'].join(
    '\n',
  ),
  bash: [
    '# a comment',
    'set -euo pipefail',
    'for file in "$HOME"/*.md; do echo "${file%.md}" | grep -c \'x\' > /dev/null && exit 1; done',
    'pnpm install --frozen-lockfile',
  ].join('\n'),
  css: [
    '/* a comment */',
    '@media (prefers-color-scheme: dark) {',
    '  .prose pre > code::before { color: var(--ink, #111); margin: 0 1.5rem !important; content: "x"; }',
    '}',
  ].join('\n'),
  html: [
    '<!-- a comment -->',
    '<!doctype html>',
    '<main id="content" class="prose" hidden><a href="/x/?a=1&amp;b=2">text</a><br /></main>',
  ].join('\n'),
};

/** Which marks each sample must show: HTML has no reserved words, JSON no comments. */
const EXPECTED: Readonly<Record<string, { readonly bold: boolean; readonly comment: boolean }>> = {
  java: { bold: true, comment: true },
  typescript: { bold: true, comment: true },
  rust: { bold: true, comment: true },
  python: { bold: true, comment: true },
  sql: { bold: true, comment: true },
  json: { bold: true, comment: false },
  yaml: { bold: true, comment: true },
  bash: { bold: true, comment: true },
  css: { bold: true, comment: true },
  html: { bold: false, comment: true },
};

/** The declarations a code block may carry; `overflow-x: auto` is Astro's own, on the <pre>. */
const ALLOWED: ReadonlySet<string> = new Set([
  `color:${CODE_INK.text}`,
  `color:${CODE_INK.comment}`,
  `background-color:${CODE_INK.background}`,
  'font-weight:bold',
  'overflow-x:auto',
]);

interface Span {
  readonly declarations: readonly string[];
  readonly text: string;
}

interface Rendered {
  readonly language: string;
  readonly declarations: ReadonlySet<string>;
  readonly spans: readonly Span[];
}

const declarationsOf = (style: string): readonly string[] =>
  style
    .split(';')
    .map((d) => d.replace(/\s+/gu, '').trim())
    .filter((d) => d !== '');

const decode = (text: string): string =>
  text.replace(/&#x([0-9a-f]+);/giu, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)));

let rendered: Promise<readonly Rendered[]> | undefined;
const render = (): Promise<readonly Rendered[]> =>
  (rendered ??= (async () => {
    const processor = await createMarkdownProcessor({
      syntaxHighlight: { type: 'shiki', excludeLangs: ['math'] },
      shikiConfig: SHIKI_CONFIG,
    });
    const out: Rendered[] = [];
    for (const [language, code] of Object.entries(SAMPLES)) {
      const { code: html } = await processor.render(`\`\`\`${language}\n${code}\n\`\`\`\n`);
      const declarations = new Set([...html.matchAll(/style="([^"]*)"/gu)].flatMap((m) => declarationsOf(m[1] ?? '')));
      const spans = [...html.matchAll(/<span style="([^"]*)">([^<]*)<\/span>/gu)].map((m) => ({
        declarations: declarationsOf(m[1] ?? ''),
        text: decode(m[2] ?? ''),
      }));
      out.push({ language, declarations, spans });
    }
    return out;
  })());

const tokens = parseTokens(
  JSON.parse(readFileSync(new URL('../../../src/core/design/tokens.json', import.meta.url), 'utf8')) as Parameters<
    typeof parseTokens
  >[0],
);

/** The colour table of a scheme; the *-more tables override the base ones (as in scripts/verify-palette.ts). */
const table = (scheme: ColorScheme): ColorTable => {
  if (!tokens.ok) throw new Error(tokens.error.join('\n'));
  const { colors } = tokens.value;
  return scheme === 'light-more'
    ? { ...colors.light, ...colors['light-more'] }
    : scheme === 'dark-more'
      ? { ...colors.dark, ...colors['dark-more'] }
      : colors[scheme];
};

/** `var(--ink-muted)` → `ink-muted`. */
const tokenName = (value: string): string => /^var\(--([a-z-]+)\)$/u.exec(value)?.[1] ?? value;

describe('code blocks are set with the site tokens only', () => {
  it('uses one theme of the site, the same in every colour scheme', () => {
    expect(SHIKI_CONFIG).not.toHaveProperty('themes');
    expect(SHIKI_CONFIG.theme.name).toBe('reading');
  });

  it('emits no declaration but the two inks, the sunken paper and bold', async () => {
    const foreign = (await render()).flatMap(({ language, declarations }) =>
      [...declarations].filter((d) => !ALLOWED.has(d)).map((d) => `${language}: ${d}`),
    );
    expect(foreign).toEqual([]);
  });

  it('sets reserved words in bold and comments in the secondary ink, in every language', async () => {
    const missing: string[] = [];
    for (const { language, spans } of await render()) {
      const expected = EXPECTED[language];
      if (expected === undefined) {
        missing.push(`${language}: no expectation`);
        continue;
      }
      const bold = spans.some((s) => s.declarations.includes('font-weight:bold'));
      const comment = spans.some((s) => s.declarations.includes(`color:${CODE_INK.comment}`));
      if (bold !== expected.bold) missing.push(`${language}: bold ${String(bold)}`);
      if (comment !== expected.comment) missing.push(`${language}: comment ${String(comment)}`);
    }
    expect(missing).toEqual([]);
  });

  it('puts bold on words only, never on operator symbols', async () => {
    const symbols = (await render()).flatMap(({ language, spans }) =>
      spans
        .filter((s) => s.declarations.includes('font-weight:bold'))
        .map((s) => s.text.trim())
        .filter((text) => !/^[@#!]?\p{L}[\p{L}\p{N}_ ]*$/u.test(text))
        .map((text) => `${language}: "${text}"`),
    );
    expect(symbols).toEqual([]);
  });

  it('draws both inks at 7:1 or more on the sunken paper, in all four colour schemes', () => {
    const failures: string[] = [];
    const background = tokenName(CODE_INK.background);
    for (const scheme of ['light', 'dark', 'light-more', 'dark-more'] as const) {
      const colours = table(scheme);
      const paper = colours[background];
      for (const ink of [CODE_INK.text, CODE_INK.comment].map(tokenName)) {
        const value = colours[ink];
        if (paper === undefined || value === undefined) {
          failures.push(`${scheme}: missing ${ink} or ${background}`);
          continue;
        }
        const ratio = new Color('oklch', [...paper]).contrast(new Color('oklch', [...value]), 'WCAG21');
        if (ratio < AAA) failures.push(`${scheme}: ${ink} on ${background} is ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });
});
