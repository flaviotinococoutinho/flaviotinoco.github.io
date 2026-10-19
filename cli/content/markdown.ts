/**
 * The site's Markdown processor, run without building the site (shell).
 *
 * Same chain as `astro build` renders a content entry with
 * (astro.config.ts → markdown.processor): @astrojs/markdown-remark's
 * createMarkdownProcessor with GFM and SmartyPants, then EVERY stage of
 * src/adapters/unified/pipeline.ts in its production order, with the real
 * build context (lexicons, bibliography, concepts) loaded by
 * loadPipelineContext from the project root. Syntax highlighting is off: it
 * changes no text and reports nothing.
 *
 * Two capture plugins bracket the stages: the first records the VFile the
 * processor creates (so its messages are available even when a stage fails),
 * the last records the final mdast (input of the unknown-word discovery).
 * They are keyed by the frontmatter object handed to `render`, which Astro
 * places, by reference, at file.data.astro.frontmatter.
 *
 * Console: the integrity stage prints non-fatal messages as `[content-lint]`
 * lines and Astro prints the error of a failed render; `ft` reports both from
 * the VFile, so while rendering the console is captured and only unrelated
 * lines are forwarded (see REQUESTED SHARED CHANGES: a reporter option on
 * remarkIntegrity would make the capture unnecessary).
 */
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import type { Root } from 'mdast';
import { pathToFileURL } from 'node:url';
import type { VFile } from 'vfile';
import { loadPipelineContext, type PipelineContext } from '../../src/adapters/unified/context.ts';
import { createPipeline } from '../../src/adapters/unified/pipeline.ts';
import type { ContentDocument } from './document.ts';

export interface StageMessage {
  /** File coordinates (0:0 when the stage gave no place, as in the build log). */
  readonly line: number;
  readonly column: number;
  /** `source:ruleId`, exactly as in the build's `[content-lint]` lines. */
  readonly rule: string;
  readonly reason: string;
  readonly fatal: boolean;
}

export interface RenderOutcome {
  /** Non-fatal messages (the build's [content-lint] lines) and fatal ones (build errors). */
  readonly messages: readonly StageMessage[];
  /** The mdast after the last remark stage; undefined when a stage failed. */
  readonly tree: Root | undefined;
}

export interface SiteRenderer {
  readonly context: PipelineContext;
  readonly render: (doc: ContentDocument) => Promise<RenderOutcome>;
}

interface Capture {
  file?: VFile;
  tree?: Root;
}

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';

/**
 * Runs `task` with the console redirected: `keep(args)` decides which calls are
 * forwarded to `forward` (as one line); the console is restored afterwards.
 */
export const withConsole = async <T>(
  task: () => Promise<T>,
  keep: (args: readonly unknown[]) => boolean,
  forward: (line: string) => void,
): Promise<T> => {
  const methods: readonly ConsoleMethod[] = ['log', 'info', 'warn', 'error'];
  const saved = methods.map((m) => [m, console[m]] as const);
  const sink = (...args: unknown[]): void => {
    if (keep(args)) forward(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
  };
  for (const m of methods) console[m] = sink;
  try {
    return await task();
  } finally {
    for (const [m, f] of saved) console[m] = f;
  }
};

const isContentLint = (args: readonly unknown[]): boolean =>
  typeof args[0] === 'string' && args[0].startsWith('[content-lint]');

const ruleOf = (m: { readonly source?: string | null; readonly ruleId?: string | null }): string =>
  [m.source, m.ruleId].filter((x): x is string => typeof x === 'string' && x !== '').join(':');

const toMessage = (
  m: {
    readonly line?: number | null;
    readonly column?: number | null;
    readonly reason: string;
    readonly fatal?: boolean | null;
    readonly source?: string | null;
    readonly ruleId?: string | null;
  },
  offset: number,
): StageMessage => ({
  line: typeof m.line === 'number' ? m.line + offset : 0,
  column: typeof m.column === 'number' ? m.column : 0,
  rule: ruleOf(m),
  reason: m.reason,
  fatal: m.fatal === true,
});

/** Base path used by the stages for links (the production default of astro.config.ts). */
const BASE = '/flaviotinoco.github.io/';

export const createSiteRenderer = async (root: string, forward: (line: string) => void): Promise<SiteRenderer> => {
  const rootUrl = pathToFileURL(root.endsWith('/') ? root : `${root}/`);
  const context = await withConsole(
    () => loadPipelineContext(rootUrl, BASE),
    () => true,
    forward,
  );
  // The frontmatter object identifies the render at the first stage; later stages
  // (meta) replace file.data.astro.frontmatter, so the VFile identifies it afterwards.
  const byFrontmatter = new WeakMap<object, Capture>();
  const byFile = new WeakMap<VFile, Capture>();
  const start = () => (_tree: Root, file: VFile) => {
    const fm = file.data.astro?.frontmatter;
    const c = typeof fm === 'object' ? byFrontmatter.get(fm) : undefined;
    if (c === undefined) return;
    c.file = file;
    byFile.set(file, c);
  };
  const end = () => (tree: Root, file: VFile) => {
    const c = byFile.get(file);
    if (c !== undefined) c.tree = tree;
  };
  const pipeline = createPipeline(context);
  const processor = await createMarkdownProcessor({
    remarkPlugins: [start, ...pipeline.remarkPlugins, end],
    rehypePlugins: [...pipeline.rehypePlugins],
    syntaxHighlight: false,
    gfm: true,
    smartypants: true,
  });

  const render = async (doc: ContentDocument): Promise<RenderOutcome> => {
    const frontmatter: Record<string, unknown> = { ...doc.frontmatter };
    const capture: Capture = {};
    byFrontmatter.set(frontmatter, capture);
    let thrown: unknown;
    await withConsole(
      async () => {
        try {
          await processor.render(doc.body, { frontmatter, fileURL: pathToFileURL(doc.path) });
        } catch (e: unknown) {
          thrown = e;
        }
      },
      // Astro prints the error of a failed render (console.error(err)) before rethrowing it.
      (args) => !isContentLint(args) && !(args[0] instanceof Error),
      forward,
    );
    const all = capture.file?.messages ?? [];
    const fatal = all.filter((m) => m.fatal === true);
    // A stage that lists every error in one final file.fail (reading) also marked each
    // error fatal: report the individual errors, not the summary that repeats them.
    const summary = fatal.length > 1 ? fatal[fatal.length - 1] : undefined;
    const messages = all.filter((m) => m !== summary).map((m) => toMessage(m, doc.bodyLineOffset));
    if (thrown !== undefined && fatal.length === 0) {
      const reason = thrown instanceof Error ? thrown.message.replace(/^Failed to parse Markdown file "[^"]*":\n/, '') : String(thrown);
      messages.push({ line: 0, column: 0, rule: 'markdown:render', reason, fatal: true });
    }
    return { messages, tree: thrown === undefined ? capture.tree : undefined };
  };

  return { context, render };
};
