/**
 * The agent hook .claude/hooks/tokens-on-edit.mjs, run as Claude Code runs it
 * (payload on stdin), inside a throw-away copy of the project layout whose
 * generator scripts are stubs: the test observes which scripts the hook runs
 * without touching the real tokens.css.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const HOOK = '.claude/hooks/tokens-on-edit.mjs';

const sandbox = realpathSync(mkdtempSync(path.join(tmpdir(), 'ft-hook-')));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

/** A project with the real hook, stub generator scripts and a tokens.json; plus a symlink to it. */
const project = path.join(sandbox, 'real');
const link = path.join(sandbox, 'link');
for (const dir of ['.claude/hooks', 'scripts', 'src/core/design'])
  mkdirSync(path.join(project, dir), { recursive: true });
copyFileSync(path.join(ROOT, HOOK), path.join(project, HOOK));
writeFileSync(path.join(project, 'scripts/tokens.ts'), "console.log('stub: tokens.css written');\n");
writeFileSync(path.join(project, 'scripts/verify-palette.ts'), "console.log('ok stub palette');\n");
writeFileSync(path.join(project, 'src/core/design/tokens.json'), '{}\n');
symlinkSync(project, link, 'dir');

const runHook = (via: string, payload: unknown): { readonly code: number | null; readonly out: string } => {
  const r = spawnSync(process.execPath, [path.join(via, HOOK)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe('tokens-on-edit hook', () => {
  it('regenerates and verifies when tokens.json is edited', () => {
    const r = runHook(project, {
      tool_input: { file_path: path.join(project, 'src/core/design/tokens.json') },
      cwd: project,
    });
    expect(r).toEqual({ code: 0, out: 'stub: tokens.css written\nPalette verified.\n' });
  });

  // Regression (review guardrails#5): Node runs the hook from its real path while the payload
  // spells paths through the symlink (macOS /tmp → /private/tmp, a symlinked ~/code).
  it.each([
    ['an absolute path through a symlink', path.join(link, 'src/core/design/tokens.json'), link],
    ['a relative path from a symlinked cwd', 'src/core/design/tokens.json', link],
  ])('also when the payload names it by %s', (_label, file, cwd) => {
    const r = runHook(link, { tool_input: { file_path: file }, cwd });
    expect(r).toEqual({ code: 0, out: 'stub: tokens.css written\nPalette verified.\n' });
  });

  it('ignores every other file and malformed payloads', () => {
    expect(
      runHook(link, { tool_input: { file_path: path.join(link, 'src/core/design/other.json') }, cwd: link }),
    ).toEqual({ code: 0, out: '' });
    expect(runHook(project, 'not an object')).toEqual({ code: 0, out: '' });
  });
});
