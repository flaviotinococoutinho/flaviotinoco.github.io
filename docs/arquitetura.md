# Arquitetura e estado da implementação

Este documento define a arquitetura do site e os contratos entre as partes, e registra, com data e comando,
o que está implementado. Decisões: [ADRs](adr/); requisitos não funcionais: [requisitos-nao-funcionais.md](requisitos-nao-funcionais.md).

## Estado da implementação

Inspeção de 21/10/2026 sobre a `main`. Cada linha diz o que existe no código versionado e o comando que o
comprova; "verificado" significa que o comando passou nessa data (CI: `.github/workflows/ci.yml`). As pesquisas
de 11/10/2026 em `docs/research/` mantêm suas datas e limites originais.

| Área                                        | Estado no código versionado                                                                                                                                                | Comprovação                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Núcleo funcional (`src/core/`)              | `algebra`, `domain`, `i18n`, `design`, `latex`, `formulas`, `bibliography`, `lexicon`, `abnt`, `ontology`, `reading`, `fold`, `chrome`, `labs`, `web` — 150+ módulos puros | `pnpm check:lint` (pureza, camadas); `pnpm test` com cobertura                                            |
| Pipeline Markdown (`src/adapters/unified/`) | estágios `integrity`, `latex`, `citations`, `reading`, `concepts`, `embeds`, `abnt`, `meta`, na ordem de `pipeline.ts`                                                     | testes de cada estágio; `pnpm build:site` (estrito)                                                       |
| Ilhas (`src/islands/elements/`)             | 23 elementos `ft-*` carregados sob demanda pelo `registry.ts`                                                                                                              | e2e (`chrome`, `labs`, `keyboard`, `motion`)                                                              |
| Conteúdo                                    | 3 ensaios, 6 laboratórios, 4 estratos e 2 páginas por língua; 53 conceitos; 36 fórmulas com versão em palavras (ADR 0011); `bibliography/main.bib`; 5 léxicos              | `pnpm check:i18n`; testes de `content`, `bibliography/seed`, `ontology`, `lexicon`, `guardrails/formulas` |
| WebAssembly (`wasm/`, `src/adapters/wasm/`) | três núcleos `no_std` (`signal`, `information`, `dynamics`), ABI v1, sem importações                                                                                       | `pnpm check:wasm`; `pnpm test:wasm`; orçamento ≤ 48 KiB                                                   |
| Vistas e rotas                              | `src/pages` só despacha; `src/views` compõe; codec de rotas bijetivo com as páginas da ontologia e do acervo de fórmulas                                                   | `routes.test.ts`; `pnpm check:links`                                                                      |
| Verificações                                | tokens, paleta, tipos, lint, formatação, i18n, testes, wasm, links, orçamentos, `robots`, e2e (axe nos dois temas)                                                         | `pnpm check`; jobs `quality`, `wasm`, `build`, `e2e`                                                      |
| Automação e decisões                        | `ci.yml`, `deploy.yml`, `codeql.yml`, `release.yml`; Dependabot; ADRs 0001–0011; `CLAUDE.md`                                                                               | `tests/unit/guardrails/workflows.test.ts`                                                                 |
| Publicação                                  | Pages com origem "GitHub Actions"; `main` protegida por conjunto de regras; `noindex` até o lançamento (ADR 0008)                                                          | job `Deploy`; `pnpm check:robots`                                                                         |
| Pendente                                    | CLI `ft` (`cli/`, issue #20); complementos de leitura (#19); resenhas (#17, #18); camada de acidentes (#14)                                                                | branches `ws/*`                                                                                           |

Os requisitos abaixo definem a arquitetura pretendida e os contratos entre as partes. Um requisito não comprova
que um recurso funciona: a tabela acima, os ADRs e o CI comprovam.

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
│   ├── formulas/            acervo de fórmulas: analisador, registro (rótulos, conceitos, fontes), versão em palavras, JSON
│   ├── bibliography/        analisador BibTeX (árvore sintática), modelo de referência, estilos NBR 6023/10520 e APA
│   ├── lexicon/             TSV → trie → regex compilada; filtro de Bloom; casamento sobre nós de texto
│   ├── abnt/                regras tipográficas e normativas como dados + aplicadores puros
│   ├── ontology/            grafo SKOS tipado: topologia, medidas, reticulado, cena do mapa, JSON-LD
│   ├── reading/             leitura não linear: transformação, recuperação, layout do argumento, rolagem
│   ├── chrome/              moldura: navegação, preferências, paleta, atalhos, documentos sob demanda
│   ├── labs/                laboratórios: eixos, escalas, caminhos, resumos em texto, codec do estado
│   ├── web/                 JSON-LD seguro para páginas
│   └── fold/                catamorfismos sobre árvores: contagem de palavras, tempo de leitura, grafo argumentativo
├── adapters/                Adaptadores que ligam o núcleo a ferramentas
│   ├── unified/             estágios remark/rehype (um arquivo por estágio) + carregadores de contexto
│   ├── astro/               i18n (BASE_URL), consultas de conteúdo, fontes, script pré-pintura
│   └── wasm/                carregamento e invólucros tipados dos módulos WebAssembly
├── islands/                 DOM: registry.ts + elements/ft-*.ts (custom elements sob demanda)
├── views/                   composição de páginas (Astro), uma por tipo de rota
├── components/              componentes de apresentação (Astro, sem estado)
├── layouts/                 documento base
├── pages/                   despachantes de rota gerados pelo codec do núcleo; endpoints (RSS, JSON por idioma)
├── content/                 essays/, labs/, strata/, pages/ ({pt,en}/*.md), concepts/*.json e formulas/*.json
├── wasm/                    núcleos compilados (gerados por scripts/build-wasm.mjs; fora do controle de versão)
└── styles/                  tokens.css (gerado), camadas base, components/*.css
```

Fora de `src/`: `wasm/` (crates Rust), `scripts/` (ferramentas de linha de comando e `scripts/lib/` puro),
`bibliography/`, `lexicon/`, `tests/`, `docs/` e `.github/`.

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
- Versão em palavras: toda equação numerada do conteúdo está vinculada, pelo rótulo, a uma fórmula do acervo (`src/content/formulas/`, [ADR 0011](adr/0011-acervo-de-formulas.md)); o estágio gera sob ela o significado, a leitura em voz alta e o link para a ficha, e reprova rótulo sem fórmula.

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

## 8. Verificações

Todas as verificações declaradas no `package.json` existem e rodam no CI a cada PR e na `main`
(`.github/workflows/ci.yml`: `quality` ∥ `wasm` → `build` → `e2e`). A tabela do README lista cada comando e o
que ele confere; os limiares, formalismos e evidências estão em
[requisitos-nao-funcionais.md](requisitos-nao-funcionais.md). Uma verificação nunca é desligada ou afrouxada
para o CI passar (`CLAUDE.md`, regra 11): a correção vai no código, ou a regra muda em commit próprio com a
razão, ou um ADR registra a decisão.
