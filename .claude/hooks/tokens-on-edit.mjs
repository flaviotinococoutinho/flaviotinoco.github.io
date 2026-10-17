// @ts-check
/**
 * PostToolUse hook (matcher Edit|Write): keeps the generated stylesheet in step
 * with its single source of truth.
 *
 * Reads the hook payload (JSON on stdin) and acts ONLY when the edited file is
 * src/core/design/tokens.json: regenerates src/styles/tokens.css
 * (`node scripts/tokens.ts`) and re-verifies the palette
 * (`node scripts/verify-palette.ts`). Any other path is a no-op.
 *
 * Exit codes follow the Claude Code hook contract: 0 = done (stdout is shown in
 * the transcript); 2 = the edit is kept but stderr is fed back to Claude, so a
 * token edit that breaks generation or the palette checks is fixed right away.
 *
 * Plain JavaScript on purpose: .claude/ is outside the TypeScript project, and
 * the hook itself needs no type stripping. The scripts it runs do
 * (`node scripts/tokens.ts`): type stripping is on by default from Node 22.18,
 * the minimum in package.json `engines` (24 recommended, see .nvmrc).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A path with every symbolic link resolved. Node starts this module from its real
 * path, so ROOT is canonical, while the payload's file_path and cwd come as the
 * session sees them (macOS /tmp → /private/tmp, a symlinked ~/code): comparing
 * the spellings would silently skip the regeneration. A file that does not exist
 * resolves through its directory.
 * @param {string} file
 * @returns {string}
 */
const canonical = (file) => {
  try {
    return fs.realpathSync.native(file);
  } catch {
    try {
      return path.join(fs.realpathSync.native(path.dirname(file)), path.basename(file));
    } catch {
      return path.resolve(file);
    }
  }
};

const ROOT = canonical(path.resolve(import.meta.dirname, '..', '..'));
const SOURCE = canonical(path.join(ROOT, 'src', 'core', 'design', 'tokens.json'));

/** @returns {Promise<string>} */
const readStdin = async () => {
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  return Buffer.concat(chunks).toString('utf8');
};

/**
 * The edited file of an Edit/Write payload, resolved against the session's cwd.
 * @param {string} raw
 * @returns {string | undefined}
 */
const editedFile = (raw) => {
  /** @type {unknown} */
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof payload !== 'object' || payload === null) return undefined;
  const { tool_input: input, cwd } = /** @type {{ tool_input?: unknown, cwd?: unknown }} */ (payload);
  if (typeof input !== 'object' || input === null) return undefined;
  const file = /** @type {{ file_path?: unknown }} */ (input).file_path;
  if (typeof file !== 'string' || file === '') return undefined;
  return path.resolve(typeof cwd === 'string' ? cwd : ROOT, file);
};

/**
 * Runs a repository script with the current Node.
 * @param {string} script
 * @returns {{ ok: boolean, output: string }}
 */
const run = (script) => {
  const r = spawnSync(process.execPath, [path.join('scripts', script)], { cwd: ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, output: `${r.stdout}${r.stderr}`.trim() };
};

const file = editedFile(await readStdin());
if (file === undefined || canonical(file) !== SOURCE) process.exit(0);

const tokens = run('tokens.ts');
if (!tokens.ok) {
  console.error(`tokens.json was edited but src/styles/tokens.css could not be regenerated:\n${tokens.output}`);
  process.exit(2);
}
const palette = run('verify-palette.ts');
if (!palette.ok) {
  const failures = palette.output
    .split('\n')
    .filter((line) => !line.startsWith('ok '))
    .join('\n');
  console.error(`src/styles/tokens.css was regenerated, but the palette no longer verifies:\n${failures}`);
  process.exit(2);
}
console.log(`${tokens.output}\nPalette verified.`);
