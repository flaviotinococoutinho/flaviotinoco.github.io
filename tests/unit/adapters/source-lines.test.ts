import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VFile } from 'vfile';
import { fileLineColumn, lineOffset } from '../../../src/adapters/unified/source-lines.ts';

describe('file line offset', () => {
  const raw = '---\ntitle: T\nlang: pt-BR\n---\n\n# Título\n\nTexto.\n';

  it('counts the lines that precede the body in the file', () => {
    expect(lineOffset(raw, '# Título\n\nTexto.\n')).toBe(5);
    expect(lineOffset(raw, '\n# Título\n\nTexto.\n')).toBe(4);
  });

  it('is 0 when the body is the whole file or not a slice of it', () => {
    expect(lineOffset(raw, raw)).toBe(0);
    expect(lineOffset(raw, 'outro texto')).toBe(0);
    expect(lineOffset(raw, '')).toBe(0);
  });

  it('shifts vfile lines into file coordinates', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ft-lines-'));
    const path = join(dir, 'entry.md');
    writeFileSync(path, raw);
    const file = new VFile({ path, value: '# Título\n\nTexto.\n' });
    expect(fileLineColumn(file, 3, 1)).toBe('8:1');
    expect(fileLineColumn(file, undefined, undefined)).toBe('0:0');
    expect(fileLineColumn(new VFile({ value: 'x' }), 2, 4)).toBe('2:4');
  });
});
