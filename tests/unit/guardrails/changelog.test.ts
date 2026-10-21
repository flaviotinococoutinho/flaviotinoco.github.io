/**
 * Versioning guardrails (ADR 0010): package.json and wasm/Cargo.toml carry the
 * same version; CHANGELOG.md has a dated section for every released version
 * (the current one included) and an "unreleased" section first; and the pure
 * release-notes helper behind scripts/release-notes.ts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  changelogSections,
  releaseNotes,
  releasedVersions,
  SEMVER,
  versionOfTag,
} from '../../../scripts/lib/changelog.ts';

const read = (file: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), 'utf8');

const SAMPLE = [
  '# Registro de mudanças',
  '',
  'Intro.',
  '',
  '## [Não lançado]',
  '',
  '### Adicionado',
  '',
  '- Algo novo.',
  '',
  '## [0.2.0] - 2026-10-19',
  '',
  '### Adicionado',
  '',
  '- Ontologia.',
  '- Laboratórios.',
  '',
  '## [0.1.0] - 2026-10-11',
  '',
  '- Primeira versão.',
  '',
  '[Não lançado]: https://example.test/compare/v0.2.0...HEAD',
  '[0.2.0]: https://example.test/compare/v0.1.0...v0.2.0',
  '[0.1.0]: https://example.test/tree/v0.1.0',
  '',
].join('\n');

describe('changelog sections', () => {
  it('splits the file by release headings, dropping the link references', () => {
    const sections = changelogSections(SAMPLE);
    expect(sections.map((s) => [s.name, s.date])).toEqual([
      ['Não lançado', undefined],
      ['0.2.0', '2026-10-19'],
      ['0.1.0', '2026-10-11'],
    ]);
    expect(sections[2]?.body).toBe('- Primeira versão.');
    expect(sections[1]?.body).toBe('### Adicionado\n\n- Ontologia.\n- Laboratórios.');
  });

  it('lists the released versions in file order', () => {
    expect(releasedVersions(SAMPLE)).toEqual(['0.2.0', '0.1.0']);
    expect(releasedVersions('nothing here')).toEqual([]);
  });

  it('handles CRLF line endings and a file without headings', () => {
    expect(changelogSections(SAMPLE.replace(/\n/g, '\r\n')).map((s) => s.name)).toEqual([
      'Não lançado',
      '0.2.0',
      '0.1.0',
    ]);
    expect(changelogSections('')).toEqual([]);
  });
});

describe('release notes', () => {
  it('returns the body of a dated, non-empty section', () => {
    expect(releaseNotes(SAMPLE, '0.2.0')).toEqual({
      ok: true,
      value: '### Adicionado\n\n- Ontologia.\n- Laboratórios.',
    });
  });

  it('refuses a missing, undated or empty section', () => {
    expect(releaseNotes(SAMPLE, '9.9.9').ok).toBe(false);
    expect(releaseNotes('## [1.0.0]\n\n- x\n', '1.0.0')).toEqual({
      ok: false,
      error: 'CHANGELOG.md: section [1.0.0] has no release date',
    });
    expect(releaseNotes('## [1.0.0] - 2026-01-01\n\n\n## [0.9.0] - 2025-12-01\n- y\n', '1.0.0')).toEqual({
      ok: false,
      error: 'CHANGELOG.md: section [1.0.0] is empty',
    });
  });

  it('reads the version of a tag, with or without the v', () => {
    expect(versionOfTag('v1.2.3')).toEqual({ ok: true, value: '1.2.3' });
    expect(versionOfTag('1.2.3-rc.1')).toEqual({ ok: true, value: '1.2.3-rc.1' });
    expect(versionOfTag('v1.2').ok).toBe(false);
    expect(versionOfTag('latest').ok).toBe(false);
    expect(SEMVER.test('01.0.0')).toBe(false);
  });
});

describe('the repository', () => {
  const pkg = (JSON.parse(read('package.json')) as { readonly version: string }).version;
  const cargo = /^version\s*=\s*"([^"]+)"/m.exec(read('wasm/Cargo.toml'))?.[1];
  const changelog = read('CHANGELOG.md');

  it('carries one semantic version in package.json and wasm/Cargo.toml', () => {
    expect(pkg).toMatch(SEMVER);
    expect(cargo).toBe(pkg);
  });

  it('has an unreleased section first and a dated section for the current version', () => {
    const sections = changelogSections(changelog);
    expect(sections[0]?.name).toBe('Não lançado');
    expect(releasedVersions(changelog)).toContain(pkg);
    expect(releaseNotes(changelog, pkg).ok).toBe(true);
  });

  it('dates every released section and orders them newest first', () => {
    const released = changelogSections(changelog).filter((s) => SEMVER.test(s.name));
    for (const s of released) expect(s.date, s.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = released.map((s) => s.date ?? '');
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
