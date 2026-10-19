import { defineConfig, envField, passthroughImageService } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { loadPipelineContext } from './src/adapters/unified/context.ts';
import { createPipeline } from './src/adapters/unified/pipeline.ts';
import { FONT_FAMILIES } from './src/adapters/astro/fonts.ts';

/**
 * Deployment coordinates.
 *
 * The repository `flaviotinococoutinho/flaviotinoco.github.io` is a *project*
 * site (the owner is not `flaviotinoco`), so GitHub Pages serves it under
 * `/flaviotinoco.github.io/`. CI passes the authoritative values from
 * `actions/configure-pages` (SITE = origin, BASE_PATH = base_path), which also
 * covers a future custom domain or a rename to `<owner>.github.io` (empty base).
 * Local builds default to production values so base-path bugs surface early.
 */
const SITE = process.env['SITE'] ?? 'https://flaviotinococoutinho.github.io';
const BASE_PATH = process.env['BASE_PATH'] ?? '/flaviotinoco.github.io';
const base = BASE_PATH === '' ? '/' : BASE_PATH;
const baseWithSlash = base.endsWith('/') ? base : `${base}/`;

const pipeline = createPipeline(await loadPipelineContext(new URL('./', import.meta.url), baseWithSlash));

export default defineConfig({
  site: SITE,
  base,
  trailingSlash: 'always',
  env: {
    schema: {
      /**
       * Search-engine indexing (ADR 0008). Off until launch: every page carries
       * <meta name="robots" content="noindex, nofollow">; `pnpm check:robots`
       * verifies dist/ against the same switch (scripts/lib/robots.ts).
       */
      SITE_INDEXING: envField.boolean({ context: 'server', access: 'public', default: false }),
    },
  },
  build: {
    format: 'directory',
    // Component styles inside Markdown-rendered pages must be external to be covered by the CSP.
    inlineStylesheets: 'never',
  },
  // Astro 7 defaults to 'jsx' whitespace semantics, which deletes the space between
  // adjacent inline elements ("<em>a</em> <b>b</b>" → "ab"): silent text loss. Keep HTML semantics.
  compressHTML: true,
  i18n: {
    locales: [{ path: 'pt', codes: ['pt-BR', 'pt'] }, 'en'],
    defaultLocale: 'pt',
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  markdown: {
    processor: unified({
      remarkPlugins: [...pipeline.remarkPlugins],
      rehypePlugins: [...pipeline.rehypePlugins],
      gfm: true,
      smartypants: true,
    }),
    syntaxHighlight: { type: 'shiki', excludeLangs: ['math'] },
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
  },
  fonts: FONT_FAMILIES,
  // Content images are authored as optimised SVG/WebP; no raster pipeline (and no native sharp dependency).
  image: { service: passthroughImageService() },
  security: {
    csp: {
      // 'wasm-unsafe-eval' is required to compile WebAssembly; it does not enable JS eval.
      scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'"] },
      // KaTeX and Shiki position glyphs with style="" attributes.
      styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }] },
    },
  },
  integrations: [
    sitemap({
      filter: (page) => page !== `${SITE}${baseWithSlash}`,
      i18n: { defaultLocale: 'pt', locales: { pt: 'pt-BR', en: 'en' } },
    }),
  ],
  vite: {
    build: { assetsInlineLimit: 0 },
  },
});
