# Registro de mudanças

Mudanças notáveis da plataforma do site: código, pipeline de compilação, linguagem de autoria,
verificações e implantação. O formato segue o [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões, o [Versionamento Semântico 2.0.0](https://semver.org/lang/pt-BR/) (regras em
[docs/versionamento.md](docs/versionamento.md) e [ADR 0010](docs/adr/0010-versionamento-semantico.md)).

O conteúdo não é versionado aqui: cada ensaio, laboratório e página declara `published` e `revisions` no
próprio frontmatter.

## [Não lançado]

## [0.2.0] - 2026-10-21

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
- Páginas da ontologia: estrutura (nível superior e vocabulário), comparação (comparar, conceitos-ponte, comunidades) e reticulado das obras, com navegação local (ADR 0009) (#30).
- Testes unitários e de propriedade do núcleo dos laboratórios (`tests/unit/labs/`) (#30).
- Sete conceitos-ponte: abstração, heurística, otimização, otimização combinatória, complexidade computacional, ocultação de informação e satisficing, com oito fontes novas na bibliografia (#31).
- Guias `docs/ontologia.md`, `docs/requisitos-nao-funcionais.md` e `docs/programa-editorial.md`; tabela de estado da implementação datada em `docs/arquitetura.md`; plano da rodada em `docs/planos/` (#32).
- Ícone de toque `public/apple-touch-icon.png`, gerado do favicon por `scripts/icons.ts` (#32).
- Teste e2e de reflow a 320 px em toda página (WCAG 1.4.10) (#33).
- Conjunto de regras da `main`: merge só por pull request, seis verificações obrigatórias, sem exclusão nem _force-push_ (emenda ao ADR 0005) (#32).

### Alterado

- Configurações do pnpm em `pnpm-workspace.yaml`; o campo `pnpm` do `package.json`, que o pnpm já não lia,
  foi removido.
- A paleta de comandos e o painel de preferências carregam seu conteúdo sob demanda, de `/<lang>/palette.json` e `/<lang>/preferences.json`; 14,4 KiB a menos de HTML em cada página (ADR 0009) (#30).
- O breadcrumb de categoria de um conceito aponta para a página de estrutura da ontologia (#30).

### Corrigido

- Grafia do nome do autor na bibliografia (Flávio) (#3).
- Seis páginas acima do orçamento de 150 KiB de HTML (#26, #30).
- O cálculo de marcas de eixo não termina para intervalos abaixo da resolução imprimível (#30).
- O gerador do teste de nomes BibTeX produzia o separador `and`; a propriedade falhava por sorteio (#30).
- Títulos de uma palavra mais larga que a coluna alargavam a página a 320 px (#33).

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

[Não lançado]: https://github.com/flaviotinococoutinho/flaviotinoco.github.io/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/flaviotinococoutinho/flaviotinoco.github.io/compare/d09aeabb1e32a34a686e7f2be9303c3323136bf9...v0.2.0
[0.1.0]: https://github.com/flaviotinococoutinho/flaviotinoco.github.io/tree/d09aeabb1e32a34a686e7f2be9303c3323136bf9
