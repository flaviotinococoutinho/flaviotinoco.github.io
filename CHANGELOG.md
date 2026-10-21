# Registro de mudanças

Mudanças notáveis da plataforma do site: código, pipeline de compilação, linguagem de autoria,
verificações e implantação. O formato segue o [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões, o [Versionamento Semântico 2.0.0](https://semver.org/lang/pt-BR/) (regras em
[docs/versionamento.md](docs/versionamento.md) e [ADR 0010](docs/adr/0010-versionamento-semantico.md)).

O conteúdo não é versionado aqui: cada ensaio, laboratório e página declara `published` e `revisions` no
próprio frontmatter.

## [Não lançado]

### Adicionado

- Bibliografia: analisador BibTeX, estilos ABNT NBR 6023/10520 e APA 7, estágio de citações, "como citar",
  citações schema.org e exportação `.bib` ([#3](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/pull/3)).
- Facetas de domínio novas (filosofia aplicada, comportamento, ciência da computação, sistemas de informação,
  engenharia de software, tecnologia e metodologia), vocabulário de qualidades e taxonomia de termos de ligação
  (ADR 0006); modelo das resenhas (ADR 0007) (#3).
- Ontologia de conceitos: grafo tipado em três níveis, garantias topológicas na compilação, medidas de
  informação, páginas de conceito, ontologia e glossário, exportações JSON-LD e JSON
  ([#24](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/pull/24)).
- Laboratórios interativos sobre os núcleos WebAssembly: Fourier e Gibbs, amostragem, entropia e Huffman, canal
  ruidoso, mapa logístico, teorema central do limite; campo ambiente na página inicial
  ([#25](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/pull/25)).
- Páginas fora dos índices de busca até o lançamento: opção de compilação `SITE_INDEXING` e
  `pnpm check:robots` (ADR 0008) ([#27](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/pull/27)).
- Registro de mudanças, regras de versionamento (ADR 0010) e workflow de _release_ a partir de _tags_ `vX.Y.Z`.

### Alterado

- Configurações do pnpm em `pnpm-workspace.yaml`; o campo `pnpm` do `package.json`, que o pnpm já não lia,
  foi removido.

### Corrigido

- Grafia do nome do autor na bibliografia (Flávio) (#3).

## [0.1.0] - 2026-10-11

### Adicionado

- Site em Astro 7 com conteúdo em Markdown puro e linguagem fechada de diretivas; núcleo funcional e casca
  imperativa (ADR 0001, ADR 0002).
- Núcleos WebAssembly em Rust, sem `wasm-bindgen` e sem importações (ADR 0003).
- Sistema de cor verificado: tokens W3C DTCG, contraste WCAG AAA e APCA, discromatopsia simulada (ADR 0004).
- Internacionalização pt-BR/en com codec de rotas bijetivo e paridade verificada.
- Camada LaTeX: ambientes `amsthm`, equações rotuladas, ilustrações ABNT e exportação `.tex`.
- Leitura não linear: _stretchtext_, notas laterais, _scrollytelling_, passagem horizontal, mapa do argumento.
- Léxico: estrangeirismos, latinismos, nomes próprios, siglas e homógrafos.
- Integração contínua e implantação no GitHub Pages com ações fixadas por SHA (ADR 0005)
  ([#1](https://github.com/flaviotinococoutinho/flaviotinoco.github.io/pull/1)).

[Não lançado]: https://github.com/flaviotinococoutinho/flaviotinoco.github.io/compare/d09aeabb1e32a34a686e7f2be9303c3323136bf9...HEAD
[0.1.0]: https://github.com/flaviotinococoutinho/flaviotinoco.github.io/tree/d09aeabb1e32a34a686e7f2be9303c3323136bf9
