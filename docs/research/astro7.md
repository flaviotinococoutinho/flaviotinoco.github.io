# Astro 7.3.8 verified research report (static, i18n, MDX site on GitHub Pages)

**How I checked:** I installed the packages in a throwaway probe directory, read the shipped `.d.ts` files and source, and read docs.astro.build pages via WebFetch (I did not query Context7). The final config builds cleanly and `astro check` reports 0 errors. Everything marked VERIFIED was confirmed by actually running `pnpm astro build`. `/home/user/flaviotinoco.github.io` was not touched.

- Probe directory: `/tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/astro7probe`
- Final config: `.../astro7probe/astro.config.mjs`
- Sätteri alternative config: `.../astro7probe/astro.satteri.config.mjs`
- Sätteri KaTeX plugin: `.../astro7probe/satteri-katex.mjs`

## Versions resolved (pnpm, 2026-10-11)

| Package | Version |
|---|---|
| astro | 7.3.8 (`engines.node >=22.12.0`; tested on Node 22.22.0) |
| vite | 8.3.4 (bundled with rolldown 1.2.13) |
| zod | 4.6.5 |
| shiki | 4.5.0 |
| compiler | `@astrojs/compiler-rs` (the Rust compiler) |
| @astrojs/mdx | 8.0.3 |
| @astrojs/sitemap | 3.7.4 |
| @astrojs/rss | 4.0.19 |
| @astrojs/markdown-remark | 7.3.2 (optional peer, not installed by default) |
| @astrojs/markdown-satteri | 0.4.3 |
| @astrojs/check | 0.9.10 |
| katex / remark-math / rehype-katex | 0.19.0 / 6.0.0 / 7.0.1 |

**TypeScript gotcha:** `pnpm add typescript` installs 7.0.2. `astro check` then refuses to run with: "does not currently support TypeScript 7.0 … install TypeScript 6". Pin `typescript@6` (6.0.3 works). The CLI also says `astro check` "will be deprecated", and that TS 7.1+ support is experimental via `@astrojs/ts-content-mapper`.

## 1. Config, `base` / `trailingSlash` and `BASE_URL` (VERIFIED)

- Use `defineConfig` from `astro/config`. `.cjs` and `.cts` config files were removed in v6.
- `build.format` accepts `'file' | 'directory' | 'preserve'` (default `'directory'`).
- `trailingSlash` accepts `'always' | 'never' | 'ignore'` (default `'ignore'`).

`BASE_URL` follows `trailingSlash`, not what you typed in `base`:

| base | trailingSlash | `BASE_URL` | `Astro.url.pathname` | `getRelativeLocaleUrl('pt-BR','essays/foo')` |
|---|---|---|---|---|
| `/probe` | always | `/probe/` | `/probe/pt/essays/foo/` | `/probe/pt/essays/foo/` |
| `/probe/` | never | `/probe` | `/probe/pt/essays/foo` | `/probe/pt/essays/foo` |
| `/probe` | ignore | `/probe` (no slash) | `/probe/pt/essays/foo/` | `/probe/pt/essays/foo/` |
| `/probe/` | ignore | `/probe/` | `/probe/pt/essays/foo/` | `/probe/pt/essays/foo/` |
| `/` | any | `/` | — | — |

- Asset URLs, font URLs and the i18n helpers all get the base prefix automatically.
- Watch out with `'ignore'`: if `base` has no trailing slash, `${BASE_URL}foo` produces `/probefoo`.
- For a user site (`<user>.github.io`), leave `base` out and use `trailingSlash: 'always'` with `format: 'directory'`.

## 2. i18n (VERIFIED)

```js
i18n: {
  locales: [{ path: 'pt', codes: ['pt-BR', 'pt'] }, 'en'],
  defaultLocale: 'pt',          // MUST be the path
  routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  // fallback: { en: 'pt' },    // keys and values must also be paths
},
```

- **`defaultLocale` and `fallback` must use the `path`, not a code.** `defaultLocale: 'pt-BR'` passes the TypeScript type but fails at runtime: "The default locale pt-BR is not present in the i18n.locales array". Putting `'pt'` in both `path` and `codes` satisfies both the type and the runtime check.
- **`Astro.currentLocale`** returns the first code: `'pt-BR'` on `/pt/...` and `'en'` on `/en/...`. This also works with dynamic `[lang]` routes and in endpoints (`context.currentLocale`).
- **Helpers in `astro:i18n` (all verified):**
  - `getRelativeLocaleUrl('pt-BR', 'essays/foo')` → `/pt/essays/foo/`
  - `getAbsoluteLocaleUrl('en', 'essays/foo')` → `https://site/en/essays/foo/`
  - `getRelativeLocaleUrlList()` → `['/pt/', '/en/']`
  - `getAbsoluteLocaleUrlList(path)`
  - `getPathByLocale('pt-BR')` → `'pt'`; `getLocaleByPath('pt')` → `'pt-BR'`
  - Also exported: `pathHasLocale`, `normalizeTheLocale`, `toCodes`, `toPaths`, `middleware`, `redirectToDefaultLocale`, `notFound`, `requestHasLocale`, `redirectToFallback`
- **Lowercasing gotcha:** with a plain `'pt-BR'` locale, the page is built at `/pt-BR/` but `getRelativeLocaleUrl('pt-BR','x')` returns `/pt-br/x/`, which 404s on case-sensitive GitHub Pages. Fix with `{ normalizeLocale: false }`, or use the `{path, codes}` form.
- **Root redirect behaviour:**
  - `redirectToDefaultLocale: true` requires `src/pages/index.astro`; without it you get `MissingIndexForInternationalization`. The page's content is replaced by a meta refresh with a **2-second delay** (it is treated as a 302).
  - In v6+, `redirectToDefaultLocale` defaults to false and is only allowed with `prefixDefaultLocale: true`.
  - Recommended: `redirects: { '/': '/pt/' }` with `redirectToDefaultLocale: false` and no `index.astro`. This gives a 0-second refresh and a canonical link.
- **A `[lang]` dynamic segment works alongside the i18n config.** `src/pages/[lang]/...` with `getStaticPaths` returning `lang: 'pt' | 'en'` built correctly, and the static `src/pages/pt/sobre.astro` built alongside it.
- **Problems with `fallback`:**
  - Every `[lang]` route, and every page outside a locale folder, logs "Could not render X … conflicts with higher priority route X".
  - With `prerenderConflictBehavior: 'error'` the build **fails**; this looks like an Astro bug.
  - Fallback only creates pages for missing files in static locale folders. Missing `[lang]` params are simply not generated.
  - `fallbackType: 'rewrite'` copies the content with `currentLocale: 'en'` but `Astro.url.pathname` set to `/pt/...`.
  - **Recommendation:** use `[lang]` routes without `fallback`.
- `Astro.preferredLocale` on prerendered pages logs an "`Astro.request.headers` is not available" warning. Don't use it on a static site.

## 3. Content collections (VERIFIED)

- The config file is `src/content.config.ts` (`.mjs/.js/.mts` also accepted). The old `src/content/config.ts` only works with `legacy.collectionsBackwardsCompat`.
- Import `z` from `astro/zod`, which is `zod/v4`. Importing `z` from `astro:content` or `astro:schema` is deprecated and slated for removal in Astro 8.

```ts
import { defineCollection, reference } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';
const authors = defineCollection({ loader: file('src/data/authors.json'), schema: z.object({ name: z.string(), url: z.url().optional() }) });
const essays = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/essays' }),
  schema: ({ image }) => z.object({ title: z.string(), date: z.coerce.date(), lang: z.enum(['pt-BR','en']), author: reference('authors'), draft: z.boolean().default(false) }),
});
export const collections = { essays, authors };
```

- `glob()` options: `pattern`, `base`, `generateId`, `retainBody`, `deferRender`.
- `file(path, { parser })` takes an array of objects with `id`, or an object keyed by id.
- **`entry.id` format:**
  - `essays/pt/foo.mdx` → `pt/foo`
  - `en/Deep Folder/My Post.MDX.md` → `en/deep-folder/my-postmdx` (slugified and lowercased)
  - `en/Deep Folder/index.md` → `en/deep-folder`
  - `entry.filePath` → `src/content/essays/pt/foo.mdx`
- **Query API:** `getCollection(name, filter)`, `getEntry(ref)` or `getEntry(name, id)` (both resolve `reference()`), `getEntries`.
- **Rendering:** `const { Content, headings, remarkPluginFrontmatter } = await render(entry)`.
  - `headings` looks like `[{depth:2, slug:'introdução', text:'Introdução'}]`.
  - Slugs keep Unicode characters; trailing hyphens are kept since v6.
- `entry.slug` and `entry.render()` are gone.

## 4. Markdown, MDX, Shiki and KaTeX (VERIFIED)

- **Sätteri (Rust) is the default processor in v7, and `@astrojs/markdown-remark` is not installed by default.**
- `markdown.remarkPlugins`, `rehypePlugins`, `remarkRehype`, `gfm` and `smartypants` are deprecated. They still work, but only if markdown-remark is installed.
- The new way is `markdown.processor`.
- `mdx()` inherits `markdown.processor`. Its own `remarkPlugins`/`rehypePlugins` options are deprecated; use `mdx({ processor })` to override.

**Route A: remark-math + rehype-katex.** Works in both `.md` and `.mdx`. Install `@astrojs/markdown-remark remark-math rehype-katex katex`:

```js
import { unified } from '@astrojs/markdown-remark';
markdown: { processor: unified({ remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] }),
            shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } } },
```

- In the layout, add `import 'katex/dist/katex.min.css'`. It gets bundled, and the KaTeX fonts are emitted as hashed assets.
- `$E=mc^2` rendered to `<span class="katex">…<math>…`.
- **Route B: pure Sätteri.** `satteri({ features: { math: true } })` on its own only emits `<code class="language-math math-inline|math-display">`. Adding the custom mdast plugin `.../astro7probe/satteri-katex.mjs` renders KaTeX in both `.md` and `.mdx`. It must branch on `ctx.sourceFormat`: `{type:'html', value}` for md, `{raw, mdxExpressions:false}` for mdx. A hast-phase version failed in MDX.
- **Syntax highlighting:** default is `syntaxHighlight: { type: 'shiki', excludeLangs: ['math'] }`; options are `'shiki' | 'prism' | false`. Shiki emits inline `style=""` attributes.

## 5. Fonts API: stable since 6.0, top-level `fonts` (VERIFIED, network worked)

```js
import { defineConfig, fontProviders } from 'astro/config';
fonts: [{ provider: fontProviders.fontsource(), name: 'Literata', cssVariable: '--font-literata',
          weights: ['200 900'], styles: ['normal','italic'], subsets: ['latin','latin-ext'], fallbacks: ['Georgia','serif'] },
        { provider: fontProviders.local(), name: 'LiterataLocal', cssVariable: '--font-literata-local', fallbacks: ['serif'],
          options: { variants: [{ src: ['./src/assets/fonts/Literata-Var.woff2'], weight: '200 900', style: 'normal' }] } }],
```

```astro
---
import { Font } from 'astro:assets';
---
<Font cssVariable="--font-literata" preload={[{ subset: 'latin', style: 'normal' }]} />  <!-- or preload / preload={false} -->
<style>body { font-family: var(--font-literata); }</style>
```

- **Providers:** `adobe`, `bunny`, `fontshare`, `fontsource`, `google`, `googleicons`, `local`, `npm`.
- **Defaults:** weights `[400]`, styles `['normal','italic']`, subsets `['latin']`, formats `['woff2']`, display `'swap'`, `optimizedFallbacks: true`. Other options: `unicodeRange`, `stretch`, `featureSettings`, `variationSettings`.
- **Output:**
  - Font files go to `/_astro/fonts/<hash>.woff2`.
  - The `@font-face` CSS is inlined in a `<style>`.
  - The preload filter correctly reduced 4 preloads to 1.
  - A fallback face is generated as `src: local("Times New Roman"); size-adjust:118.4%; ascent-override…`, giving `--font-literata: Literata-<hash>, "… fallback: Times New Roman", Georgia, serif`. The last entry in `fallbacks` must be a generic family for this to happen.
  - With CSP enabled, `font-src 'self'` is added automatically.
- If `<Font>` references a `cssVariable` that isn't configured, the build throws `FontFamilyNotFound`.

## 6. CSP: stable `security.csp` since 6.0, emitted as a `<meta>` on static pages (VERIFIED)

```js
security: { csp: {
  scriptDirective: { resources: ["'self'", "'wasm-unsafe-eval'"] },   // resources REPLACE the default; keep 'self'
  styleDirective:  { resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }] }, // -> style-src-attr
}}
```

- **Emitted header:** `font-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'sha256-…'…; style-src 'self' 'sha256-…'; style-src-attr 'unsafe-inline';`
- Other options: `algorithm`, `directives: [...]`, `hashes`, `strictDynamic`. Entry `kind: 'element' | 'attribute' | 'default'` is supported since 7.1.
- CSP is not applied in `astro dev`.
- **What gets hashed:**

| Content | Covered? |
|---|---|
| Processed `<script>` (bundled, small ones inlined) | Hashed, allowed |
| `<Font>` style | Hashed, allowed |
| `is:inline` scripts | **Not hashed — blocked** |
| Inline `<style>` of a component used inside an MDX collection entry | **Not hashed — blocked** (probable bug) |
| KaTeX/Shiki `style=""` attributes (39 on one page) | Blocked unless you add `style-src-attr 'unsafe-inline'` |

- **Fixes:**
  - For `is:inline` scripts, call `Astro.csp.insertScriptHash('sha256-…')`. This works on prerendered pages.
  - For the MDX component styles, set `build.inlineStylesheets: 'never'`.
  - The `style-src-attr 'unsafe-inline'` setting causes a benign warning. A Shiki CSP warning still prints.
- `<ClientRouter />` is documented as unsupported with CSP. It builds, but the router script lands before the meta tag.
- Runtime API: `Astro.csp.insertDirective`, `insertScriptResource`, `insertStyleResource`, `insertScriptHash`, `insertStyleHash`.

## 7. Client scripts and WASM (VERIFIED)

- A `<script>` with no attributes other than `src` is processed: TypeScript, bundling, `type="module"`, deduplicated, rendered in source order (v6+), and inlined when small.
- Any other attribute, or `is:inline`, leaves the script untouched.
- **WASM as a URL:**
  - `import u from '../wasm/add.wasm?url'` gets **inlined as a `data:application/wasm;base64` URL** when the file is under 4 KB.
  - `?url&no-inline` forces a hashed asset, e.g. `/_astro/add.DkMAU0Nf.wasm`.
  - A 5 KB `.wasm` imported with plain `?url` was emitted as `/_astro/big.xi0E3G7p.wasm`.
  - Use `fetch(u)` with `WebAssembly.instantiateStreaming`; CSP needs `'wasm-unsafe-eval'`.

## 8. View transitions

- `ClientRouter` still exists in `astro:transitions`. Client APIs (`navigate`, `swapFunctions`, events) are in `astro:transitions/client`.
- The docs don't deprecate it; they say it will "increasingly become unnecessary".
- Native `@view-transition { navigation: auto; }` is plain CSS with no Astro involvement. VERIFIED: it passed through to the built CSS unchanged.
- Removed in v7: `TRANSITION_*` constants, `isTransition*Event()` and `createAnimationScope()`. Compare `event.type` strings instead.

## 9. Breaking changes in v6 and v7

From the docs, plus items observed in the build marked as such.

**v6**
- Node >=22.12.0, Vite 7, Zod 4, Shiki 4.
- Zod 4 changes: `z.email()` and `z.url()` are top-level; `message` becomes `error`; `.default()` must match the output type, use `.prefault()` otherwise.
- Legacy collections removed, `<ViewTransitions/>` removed, `Astro.glob()` removed (use `import.meta.glob`).
- `import.meta.env` values are always inlined and never coerced.
- `getStaticPaths` params must be strings.
- Endpoints with a file extension are served without a trailing slash.
- `fonts`, `csp` and live collections became stable. `preserveScriptOrder`, `staticImportMetaEnv` and `headingIdCompat` became default.
- `Astro.*` inside `getStaticPaths` is deprecated; use `import.meta.env.SITE`.
- Images: default image service crops by default and never upscales; `getImage()` throws if called on the client.

**v7**
- Vite 8 (rolldown).
- The Rust compiler is the only compiler. It is stricter: unclosed tags and `<div>` inside `<p>` now error.
- Sätteri is the default Markdown processor.
- **`compressHTML` now defaults to `'jsx'`.** VERIFIED: `<span>hello</span>⏎<em>world</em>` renders as "helloworld". Add `{" "}`, or set `compressHTML: true` to get the old behaviour.
- `src/fetch.ts` is a reserved file name.
- `logger`, `cache`/`routeRules` and advanced routing became stable.
- `@astrojs/db` removed.

## 10. Endpoints, getStaticPaths and RSS (VERIFIED)

```ts
// src/pages/[lang]/feed.json.ts
export const getStaticPaths = (() => [{ params: { lang: 'pt' }, props: { code: 'pt-BR' } }, { params: { lang: 'en' }, props: { code: 'en' } }]) satisfies GetStaticPaths;
export const GET: APIRoute = async ({ params, props, currentLocale }) =>
  Response.json({ lang: params.lang, currentLocale, ids: (await getCollection('essays', e => e.data.lang === props.code)).map(e => e.id) });
// src/pages/rss.xml.ts
export async function GET(context: APIContext) { return rss({ title, description, site: context.site!, items: [...] }); }
```

These produced `/pt/feed.json`, `/en/feed.json` and `/rss.xml` (no trailing slash, even with `trailingSlash: 'always'`).

## 11. Sitemap i18n (VERIFIED)

```js
sitemap({
  filter: (page) => page !== `${SITE}/`,
  i18n: { defaultLocale: 'pt', locales: { pt: 'pt-BR', en: 'en' } },
})
```

- Keys are URL path prefixes; values are hreflang codes.
- This emits `xhtml:link rel="alternate" hreflang` pairs.
- Without the filter, the root redirect page `/` was listed with a duplicate `hreflang="pt-BR"`. i18n fallback redirect pages are also listed if you use `fallback`.

## Not verified

- I did not check runtime behaviour in a real browser: KaTeX rendering, the WASM fetch under CSP, ClientRouter breaking under CSP, or the native view transition animation.
- The GitHub Pages workflow (`withastro/action@v6`, `actions/deploy-pages@v5`, `actions/checkout@v7`, default node-version 24) comes from a WebFetch summary and was not tested.
- I didn't check the exact size limit for inlining small scripts; it is presumably Vite's `assetsInlineLimit` of 4 KB.
- Context7 was not queried; sources were the installed package types and source plus docs.astro.build.
