import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  DEFAULT_BASE_PATH,
  DEFAULT_SITE,
  distTargetOf,
  normaliseBase,
  pageUrlOf,
  siteCoordinates,
} from '../../../scripts/lib/site.ts';

const segment = fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,11}$/);
const baseArb = fc.oneof(fc.constant('/'), segment.map((s) => `/${s}/`));
const dirPath = fc.array(segment, { maxLength: 4 }).map((parts) => parts.map((p) => `${p}/`).join(''));

describe('site coordinates', () => {
  it('defaults to the production project site (base-path bugs surface locally)', () => {
    expect(siteCoordinates({})).toEqual({ origin: DEFAULT_SITE, base: `${DEFAULT_BASE_PATH}/` });
  });

  it('reads SITE and BASE_PATH as actions/configure-pages emits them', () => {
    expect(siteCoordinates({ SITE: 'https://x.dev/', BASE_PATH: '' })).toEqual({ origin: 'https://x.dev', base: '/' });
    expect(siteCoordinates({ SITE: 'https://o.github.io', BASE_PATH: '/repo' })).toEqual({
      origin: 'https://o.github.io',
      base: '/repo/',
    });
  });

  test.prop([fc.string({ maxLength: 30 })])('normaliseBase is idempotent and slash-delimited', (raw) => {
    const once = normaliseBase(raw);
    expect(normaliseBase(once)).toBe(once);
    expect(once.startsWith('/')).toBe(true);
    expect(once.endsWith('/')).toBe(true);
  });
});

describe('dist mapping', () => {
  it('maps directory URLs to index.html and files to themselves', () => {
    expect(distTargetOf('/b/pt/', '/b/')).toEqual({ kind: 'file', path: 'pt/index.html' });
    expect(distTargetOf('/b/', '/b/')).toEqual({ kind: 'file', path: 'index.html' });
    expect(distTargetOf('/b/_astro/a.css', '/b/')).toEqual({ kind: 'file', path: '_astro/a.css' });
    expect(distTargetOf('/b/img/a%20b.svg', '/b/')).toEqual({ kind: 'file', path: 'img/a b.svg' });
    expect(distTargetOf('/b/pt/ensa%C3%A7o/', '/b/')).toEqual({ kind: 'file', path: 'pt/ensaço/index.html' });
  });

  it('reports links that escape the base path or lack the trailing slash', () => {
    expect(distTargetOf('/pt/', '/b/')).toEqual({ kind: 'outside-base', base: '/b/' });
    expect(distTargetOf('/b/pt', '/b/')).toEqual({ kind: 'missing-trailing-slash', candidate: 'pt/index.html' });
    expect(distTargetOf('/b', '/b/')).toEqual({ kind: 'missing-trailing-slash', candidate: 'index.html' });
  });

  it('keeps malformed percent-escapes verbatim instead of throwing', () => {
    expect(distTargetOf('/b/100%/', '/b/')).toEqual({ kind: 'file', path: '100%/index.html' });
  });

  test.prop([baseArb, dirPath])('pageUrlOf and distTargetOf are inverse on directory pages', (base, dir) => {
    const coords = { origin: 'https://example.test', base };
    const file = `${dir}index.html`;
    expect(distTargetOf(pageUrlOf(file, coords).pathname, base)).toEqual({ kind: 'file', path: file });
  });

  test.prop([baseArb, dirPath, segment])('pageUrlOf and distTargetOf are inverse on files', (base, dir, name) => {
    const coords = { origin: 'https://example.test', base };
    const file = `${dir}${name}.css`;
    expect(distTargetOf(pageUrlOf(file, coords).pathname, base)).toEqual({ kind: 'file', path: file });
  });
});
