/**
 * Line numbers relative to the file on disk.
 *
 * Content collections hand the processor the body only (frontmatter removed),
 * so vfile positions count lines from the first body line; an author opening
 * the file needs the line in the file. The offset is the number of lines that
 * precede the body in the raw file. When the body is not a verbatim slice of
 * the file (pages whose frontmatter Astro blanks out in place, tests without
 * a file on disk), the offset is 0 and positions are already file positions.
 */
import { readFileSync } from 'node:fs';
import type { VFile } from 'vfile';

/** Lines before `body` in `raw`; 0 when `body` is not a slice of `raw`. */
export const lineOffset = (raw: string, body: string): number => {
  if (body.length === 0) return 0;
  const at = raw.lastIndexOf(body);
  if (at <= 0) return 0;
  let lines = 0;
  for (let i = 0; i < at; i += 1) if (raw.charCodeAt(i) === 10) lines += 1;
  return lines;
};

// Per vfile: in dev the same path is re-rendered after edits that can move the body.
const cache = new WeakMap<VFile, number>();

const readOffset = (path: string, body: string): number => {
  try {
    return lineOffset(readFileSync(path, 'utf8'), body);
  } catch {
    return 0;
  }
};

export const fileLineOffset = (file: VFile): number => {
  const path = file.path;
  if (path === undefined || path === '') return 0;
  const hit = cache.get(file);
  if (hit !== undefined) return hit;
  const offset = readOffset(path, String(file.value));
  cache.set(file, offset);
  return offset;
};

/** "line:column" in file coordinates, or "0:0" when the message has no place. */
export const fileLineColumn = (file: VFile, line: number | undefined, column: number | undefined): string =>
  line === undefined ? '0:0' : `${String(line + fileLineOffset(file))}:${String(column ?? 0)}`;
