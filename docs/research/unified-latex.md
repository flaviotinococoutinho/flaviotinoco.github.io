# Probe report: unified/remark/rehype stack for LaTeX-like features on Astro 7 MDX (verified 2026-10-11)

I ran every claim below with Node 22.22.0 and pnpm 10.28.0 in `/tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/unifiedprobe`. I did not modify `/home/user/flaviotinoco.github.io`. Its `package.json` only has typescript 6.0.3 and vitest 5.0.3, so there is no Astro there yet.

## 1. Versions (installed and loaded)

| package | version | notes |
|---|---|---|
| unified | 11.0.5 | |
| remark-parse | 11.0.0 | |
| remark-rehype | 11.1.2 | |
| rehype-stringify | 10.0.1 | |
| remark-math | 6.0.0 | |
| rehype-katex | 7.0.1 | depends on `katex ^0.16.0`, which resolves to **0.16.47**, not the latest |
| katex | 0.19.0 | released 2026-10-01. Breaking changes: 0.18.0 prefixed some CSS classes, 0.19.0 changed the `strict` callback |
| remark-directive | 4.0.0 | |
| micromark-extension-directive | 4.0.0 | |
| mdast-util-directive | 3.1.1 | published 2026-10-03 (8 days old); 3.1.0 is from 2025-01 |
| remark-smartypants | 3.0.3 | wraps retext-smartypants 6.2.0 |
| remark-gfm | 4.0.1 | |
| unist-util-visit | 5.1.0 | |
| unist-util-visit-parents | 6.0.2 | |
| hast-util-to-string | 3.0.1 | |
| mdast-util-to-string | 4.0.0 | |
| hastscript | 9.0.1 | |
| @mdx-js/mdx | 3.1.1 | |
| astro | 7.3.8 | |
| @astrojs/mdx | 8.0.3 | **no direct @mdx-js/mdx dependency** |
| @astrojs/markdown-remark | 7.3.2 | optional peer of @astrojs/mdx; brings in `@mdx-js/mdx ^3.1.1` (3.1.1) |
| @astrojs/markdown-satteri | 0.4.3 | Astro 7's **default** processor, using satteri 0.10.5 (Rust) |
| fast-check | 4.10.2 | |
| @fast-check/vitest | 0.5.0 | peers: vitest ^4.1 or ^5; fast-check ^3 or ^4 |
| vitest | 5.0.3 | |
| @retorquere/bibtex-parser | 11.0.0 | ISC, ESM + CJS |
| bibtex-parse | 2.1.0 | last release 2022 |
| @citation-js/core, plugin-bibtex, plugin-csl | 0.9.0 | |
| citeproc | 2.4.63 | license **CPAL-1.0 OR AGPL-1.0** |
| @benrbray/remark-cite | 2.0.1-alpha.4 | last release 2024-07 |
| rehype-citation | 2.3.2 | 2026-02; still on citation-js ^0.7 |

All of these are MIT unless noted.

## 2. Astro 7: how remark/rehype plugins actually get applied

This is the most important finding. Astro 7's default Markdown/MDX processor is **satteri**, which does not run remark or rehype plugins. You must switch to the unified processor. Both `.md` and `.mdx` inherit it, and I confirmed this with a real `astro build` in `astro-site/`:

```js
// astro.config.mjs (verified: 2 pages built; directives, KaTeX, \tag and pt-BR quotes rendered)
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
export default defineConfig({
  markdown: { processor: unified({
    remarkPlugins: [remarkMath, remarkDirective, remarkTheorem],
    rehypePlugins: [[rehypeKatex, { output: 'mathml', strict: (c) => (c === 'unicodeTextInMathMode' ? 'ignore' : 'error') }]],
    smartypants: { openingQuotes: { double: '“', single: '‘' }, closingQuotes: { double: '”', single: '’' } },
  }) },
  integrations: [mdx()],
});
```

What I saw in the code and the builds:

- **Old-style config breaks the build.** `mdx({ remarkPlugins })` without `markdown.processor` prints two warnings: "deprecated" and "ignored because your `satteri` processor does not run remark/rehype plugins". The build then failed on `{#thm-1 title="…"}` with `Could not parse expression with oxc` (satteri read it as an MDX expression).
- **Plugin order.**
  - `.md`: parse → gfm → smartypants → your remark plugins → remark-rehype (`allowDangerousHtml`) → highlighting → your rehype plugins → images and heading ids → rehype-raw.
  - `.mdx` (via `createProcessor`): your rehype plugins run after `rehypeRaw({ passThrough: nodeTypes })` and syntax highlighting.
- **String plugin names are dropped for MDX.** `filterStringPlugins` skips them and warns, so always import plugin functions.
- **satteri silently destroys content.** With `features: { directive: true }`, it drops directives it doesn't handle:
  - `:::theorem\nTexto.\n:::` produced nothing at all.
  - `10:30` became `10`.
  - Its `math: true` also turns `R$ 5 e R$ 10` into math.

## 3. remark-directive (scripts 02, 02b, 02c)

**Syntax and node shapes.** The mdast node is `{type:'containerDirective'|'leafDirective'|'textDirective', name, attributes, children}`. For `:::theorem{#thm-x title="…" .important}`, attributes come out as `{id, title, class:"important"}`.

**Turning a directive into HTML.** Set `node.data.hName` and `node.data.hProperties` in a remark plugin. You can use `hastscript`'s `h()` to normalise `class`/`id` and copy `.tagName`/`.properties` across.

**Nesting needs MORE colons on the outer fence.** This is verified:
- `::::theorem … :::proof … ::: … ::::` nests correctly.
- `:::` outside with `::::` inside closes wrongly and leaves a stray `<p>:::</p>`.

**Unknown directives cause real information loss.** remark-rehype turns any unhandled directive into a `<div>`:
- `10:30` → `10<div></div>` (the "30" is lost).
- `http://x.y:8080` loses `8080`.
- `:cite[@k]{p=1}` → `<div>@k</div>`, and the attributes are lost.

The fix I verified (output is byte-identical text) restores the exact source slice for every directive you don't own:

```js
const raw = src.slice(node.position.start.offset, node.position.end.offset);
parent.children.splice(index, 1, node.type === 'textDirective'
  ? { type: 'text', value: raw }
  : { type: 'paragraph', children: [{ type: 'text', value: raw }] });
return [SKIP, index + 1];
```

**MDX compatibility** (`@mdx-js/mdx` `compile()` with remark-directive). Everything I tried compiled:
- `{#id .c title="a{b}"}` attributes, including braces inside quotes.
- JSX inside a container: `<Comp />`, and `<Comp>**md**</Comp>`.
- A directive inside JSX: `<span>:abbr[x]{title="t"}</span>`.
- `{1+1}` expressions next to directives.

## 4. KaTeX (script 03): same results on 0.16.47 and 0.19.0

| feature | result |
|---|---|
| `\tag{3.1}`, `\tag*{A}` | work in display mode only. Inline throws `\tag works only in display equations` |
| `\label`, `\ref`, `\eqref` | **not supported** in either version (`Undefined control sequence`). You need a remark-level plugin (section 5) |
| `macros` option | `\gdef` mutates the passed object and persists. `\def` and `\newcommand` don't persist unless you set `globalGroup: true` |
| `trust` with `\htmlClass`, `\htmlId`, `\htmlData`, `\href` | rendered only with `trust: true` or a `trust(ctx)` function. ctx looks like `{command:'\\htmlData', attributes:{'data-ref':'eq:x',…}}`, or `{command:'\\href', url, protocol}`. With trust on, the default `strict: 'warn'` still warns `[htmlExtension]`, so use `strict: (code) => code === 'htmlExtension' ? 'ignore' : …` |
| strict | `"é"` in math: warn by default, throws under `'error'`. Codes include `unicodeTextInMathMode` and `htmlExtension` |
| output size for `\frac{a}{b}` | `htmlAndMathml` 1361 chars, `html` 1135, `mathml` 219 |
| original TeX | `<annotation encoding="application/x-tex">` holds the original TeX, HTML-escaped (`a&lt;b \&amp; c`). Present in `mathml` and `htmlAndMathml`, absent in `html` |
| `katex.__parse` | exists, but it is an internal API |

Caveats:

- **CSS mismatch.** 0.19 emits `katex-base` and `katex-strut`, and its CSS targets `.katex .katex-base`. 0.16.47, which rehype-katex uses, emits `base` and `strut`. So rehype-katex HTML styled with `katex@0.19/dist/katex.css` will be misstyled. Either:
  - load the CSS from the same version that rendered the HTML, or
  - force one version with `"pnpm": {"overrides": {"katex": "0.19.0"}}`. I verified this works with rehype-katex 7.0.1 and produces prefixed classes.
- **0.19 strict callbacks** that return `undefined` now emit a warning (verified). Return `false` or `'ignore'` instead.

**rehype-katex 7.0.1** passes all options through except `displayMode` and `throwOnError`. Errors on bad TeX don't fail the build: it records a non-fatal `file.message` (`source:'rehype-katex'`, `ruleId:'parseerror'`) and renders a `katex-error` span. If you want the build to fail, check `file.messages`.

**Macros leak between pages** (verified: a `\gdef` in file 1 is usable in file 2), because rehype-katex shares one options object. Wrapping it with a fresh macros object per file fixes this:

```js
const rehypeKatexIsolated = (opts={}) => (tree, file) =>
  rehypeKatex({ ...opts, macros: { ...BASE_MACROS, ...(file.data.frontmatter?.macros ?? {}) } })(tree, file);
```

Also, `hast-util-to-string` on KaTeX MathML output counts the text twice (`"a+ba+b"`) because it includes the annotation. Keep that in mind for word counts and search indexing.

## 5. remark-math mdast and numbering equations (script 04)

**Node shapes.**
- `inlineMath`: `{value:'a+b', data:{hName:'code', hProperties:{className:['language-math','math-inline']}, hChildren:[{type:'text',value:'a+b'}]}}`. Inline `$$c$$` is also `inlineMath`.
- `math`: `{value, meta:'meta words', data:{hName:'pre', hChildren:[code.language-math.math-display > text]}}`.
- A ` ```math ` fence stays a `code` node with `lang:'math'`.

**Pitfall: changing `node.value` has no effect.** remark-rehype renders the `data.hChildren` copy that was made at parse time. My first attempt left `\label` unrendered for exactly this reason. Update both:

```js
function setMathValue(node, v) { node.value = v; const hc = node.data?.hChildren;
  if (node.type === 'inlineMath' && hc?.[0]?.type === 'text') hc[0].value = v;
  if (node.type === 'math' && hc?.[0]?.children?.[0]?.type === 'text') hc[0].children[0].value = v; }
```

**The working plugin** (in `04-math-labels.mjs`), in four passes:
1. Collect `\label{…}` from `math` nodes, strip it, and append `\tag{n}`, or reuse an existing `\tag`. Duplicate labels make the build fail.
2. Wrap the equation in `{type:'equationBlock', data:{hName:'div', hProperties:{id}}, children:[math]}`. rehype-katex replaces the `<pre>`, so an id placed there would be lost.
3. Resolve `\eqref`/`\ref` inside math to `\text{(n)}`.
4. Resolve them in prose `text` nodes to `<a href="#eq-…">`.

Forward references work. An undefined reference keeps the literal text and records `file.message` (`ruleId:'undefined-ref'`). Rendered output: `(1)` and `(2)` appear as tags, and `$x \eqref{eq:pit}$` renders as `(2)`.

Two things to know about this plugin:
- The `<annotation>` then contains the rewritten TeX (`\tag{1}`), not the original `\label`. If you need the original, store it in a `data-tex` attribute on the wrapper.
- **pt-BR currency is a real hazard.** `Custa R$ 5,00 e R$ 10,00` becomes `inlineMath(" 5,00 e R")`. `singleDollarTextMath: false` (only `$$…$$` counts as math) or escaping `R\$` both avoid it. Both checks passed.

## 6. Pandoc-style citations (scripts 06, 09, 10)

**@benrbray/remark-cite 2.0.1-alpha.4.** Works with unified 11 and micromark 4. It is alpha and hasn't been released since 2024-07.
- Node shape: `{type:'cite', value:'[ver @a, p. 12; -@b, cap. 2]', data:{citeItems:[{prefix:'ver ',key:'a',suffix:', p. 12'},{prefix:' ',suppressAuthor:true,key:'b',suffix:', cap. 2'}], hName:'span', hProperties:{className:['cite-inline'],'data-cite':…}}}`.
- It honours escapes, code spans and footnotes (with or without gfm in either order), round-trips through remark-stringify, and works in MDX.
- **It breaks some links:** `[@key](http://a.b)` becomes a cite plus the literal text `(http://a.b)`, and `[@key][ref]` breaks the same way.
- No bare in-text `@key`; there is an optional alternative syntax, `@[key]`.

**rehype-citation 2.3.2.** Works with a local ABNT CSL file plus the pt-BR locale. Problems I hit:
- `-@key` produced a broken link: `; 2019<a …>)</a>`.
- In-text `@knuth1984` came out as `Knuth,  (1984)`.
- An unknown `[@nope]` was left silently, with **no message**.
- It uses citation-js 0.7 and triggers a `punycode` deprecation warning.

**Custom text-node plugin.** `remark-cite-text.mjs` is the recommended way to keep control. It is about 60 lines and works like this:
- It visits only `text` nodes whose ancestors include no link, linkReference, definition, code, math, html, or JSX nodes.
- Group regex (Unicode keys, pandoc-style internal punctuation): `` `\[([^\[\]]*?-?@([\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&+?<>~/-](?=[\p{L}\p{N}_]))*)[^\[\]]*)\]` `` with flags `gu`.
- It honours escapes by mapping the k-th `[` of `node.value` to the k-th `[` in the raw source slice. If the counts differ (character references), it leaves the text alone and records a message.
- It warns on unknown keys (`ruleId:'unknown-key'`).

Verified behaviour:
- Footnotes, links, code and math are left untouched.
- `[@k, *p.* 12]` (emphasis splits the text) is left as literal text, with no loss.
- `[fulano@exemplo.com]` stays a GFM email link.

## 7. BibTeX and ABNT (scripts 07, 07b, 08, 08b)

**@retorquere/bibtex-parser 11.0.0.** Synchronous `parse(str, opts)` returning `{entries, errors, strings, comments, preamble, jabref}`, plus `parseAsync`.
- Each entry is `{type, key, fields}`. Creators come out as `{lastName, firstName, prefix}`, or `{name}` for an organisation in braces.
- It decodes LaTeX to Unicode: `{\c c}{\~a}` → `ção`, `--` → `–`, `$\alpha$` → `α`, and `@string` plus `#` concatenation work.
- Months are normalised to numeric strings: `jan` → `"1"`, `{mar}` → `"3"`.
- `da Silva` gives `prefix: 'da'`.
- `\textit{}` becomes `<i>…</i>` and case protection becomes `<span class="nocase">`, so **fields contain HTML**.
- An unknown macro such as `\TeX` is kept raw and logged in `errors` without throwing. A broken entry is reported in `errors` but still returned partially.
- `raw: true` returns the fields undecoded.
- Install footprint is about 18 MB, mostly 7.2 MB of data plus wink-nlp. Import takes about 133 ms.

**Critical: its output is not NFC.** `{\'e}` comes out as `e` + U+0301, and `{\'\i}` comes out as dotless ı + U+0301. So `"Estatística"` decoded from BibTeX does **not** equal the precomposed string, which breaks regex and dictionary matching. Applying this fix makes all three spellings equal:

```js
s.replace(/[\u0131\u0237](?=[\u0300-\u036f])/g, c => c === '\u0131' ? 'i' : 'j').normalize('NFC')
```

citation-js output has the same dotless-i problem (`Naı̈ve`).

**bibtex-parse 2.1.0.** Lossy: `Jos'e`, `Concei\c c\~ao`, `\textitin vivo`. Months come out as English names. Not recommended.

**citation-js 0.9.0 API change.** The registry is now `plugins.config.get('@csl').styles` (it used to be `.templates`; `.templates` is undefined in 0.9). Format with `cite.format('bibliography'|'citation', { format:'text'|'html', style|template: name, lang:'pt-BR', entry:[{id, locator:'12', label:'page'}] })`. The built-in locales do **not** include pt-BR, so register `locales-pt-BR.xml` yourself.

**CSL styles repo** (commit f2c83bb, 2026-10-09). It has 15 `associacao-brasileira-de-normas-tecnicas*` files.
- The base `associacao-brasileira-de-normas-tecnicas.csl` says "NBR 10520.2023 and **NBR 6023.2002**" (updated 2023-08). Its output shows 2002 style: `Disponível em: <url>. Acesso em: 3 maio. 2024.`
- `associacao-brasileira-de-normas-tecnicas-ufrgs.csl` says "NBR 10520.2023 and **NBR 6023.2018**" (updated 2025-09-25). Its output: `Disponível em: https://…. Acesso em: 3 maio 2024.`, `[S. l.]`, `(org.)`, `2. ed.`, and citations `(Knuth, 1984, p. 12)`, which match the 2023 mixed-case citation rule.
- Gaps in the UFRGS style: it drops the month for journal articles (6023:2018 wants `mar. 2020`), and `@inproceedings` output is malformed (`2019. Anais do SBBD. [S. l.]: [s. d.], 2019`) because BibTeX has no event-name or event-place fields.
- Both styles render `DA SILVA, João`. ABNT wants `SILVA, João da`. Moving `non-dropping-particle` to `dropping-particle` in the CSL-JSON before formatting gives `SILVA, João da et al.` and `(Silva et al., 2020)` (verified).

## 8. SmartyPants for pt-BR (script 05)

Options are `openingQuotes`/`closingQuotes` as `{double, single}`, `dashes` (`true`, `'oldschool'` or `'inverted'`), `ellipses` and `backticks`. Code, inline math and link URLs are left untouched.

Caveats:
- `'90` becomes `‘90` (wrong; it should be an apostrophe).
- Setting the closing single quote to anything other than `’` corrupts apostrophes: with guillemets, `d'Ávila` became `d›Ávila`.
- `<<assim>>` is parsed as raw HTML and **dropped** by remark-rehype.

## 9. fast-check and vitest (`props.test.mjs`, `escape.test.mjs`)

Usage is `import { test, fc } from '@fast-check/vitest'; test.prop([arbs], { numRuns, seed })('name', fn)`, and it ran fine under vitest 5.0.3. I ran four properties; all pass:
- The citation plugin never changes the document's plain text (`mdast-util-to-string`), 500 runs.
- `parseGroup` gets back exactly the keys, locators and suppress flags it was generated from.
- remark-directive plus the fallback keeps text identical to plain remark, 500 runs.
- An escaped `\[@key]` never becomes a citation.

The last one first **failed** before I added escape handling. fast-check shrank the failure to `["","a"]`, i.e. `\[@a]`.

## 10. Other caveats

- **Very new releases:** katex 0.19.0 (10 days old), mdast-util-directive 3.1.1 (8 days, pulled in by `^3`), astro 7.3.8 (3 days). Pin exact versions in the lockfile.
- **License:** citeproc is CPAL/AGPL. It is used at build time, but it is still a dependency of `@citation-js/plugin-csl` and rehype-citation.
- **MDX output size:** KaTeX `htmlAndMathml` output turns into large JSX trees. `output: 'mathml'` is about 6× smaller.

## Files

Everything is in `/tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/`:

- **Probe scripts:**
  - `unifiedprobe/01-versions.mjs`
  - `unifiedprobe/02-directive.mjs`, `02b-directive-edge.mjs`, `02c-astro-processor.mjs`
  - `unifiedprobe/03-katex.mjs`
  - `unifiedprobe/04-math-labels.mjs`
  - `unifiedprobe/05-smartypants.mjs`
  - `unifiedprobe/06-cite.mjs`, `06b-cite-debug.mjs`, `06c-cite-gfm.mjs`
  - `unifiedprobe/07-bibtex.mjs`, `07b-nfc.mjs`
  - `unifiedprobe/08-citationjs.mjs`, `08b-particle.mjs`
  - `unifiedprobe/09-rehype-citation.mjs`
  - `unifiedprobe/10-cite-text.mjs`
  - `unifiedprobe/11-satteri.mjs`, `11b-satteri.mjs`
  - `unifiedprobe/12-macros-per-file.mjs`
- **Citation plugin:** `unifiedprobe/remark-cite-text.mjs`
- **Property tests:** `unifiedprobe/props.test.mjs`, `unifiedprobe/escape.test.mjs`
- **Astro build test:** `unifiedprobe/astro-site/` (`astro.config.mjs`, `src/pages/index.mdx`, `src/pages/plain.md`)
- **katex override test:** `unifiedprobe/k19/`
- **Downloaded CSL styles and pt-BR locale:** `csl-dl/`; shallow clone of the CSL styles repo: `csl-styles-repo/`
