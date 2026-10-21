# CLAUDE.md

Bilingual (pt-BR / en) static knowledge site — essays, interactive labs and a SKOS ontology arranged as a bridge
of four strata (philosophy → theory → formal → value). Astro 7, pure Markdown content, WebAssembly kernels,
deployed to GitHub Pages as a project site under `/flaviotinoco.github.io/`.

## Architecture (normative: [docs/arquitetura.md](docs/arquitetura.md); decisions: [docs/adr/](docs/adr/); requirements: [docs/requisitos-nao-funcionais.md](docs/requisitos-nao-funcionais.md))

- `src/core/**` — functional core: pure, deterministic, total TypeScript. Business rules live here only.
- `src/adapters/unified/` — one remark/rehype stage per file; order and contracts in `pipeline.ts`.
- `src/adapters/astro/`, `src/adapters/wasm/` — glue to Astro (i18n, content queries, fonts) and to the kernels.
- `src/islands/` — `registry.ts` (the only global script) lazy-loads `elements/ft-*.ts` custom elements.
- `src/views/` compose pages; `src/components/` are stateless; `src/pages/` only dispatch routes and serve the
  per-locale endpoints (RSS, `palette.json`, `preferences.json`: chrome content fetched on demand, ADR 0009).
- `src/content/{essays,labs,strata,pages}/{pt,en}/*.md` + `concepts/*.json` — data, never code.
- `src/core/design/tokens.json` (W3C DTCG) → generated `src/styles/tokens.css`; component CSS in `src/styles/components/`.
- `src/core/i18n/` — bijective route codec and message catalogs (`defineMessages`, key parity type-checked).
- `wasm/` — Rust kernels (no wasm-bindgen, no imports) built into `src/wasm/` by `scripts/build-wasm.mjs`.
- `scripts/` — shell tools (tokens, palette, i18n, links, budgets); pure helpers in `scripts/lib/`.
- `tests/unit/**` (Vitest + fast-check), `tests/e2e/**` (Playwright + axe on the built site).
- Folder patterns: parser `unknown → Result`, codec `decode ∘ encode = id`, transform, fold, compiler, formatter.
- Shell code (adapters, islands, views, scripts) may do I/O and fail loudly; the core returns `Result`.
- Ontology: `src/content/concepts/*.json` + `src/core/ontology/**`; the guide is [docs/ontologia.md](docs/ontologia.md)
  (categories, relation constraints, what the build rejects, how to add a concept).
- CI: `.github/workflows/ci.yml` (quality, wasm, build, e2e); deploy: `deploy.yml` (configure-pages → Pages);
  release: `release.yml` (a tag `vX.Y.Z` publishes the CHANGELOG section, ADR 0010). `main` is protected: PRs only,
  six required checks, auto-merge waits for them.

## Commands

```sh
pnpm install --frozen-lockfile   # never add, remove or upgrade dependencies without being asked
pnpm check            # types (astro check + tsc), lint, format, tokens, palette, i18n, unit tests
pnpm test             # vitest; replay a property failure with FC_SEED=<seed> pnpm test
pnpm build            # build:wasm → astro build → pagefind (needs the Rust toolchain)
pnpm exec astro build # site only, reusing src/wasm/*.wasm
pnpm check:links && pnpm check:budgets && pnpm check:robots   # on dist/, after a build
pnpm test:e2e         # Playwright on dist/ via `astro preview` (build first)
pnpm tokens           # regenerate src/styles/tokens.css (a hook does it when tokens.json is edited)
pnpm check:wasm       # cargo fmt, clippy (host + wasm32), cargo test in wasm/
pnpm format           # prettier --write (never on src/content: it is ignored on purpose)
```

## Non-negotiable rules

1. **Functional core purity.** `src/core/**`: no I/O, `node:*`, DOM, `astro:*`, `import.meta`, `Date.now()`,
   `new Date()`, `Math.random()`, `console`, `throw`; no imports from outside `src/core`. Inject clocks and
   seeds; return `Result` (`src/core/algebra/result.ts`); `readonly` data; exhaustive `switch` with `absurd()`.
   Local mutation is fine; mutating inputs is not. ESLint enforces this — fix the code, never the rule.
2. **Parse, don't validate.** Untyped input (frontmatter, `.bib`, `.tsv`, JSON) is parsed once, at the boundary,
   into branded types (`src/core/domain/identifiers.ts`). Accumulate content errors so authors see them all.
3. **Information preservation.** Every text transform is injective: plain text unchanged (structure only added)
   or the original kept in a `data-*` attribute. Prove it with a fast-check property test.
4. **Content is pure Markdown** with the closed directive language of docs/arquitetura.md §5. No JSX/MDX.
   Unknown block directives fail the build. **Math only with `$$…$$`** (single `$` is currency: "R$ 5,00").
5. **Tokens only.** Use `--paper*`, `--ink*`, `--rule*`, `--link`, `--focus`, `--mark`, `--stratum-*`, `--step-*`,
   `--space-*`, `--duration-*`, `--ease-*`, `--font-*`, `--leading-*`, `--measure`. No hard-coded colours, no
   `linear-gradient()`, durations only from `--duration-*`. Respect `--motion`, reduced motion, forced colors.
6. **Strata are never shown by colour alone**: always simplex glyph + text label (WCAG 1.4.1).
7. **i18n with parity.** UI strings come from `src/core/i18n/catalogs/*.ts` (`defineMessages`, pt-BR + en, same
   keys and `{placeholders}`). Every essay, lab and page exists in both locales with the same `translationKey`.
8. **Citations** go through the citation stage (`[@key]`): ABNT NBR 10520/6023 in pt-BR, APA 7 in en.
9. **Accessibility**: WCAG 2.2 AA (AAA contrast via tokens), semantic HTML, keyboard, visible focus, `lang` on
   foreign words, `aria-live` for dynamic results, a useful no-JS fallback for every `ft-*` island.
10. **Never edit `src/styles/tokens.css`** — edit `src/core/design/tokens.json` and run `pnpm tokens`.
11. **Never disable, skip or weaken a check** (lint rule, threshold, budget, test, CI step) to make CI green.
    Fix the cause; if a rule is genuinely wrong, change it in its own commit with the reason, or write an ADR.
12. **Before committing**: `pnpm check` and `pnpm exec astro build` (or `pnpm build`) must pass with no new
    warnings; for UI changes also `pnpm check:links`, `pnpm check:budgets` and `pnpm test:e2e`.

## Conventions

- TypeScript strictest + `erasableSyntaxOnly`: no enums, namespaces or parameter properties; relative imports
  with the `.ts` extension; `import type` for types. Scripts run with `node file.ts` (type stripping).
- Comments and JSDoc in English, citing the method or reference behind non-obvious code. `docs/*.md` in pt-BR.
- Markdown stages: claim directives via `node.data.hName`; never descend into `code`, `inlineCode`, `math`,
  `inlineMath`, `html` or link URLs; report with `file.message(reason, node, 'stage:rule')`, fatal with
  `file.fail`; export page metadata through `file.data.astro.frontmatter`.
- Interactive behaviour = one custom element `ft-*` per file in `src/islands/elements/`, guarded against double
  definition; non-trivial logic goes to `src/core` with tests. Never add global `<script>`s.
- Internal links use `import.meta.env.BASE_URL` / the route codec; URLs end with `/` (`trailingSlash: 'always'`).
- Conventional Commits; one PR per subject, with the repository template. A change to the platform adds one line
  under "Não lançado" in `CHANGELOG.md` (ADR 0010). Do not commit `dist/`, `src/wasm/*.wasm` or generated reports.
- Documentation in pt-BR under `docs/`; a dated plan of a review round goes to `docs/planos/`.
