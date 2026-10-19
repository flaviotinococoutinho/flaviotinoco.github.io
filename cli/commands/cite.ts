/**
 * ft cite <key…> [--style abnt|apa] [--narrative] [--locator 'p. 12'] [--format text|html|bibtex]
 *
 * Formats, from bibliography/*.bib, the citation call(s) and the reference
 * list entries of the given keys, with the citation engine of the site
 * (src/core/bibliography: buildReferenceList, renderCitation, the ABNT and APA
 * styles) — the same text the citation stage puts in a page. Several keys make
 * one parenthetical call "(A, 1990; B, 1991)" (or one narrative call per key);
 * year letters are assigned among the cited works, as in a document that cites
 * only them. Default style: abnt (pt-BR), or apa when the message language is en.
 */
import { buildReferenceList, renderCitation, type CiteRef } from '../../src/core/bibliography/cite/engine.ts';
import { parseSuffix } from '../../src/core/bibliography/cite/locator.ts';
import { abnt, apa, toBibtex, toHtml, type CitationStyle, type Inline, type Reference } from '../../src/core/bibliography/index.ts';
import type { CitationKey } from '../../src/core/domain/identifiers.ts';
import { bool, openSession, parseCommand, str } from '../args.ts';
import { EXIT_FAILURE, EXIT_OK, type ExitCode, type Io } from '../io.ts';
import { loadBibliographySources } from '../sources.ts';
import type { Style } from '../term.ts';
import { usageError } from './shared.ts';

export const OPTIONS = {
  style: { type: 'string' },
  narrative: { type: 'boolean' },
  locator: { type: 'string' },
  format: { type: 'string' },
} as const;

const STYLES: Readonly<Record<'abnt' | 'apa', CitationStyle>> = { abnt, apa };

/** Terminal interpretation of the formatters' inline tree: the ABNT destaque (title) in bold, italics in italic. */
export const toTerminal = (nodes: readonly Inline[], s: Style): string =>
  nodes
    .map((n): string => {
      switch (n.kind) {
        case 'text':
          return n.value;
        case 'title':
          return s.bold(toTerminal(n.children, s));
        case 'italic':
          return s.italic(toTerminal(n.children, s));
        case 'lang':
        case 'link':
        case 'time':
          return toTerminal(n.children, s);
      }
    })
    .join('');

/** Levenshtein distance (dynamic programming), for "did you mean" suggestions. */
const distance = (a: string, b: string): number => {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j] ?? 0;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
};

export const suggestKeys = (key: string, keys: readonly string[], n = 3): readonly string[] =>
  keys
    .map((k) => ({ k, d: distance(key.toLowerCase(), k.toLowerCase()) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(key.length / 3)))
    .sort((x, y) => x.d - y.d || (x.k < y.k ? -1 : 1))
    .slice(0, n)
    .map((x) => x.k);

export const run = async (args: readonly string[], io: Io): Promise<ExitCode> => {
  const parsed = parseCommand(args, OPTIONS);
  if (!parsed.ok) return usageError(io, 'cite', parsed.error, args);
  const { values, positionals } = parsed.value;
  const session = openSession(io, values);
  const { t } = session;
  if (positionals.length === 0) return usageError(io, 'cite', t('cite.noKeys'), session);
  const styleName = str(values, 'style') ?? (session.locale === 'en' ? 'apa' : 'abnt');
  if (styleName !== 'abnt' && styleName !== 'apa') {
    return usageError(io, 'cite', t('cite.style', { value: styleName }), session);
  }
  const format = str(values, 'format') ?? 'text';
  if (format !== 'text' && format !== 'html' && format !== 'bibtex') {
    return usageError(io, 'cite', t('error.format', { format }), session);
  }
  const locatorRaw = str(values, 'locator');
  if (locatorRaw !== undefined && positionals.length > 1) {
    return usageError(io, 'cite', t('cite.locatorOne'), session);
  }

  const loaded = await loadBibliographySources(session.root, io.fs);
  if (!loaded.ok) {
    for (const line of loaded.error) session.warn(line);
    return EXIT_FAILURE;
  }
  const { index } = loaded.value;
  const refs: Reference[] = [];
  let missing = false;
  for (const key of positionals) {
    const ref = index.get(key);
    if (ref === undefined) {
      missing = true;
      const near = suggestKeys(key, index.keys);
      session.warn(
        session.errStyle.red(
          near.length === 0 ? t('cite.unknown', { key }) : t('cite.unknownNear', { key, near: near.join(', ') }),
        ),
      );
    } else refs.push(ref);
  }
  if (missing) return EXIT_FAILURE;

  if (format === 'bibtex') {
    io.stdout.write(`${refs.map(toBibtex).join('\n')}\n`);
    return EXIT_OK;
  }
  const style = STYLES[styleName];
  const list = buildReferenceList(refs, style);
  const ctx = {
    style,
    letterOf: list.letterOf,
    href: (key: CitationKey) => `#ref-${key}`,
    anchorId: () => undefined,
  };
  const located = locatorRaw === undefined ? undefined : parseSuffix(locatorRaw, { bare: true });
  const item = (reference: Reference): CiteRef => ({
    reference,
    prefix: '',
    suppressAuthor: false,
    ...(located?.locator === undefined ? {} : { locator: located.locator }),
    suffix: located?.rest.trim() ?? '',
  });
  const render = (nodes: readonly Inline[]): string => (format === 'html' ? toHtml(nodes) : toTerminal(nodes, session.out));
  const calls = bool(values, 'narrative')
    ? refs.map((r) => renderCitation('narrative', [item(r)], ctx))
    : [renderCitation('parenthetical', refs.map(item), ctx)];
  session.print(session.out.dim(t('cite.citation', { style: styleName })));
  for (const call of calls) session.print(render(call));
  session.print();
  session.print(session.out.dim(t('cite.references')));
  for (const entry of list.entries) session.print(render(entry.content));
  return EXIT_OK;
};
