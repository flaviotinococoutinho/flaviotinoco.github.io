# Blog de Flávio Tinoco

Projeto de blog técnico bilíngue (português do Brasil e inglês) em Astro e TypeScript. A arquitetura prevê conteúdo organizado em filosofia, teoria, formalização e valor, com matemática, citações e recursos de leitura não linear.

## Estado do projeto

A implementação está em integração. O estado verificado de cada área, com a data da última inspeção e o comando que a confirma, está em [docs/arquitetura.md](docs/arquitetura.md#estado-da-implementação). Um item só consta como funcionando quando a verificação correspondente passa no código versionado; a presença de um arquivo ou de uma dependência não comprova o recurso.

## Ferramentas

O `package.json` declara Node.js a partir de `22.18.0` (os scripts em TypeScript dependem do *type stripping* nativo, ativo por padrão a partir dessa versão; recomenda-se a 24, ver `.nvmrc`), pnpm `10.28.0` e Astro `7.3.8`. Os módulos WebAssembly exigem Rust; a versão e o alvo `wasm32-unknown-unknown` vêm de `wasm/rust-toolchain.toml` e são instalados pelo `rustup`.

## Como executar

```sh
pnpm install --frozen-lockfile
pnpm build:wasm          # compila os kernels Rust → src/wasm/*.wasm
pnpm dev                 # servidor de desenvolvimento
pnpm build               # build:wasm → astro build (estrito) → índice de busca (saída em dist/)
pnpm preview             # serve dist/ em http://localhost:4321/flaviotinoco.github.io/
```

Sem variáveis de ambiente, a compilação usa os valores de produção (site de projeto com *base path* `/flaviotinoco.github.io/`), para que erros de caminho apareçam localmente. Para servir na raiz: `BASE_PATH= pnpm build`.

`pnpm build:site` falha quando o Astro registra um erro de renderização de conteúdo: o carregador de conteúdo do Astro apenas registra essas falhas e termina com sucesso, o que publicaria páginas vazias.

## Verificações

| Verificação | Comando | O que confere |
|---|---|---|
| Tokens | `pnpm check:tokens` | `tokens.css` corresponde a `tokens.json` |
| Paleta | `pnpm verify:palette` | contraste WCAG AAA e APCA, gama sRGB, distinção dos estratos sob discromatopsia simulada (Machado et al., 2009; CIEDE2000) |
| Tipos | `pnpm check:types` | `astro check` e `tsc` |
| Lint | `pnpm check:lint` | pureza do núcleo, camadas, regras do typescript-eslint |
| Formatação | `pnpm check:format` | Prettier; o conteúdo autoral é excluído de propósito |
| Paridade i18n | `pnpm check:i18n` | catálogos com as mesmas chaves; traduções presentes; quatro estratos nas duas línguas |
| Testes | `pnpm test` e `pnpm test:wasm` | testes unitários e de propriedade; os de WebAssembly exigem `pnpm build:wasm` |
| Wasm | `pnpm check:wasm` | `cargo fmt`, `clippy` e `cargo test` |
| Links | `pnpm check:links` | links, recursos e fragmentos internos de `dist/` |
| Orçamentos | `pnpm check:budgets` | tamanho de HTML, CSS, JS e WebAssembly por página |
| E2E | `pnpm test:e2e` | axe (WCAG 2.2 AA) nos temas claro e escuro, teclado, movimento reduzido, CSP |

O CI (`.github/workflows/ci.yml`) executa essas verificações em cada pull request e em `main`. Testes de propriedade imprimem a semente usada; para reproduzir uma falha: `FC_SEED=<semente> pnpm test`.

## Publicação

1. Em Settings → Pages, escolha a fonte "GitHub Actions" (uma única vez).
2. Cada push em `main` executa `.github/workflows/deploy.yml`. `actions/configure-pages` informa a origem e o *base path*, a compilação os recebe em `SITE` e `BASE_PATH`, e o artefato `dist/` é publicado com `actions/deploy-pages`.
3. O dono do repositório é `flaviotinococoutinho`, então este é um site de projeto, servido em <https://flaviotinococoutinho.github.io/flaviotinoco.github.io/>. Renomear o repositório para `flaviotinococoutinho.github.io` ou configurar um domínio próprio remove o *base path* sem mudança de código.

As ações do GitHub são fixadas por SHA de commit e atualizadas pelo Dependabot ([ADR 0005](docs/adr/0005-implantacao-no-github-pages.md)).

## Documentação

- [Arquitetura-alvo e estado de implementação](docs/arquitetura.md).
- Decisões: [ADRs em docs/adr/](docs/adr/).
- Guias de autoria: [LaTeX](docs/guia-latex.md), [leitura não linear](docs/leitura-nao-linear.md), [guia editorial e ABNT](docs/guia-editorial.md).
- Regras para agentes e colaboradores: [CLAUDE.md](CLAUDE.md).
- Pesquisas: [Astro](docs/research/astro7.md), [Markdown e LaTeX](docs/research/unified-latex.md), [léxico](docs/research/lexicon.md), [ABNT](docs/research/abnt.md), [compatibilidade de CSS](docs/research/css-support.md), [GitHub Actions](docs/research/github-actions.md), [fontes](docs/research/fonts.md).

Os relatórios de pesquisa registram verificações de 11/10/2026. Preserve as datas e revalide as fontes antes de usar suas conclusões em uma nova decisão.
