# flaviotinoco.github.io

Site bilíngue (pt-BR e en) de Flávio Tinoco: ensaios, laboratórios interativos e uma ontologia de conceitos,
organizados em quatro estratos — filosofia, teoria, formal e valor — percorridos sempre nessa ordem. Os temas
vão da semiótica e da teoria da informação ao processamento de sinais, à computação, à engenharia de software e
à otimização combinatória ([programa editorial](docs/programa-editorial.md)).

Astro 7, Markdown puro, núcleos numéricos em Rust compilados para WebAssembly, citações ABNT e APA, WCAG 2.2.
Desempenho, contraste, paridade de línguas e preservação de informação são verificados a cada mudança
([requisitos não funcionais](docs/requisitos-nao-funcionais.md)).

[![CI](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/actions/workflows/ci.yml/badge.svg)](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/actions/workflows/ci.yml)
[![Deploy](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/actions/workflows/deploy.yml/badge.svg)](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/actions/workflows/deploy.yml)

## Estado

Publicado em <https://flaviotinococoutinho.github.io/flaviotinoco.github.io/>, fora dos índices de busca até o
lançamento ([ADR 0008](docs/adr/0008-fora-dos-indices-ate-o-lancamento.md)). O estado verificado de cada área,
com a data da inspeção e o comando que o comprova, está em
[docs/arquitetura.md](docs/arquitetura.md#estado-da-implementação). As mudanças por versão estão no
[registro de mudanças](CHANGELOG.md); as frentes abertas, nas
[issues](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/issues).

## Ferramentas

O `package.json` declara Node.js a partir de `22.18.0` (os scripts em TypeScript dependem do _type stripping_
nativo, ativo por padrão a partir dessa versão; o CI usa a 24, ver `.nvmrc`), pnpm `10.28.0` (configurações em
`pnpm-workspace.yaml`) e Astro `7.3.8`. Os módulos WebAssembly exigem Rust; a versão e o alvo
`wasm32-unknown-unknown` vêm de `wasm/rust-toolchain.toml` e são instalados pelo `rustup`.

## Como executar

```sh
pnpm install --frozen-lockfile
pnpm build:wasm          # compila os núcleos Rust → src/wasm/*.wasm
pnpm dev                 # servidor de desenvolvimento
pnpm build               # build:wasm → astro build (estrito) → índice de busca (saída em dist/)
pnpm preview             # serve dist/ em http://localhost:4321/flaviotinoco.github.io/
```

Sem variáveis de ambiente, a compilação usa os valores de produção (site de projeto com _base path_
`/flaviotinoco.github.io/`), para que erros de caminho apareçam localmente. Para servir na raiz:
`BASE_PATH= pnpm build`.

`pnpm build:site` falha quando o Astro registra um erro de renderização de conteúdo: o carregador de conteúdo
do Astro apenas registra essas falhas e termina com sucesso, o que publicaria páginas vazias.

## Verificações

| Verificação   | Comando                        | O que confere                                                                                                              |
| ------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Tokens        | `pnpm check:tokens`            | `tokens.css` corresponde a `tokens.json`                                                                                   |
| Paleta        | `pnpm verify:palette`          | contraste WCAG AAA e APCA, gama sRGB, distinção dos estratos sob discromatopsia simulada (Machado et al., 2009; CIEDE2000) |
| Tipos         | `pnpm check:types`             | `astro check` e `tsc`                                                                                                      |
| Lint          | `pnpm check:lint`              | pureza do núcleo, camadas, regras do typescript-eslint                                                                     |
| Formatação    | `pnpm check:format`            | Prettier; o conteúdo autoral é excluído de propósito                                                                       |
| Paridade i18n | `pnpm check:i18n`              | catálogos com as mesmas chaves; traduções presentes; quatro estratos nas duas línguas                                      |
| Testes        | `pnpm test` e `pnpm test:wasm` | testes unitários e de propriedade; os de WebAssembly exigem `pnpm build:wasm`                                              |
| Wasm          | `pnpm check:wasm`              | `cargo fmt`, `clippy` e `cargo test`                                                                                       |
| Links         | `pnpm check:links`             | links, recursos e fragmentos internos de `dist/`                                                                           |
| Orçamentos    | `pnpm check:budgets`           | tamanho de HTML, CSS, JS e WebAssembly por página                                                                          |
| Robots        | `pnpm check:robots`            | toda página de `dist/` leva `noindex` enquanto `SITE_INDEXING` estiver desligado                                           |
| E2E           | `pnpm test:e2e`                | axe (WCAG 2.2 AA) nos temas claro e escuro, teclado, movimento reduzido, CSP, paleta, preferências, laboratórios           |

`pnpm check` encadeia tipos, lint, formatação, tokens, paleta, i18n e testes. O CI
(`.github/workflows/ci.yml`) executa tudo em cada pull request e na `main`; a `main` só recebe merges por
pull request com as verificações verdes. Testes de propriedade imprimem a semente usada; para reproduzir uma
falha: `FC_SEED=<semente> pnpm test`. Limiares, formalismos e evidências de cada verificação:
[docs/requisitos-nao-funcionais.md](docs/requisitos-nao-funcionais.md).

## Publicação

Cada push em `main` executa `.github/workflows/deploy.yml`: `actions/configure-pages` informa a origem e o
_base path_, a compilação os recebe em `SITE` e `BASE_PATH`, links, orçamentos e `robots` são conferidos de
novo contra os valores reais, e o artefato `dist/` é publicado com `actions/deploy-pages`. O dono do
repositório é `flaviotinococoutinho`, então este é um site de projeto, servido em
<https://flaviotinococoutinho.github.io/flaviotinoco.github.io/>; renomear o repositório para
`flaviotinococoutinho.github.io` ou configurar um domínio próprio remove o _base path_ sem mudança de código
([ADR 0005](docs/adr/0005-implantacao-no-github-pages.md)). As ações do GitHub são fixadas por SHA de commit e
atualizadas pelo Dependabot.

## Versionamento

A plataforma segue o Versionamento Semântico; o conteúdo tem revisões próprias no frontmatter. Regras,
registro de mudanças e processo de _release_ (uma _tag_ `vX.Y.Z` publica a _release_ pelo
`.github/workflows/release.yml`): [docs/versionamento.md](docs/versionamento.md).

## Documentação

- Arquitetura e estado da implementação: [docs/arquitetura.md](docs/arquitetura.md).
- Requisitos não funcionais, com formalismos, limiares e evidências: [docs/requisitos-nao-funcionais.md](docs/requisitos-nao-funcionais.md).
- Programa editorial: [docs/programa-editorial.md](docs/programa-editorial.md).
- Ontologia de conceitos: [docs/ontologia.md](docs/ontologia.md).
- Decisões: [ADRs em docs/adr/](docs/adr/).
- Guias de autoria: [guia editorial e ABNT](docs/guia-editorial.md), [citações](docs/guia-citacoes.md),
  [LaTeX](docs/guia-latex.md), [leitura não linear](docs/leitura-nao-linear.md), [léxicos](lexicon/README.md).
- Versionamento: [docs/versionamento.md](docs/versionamento.md); [registro de mudanças](CHANGELOG.md).
- Planos de rodada: [docs/planos/](docs/planos/).
- Regras para colaboradores e ferramentas de automação: [CLAUDE.md](CLAUDE.md).
- Pesquisas (relatórios datados de 11/10/2026; revalide as fontes antes de decidir por eles):
  [Astro](docs/research/astro7.md), [Markdown e LaTeX](docs/research/unified-latex.md),
  [léxico](docs/research/lexicon.md), [ABNT](docs/research/abnt.md),
  [compatibilidade de CSS](docs/research/css-support.md), [GitHub Actions](docs/research/github-actions.md),
  [fontes](docs/research/fonts.md).

## Contribuição

Um pull request por assunto, com o template do repositório (o quê e por quê, como verificar, lista de
verificação) e commits no formato Conventional Commits. Toda mudança da plataforma acrescenta uma linha em
"Não lançado" do registro de mudanças; uma decisão não óbvia ganha um ADR. Nenhuma verificação é desligada ou
afrouxada para o CI passar.

## Licença

A licença dos textos e do código ainda não foi definida pelo autor; até lá, nenhuma licença de reutilização
está declarada.
