# Arquitetura

> Documento normativo. Descreve **o que o sistema é** e **os contratos entre as partes**. Decisões pontuais e
> suas alternativas ficam nos ADRs (`docs/adr/`); evidências e fontes, em `docs/research/`.

## 1. Conceito

O site é uma ponte em quatro estratos, percorrida sempre no mesmo sentido:

| Estrato | Pergunta-guia | Método | Símbolo (k-simplexo) |
|---|---|---|---|
| Filosofia | O que é isto, e como sabemos? | análise conceitual | ponto (0-simplexo) |
| Teoria | Que modelo explica isto? | modelagem, abstração | segmento (1-simplexo) |
| Formal | O que se segue necessariamente? | prova, algoritmo, determinismo | triângulo (2-simplexo) |
| Valor | Para que serve, a quem, a que custo? | projeto, produto, ética | tetraedro (3-simplexo) |

Cada passo acrescenta uma dimensão de determinação: da questão sem extensão ao artefato sólido. A ordem dos
estratos é codificada de forma **redundante** — forma (simplexo), posição, rótulo textual e luminosidade da
cor —, para sobreviver a qualquer discromatopsia, à impressão em tons de cinza e a leitores de tela.

## 2. Princípios

1. **Núcleo funcional, casca imperativa** (G. Bernhardt, *Boundaries*, 2012). Toda regra de negócio vive em
   `src/core/**`: funções puras, determinísticas, sem E/S, sem DOM, sem Astro. A casca (`src/adapters`,
   `src/islands`, `src/pages`, `scripts`, `cli`) só lê, escreve e desenha.
2. **Analise, não valide** (A. King, 2019). Dados não tipados (frontmatter, `.bib`, `.tsv`, JSON) são
   convertidos **uma única vez**, na fronteira, em tipos refinados (`Slug`, `ConceptId`, `Locale`,
   `CitationKey`, `Label`). Depois disso, o compilador impede confusões.
3. **Tipos algébricos e totalidade.** Uniões discriminadas com verificação de exaustividade (`absurd`), `Result`
   em vez de exceções no núcleo, `readonly` por padrão. Erros de conteúdo são acumulados (validação aplicativa)
   para que o autor veja todos de uma vez.
4. **Preservação de informação (injetividade).** Toda transformação de texto `T` admite uma recuperação `R` com
   `R(T(x)) = x`: ou o texto plano é preservado (marcações só *acrescentam* estrutura), ou o original fica
   registrado (`data-*`). Isso é verificado por testes de propriedade (fast-check). Exemplos de perda evitada:
   - `remark-directive` transformaria “às 10:30” em “às 10” → estágio `integrity` restaura o trecho literal;
   - `$` simples transformaria “R$ 5,00 e R$ 10,00” em fórmula → só `$$…$$` é matemática;
   - YAML 1.1 interpreta `no`/`yes`/`on` como booleanos (*Norway problem*) → léxicos em TSV com esquema explícito;
   - Astro 7 apagaria o espaço entre elementos inline (`compressHTML: 'jsx'`) → `compressHTML: true`;
   - BibTeX decodificado não sai em NFC (`é` = `e` + U+0301) → normalização NFC na fronteira.
5. **Dados, não código, no conteúdo.** Textos são Markdown puro (`.md`) com diretivas de sintaxe declarativa —
   sem JSX. O conteúdo permanece portátil (Pandoc/LaTeX) e não executa nada.
6. **Fonte única de verdade.** Tokens de design em `src/core/design/tokens.json` (formato W3C DTCG 2025.10) →
   CSS gerado. Relações SKOS derivadas (`narrower`) são calculadas a partir das inversas (`broader`), nunca
   armazenadas.
7. **Leveza como requisito.** HTML estático; nenhum framework de UI no cliente; cada comportamento é um
   *custom element* carregado sob demanda; WebAssembly sem `wasm-bindgen`, sem importações.

## 3. Organização por padrão funcional

```
src/
├── core/                    NÚCLEO FUNCIONAL — puro (regras de lint impedem E/S, DOM e não determinismo)
│   ├── algebra/             Result, Brand, absurd, pipe — o vocabulário comum
│   ├── domain/              tipos do domínio e seus construtores (locale, strata, facets, epistemic, identifiers)
│   ├── i18n/                rotas (codec bijetivo), catálogos de mensagens com paridade de chaves
│   ├── design/              tokens → CSS; simulação de discromatopsia (Machado et al., 2009); escalas φ
│   ├── latex/               macros, contadores, ambientes, referências cruzadas, exportação .tex
│   ├── bibliography/        analisador BibTeX (árvore sintática), modelo de referência, estilos NBR 6023/10520 e APA
│   ├── lexicon/             TSV → trie → regex compilada; filtro de Bloom; casamento sobre nós de texto
│   ├── abnt/                regras tipográficas e normativas como dados + aplicadores puros
│   ├── ontology/            grafo SKOS: fechamento, ciclos, LCS, conteúdo informacional, JSON-LD
│   └── fold/                catamorfismos sobre árvores: contagem de palavras, tempo de leitura, grafo argumentativo
├── adapters/                CASCA — liga o núcleo a ferramentas
│   ├── unified/             estágios remark/rehype (um arquivo por estágio) + carregadores de contexto
│   ├── astro/               i18n (BASE_URL), consultas de conteúdo, fontes, script pré-pintura
│   └── wasm/                carregamento e invólucros tipados dos módulos WebAssembly
├── islands/                 CASCA (DOM) — registry.ts + elements/ft-*.ts (custom elements sob demanda)
├── views/                   composição de páginas (Astro), uma por tipo de rota
├── components/              componentes de apresentação (Astro, sem estado)
├── layouts/                 documento base
├── pages/                   despachantes de rota gerados pelo codec do núcleo
├── content/                 essays/, labs/, strata/, pages/ ({pt,en}/*.md) e concepts/*.json
└── styles/                  tokens.css (gerado), camadas base, components/*.css
```

Padrões funcionais por pasta (o nome diz o que a função **é**):

| Padrão | Assinatura | Leis verificadas |
|---|---|---|
| **parser** (`parse*`) | `unknown → Result<T, E>` | aceita exatamente a linguagem especificada |
| **codec** | `encode: A → B`, `decode: B → Result<A>` | `decode ∘ encode = id` |
| **transform** | `Tree → Tree` | preservação do texto (ou recuperação), idempotência |
| **fold** | `Tree → Summary` | determinismo; invariância a reordenação quando aplicável |
| **compiler** | `Spec → Artefact` (TSV → regex, tokens → CSS) | equivalência com a especificação ingênua |
| **formatter** | `Model × Style → string` | exemplos trabalhados da norma (ABNT/APA) |

## 4. Pipeline de Markdown

Ordem e contratos estão em `src/adapters/unified/pipeline.ts`. Cada estágio:

- reivindica as diretivas que trata atribuindo `node.data.hName` (ou substituindo o nó);
- registra avisos com `file.message(motivo, nó, 'estágio:regra')` e falhas com `file.fail(...)`;
- exporta metadados para a página via `file.data.astro.frontmatter.<campo>` (chega em `remarkPluginFrontmatter`);
- nunca percorre o interior de `code`, `inlineCode`, `math`, `inlineMath`, `html` nem URLs de links.

## 5. Linguagem de autoria (contrato entre conteúdo e estágios)

Toda a sintaxe abaixo é **fechada**: nomes desconhecidos de diretiva de bloco falham a compilação; diretivas de
texto desconhecidas viram texto literal com aviso.

### 5.1 Matemática (estágio `latex` + `katex`)

- Inline: `$$a^2 + b^2 = c^2$$` dentro do parágrafo. Bloco: `$$` em linhas próprias.
- Rótulo e numeração (ABNT NBR 14724: “algarismos arábicos entre parênteses, alinhados à direita” — só equações
  rotuladas são numeradas): `\label{eq:nome}` dentro do bloco.
- Referências: `:eqref[eq:nome]` no texto → “(3)” com link; `\eqref{eq:nome}` dentro de outra fórmula.
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
Referência: `:ref[thm:amostragem]` → “Teorema 2” com link. Rótulo inexistente = erro de compilação.

### 5.3 Ilustrações e tabelas (ABNT NBR 14724, 5.8–5.9)

```markdown
:::figure{#fig:alias kind="figure" title="Dobramento espectral" source="Elaborado pelo autor (2026)."}
![Descrição textual completa da imagem](./alias.svg)
:::
```

`kind ∈ {figure, chart, frame, table}` → “Figura”, “Gráfico”, “Quadro”, “Tabela”, cada um com contador próprio.
Título **acima** (“Figura 1 – Título”), fonte **abaixo** (“Fonte: …”). Referência: `:ref[fig:alias]`.

### 5.4 Citações e referências (estágio `citations`)

- Parentética: `[@shannon1948]`, `[@shannon1948, p. 379]`, `[@peirce1931; @saussure1916]`, `[-@shannon1948]`
  (omite autor). Narrativa: `@shannon1948 [p. 379]`.
- pt-BR: ABNT NBR 10520:2023 (autor-data; sobrenomes em maiúsculas e minúsculas) e NBR 6023:2025
  (3.ª ed. = 2018 + Emenda 1; lista “Referências”). en: APA 7.
- A lista sai onde houver `::bibliography`; sem a diretiva, é acrescentada ao final. Chave inexistente entre
  colchetes = erro de compilação; `@palavra` fora de colchetes que não seja chave conhecida = texto.
- Fonte única: `bibliography/*.bib` (BibTeX), analisado pelo núcleo (NFC na fronteira).

### 5.5 Leitura não linear (estágios `reading`, `concepts`, `embeds`)

| Sintaxe | Resultado |
|---|---|
| `:::stretch{label="Por que logaritmo?"}` … `:::` | *stretchtext* (T. Nelson): expansão no fluxo do texto |
| `:sidenote[texto]` | nota lateral numerada (margem em telas largas; alternável em telas estreitas) |
| `:marginnote[texto]` | nota de margem não numerada |
| `::::scrolly` + `:::step{state="…"}` | figura fixa cujo estado acompanha a rolagem por etapas |
| `::::horizontal{label="…"}` + `:::panel` | sequência horizontal dentro da rolagem vertical |
| `:::epigraph{source="@chave"}` | epígrafe |
| `:::aside` | digressão destacada |
| `::toc` | sumário do documento |
| `## Título {#id .claim depends="def-1,premissa-2"}` | nó do grafo argumentativo (Toulmin, 1958) |
| `:concept[entropia]{id=entropy}` | link ao conceito com prévia da definição |
| `::concept-map{focus=entropy depth=2}` | subgrafo da ontologia |
| `::lab{widget=sampling}` | laboratório interativo (WebAssembly) embutido |

Tipos de nó argumentativo: `question`, `definition`, `premise`, `claim`, `proof`, `example`, `objection`,
`reply`, `application`, `conclusion` (`premise` ≈ *grounds*, `objection` ≈ *rebuttal* no modelo de Toulmin).

### 5.6 Marcação normativa explícita (estágio `abnt`)

A marcação automática (dicionários em `lexicon/*.tsv`) pode ser sobreposta, com precedência
**diretiva explícita > frontmatter > dicionário**:

| Sintaxe | Efeito |
|---|---|
| `:foreign[Zeitgeist]{lang=de}` | `<i lang="de">` — estrangeirismo (WCAG 3.1.2, *Language of Parts*) |
| `:name[Ferdinand de Saussure]` | nome próprio: sem hifenização, `translate="no"` |
| `:abbr[FFT]{title="Fast Fourier Transform"}` | sigla com expansão |
| `:raw[data]` | suprime qualquer marcação automática (homógrafos: “data” em português) |
| `:sc[texto]` | versaletes |

## 6. Interface

- **Tipografia:** Literata (texto, eixo de tamanho óptico), Atkinson Hyperlegible Next (interface),
  Atkinson Hyperlegible Mono (código). Escala fluida Utopia com razão √φ no limite superior; entrelinha φ;
  medida de 66 caracteres. Hifenização por idioma (`lang`), desligável pelo leitor.
- **Espaço:** potências de φ; coluna de leitura e coluna de margem na razão φ:1.
- **Tempo:** durações em milissegundos de Fibonacci; toda animação tem estado final como padrão; preferências
  do leitor sobrepõem as do sistema; *view transitions* nativas entre páginas.
- **Cor:** paleta verificada em CI (`scripts/verify-palette.ts`): contraste WCAG AAA para texto, APCA,
  gama sRGB, separabilidade CIEDE2000 sob protanopia/deuteranopia/tritanopia e luminosidade monótona sob
  acromatopsia. Cor nunca é o único portador de significado.
- **Textura:** ruído fractal discreto (feTurbulence) no fundo; nenhum gradiente linear.

## 7. Ilhas (comportamento no cliente)

- Uma tag `ft-*` ⇔ um módulo `src/islands/elements/ft-*.ts` que chama `customElements.define`.
- `src/islands/registry.ts` (único `<script>` global) importa cada módulo quando a tag se aproxima da viewport.
- Todo elemento tem conteúdo de fallback útil sem JavaScript, respeita `--motion`, é operável por teclado e
  anuncia resultados relevantes em `aria-live="polite"`.
- Lógica não trivial (layout de grafo, mapeamentos de rolagem, easing) fica no núcleo e é testada.

## 8. Garantias automatizadas

Ver `.github/workflows/ci.yml` e `CLAUDE.md`: tipos, lint (pureza do núcleo), formatação, tokens atualizados,
paleta, i18n, testes unitários e de propriedade, Wasm (fmt, clippy, testes), compilação, links internos,
orçamentos de tamanho, acessibilidade (axe) nos dois temas.
