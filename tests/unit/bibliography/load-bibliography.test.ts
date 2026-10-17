import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadBibliography } from '../../../src/adapters/unified/load-bibliography.ts';
import catalog from '../../../src/core/i18n/catalogs/citations.ts';

const roots: string[] = [];
const project = (files: Readonly<Record<string, string>>): URL => {
  const root = mkdtempSync(join(tmpdir(), 'bib-'));
  roots.push(root);
  if (Object.keys(files).length > 0) mkdirSync(join(root, 'bibliography'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, 'bibliography', name), text);
  return pathToFileURL(`${root}/`);
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('loadBibliography (shell)', () => {
  it('reads every bibliography/*.bib (sorted) into one immutable index', async () => {
    const index = await loadBibliography(
      project({
        'b.bib': '@book{b2000, title={B}, year=2000}',
        'a.bib': '@book{a2000, title={A}, year=2000}',
        'notes.txt': 'ignored',
      }),
    );
    expect(index.keys).toEqual(['a2000', 'b2000']);
    expect(index.get('b2000')?.title.main.text).toBe('B');
    expect(Object.isFrozen(index)).toBe(true);
    expect(Object.isFrozen(index.keys)).toBe(true);
  });

  it('fails the build listing ALL errors of all files with file:line:column', async () => {
    const root = project({
      'a.bib': '@book{a, title={A}, year=2000, pubisher={x}}\n@book{bad, year=2000}',
      'b.bib': '@book{a, title={dup}, year=2001}\n@article{c, title = {unterminated',
    });
    await expect(loadBibliography(root)).rejects.toThrow(
      [
        'bibliography: 6 error(s) in a.bib, b.bib',
        'bibliography/a.bib:1:32: error: a: field "pubisher" is not supported on @book [model:unsupported-field]',
        'bibliography/a.bib:2:7: error: bad: @book requires "title" [model:missing-field]',
        'bibliography/b.bib:1:7: error: duplicate key "a" (first defined in bibliography/a.bib:1:7) [db:duplicate-key]',
        // The truncated entry is still converted, so its own problems are reported too.
        'bibliography/b.bib:2:10: error: c: a "year" or "date" is required [model:missing-field]',
        'bibliography/b.bib:2:10: error: c: @article requires "journal" [model:missing-field]',
        'bibliography/b.bib:2:21: error: unbalanced braces in field value [lex:unterminated-braces]',
      ].join('\n'),
    );
  });

  it('prints warnings once and returns the index', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const index = await loadBibliography(project({ 'a.bib': '@book{a2000, title={A \\weird b}, year=2000}' }));
    expect(index.size).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      'bibliography/a.bib:1:20: warning: a2000.title: unknown LaTeX command "\\weird" kept verbatim [latex:unknown-command]',
    );
  });

  it('returns an empty index when the project has no bibliography folder', async () => {
    expect((await loadBibliography(project({}))).size).toBe(0);
  });
});

describe('citations catalog', () => {
  it('has the same keys and placeholders in both locales', () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(catalog['pt-BR'])).toEqual(keys(catalog.en));
    expect(catalog['pt-BR']['references.backlink']).toContain('{label}');
    expect(catalog.en['references.backlink']).toContain('{label}');
  });
});
