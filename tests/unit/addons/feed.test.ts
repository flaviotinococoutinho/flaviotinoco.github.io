/**
 * JSON Feed 1.1 (https://www.jsonfeed.org/version/1.1/): the builder's output is
 * checked by a structural validator written from the specification (required
 * members, types, RFC 3339 dates, unique ids, content_html or content_text).
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  escapeHtml,
  jsonFeed,
  JSON_FEED_VERSION,
  type FeedInput,
  type FeedItemInput,
} from '../../../src/core/addons/feed.ts';

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;

/** Problems of a value read as a JSON Feed 1.1 document (empty = valid). */
const validate = (feed: unknown): readonly string[] => {
  const p: string[] = [];
  if (typeof feed !== 'object' || feed === null) return ['not an object'];
  const f = feed as Record<string, unknown>;
  if (Object.keys(f)[0] !== 'version') p.push('version must come first');
  if (f['version'] !== 'https://jsonfeed.org/version/1.1') p.push('version');
  if (typeof f['title'] !== 'string') p.push('title');
  for (const k of ['home_page_url', 'feed_url', 'icon', 'favicon', 'description', 'language'])
    if (k in f && typeof f[k] !== 'string') p.push(k);
  if ('authors' in f) {
    if (!Array.isArray(f['authors'])) p.push('authors');
    else
      for (const a of f['authors'] as unknown[]) {
        const o = a as Record<string, unknown>;
        if (!['name', 'url', 'avatar'].some((k) => typeof o[k] === 'string')) p.push('author without fields');
      }
  }
  if (!Array.isArray(f['items'])) return [...p, 'items'];
  const ids = new Set<string>();
  for (const [i, raw] of (f['items'] as unknown[]).entries()) {
    const item = raw as Record<string, unknown>;
    const id = item['id'];
    if (typeof id !== 'string' || id === '') p.push(`items[${i}].id`);
    else if (ids.has(id)) p.push(`items[${i}].id duplicate`);
    else ids.add(id);
    if (typeof item['content_html'] !== 'string' && typeof item['content_text'] !== 'string')
      p.push(`items[${i}] content`);
    for (const k of ['url', 'title', 'summary', 'content_html', 'content_text', 'language'])
      if (k in item && typeof item[k] !== 'string') p.push(`items[${i}].${k}`);
    for (const k of ['date_published', 'date_modified'])
      if (k in item && !(typeof item[k] === 'string' && RFC3339.test(item[k]))) p.push(`items[${i}].${k}`);
    if (
      'tags' in item &&
      !(Array.isArray(item['tags']) && (item['tags'] as unknown[]).every((t) => typeof t === 'string'))
    )
      p.push(`items[${i}].tags`);
  }
  return p;
};

const item = (n: number, extra: Partial<FeedItemInput> = {}): FeedItemInput => ({
  url: `https://example.org/pt/ensaios/e${n}/`,
  title: `Ensaio ${n}`,
  summary: `Descrição ${n}.`,
  abstract: `Resumo ${n} <com> & "aspas".`,
  published: new Date(Date.UTC(2026, 0, n)),
  modified: new Date(Date.UTC(2026, 1, n)),
  tags: ['Ensaio', 'Formal'],
  language: 'pt-BR',
  ...extra,
});

const input = (items: readonly FeedItemInput[]): FeedInput => ({
  title: 'Flávio Tinoco',
  description: 'Ensaios e laboratórios.',
  homePageUrl: 'https://example.org/pt/',
  feedUrl: 'https://example.org/pt/feed.json',
  language: 'pt-BR',
  authors: [{ name: 'Flávio Tinoco', url: 'https://example.org/pt/sobre/' }],
  items,
});

describe('JSON Feed 1.1', () => {
  it('is a valid feed whose JSON text round-trips', () => {
    const feed = jsonFeed(input([item(1), item(2)]));
    expect(validate(feed)).toEqual([]);
    expect(validate(JSON.parse(JSON.stringify(feed)))).toEqual([]);
    expect(feed.version).toBe(JSON_FEED_VERSION);
  });

  it('lists the newest first, with url as id and the abstract (escaped) as the only content', () => {
    const feed = jsonFeed(input([item(1), item(3), item(2)]));
    expect(feed.items.map((i) => i.title)).toEqual(['Ensaio 3', 'Ensaio 2', 'Ensaio 1']);
    const first = feed.items[0];
    expect(first?.id).toBe(first?.url);
    expect(first?.content_html).toBe('<p>Resumo 3 &lt;com&gt; &amp; &quot;aspas&quot;.</p>');
    expect(first?.date_published).toBe('2026-01-03T00:00:00.000Z');
    expect(first?.summary).toBe('Descrição 3.');
  });

  it('falls back to the summary when there is no abstract', () => {
    const { abstract: _omit, ...noAbstract } = item(4);
    expect(jsonFeed(input([noAbstract])).items[0]?.content_html).toBe('<p>Descrição 4.</p>');
  });

  test.prop([fc.uniqueArray(fc.integer({ min: 1, max: 28 }), { maxLength: 12 })])(
    'is valid and ordered for any set of items, independently of input order',
    (days) => {
      const items = days.map((d) => item(d));
      const a = jsonFeed(input(items));
      const b = jsonFeed(input([...items].reverse()));
      expect(validate(a)).toEqual([]);
      expect(a).toEqual(b);
    },
  );

  test.prop([fc.string()])('escapeHtml leaves no markup characters', (s) => {
    expect(escapeHtml(s)).not.toMatch(/[<>"]|&(?!amp;|lt;|gt;|quot;)/u);
  });

  it('the validator itself rejects broken feeds', () => {
    expect(validate({ title: 'x', items: [] })).toContain('version must come first');
    expect(
      validate({ version: JSON_FEED_VERSION, title: 'x', items: [{ id: 'a' }, { id: 'a', content_text: '' }] }),
    ).toEqual(['items[0] content', 'items[1].id duplicate']);
  });
});
