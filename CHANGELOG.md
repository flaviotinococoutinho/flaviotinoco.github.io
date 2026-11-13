# Registro de mudanças

Mudanças notáveis da plataforma do site: código, pipeline de compilação, linguagem de autoria,
verificações e implantação. O formato segue o [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões, o [Versionamento Semântico 2.0.0](https://semver.org/lang/pt-BR/) (regras em
[docs/versionamento.md](docs/versionamento.md) e [ADR 0010](docs/adr/0010-versionamento-semantico.md)).

O conteúdo não é versionado aqui: cada ensaio, laboratório e página declara `published` e `revisions` no
próprio frontmatter.

## [Não lançado]

### Adicionado

- Frentes temáticas e orientação de lugar digital na página inicial (`Frentes de investigação` com marcas
  vetoriais estruturais para engenharia de software, otimização, sistemas de informação e filosofia aplicada;
  destaque triplo para Laboratório, Ontologia e Fórmulas em palavras), marcação facetada de domínios nos cartões
  e cabeçalhos de ensaio, linha de suspensão (`hangline`) nos ensaios e distinção geométrica por traço tracejado
  para objeções dialéticas no mapa do argumento.
- Três novos ensaios bilíngues (`O registro não é a coisa`, `O ótimo é inimigo do prazo` e `Mudar sem quebrar`),
  onze conceitos SKOS (sistemas de informação, registro, transação, idempotência, lei de Amdahl, algoritmo de
  aproximação, complexidade essencial e acidental, camadas de ritmo, gramática visual, registro de decisão
  arquitetural e lei de Conway), cinco fichas de fórmula com versão em palavras e 23 referências primárias
  verificadas em `bibliography/main.bib`, além do ensaio `A segunda flag`.

### Alterado

- Contrato editorial do corpus (`tests/unit/content/syntax.test.ts`): a data de publicação e a nota de
  proveniência combinadas valem só para os nove textos-semente (lista fechada, conferida nas duas línguas);
  toda obra segue o contrato geral, que passa a exigir a primeira revisão no dia da própria publicação,
  revisões em ordem de data e nota de proveniência sempre que houver assistência ou faltar revisão.
- Identidade do site nos catálogos (`site.tagline`, `site.description`): foco declarado em engenharia de
  software e computação ([plano de 10/11/2026](docs/planos/2026-11-10-foco-em-engenharia-de-software.md)).
- Léxico: `flag` e `statechart` em `lexicon/estrangeirismos.tsv`; vocabulários fechados dos testes de
  conteúdo com os conceitos e as chaves bibliográficas de estado e autômatos.

### Corrigido

- Mapa do argumento aberto (`ArgumentMap.astro`, `ft-argument-map.ts`): removido o elemento `<title>` redundante
  dentro dos nós SVG cujo `aria-label` já nomeia o tipo e a seção, evitando concatenação duplicada do texto
  visível na auditoria do critério 2.5.3 da WCAG 2.2 (`label-content-name-mismatch`).
- Contraste dos blocos de código (WCAG 2.2, critério 1.4.3): os temas `github-light` e `github-dark` do Shiki
  desenhavam variáveis a 3,49:1 e comentários a 3,05:1; os temas passam a ser `github-light-default` e
  `github-dark-default` (`src/adapters/astro/code.ts`), e o teste de guarda
  `tests/unit/guardrails/code-contrast.test.ts` mede toda cor emitida em dez linguagens, nos dois esquemas.
- Build na Hostinger sem `cargo`: módulos WebAssembly versionados, com validação de integridade e das fontes
  antes de compilar o site e o índice de busca ([ADR 0012](docs/adr/0012-hostinger-build.md)).
- Validação portátil dos artefatos WASM: tamanho original e SHA-256 atestam integridade; o tamanho gzip é
  recalculado por ambiente, pois depende da implementação de zlib.

## [0.3.0] - 2026-10-21

### Adicionado

- Acervo de fórmulas ([ADR 0011](docs/adr/0011-acervo-de-formulas.md)): registro em `src/content/formulas/*.json`
  (36 fórmulas, nome, TeX canônico, significado, leitura em voz alta, símbolos, conceitos e fontes nas duas
  línguas), núcleo `src/core/formulas/`, páginas `/<lang>/formulas/` e `/<lang>/formulas/<slug>/`, exportação
  `/formulas.json`, entrada na navegação, na paleta, no rodapé e na página 404.
- Versão em palavras sob toda equação numerada (estágio `latex`: `details.formula__words`, `aria-describedby`)
  e sob a notação de cada conceito; teste de guarda `tests/unit/guardrails/formulas.test.ts` (todo bloco `$$`
  rotulado, todo rótulo com fórmula, toda notação com ficha).
- Leitura assistida: preferências `spacing` (espaçamento amplo, valores do critério 1.4.12 da WCAG 2.2),
  `ruler` (régua de leitura, `ft-reading-ruler`, geometria pura em `src/core/chrome/ruler.ts`) e `focus` (modo
  de foco: sem textura nem campo ambiente, marginália discreta); teste e2e `spacing.spec.ts` aplica o critério
  1.4.12 a todas as páginas de duas formas.

### Alterado

- Orçamento de HTML por página: 150 → 160 KiB (ADR 0011 altera a decisão 3 do ADR 0009; medição no ADR).
- Impressão: `[data-reveal]` sem animação e conteúdo de `details` exposto via `::details-content`.
- Diagnóstico novo do estágio `latex`: `missing-formula` (equação numerada sem fórmula no acervo).

### Corrigido

- Controles de formulário nunca alargam o contêiner: o seletor de conceitos da página de comparação (opção
  mais longa com espaçamento amplo) transbordava a janela a 390 px.
- Exportação LaTeX: um `[` literal logo depois de uma citação (`@k[` seguido de quebra de parágrafo) era lido
  como argumento opcional e podia engolir o bloco seguinte; o exportador termina a citação com `\relax`.

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

[Não lançado]: https://github.com/flaviotinococoutinho/flaviotinoco.github.io/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/flaviotinococoutinho/flaviotinoco.github.io/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/flaviotinococoutinho/flaviotinoco.github.io/compare/d09aeabb1e32a34a686e7f2be9303c3323136bf9...v0.2.0
[0.1.0]: https://github.com/flaviotinococoutinho/flaviotinoco.github.io/tree/d09aeabb1e32a34a686e7f2be9303c3323136bf9
