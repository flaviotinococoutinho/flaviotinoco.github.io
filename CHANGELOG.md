# Registro de mudanças

Mudanças notáveis da plataforma do site: código, pipeline de compilação, linguagem de autoria,
verificações e implantação. O formato segue o [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/)
e as versões, o [Versionamento Semântico 2.0.0](https://semver.org/lang/pt-BR/) (regras em
[docs/versionamento.md](docs/versionamento.md) e [ADR 0010](docs/adr/0010-versionamento-semantico.md)).

O conteúdo não é versionado aqui: cada ensaio, laboratório e página declara `published` e `revisions` no
próprio frontmatter.

## [Não lançado]

### Adicionado

- Escopo do site como vocabulário fechado e medido ([ADR 0013](docs/adr/0013-escopo-do-site.md)): a faceta de
  domínio se divide em onze disciplinas do núcleo e onze fundamentos (`src/core/domain/scope.ts`); um ensaio
  sem disciplina do núcleo não compila, e ao menos 75 % das obras devem declarar uma
  (`tests/unit/content/scope.test.ts`). Páginas `/<lang>/escopo/` (`/scope/`) e uma por disciplina, com a
  matriz de cobertura disciplina × estrato calculada do acervo, o que fica de fora e os fundamentos de cada
  disciplina; entradas no cabeçalho, no rodapé e na paleta de comandos.
- Laboratório `flags` ("Flags e estados"): o reprodutor de vídeo do ensaio "A segunda flag" em duas
  representações que recebem os mesmos eventos, com as oito configurações de três flags, os eventos que o
  autômato recusa e a redundância do histórico (`src/core/labs/flags.ts`, `ft-lab-flags`).
- Página inicial: a proposição do site como título, as chamadas, o acervo em números e o laboratório de flags
  em forma compacta na primeira tela; sem JavaScript, a mesma figura desenhada na compilação.
- Sala de leitura ([ADR 0014](docs/adr/0014-sala-de-leitura.md)): nos ensaios, em janelas largas, uma cena
  three.js (mesa, estante, janela com chuva, vela) ocupa as calhas ao lado do texto, que continua sobre uma
  folha opaca com os tokens de papel. A decisão de mostrá-la é uma função pura (`src/core/chrome/room.ts`):
  nada é baixado sem calha, com economia de dados, contraste aumentado ou renderizador por software; com
  movimento reduzido fica um quadro. A sala é calculada do site: a estante é o acervo (uma lombada por ensaio,
  um caderno por laboratório, cor do estrato), a obra lida fica sobre a mesa sob o simplexo do seu estrato, a
  vela queima com o progresso da leitura e a chuva cede no fim. Preferência `room` (desligada por padrão,
  automática, ligada) no painel; tokens `--room-*`; dependência `three` 0.187.0, isolada num módulo sob demanda.
- Laboratório `pipeline` ("O pipeline"): um pipeline de ETL de até seis etapas sobre uma distribuição exata de
  144 vendas; depois de cada etapa, a informação mútua com a venda inteira e com uma pergunta escolhida pelo
  leitor, calculada por `information.wasm`, e a etapa em que a pergunta deixa de ser respondida
  (`src/core/labs/pipeline.ts`, `ft-lab-pipeline`); embutido no ensaio de ETL.
- Cartões de compartilhamento: um PNG de 1200 × 630 por ensaio e laboratório e um do site por língua
  (`/<lang>/card/<tipo>/<slug>.png`), gerados na compilação por satori e resvg a partir de um modelo puro
  (`src/core/chrome/card.ts`): estrato com glifo e nome, título, descrição, disciplinas e, nos laboratórios, a
  miniatura. Toda página declara `og:image` (com dimensões e texto alternativo) e `twitter:card`. As fontes dos
  cartões são instâncias TTF estáticas (`scripts/fonts/build_card_fonts.py`), porque o satori não lê WOFF2.
- Memória de leitura (`ft-reading-memory`, `src/core/reading/memory.ts`): ao voltar a um ensaio, o leitor vê
  onde parou (seção e porcentagem) e pode continuar dali, com o foco levado à seção, ou esquecer. O registro
  fica só no `localStorage`, limitado a 40 ensaios; uma visita que só espia o topo não apaga o lugar. A vela da
  sala de leitura começa tão gasta quanto o leitor a deixou.
- Orçamentos: todo módulo do pacote do site passa a ter teto de 16 KiB em gzip, e a cena da sala de leitura,
  de 140 KiB (`pnpm check:budgets`).

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
- Sala de leitura interativa ([ADR 0014](docs/adr/0014-sala-de-leitura.md), decisões 15 e 16): para quando o
  leitor para (todos os quadros enquanto ele se mexe, 15 por segundo até 20 s, depois um quadro parado, `pace`
  em `src/core/chrome/room.ts`) e responde à mão nas calhas: o olho acompanha o ponteiro (paralaxe), a chama se
  inclina com o ar da mão, o vidro embaçado se limpa por onde ela passa, e o livro sob o ponteiro sai da
  estante com o título ao lado; um clique abre a obra. Títulos e endereços em `/<lang>/shelf.json`, da mesma
  lista que o atributo `shelf` (`src/adapters/astro/shelf.ts`), baixados só depois que a sala acende.

### Alterado

- Ambiente rústico em todo ensaio ([ADR 0014](docs/adr/0014-sala-de-leitura.md), decisão 17): o artigo é uma
  folha de papel no seu suporte de madeira, sobre uma mesa velha, só com CSS (`room.css`, `--wood-image` em
  `texture.css`): sem script, sem download, sem movimento. A sala em 3D continua a versão acesa, pelo botão do
  ensaio. A mesa some com a cena acesa, no modo de foco, com contraste aumentado, com cores forçadas e na
  impressão.
- Proveniência das obras: por decisão do autor, os ensaios e laboratórios publicados até 16/11/2026 deixam de
  declarar o uso de IA. O campo `provenance` passa a opcional (`src/content.config.ts`); o contrato editorial
  (`tests/unit/content/syntax.test.ts`) exige a nota só de quem declarar; guia e programa editoriais, "Sobre" e
  "Colofão" acompanham.
- Sala de leitura desligada por padrão (a preferência `room` passa a `off` | `auto` | `on`, com `off` por
  padrão): nada dela é baixado até o leitor pedir. O pedido mais perto é o botão "Sala de leitura" no
  cabeçalho do ensaio (`ft-room-switch`, botão de alternância com `aria-pressed`), que só aparece onde a sala
  cabe e grava a mesma preferência do painel. Quem havia escolhido "ligada" continua com a sala.
- Preferências: ler, gravar e aplicar ficam num armazenamento compartilhado (`src/islands/preferences-store.ts`)
  que relê o que está guardado antes de mudar uma chave, para que o painel e o botão da sala não se
  sobrescrevam; o painel espelha mudanças feitas por outro controle da página.
- Faceta de domínio: `technology` passa a `information-technology`; entram `software-architecture`,
  `systems-design`, `systems-optimization` e `data-engineering`; quatro ensaios e treze conceitos foram
  reclassificados (sem mudança de prosa; a revisão está registrada em cada ensaio).
- Página inicial: as "frentes de investigação" passam a ser geradas do modelo de escopo (cinco frentes, com
  suas disciplinas e a obra mais recente de cada uma); os simplexos acompanham a seção da ponte.
- Esquema de conteúdo: o `widget` de um laboratório deriva de `WIDGETS` (uma lista só).
- Contrato editorial do corpus (`tests/unit/content/syntax.test.ts`): a data de publicação e a nota de
  proveniência combinadas valem só para os nove textos-semente (lista fechada, conferida nas duas línguas);
  toda obra segue o contrato geral, que passa a exigir a primeira revisão no dia da própria publicação,
  revisões em ordem de data e nota de proveniência sempre que houver assistência ou faltar revisão.
- Identidade do site nos catálogos (`site.tagline`, `site.description`): foco declarado em engenharia de
  software e computação ([plano de 10/11/2026](docs/planos/2026-11-10-foco-em-engenharia-de-software.md)).
- Léxico: `flag` e `statechart` em `lexicon/estrangeirismos.tsv`; vocabulários fechados dos testes de
  conteúdo com os conceitos e as chaves bibliográficas de estado e autômatos.
- Signos do papel argumentativo (`src/core/reading/argument.ts`): círculos, quadrados e losangos davam lugar a
  confusão com os simplexos dos estratos (o ponto da Filosofia lia-se como "pergunta"); passam à notação
  lógica, em pares: premissa ∵ e conclusão ∴, tese ⊢ e aplicação ⊨, objeção ¬ e resposta ¬¬, pergunta ? e
  prova ∎, definição ≔ e exemplo ∈. A gramática dos signos do site fica escrita em
  [docs/arquitetura.md](docs/arquitetura.md) §6.
- Blocos de código: um tema do próprio site no lugar dos temas do GitHub, cujos azuis, roxos, laranjas e
  verdes competiam com as cores reservadas (um azul lia-se como link, um laranja como o estrato de valor) e cujo
  fundo branco ou quase preto abria um buraco no papel. O realce passa a ser tipográfico, como nas linguagens de
  publicação (ALGOL 60, WEB): palavras reservadas em negrito (só palavras, nunca `=` ou `=>`), comentários na
  tinta secundária, o resto na tinta do texto, sobre o papel rebaixado (`src/adapters/astro/code.ts`). Um tema
  só serve aos quatro esquemas de cor; as cores forçadas mantêm o negrito.
- Laboratório "O pipeline": as duas barras de cada etapa (uma delas na cor dos links) passam a um indicador só,
  contorno e preenchimento; o preenchimento, a pergunta, nunca passa do contorno, a venda inteira, o que é a
  própria desigualdade do processamento de dados.
- Página inicial: a obra "mais recente" de cada frente passa a vir de um emparelhamento máximo entre frentes e
  obras (algoritmo de caminhos aumentantes de Kuhn, `latestByAxis` em `src/core/domain/scope.ts`): uma obra com
  disciplinas de duas frentes aparece numa só ("Flags e estados" e "O pipeline" apareciam duas vezes cada), e
  nenhuma frente que tem obras fica vazia. Obras do mesmo dia se ordenam pela chave de tradução, e não pelo
  título traduzido, para que as duas línguas mostrem as mesmas obras.
- Índice dos laboratórios: a abertura não diz mais quantos são nem de que áreas ("Seis laboratórios… de sinais,
  informação, dinâmica e probabilidade" já eram oito, de mais áreas); cada cartão nomeia o seu resultado. A
  abertura das frentes ("Onze disciplinas em cinco frentes") ganhou teste contra o modelo de escopo.

### Corrigido

- Separadores "·" nas linhas de metadados (ensaio, cartões, listas de disciplinas, laboratório do pipeline): o
  ponto ficava antes do item seguinte e abria a linha quando ela quebrava, lido como marcador de lista; agora
  fica preso ao item anterior por um espaço não separável, e a quebra vem depois dele
  (`src/core/chrome/runin.ts`, `::after` no CSS). A seta da dica das passagens horizontais não fica mais sozinha
  numa linha.
- Laboratórios: o campo de texto pede o teclado numérico só quando o alfabeto é de dígitos; o histórico de eventos
  de "Flags e estados" e as etapas de "O pipeline" são letras, que o teclado numérico do celular não digita.
- Mapa do argumento aberto (`ArgumentMap.astro`, `ft-argument-map.ts`): removido o elemento `<title>` redundante
  dentro dos nós SVG cujo `aria-label` já nomeia o tipo e a seção, evitando concatenação duplicada do texto
  visível na auditoria do critério 2.5.3 da WCAG 2.2 (`label-content-name-mismatch`).
- Contraste dos blocos de código (WCAG 2.2, critério 1.4.3): os temas `github-light` e `github-dark` do Shiki
  desenhavam variáveis a 3,49:1 e comentários a 3,05:1. Os blocos passam ao tema tipográfico do site (em
  "Alterado"), com as duas tintas a 7:1 ou mais nos quatro esquemas; o teste de guarda
  `tests/unit/guardrails/code-contrast.test.ts` verifica dez linguagens.
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
