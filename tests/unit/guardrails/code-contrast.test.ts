/**
 * Contrast of code blocks (WCAG 2.2 SC 1.4.3, AA: 4.5:1).
 *
 * The colours of a highlighted code block are third-party values (Shiki themes)
 * that the palette verification never sees. This guard renders samples in the
 * languages the site writes about with the very configuration of the build
 * (src/adapters/astro/code.ts) and measures every colour that comes out against
 * the background of its theme, in the light and in the dark scheme.
 *
 * It exists because the defect is silent: `github-dark` draws comments at
 * 3.05:1 and `github-light` draws variables at 3.49:1, and a page only shows it
 * when a snippet happens to contain that kind of token.
 */
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';
import { SHIKI_CONFIG } from '../../../src/adapters/astro/code.ts';

/** Minimum contrast of normal-size text (SC 1.4.3). */
const AA = 4.5;

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

interface Painted {
  readonly language: string;
  readonly scheme: 'light' | 'dark';
  readonly background: string;
  readonly colours: ReadonlySet<string>;
}

/** Value of a CSS custom property in a `style` attribute, e.g. `--shiki-dark:#8B949E`. */
const property = (style: string, name: string): string | undefined =>
  new RegExp(`${name}:\\s*([^;"]+)`, 'u').exec(style)?.[1]?.trim();

const paint = async (): Promise<readonly Painted[]> => {
  const processor = await createMarkdownProcessor({
    syntaxHighlight: { type: 'shiki', excludeLangs: ['math'] },
    shikiConfig: SHIKI_CONFIG,
  });
  const out: Painted[] = [];
  for (const [language, code] of Object.entries(SAMPLES)) {
    const { code: html } = await processor.render(`\`\`\`${language}\n${code}\n\`\`\`\n`);
    const styles = [...html.matchAll(/style="([^"]*)"/gu)].map((m) => m[1] ?? '');
    for (const scheme of ['light', 'dark'] as const) {
      const background = styles.map((s) => property(s, `--shiki-${scheme}-bg`)).find((v) => v !== undefined);
      const colours = new Set(
        styles.map((s) => property(s, `--shiki-${scheme}`)).filter((v): v is string => v !== undefined),
      );
      out.push({ language, scheme, background: background ?? '', colours });
    }
  }
  return out;
};

describe('code blocks meet the AA contrast in both colour schemes', () => {
  it('uses one theme per colour scheme and no default colour (the CSS chooses the theme)', () => {
    expect(Object.keys(SHIKI_CONFIG.themes).sort()).toEqual(['dark', 'light']);
    expect(SHIKI_CONFIG.defaultColor).toBe(false);
  });

  it('highlights every sample (a guard over uncoloured text would prove nothing)', async () => {
    const thin = (await paint())
      .filter((p) => p.background === '' || p.colours.size < 3)
      .map((p) => `${p.language} (${p.scheme}): background "${p.background}", ${p.colours.size} colour(s)`);
    expect(thin).toEqual([]);
  });

  it('draws every token at 4.5:1 or more against the background of its theme', async () => {
    const failures: string[] = [];
    for (const { language, scheme, background, colours } of await paint()) {
      for (const colour of colours) {
        const ratio = new Color(background).contrast(new Color(colour), 'WCAG21');
        if (ratio < AA) failures.push(`${language} (${scheme}): ${colour} on ${background} is ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });
});
