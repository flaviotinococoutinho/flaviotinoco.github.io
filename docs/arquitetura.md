# Arquitetura-alvo e estado de implementação

Este documento define a arquitetura pretendida e os contratos entre as partes. A implementação está parcial. Os requisitos abaixo não comprovam que um recurso funciona ou que passou por testes.

## Estado inspecionado em 15/10/2026

A árvore contém páginas, componentes, estilos, adaptadores do pipeline Markdown e parte do núcleo funcional. As pesquisas de 11/10/2026 estão em `docs/research/` e mantêm suas datas e limites originais.

| Área                                                    | Estado no código versionado                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/core/`                                             | Contém `algebra`, `domain`, `i18n`, `design` e `latex/macros.ts`                            |
| Núcleo de bibliografia, léxico, ABNT, ontologia e folds | Diretórios ainda ausentes                                                                   |
| Pipeline Markdown                                       | Ordem declarada em `src/adapters/unified/pipeline.ts`; existem adaptadores para os estágios |
| Ilhas                                                   | `src/islands/registry.ts` existe; `src/islands/elements/` ainda não existe                  |
| Conteúdo, bibliografia e léxicos                        | `src/content/`, `bibliography/` e `lexicon/` ainda não existem                              |
| WebAssembly e CLI                                       | `wasm/`, `src/adapters/wasm/`, `cli/` e `scripts/build-wasm.mjs` ainda não existem          |
| Verificações                                            | Existem testes de rotas e integridade, `scripts/tokens.ts` e `scripts/verify-palette.ts`    |
| Automação e decisões                                    | `.github/workflows/ci.yml`, `CLAUDE.md` e `docs/adr/` ainda não existem                     |

O `package.json` declara comandos que dependem desses arquivos ausentes. `pnpm dev`, `pnpm build` e a cadeia completa de verificações ainda precisam de implementação. A organização e os contratos das seções seguintes descrevem o destino dessas partes.

## 1. Conceito

O conteúdo do site segue quatro estratos nesta ordem:

| Estrato   | Pergunta-guia                        | Método                         | Símbolo (k-simplexo)   |
| --------- | ------------------------------------ | ------------------------------ | ---------------------- |
| Filosofia | O que é isto, e como sabemos?        | análise conceitual             | ponto (0-simplexo)     |
| Teoria    | Que modelo explica isto?             | modelagem, abstração           | segmento (1-simplexo)  |
| Formal    | O que se segue necessariamente?      | prova, algoritmo, determinismo | triângulo (2-simplexo) |
| Valor     | Para que serve, a quem, a que custo? | projeto, produto, ética        | tetraedro (3-simplexo) |

A representação associa cada estrato a uma forma, uma posição, um rótulo e uma luminosidade. Essa redundância permite identificar os estratos sem depender apenas da cor. Discromatopsia, impressão em tons de cinza e leitores de tela exigem validação específica.

## 2. Princípios da arquitetura-alvo

1. Núcleo funcional, casca imperativa (G. Bernhardt, _Boundaries_, 2012). Toda regra de negócio vive em
   `src/core/**`: funções puras, determinísticas, sem E/S, sem DOM, sem Astro. A casca (`src/adapters`,
   `src/islands`, `src/pages`, `scripts`, `cli`) só lê, escreve e desenha.
2. Analise, não valide (A. King, 2019). Dados não tipados (frontmatter, `.bib`, `.tsv`, JSON) são
   convertidos uma única vez, na fronteira, em tipos refinados (`Slug`, `ConceptId`, `Locale`,
   `CitationKey`, `Label`). Depois disso, o compilador impede confusões.
3. Tipos algébricos e totalidade. Uniões discriminadas com verificação de exaustividade (`absurd`), `Result`
   em vez de exceções no núcleo, `readonly` por padrão. Erros de conteúdo são acumulados (validação aplicativa)
   para que o autor veja todos de uma vez.
4. Preservação de informação (injetividade). Toda transformação de texto `T` admite uma recuperação `R` com
   `R(T(x)) = x`: ou o texto plano é preservado (marcações só _acrescentam_ estrutura), ou o original fica
   registrado (`data-*`). Essa propriedade deve ser verificada por testes de propriedade com fast-check. Exemplos de perda evitada:
   - `remark-directive` transformaria "às 10:30" em "às 10" → estágio `integrity` restaura o trecho literal;
   - `$` simples transformaria "R$ 5,00 e R$ 10,00" em fórmula → só `$$…$$` é matemática;
   - YAML 1.1 interpreta `no`/`yes`/`on` como booleanos (_Norway problem_) → léxicos em TSV com esquema explícito;
   - Astro 7 apagaria o espaço entre elementos inline (`compressHTML: 'jsx'`) → `compressHTML: true`;
   - BibTeX decodificado não sai em NFC (`é` = `e` + U+0301) → normalização NFC na fronteira.
5. Conteúdo declarativo. Os textos usam Markdown (`.md`) e diretivas, sem JSX. O contrato prevê exportação para Pandoc e LaTeX sem executar código do conteúdo.
6. Fonte única de verdade. Tokens de design em `src/core/design/tokens.json` (formato W3C DTCG 2025.10) →
   CSS gerado. Relações SKOS derivadas (`narrower`) são calculadas a partir das inversas (`broader`), nunca
   armazenadas.
7. Leveza como requisito. HTML estático; nenhum framework de UI no cliente; cada comportamento é um
   _custom element_ carregado sob demanda; WebAssembly sem `wasm-bindgen`, sem importações.

## 3. Organização pretendida por padrão funcional

```
src/
├── core/                    Núcleo funcional puro (regras de lint impedem E/S, DOM e não determinismo)
│   ├── algebra/             Result, Brand, absurd e pipe
│   ├── domain/              tipos do domínio e seus construtores (locale, strata, facets, epistemic, identifiers)
│   ├── i18n/                rotas (codec bijetivo), catálogos de mensagens com paridade de chaves
│   ├── design/              tokens → CSS; simulação de discromatopsia (Machado et al., 2009); escalas φ
│   ├── latex/               macros, contadores, ambientes, referências cruzadas, exportação .tex
│   ├── bibliography/        analisador BibTeX (árvore sintática), modelo de referência, estilos NBR 6023/10520 e APA
│   ├── lexicon/             TSV → trie → regex compilada; filtro de Bloom; casamento sobre nós de texto
│   ├── abnt/                regras tipográficas e normativas como dados + aplicadores puros
│   ├── ontology/            grafo SKOS: fechamento, ciclos, LCS, conteúdo informacional, JSON-LD
│   └── fold/                catamorfismos sobre árvores: contagem de palavras, tempo de leitura, grafo argumentativo
├── adapters/                Adaptadores que ligam o núcleo a ferramentas
│   ├── unified/             estágios remark/rehype (um arquivo por estágio) + carregadores de contexto
│   ├── astro/               i18n (BASE_URL), consultas de conteúdo, fontes, script pré-pintura
│   └── wasm/                carregamento e invólucros tipados dos módulos WebAssembly
├── islands/                 DOM: registry.ts + elements/ft-*.ts (custom elements sob demanda)
├── views/                   composição de páginas (Astro), uma por tipo de rota
├── components/              componentes de apresentação (Astro, sem estado)
├── layouts/                 documento base
├── pages/                   despachantes de rota gerados pelo codec do núcleo
├── content/                 essays/, labs/, strata/, pages/ ({pt,en}/*.md) e concepts/*.json
└── styles/                  tokens.css (gerado), camadas base, components/*.css
```

Padrões funcionais por pasta (o nome diz o que a função é):

| Padrão            | Assinatura                                    | Propriedades exigidas                                    |
| ----------------- | --------------------------------------------- | -------------------------------------------------------- |
| parser (`parse*`) | `unknown → Result<T, E>`                      | aceita exatamente a linguagem especificada               |
| codec             | `encode: A → B`, `decode: B → Result<A>`      | `decode ∘ encode = id`                                   |
| transform         | `Tree → Tree`                                 | preservação do texto (ou recuperação), idempotência      |
| fold              | `Tree → Summary`                              | determinismo; invariância a reordenação quando aplicável |
| compiler          | `Spec → Artefact` (TSV → regex, tokens → CSS) | equivalência com a especificação ingênua                 |
| formatter         | `Model × Style → string`                      | exemplos trabalhados da norma (ABNT/APA)                 |

## 4. Pipeline de Markdown

`src/adapters/unified/pipeline.ts` declara a ordem dos estágios. O contrato de cada estágio exige as seguintes ações:

- reivindica as diretivas que trata atribuindo `node.data.hName` (ou substituindo o nó);
- registra avisos com `file.message(motivo, nó, 'estágio:regra')` e falhas com `file.fail(...)`;
- exporta metadados para a página via `file.data.astro.frontmatter.<campo>` (chega em `remarkPluginFrontmatter`);
- nunca percorre o interior de `code`, `inlineCode`, `math`, `inlineMath`, `html` nem URLs de links.

## 5. Linguagem de autoria (contrato entre conteúdo e estágios)

O contrato de autoria define uma sintaxe fechada. Nomes desconhecidos de diretiva de bloco devem falhar a compilação. Diretivas de texto desconhecidas devem virar texto literal com aviso.

### 5.1 Matemática nos estágios `latex` e `katex`

- Inline: `$$a^2 + b^2 = c^2$$` dentro do parágrafo. Bloco: `$$` em linhas próprias.
- Rótulo: `\label{eq:nome}` dentro do bloco. O contrato numera somente equações rotuladas, com algarismos arábicos entre parênteses e alinhamento à direita, conforme a ABNT NBR 14724.
- Referências: `:eqref[eq:nome]` no texto → "(3)" com link; `\eqref{eq:nome}` dentro de outra fórmula.
- Macros do site em `src/core/latex/macros.ts`; macros locais no frontmatter `macros: { '\\foo': '…' }`.

### 5.2 Ambientes (estilo `amsthm`)

```markdown
:::definition{#def:entropia title="Entropia"}
Texto da definição.
:::

::::theorem{#thm:amostragem title="Nyquist–Shannon"}
Enunciado.

:::proof
Demonstração (termina com ∎ automaticamente).
:::
::::
```

Nomes: `definition`, `theorem`, `lemma`, `proposition`, `corollary`, `conjecture`, `axiom`, `example`,
`remark` (não numerado), `proof` (não numerado; `of="thm:x"` opcional). Numeração única e contínua por documento
(como `\newtheorem{lemma}[theorem]`). Aninhamento exige mais dois-pontos no bloco externo.
Referência: `:ref[thm:amostragem]` → "Teorema 2" com link. Rótulo inexistente = erro de compilação.

### 5.3 Ilustrações e tabelas (ABNT NBR 14724, 5.8–5.9)

```markdown
:::figure{#fig:alias kind="figure" title="Dobramento espectral" source="Elaborado pelo autor (2026)."}
![Descrição textual completa da imagem](./alias.svg)
:::
```

`kind ∈ {figure, chart, frame, table}` → "Figura", "Gráfico", "Quadro", "Tabela", cada um com contador próprio.
Título acima ("Figura 1 – Título"), fonte abaixo ("Fonte: …"). Referência: `:ref[fig:alias]`.

### 5.4 Citações e referências (estágio `citations`)

- Parentética: `[@shannon1948]`, `[@shannon1948, p. 379]`, `[@peirce1931; @saussure1916]`, `[-@shannon1948]`
  (omite autor). Narrativa: `@shannon1948 [p. 379]`.
- pt-BR: ABNT NBR 10520:2023 (autor-data; sobrenomes em maiúsculas e minúsculas) e NBR 6023:2025
  (3.ª ed. = 2018 + Emenda 1; lista "Referências"). en: APA 7.
- A lista sai onde houver `::bibliography`; sem a diretiva, é acrescentada ao final. Chave inexistente entre
  colchetes = erro de compilação; `@palavra` fora de colchetes que não seja chave conhecida = texto.
- Fonte única: `bibliography/*.bib` (BibTeX), analisado pelo núcleo (NFC na fronteira).

### 5.5 Leitura não linear (estágios `reading`, `concepts`, `embeds`)

| Sintaxe                                             | Resultado                                                                     |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `:::stretch{label="Por que logaritmo?"}` … `:::`    | _stretchtext_ (T. Nelson): expansão no fluxo do texto                         |
| `:sidenote[texto]`                                  | nota lateral numerada (margem em telas largas; alternável em telas estreitas) |
| `:marginnote[texto]`                                | nota de margem não numerada                                                   |
| `::::scrolly` + `:::step{state="…"}`                | figura fixa cujo estado acompanha a rolagem por etapas                        |
| `::::horizontal{label="…"}` + `:::panel`            | sequência horizontal dentro da rolagem vertical                               |
| `:::epigraph{source="@chave"}`                      | epígrafe                                                                      |
| `:::aside`                                          | digressão destacada                                                           |
| `::toc`                                             | sumário do documento                                                          |
| `## Título {#id .claim depends="def-1,premissa-2"}` | nó do grafo argumentativo (Toulmin, 1958)                                     |
| `:concept[entropia]{ref=entropy}`                   | link ao conceito com prévia da definição                                      |
| `::concept-map{focus=entropy depth=2}`              | subgrafo da ontologia                                                         |
| `::lab{widget=sampling}`                            | laboratório interativo (WebAssembly) embutido                                 |

Tipos de nó argumentativo: `question`, `definition`, `premise`, `claim`, `proof`, `example`, `objection`,
`reply`, `application`, `conclusion` (`premise` ≈ _grounds_, `objection` ≈ _rebuttal_ no modelo de Toulmin).

### 5.6 Marcação normativa explícita (estágio `abnt`)

A marcação automática (dicionários em `lexicon/*.tsv`) pode ser sobreposta, com precedência
diretiva explícita > frontmatter > dicionário:

| Sintaxe                                      | Efeito                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `:foreign[Zeitgeist]{lang=de}`               | `<i lang="de">` para estrangeirismo (WCAG 3.1.2, _Language of Parts_)  |
| `:name[Ferdinand de Saussure]`               | nome próprio: sem hifenização, `translate="no"`                        |
| `:abbr[FFT]{title="Fast Fourier Transform"}` | sigla com expansão                                                     |
| `:raw[data]`                                 | suprime qualquer marcação automática (homógrafos: "data" em português) |
| `:sc[texto]`                                 | versaletes                                                             |

## 6. Interface

- Tipografia: Literata (texto, eixo de tamanho óptico), Atkinson Hyperlegible Next (interface),
  Atkinson Hyperlegible Mono (código). Escala fluida Utopia com razão √φ no limite superior; entrelinha φ;
  medida de 66 caracteres. Hifenização por idioma (`lang`), desligável pelo leitor.
- Espaço: potências de φ; coluna de leitura e coluna de margem na razão φ:1.
- Tempo: durações em milissegundos de Fibonacci; toda animação tem estado final como padrão; preferências
  do leitor sobrepõem as do sistema; _view transitions_ nativas entre páginas.
- Cor: o projeto prevê verificar a paleta com `scripts/verify-palette.ts`, considerando contraste WCAG AAA para texto, APCA,
  gama sRGB, separabilidade CIEDE2000 sob protanopia/deuteranopia/tritanopia e luminosidade monótona sob
  acromatopsia. Cor nunca é o único portador de significado.
- Textura: ruído fractal discreto (feTurbulence) no fundo; nenhum gradiente linear.

## 7. Ilhas (comportamento no cliente)

- Uma tag `ft-*` ⇔ um módulo `src/islands/elements/ft-*.ts` que chama `customElements.define`.
- `src/islands/registry.ts` (único `<script>` global) importa cada módulo quando a tag se aproxima da viewport.
- Todo elemento tem conteúdo de fallback útil sem JavaScript, respeita `--motion`, é operável por teclado e
  anuncia resultados relevantes em `aria-live="polite"`.
- Lógica não trivial (layout de grafo, mapeamentos de rolagem, easing) fica no núcleo e é testada.

## 8. Verificações previstas

O `package.json` declara verificações de tipos, lint, formatação, tokens, paleta, i18n, testes, WebAssembly, links, tamanho e acessibilidade. A árvore ainda não contém todos os arquivos necessários para executá-las.

A implementação da automação deve distinguir os checks disponíveis dos checks pendentes. Uma declaração de script não comprova execução nem aprovação. Este documento não registra execução de build, testes ou auditoria de acessibilidade.
