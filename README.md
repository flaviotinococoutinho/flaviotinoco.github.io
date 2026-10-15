# Blog de Flávio Tinoco

Projeto de blog técnico bilíngue em Astro e TypeScript. A arquitetura prevê conteúdo organizado em filosofia, teoria, formalização e valor, com matemática, citações e recursos de leitura não linear.

## Estado do projeto

A implementação está parcial. Existem páginas, estilos, componentes e adaptadores de Markdown, mas faltam módulos e arquivos usados pelos comandos do `package.json`. A árvore atual não contém artigos em `src/content/`.

`pnpm dev` e `pnpm build` executam `scripts/build-wasm.mjs`, que ainda não existe. Outros comandos dependem de scripts, módulos WebAssembly ou uma CLI ainda ausentes. Os comandos declarados não constituem um procedimento de instalação validado.

Consulte [a arquitetura e o estado de implementação](docs/arquitetura.md) antes de desenvolver ou tentar compilar o projeto.

## Ferramentas declaradas

O `package.json` declara Node.js a partir de `22.12.0`, pnpm `10.28.0` e Astro `7.3.8`. Essas versões descrevem o projeto versionado. A presença de uma dependência no manifesto não comprova que o build foi executado.

## Documentação

- [Arquitetura-alvo e estado de implementação](docs/arquitetura.md).
- [Pesquisa sobre Astro](docs/research/astro7.md).
- [Pesquisa sobre o pipeline de Markdown e LaTeX](docs/research/unified-latex.md).
- [Pesquisa sobre o léxico](docs/research/lexicon.md).
- [Pesquisa sobre ABNT](docs/research/abnt.md).
- [Pesquisa sobre compatibilidade de CSS](docs/research/css-support.md).
- [Pesquisa sobre GitHub Actions](docs/research/github-actions.md).

Os relatórios de pesquisa registram verificações de 11/10/2026. Preserve as datas e revalide as fontes antes de usar suas conclusões em uma nova decisão.
