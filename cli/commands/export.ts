/**
 * ft export tex <file.md> [-o <out.tex>]
 *
 * LaTeX export through src/core/latex/export.ts: the input is the mdast the
 * site's latex stage receives (Astro's parse with GFM and SmartyPants, then
 * remark-math without single-dollar math and remark-directive — captured from
 * @astrojs/markdown-remark's processor exactly as tests/unit/latex/helpers.ts
 * does), the metadata comes from the frontmatter (author: the site author),
 * and biblatex uses biblatex-abnt (`style=abnt`) for pt-BR and biblatex-apa for
 * en. Every bibliography/*.bib is copied next to the .tex and named in
 * \addbibresource. Default output: .cache/tex/<name>/<name>.tex.
 * Warnings (what print cannot represent) go to stderr with file coordinates.
 */
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import type { Root } from 'mdast';
import { basename, dirname, join, resolve } from 'node:path';
import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import type { VFile } from 'vfile';
import { SITE_AUTHOR } from '../../src/core/bibliography/index.ts';
import { exportLatex, parseExportMeta } from '../../src/core/latex/export.ts';
import { openSession, parseCommand, str } from '../args.ts';
import { readContentDocument } from '../content/document.ts';
import { withConsole } from '../content/markdown.ts';
import { EXIT_FAILURE, EXIT_OK, type ExitCode, type Io } from '../io.ts';
import { CACHE_DIR, display } from '../project.ts';
import { loadBibliographySources } from '../sources.ts';
import { usageError } from './shared.ts';

export const OPTIONS = { output: { type: 'string', short: 'o' } } as const;

type Processor = Awaited<ReturnType<typeof createMarkdownProcessor>>;
let processor: Promise<Processor> | undefined;
const captured = new WeakMap<object, Root>();

/** The tree the latex stage receives (see the module comment). */
export const latexInputTree = async (body: string, frontmatter: Readonly<Record<string, unknown>>): Promise<Root> => {
  const capture = () => (tree: Root, file: VFile) => {
    const fm = file.data.astro?.frontmatter;
    if (typeof fm === 'object') captured.set(fm, structuredClone(tree));
  };
  processor ??= createMarkdownProcessor({
    remarkPlugins: [[remarkMath, { singleDollarTextMath: false }], remarkDirective, capture],
    syntaxHighlight: false,
    gfm: true,
    smartypants: true,
  });
  const fm: Record<string, unknown> = { ...frontmatter };
  await (await processor).render(body, { frontmatter: fm });
  const tree = captured.get(fm);
  if (tree === undefined) throw new Error('the Markdown processor did not reach the capture plugin');
  return tree;
};

export const run = async (args: readonly string[], io: Io): Promise<ExitCode> => {
  const parsed = parseCommand(args, OPTIONS);
  if (!parsed.ok) return usageError(io, 'export', parsed.error, args);
  const { values, positionals } = parsed.value;
  const session = openSession(io, values);
  const { t } = session;
  const [format, input, ...rest] = positionals;
  if (format !== 'tex') return usageError(io, 'export', t('export.format', { value: format ?? '' }), session);
  if (input === undefined || rest.length > 0) return usageError(io, 'export', t('export.input'), session);

  const path = resolve(io.cwd, input);
  let raw: string;
  try {
    raw = await io.fs.readText(path);
  } catch (e: unknown) {
    session.warn(session.errStyle.red(t('lint.unreadable', { detail: e instanceof Error ? e.message : String(e) })));
    return EXIT_FAILURE;
  }
  const doc = readContentDocument(path, raw);
  if (!doc.ok) {
    session.warn(session.errStyle.red(`${display(session.root, path)}:${String(doc.error.line)}: ${doc.error.message}`));
    return EXIT_FAILURE;
  }
  const author = `${SITE_AUTHOR.given} ${SITE_AUTHOR.family}`;
  const meta = parseExportMeta({ author, ...doc.value.frontmatter });
  if (!meta.ok) {
    for (const m of meta.error) session.warn(session.errStyle.red(`${display(session.root, path)}: ${m}`));
    return EXIT_FAILURE;
  }
  const bib = await loadBibliographySources(session.root, io.fs);
  if (!bib.ok) {
    for (const line of bib.error) session.warn(line);
    return EXIT_FAILURE;
  }
  const name = basename(path, '.md');
  const out = resolve(io.cwd, str(values, 'output') ?? join(session.root, CACHE_DIR, 'tex', name, `${name}.tex`));
  const bibNames = bib.value.files.map((f) => basename(f));
  const tree = await withConsole(
    () => latexInputTree(doc.value.body, doc.value.frontmatter),
    () => true,
    session.warn,
  );
  const result = exportLatex(tree, meta.value, {
    source: doc.value.body,
    citationKeys: new Set(bib.value.index.keys),
    bibliography: bibNames,
  });
  await io.fs.writeText(out, result.tex);
  for (const file of bib.value.files) await io.fs.copy(file, join(dirname(out), basename(file)));
  for (const w of result.warnings) {
    const line = w.position === undefined ? 0 : w.position.start.line + doc.value.bodyLineOffset;
    const column = w.position?.start.column ?? 0;
    session.warn(
      session.errStyle.yellow(
        `${display(session.root, path)}:${String(line)}:${String(column)} ${t('severity.warning')} latex:export ${w.message}`,
      ),
    );
  }
  session.print(session.out.green(t('export.written', { path: display(session.root, out) })));
  for (const b of bibNames) session.print(t('export.bib', { path: display(session.root, join(dirname(out), b)) }));
  session.print(t('export.compile', { file: basename(out) }));
  return EXIT_OK;
};
