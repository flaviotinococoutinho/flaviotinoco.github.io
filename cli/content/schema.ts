/**
 * The content schema of the site, loaded outside Astro (shell).
 *
 * `ft lint` and `ft new` must accept exactly what the build accepts, so they
 * use the zod schemas of src/content.config.ts itself rather than a copy that
 * could drift. That module imports `defineCollection` from the virtual module
 * `astro:content`, which only exists inside Astro/Vite. Under plain Node a
 * module resolution hook (node:module registerHooks, Node ≥ 22.15) maps that
 * one specifier to a stub whose `defineCollection` is the identity — the
 * function Astro's own runtime uses at that point is also a pass-through of
 * the config object. Everything else (astro/zod, astro/loaders, the core
 * parsers) is the real code. Under Vitest the test files mock `astro:content`
 * with the same identity (vi.mock), since Vite resolves modules itself.
 */
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { MARKDOWN_COLLECTIONS, type MarkdownCollection } from '../project.ts';

export interface SchemaIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly code: string;
}

export type SchemaResult =
  | { readonly success: true; readonly data: unknown }
  | { readonly success: false; readonly issues: readonly SchemaIssue[] };

export interface ContentSchema {
  readonly parse: (frontmatter: unknown) => SchemaResult;
}

const STUB = `data:text/javascript,${encodeURIComponent('export const defineCollection = (config) => config;')}`;
let hooked = false;

const installAstroContentStub = (): void => {
  if (hooked) return;
  registerHooks({
    resolve: (specifier, context, nextResolve) =>
      specifier === 'astro:content' ? { url: STUB, shortCircuit: true } : nextResolve(specifier, context),
  });
  hooked = true;
};

interface ZodLike {
  readonly safeParse: (v: unknown) => {
    readonly success: boolean;
    readonly data?: unknown;
    readonly error?: { readonly issues: readonly { path: PropertyKey[]; message: string; code: string }[] };
  };
}

const isZodLike = (v: unknown): v is ZodLike =>
  typeof v === 'object' && v !== null && typeof (v as { safeParse?: unknown }).safeParse === 'function';

const wrap = (schema: ZodLike): ContentSchema => ({
  parse: (frontmatter) => {
    const r = schema.safeParse(frontmatter);
    if (r.success) return { success: true, data: r.data };
    return {
      success: false,
      issues: (r.error?.issues ?? []).map((i) => ({ path: [...i.path], message: i.message, code: i.code })),
    };
  },
});

let cache: Promise<Readonly<Record<MarkdownCollection, ContentSchema>>> | undefined;

/** The schema of every Markdown collection, from `<codeRoot>/src/content.config.ts` (loaded once). */
export const loadContentSchemas = (codeRoot: string): Promise<Readonly<Record<MarkdownCollection, ContentSchema>>> =>
  (cache ??= (async () => {
    installAstroContentStub();
    const url = pathToFileURL(join(codeRoot, 'src', 'content.config.ts')).href;
    const mod: unknown = await import(url);
    const collections =
      typeof mod === 'object' && mod !== null ? (mod as { collections?: unknown }).collections : undefined;
    const out: Partial<Record<MarkdownCollection, ContentSchema>> = {};
    for (const name of MARKDOWN_COLLECTIONS) {
      const entry =
        typeof collections === 'object' && collections !== null
          ? (collections as Record<string, unknown>)[name]
          : undefined;
      const schema = typeof entry === 'object' && entry !== null ? (entry as { schema?: unknown }).schema : undefined;
      if (!isZodLike(schema)) throw new Error(`src/content.config.ts: collection "${name}" has no zod schema`);
      out[name] = wrap(schema);
    }
    return out as Readonly<Record<MarkdownCollection, ContentSchema>>;
  })());
