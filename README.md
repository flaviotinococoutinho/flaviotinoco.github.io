# Flavio Tinoco — ponte em quatro estratos

Site estático e bilíngue (português do Brasil e inglês) de ensaios, laboratórios interativos e uma ontologia
de conceitos. Todo tema atravessa a mesma ponte, sempre no mesmo sentido: **filosofia → teoria → formal →
valor** — da pergunta sem extensão ao artefato concreto.

> **English summary.** A bilingual (pt-BR/en) static knowledge site built with Astro 7: essays, interactive labs
> powered by small Rust → WebAssembly kernels, and a SKOS concept ontology, organised as a bridge across four
> strata (philosophy → theory → formal → value). Content is pure Markdown with a closed directive language;
> all business rules live in a pure, tested functional core; colours, accessibility, bilingual parity, links and
> size budgets are verified in CI. Run `pnpm install --frozen-lockfile && pnpm build && pnpm preview`. The site
> deploys to GitHub Pages through GitHub Actions. Agent and contributor rules: [CLAUDE.md](CLAUDE.md).

## Pilha

| Camada     | Tecnologia                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Gerador    | Astro 7 (saída estática), `@astrojs/sitemap`, `@astrojs/rss`                                                                |
| Conteúdo   | Markdown puro + `remark-directive`, `remark-gfm`, `remark-math` → `rehype-katex` (KaTeX 0.19), estágios próprios em unified |
| Cliente    | _custom elements_ `ft-*` carregados sob demanda; nenhum framework de UI                                                     |
| Cálculo    | Rust 1.97 → `wasm32-unknown-unknown`, sem `wasm-bindgen` e sem importações                                                  |
| Busca      | Pagefind (índice estático)                                                                                                  |
| Tipografia | Literata, Atkinson Hyperlegible Next e Mono (API de fontes do Astro)                                                        |
| Qualidade  | TypeScript 6 (strictest), ESLint 10, Prettier, Vitest 5 + fast-check, Playwright + axe-core                                 |
| Publicação | GitHub Actions → GitHub Pages                                                                                               |

## Como rodar

Requisitos: Node ≥ 22.12 (recomendado 24, ver `.nvmrc`), pnpm 10.28 (via `packageManager`; `corepack enable
pnpm`), e — para os laboratórios — Rust via `rustup` (a versão e o alvo `wasm32-unknown-unknown` são
instalados a partir de `wasm/rust-toolchain.toml`).

```sh
pnpm install --frozen-lockfile
pnpm dev                 # compila os kernels wasm e abre o servidor de desenvolvimento
pnpm build               # build:wasm → astro build → pagefind (saída em dist/)
pnpm preview             # serve dist/ em http://localhost:4321/flaviotinoco.github.io/
```

Sem variáveis de ambiente, a compilação usa os valores de produção (site de projeto com _base path_
`/flaviotinoco.github.io/`), para que erros de caminho apareçam localmente. Para servir na raiz:
`BASE_PATH= pnpm build`.

## Estrutura

```
src/core/        núcleo funcional puro: álgebra (Result), domínio, i18n, design, LaTeX, bibliografia…
src/adapters/    casca: estágios unified (um por arquivo), adaptadores Astro e wasm
src/islands/     registry.ts + elements/ft-*.ts (comportamento no cliente, sob demanda)
src/views/       composição de páginas · src/components/ apresentação · src/pages/ rotas
src/content/     essays/, labs/, strata/, pages/ ({pt,en}/*.md) e concepts/*.json
src/styles/      tokens.css (gerado), camadas base, components/*.css
wasm/            kernels Rust (signal, information, dynamics) → src/wasm/*.wasm
scripts/         tokens, paleta, i18n, links, orçamentos (Node, sem dependências novas)
tests/unit/      Vitest + fast-check · tests/e2e/ Playwright + axe
docs/            arquitetura.md (normativo), adr/ (decisões), research/ (fontes verificadas)
```

Documento normativo: [docs/arquitetura.md](docs/arquitetura.md). Decisões:
[0001 núcleo funcional](docs/adr/0001-nucleo-funcional-e-casca-imperativa.md) ·
[0002 conteúdo como dados](docs/adr/0002-conteudo-como-dados.md) ·
[0004 cor verificável](docs/adr/0004-sistema-de-cor-verificavel.md) ·
[0005 GitHub Pages](docs/adr/0005-implantacao-no-github-pages.md).

## Portões de qualidade

Tudo roda no CI (`.github/workflows/ci.yml`) em cada PR e em `main`; localmente, `pnpm check` cobre os
portões que não exigem compilação.

| Portão        | Comando               | O que garante                                                                                             |
| ------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| Tokens        | `pnpm check:tokens`   | `tokens.css` corresponde a `tokens.json`                                                                  |
| Paleta        | `pnpm verify:palette` | WCAG AAA/APCA, gama sRGB, estratos distinguíveis sob discromatopsia (Machado 2009, CIEDE2000)             |
| Tipos         | `pnpm check:types`    | `astro check` + `tsc` (strictest)                                                                         |
| Lint          | `pnpm check:lint`     | pureza do núcleo, camadas, typescript-eslint com tipos                                                    |
| Formatação    | `pnpm check:format`   | Prettier (conteúdo autoral é ignorado de propósito)                                                       |
| Paridade i18n | `pnpm check:i18n`     | catálogos com mesmas chaves e `{marcadores}`; conteúdo nas duas línguas; 4 estratos × 2                   |
| Testes        | `pnpm test`           | unidades e propriedades; cobertura do núcleo ≥ 85 % (ADR 0001)                                            |
| Wasm          | `pnpm check:wasm`     | `cargo fmt`, `clippy` (host e wasm32), `cargo test`                                                       |
| Links         | `pnpm check:links`    | links, recursos e fragmentos internos de `dist/` (respeitando o _base path_)                              |
| Orçamentos    | `pnpm check:budgets`  | por página: HTML ≤ 150 KiB, CSS ≤ 30 KiB gz, JS inicial ≤ 12 KiB gz; cada `.wasm` ≤ 48 KiB                |
| E2E           | `pnpm test:e2e`       | axe (WCAG 2.2 AA) em todas as páginas nos temas claro e escuro, teclado, movimento reduzido, CSP, console |

Testes de propriedade usam uma semente impressa no início da execução; para reproduzir uma falha:
`FC_SEED=<semente> pnpm test`.

## Publicação

1. Em **Settings → Pages**, escolha a fonte **GitHub Actions** (uma única vez).
2. Cada _push_ em `main` executa `.github/workflows/deploy.yml`: `actions/configure-pages` informa a origem e o
   _base path_, a compilação os recebe em `SITE` e `BASE_PATH`, os links e orçamentos são verificados e o
   artefato `dist/` é publicado com `actions/deploy-pages`. Também é possível disparar manualmente
   (_Actions → Deploy → Run workflow_).
3. **Site de projeto:** como o dono do repositório é `flaviotinococoutinho` (e não `flaviotinoco`), o endereço é
   <https://flaviotinococoutinho.github.io/flaviotinoco.github.io/>. Renomear o repositório para
   `flaviotinococoutinho.github.io` ou configurar um domínio próprio remove o _base path_ automaticamente — o
   valor vem de `configure-pages`, sem mudança de código.
4. Recomenda-se proteger `main` exigindo os jobs do CI e a revisão definida em `.github/CODEOWNERS`.

As ações do GitHub são fixadas por SHA de commit e atualizadas pelo Dependabot (ADR 0005).
