# Guia de LaTeX: ambientes, equações, ilustrações e exportação

> Guia de autoria da camada LaTeX (docs/arquitetura.md §5.1–5.3). Implementação: núcleo puro em
> `src/core/latex/` (transformações e exportação `.tex`), estágio `latex` em
> `src/adapters/unified/remark-latex.ts`, estilos em `src/styles/components/latex.css` e
> `src/components/MathAssets.astro` (CSS e fontes do KaTeX). Testes em `tests/unit/latex/`.

O objetivo é escrever em Markdown com a disciplina de um documento LaTeX: enunciados numerados à maneira do
`amsthm`, equações rotuladas e referenciadas, ilustrações e tabelas legendadas segundo a ABNT NBR 14724:2024 — e
poder exportar o mesmo texto para um `.tex` completo. Tudo o que o leitor vê numerado foi numerado pelo site, em
duas passagens, como o LaTeX faz com o arquivo `.aux`; uma referência a um rótulo inexistente **interrompe a
compilação**, em vez de virar um “??” silencioso.

## 1. Matemática

| Forma               | Sintaxe                                            | Observação                                                      |
| ------------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| No parágrafo        | `a energia é $$E = mc^2$$ em repouso`              | `$$…$$` dentro da linha; **cifrão simples não é matemática**    |
| Em bloco            | `$$` numa linha, a fórmula, `$$` noutra linha      | numerada só se tiver `\label{eq:…}`                             |
| Bloco cercado       | ` ```math ` … ` ``` `                              | renderizado pelo KaTeX, sempre sem número, opaco a este estágio |
| Macros do site      | `\R`, `\E`, `\H`, `\KL{P}{Q}`, `\abs{x}`, `\d x` … | `src/core/latex/macros.ts` (Cover & Thomas; ISO 80000-2)        |
| Macros do documento | frontmatter `macros: { '\foo': '…' }`              | isoladas por arquivo (não vazam para outras páginas)            |

Por que só `$$`: em português, “R$ 5,00 e R$ 10,00” seria lido como uma fórmula entre os dois cifrões. A
gramática não pode ser ambígua com a prosa.

### 1.1 Equações numeradas

```markdown
$$
\H(X) = -\sum_{x} p(x) \log_2 p(x) \label{eq:entropia}
$$

A entropia :eqref[eq:entropia] é máxima para a distribuição uniforme.
```

- **Só equações rotuladas são numeradas** (ABNT NBR 14724:2024, 5.7: algarismos arábicos, entre parênteses,
  alinhados à direita). O número é sequencial no documento: a primeira equação rotulada é (1), a segunda (2)…
- O estágio remove o `\label{…}` e acrescenta `\tag{n}` ao fim da fórmula (o KaTeX desenha o número à direita,
  entre parênteses). Se o autor escreveu `\tag{A}`, o número dele é respeitado e as referências mostram “(A)”.
- A fórmula fica dentro de `<div class="equation" id="eq-entropia" data-label="eq:entropia" data-tex="…">`.
  O `id` sobrevive ao KaTeX e o atributo `data-tex` guarda o **TeX original**, com o `\label` (preservação de
  informação: nada do que o autor escreveu se perde).
- O KaTeX numera sozinho `equation`, `align`, `gather` e `alignat` não estrelados, com um contador próprio que
  não conhece os rótulos. O estágio troca esses ambientes pelas formas estreladas (`align*` …) antes de entregar a
  fórmula ao KaTeX: o único número visível é o do site. Para várias linhas com **um** número, use
  `\begin{aligned} … \end{aligned}` dentro de um bloco rotulado (um `\label` por bloco; dois são erro).
- `\label` em fórmula **no parágrafo** é erro de compilação: o KaTeX não aceita `\tag` fora do modo de destaque.
  Leve a fórmula para um bloco próprio.
- Dentro de outra fórmula, `\eqref{eq:x}` vira `\text{(3)}` e `\ref{eq:x}` vira `\text{3}` (também valem para
  rótulos de teoremas e figuras: `\ref{thm:x}` → `\text{2}`).

## 2. Ambientes à maneira do `amsthm`

```markdown
:::definition{#def:entropia title="Entropia"}
A entropia de uma variável aleatória discreta $$X$$ é …
:::

::::theorem{#thm:amostragem title="Nyquist–Shannon"}
Um sinal limitado em banda a $$B$$ é determinado por amostras tomadas a uma taxa maior que $$2B$$.

:::proof{of="thm:amostragem"}
Pela fórmula de interpolação :eqref[eq:sinc], segue o resultado.
:::
::::
```

| Diretiva      | pt-BR        | en          | Numeração      | Estilo `amsthm`                              |
| ------------- | ------------ | ----------- | -------------- | -------------------------------------------- |
| `definition`  | Definição    | Definition  | contador comum | `definition`: cabeça em negrito, corpo reto  |
| `theorem`     | Teorema      | Theorem     | contador comum | `plain`: cabeça em negrito, corpo em itálico |
| `lemma`       | Lema         | Lemma       | contador comum | `plain`                                      |
| `proposition` | Proposição   | Proposition | contador comum | `plain`                                      |
| `corollary`   | Corolário    | Corollary   | contador comum | `plain`                                      |
| `conjecture`  | Conjectura   | Conjecture  | contador comum | `plain`                                      |
| `axiom`       | Axioma       | Axiom       | contador comum | `plain`                                      |
| `example`     | Exemplo      | Example     | contador comum | `definition`                                 |
| `remark`      | Observação   | Remark      | não numerado   | `remark`: cabeça em itálico, corpo reto      |
| `proof`       | Demonstração | Proof       | não numerado   | cabeça em itálico, corpo reto, termina com ∎ |

- **Um único contador por documento**, como `\newtheorem{lemma}[theorem]{Lema}`: Definição 1, Teorema 2, Lema 3…
  Isso facilita achar “o 3” sem saber de que tipo ele é.
- Atributos (gramática fechada; qualquer outro é erro): `#rótulo` e `title="…"`. O título também pode vir como
  rótulo da diretiva, com marcação: `:::definition[Entropia de *Shannon*]{#def:h}` (não use os dois ao mesmo tempo).
  `proof` aceita ainda `of="thm:x"`, que produz a cabeça “Demonstração do Teorema 2.” com link (a contração
  — do/da — segue o gênero de cada nome; em inglês, “Proof of Theorem 2.”). Um `title` na demonstração substitui
  o nome, como `\begin{proof}[Esboço]`.
- A demonstração termina com o símbolo ∎ (a “lápide” de Halmos), alinhado à direita na última linha. O símbolo é
  `aria-hidden`; leitores de tela ouvem, em vez dele, o texto oculto “Fim da demonstração.” / “End of proof.”.
- A cabeça é “corrida” (run-in), como no `amsthm`: “**Teorema 2** (Nyquist–Shannon). _Um sinal…_”.

### 2.1 Aninhamento: mais dois-pontos por fora

Uma diretiva de contêiner fecha com `:::`, e o `remark-directive` fecha o contêiner **mais externo** cuja cerca
não seja mais longa que a de fechamento. Para aninhar, a cerca de fora precisa de **mais** dois-pontos:

```markdown
::::theorem{#thm:a}
Enunciado.

:::proof{of="thm:a"}
Demonstração.
:::
::::
```

Com cercas iguais (`:::theorem` … `:::proof` … `:::` … `:::`), o primeiro `:::` encerra o próprio teorema e o
segundo sobra como texto. O estágio detecta essa linha órfã e falha com a mensagem
`stray ":::" line … the OUTER fence needs more colons`. Três níveis: `:::::`, `::::`, `:::`.

A verificação vale só onde um contêiner pode ter sido fechado cedo: dentro de uma diretiva de contêiner ou
depois de uma, no mesmo nível. Num texto sem contêineres, uma linha só de dois-pontos (“Placar final:” seguido de
`:::`) é prosa e fica como está. Para manter uma linha `:::` como texto mesmo depois de um contêiner, escape-a:
`\:::` (a verificação lê a fonte, onde a barra ainda está).

## 3. Referências cruzadas

| Sintaxe                | Resultado (pt-BR)               | Resultado (en)             |
| ---------------------- | ------------------------------- | -------------------------- |
| `:ref[thm:amostragem]` | Teorema 2 (link)                | Theorem 2                  |
| `:ref[def:entropia]`   | Definição 1                     | Definition 1               |
| `:ref[fig:alias]`      | Figura 1 / Gráfico 1 / Quadro 1 | Figure 1 / Chart 1 / Box 1 |
| `:ref[tab:taxas]`      | Tabela 1                        | Table 1                    |
| `:ref[eq:entropia]`    | Equação (1)                     | Equation (1)               |
| `:eqref[eq:entropia]`  | (1)                             | (1)                        |

- **Rótulos** seguem a convenção do LaTeX, `prefixo:nome`, só com minúsculas, dígitos e hífens:
  `thm:amostragem`, `eq:sinc`, `fig:dobramento-espectral`. Prefixos sugeridos: `def`, `thm`, `lem`, `prop`, `cor`,
  `conj`, `ax`, `ex`, `rem`, `prf`, `eq`, `fig`, `tab`. O `id` HTML troca `:` por `-` (`thm-amostragem`); a troca é
  reversível porque o prefixo não tem hífen.
- Referências **para a frente** funcionam: o estágio numera tudo antes de resolver (duas passagens).
- Rótulo inexistente, duplicado (mesmo entre tipos diferentes) ou mal formado é **erro de compilação**, com linha e
  coluna. Todos os erros do documento são listados de uma vez.
- `remark` e `proof` não têm número: podem ter rótulo, mas `:ref` para eles é erro.
- O nome e o número são unidos por espaço não separável (como `Teorema~\ref{…}`): a linha nunca quebra entre
  “Teorema” e “2”.
- `:ref` **sem colchetes** (“a nota:ref”, “3:eqref”) é prosa e permanece intacto.

## 4. Ilustrações e tabelas (ABNT NBR 14724:2024, 5.8–5.9)

<!-- prettier-ignore -->
```markdown
:::figure{#fig:dobramento kind="chart" title="Dobramento espectral" source="Elaborado pelo autor (2026)."}
![Espectro dobrado em torno de f_s/2](./dobramento.svg)
:::

:::figure{#tab:taxas kind="table" title="Taxas de amostragem usuais" source="[@iso80000]"}
| Sinal | Banda (kHz) | Taxa (kHz) |
|:------|:-----------:|-----------:|
| Voz   | 4           | 8          |
:::
```

| `kind`            | pt-BR   | en     | Contador |
| ----------------- | ------- | ------ | -------- |
| `figure` (padrão) | Figura  | Figure | próprio  |
| `chart`           | Gráfico | Chart  | próprio  |
| `frame`           | Quadro  | Box    | próprio  |
| `table`           | Tabela  | Table  | próprio  |

- Cada designação tem **contador próprio** (Figura 1, Gráfico 1, Figura 2, Tabela 1…).
- **Título acima**: “Figura 1 – Dobramento espectral” (designação, número, travessão, título); **fonte abaixo**:
  “Fonte: Elaborado pelo autor (2026).”. Em inglês: “Figure 1 – …” e “Source: …”. O separador vem do catálogo
  (`caption.separator`): hoje meia-risca (–), como pede a especificação deste projeto; a NBR 14724:2024 diz
  “travessão”, mas seus próprios exemplos misturam “—” e “–” (ver docs/research/abnt.md, C-9). Trocar o separador
  é uma linha do catálogo e vale para o site e para a exportação.
- HTML: um único `<figcaption>` (acima) e a fonte num `<p class="figure__source">` dentro do `<figure>`. Para
  `kind="table"`, o corpo deve ser uma tabela GFM; ela recebe `aria-labelledby` apontando para a legenda, para que
  a tecnologia assistiva anuncie “Tabela 1 – …” ao entrar na tabela. As regras visuais seguem o IBGE / `booktabs`:
  sem linhas verticais, fio forte acima e abaixo, fio fino sob o cabeçalho.
- Sem `title` = erro (a NBR exige designação, número e título); `kind` desconhecido = erro; `kind="table"` sem
  tabela = erro; sem `source` = **aviso** (a fonte é obrigatória, mesmo para produção própria: “Elaborado pelo
  autor”). O texto da fonte passa pelos estágios seguintes (citações como `[@chave]` são resolvidas).

## 5. Contrato HTML (para views e CSS)

```html
<section
  class="env env--theorem env--plain"
  id="thm-amostragem"
  data-label="thm:amostragem"
  aria-labelledby="thm-amostragem__head"
>
  <p class="env__head" id="thm-amostragem__head">
    <span class="env__name">Teorema</span> <span class="env__number">2</span>
    <span class="env__title">(Nyquist–Shannon)</span>.
  </p>
  <p>…</p>
  <section class="env env--proof" id="env_3" aria-labelledby="env_3__head">
    <p class="env__head" id="env_3__head">
      <span class="env__name"
        >Demonstração do
        <a href="#thm-amostragem" class="xref xref--theorem" data-label="thm:amostragem">Teorema 2</a></span
      >.
    </p>
    <p>
      …<span class="qed"
        ><span aria-hidden="true">∎</span><span class="visually-hidden">Fim da demonstração.</span></span
      >
    </p>
  </section>
</section>

<div class="equation" id="eq-sinc" data-label="eq:sinc" data-tex="x(t) = … \label{eq:sinc}">(KaTeX)</div>

<figure class="figure figure--chart" id="fig-dobramento" data-label="fig:dobramento">
  <figcaption class="figure__caption" id="fig-dobramento__caption">
    <span class="figure__label">Gráfico 1</span> – <span class="figure__title">Dobramento espectral</span>
  </figcaption>
  <p><img src="…" alt="…" /></p>
  <p class="figure__source"><span class="figure__source-label">Fonte:</span> Elaborado pelo autor (2026).</p>
</figure>
```

- Classes de estilo `amsthm`: `env--plain`, `env--definition`, `env--remark`, `env--proof`.
- Ambientes e figuras sem rótulo recebem ids gerados (`env_3`, `figure_2`); o sublinhado não existe na gramática
  de rótulos, então nunca colidem com um id derivado de rótulo.
- Fórmulas no parágrafo com `\ref`/`\eqref` ficam em `<span class="math-source" data-tex="…">`.
- Links de referência: `<a class="xref xref--<tipo>" data-label="…">`, com `<tipo>` ∈ {`theorem`, `lemma`, …,
  `equation`, `figure`, `chart`, `frame`, `table`}.

## 6. Metadados para as páginas e CSS do KaTeX

O estágio exporta, em `remarkPluginFrontmatter`:

- `hasMath: boolean` — o documento tem algo que o KaTeX vai desenhar (`$$…$$` ou ` ```math `);
- `crossrefs: { label, id, type, kind, number?, title? }[]` — a tabela de rótulos em ordem de definição (útil
  para listas de ilustrações e de tabelas, NBR 14724 4.2.1.9–4.2.1.11).

As views carregam o CSS e as fontes do KaTeX **só** quando há matemática:

```astro
{remarkPluginFrontmatter.hasMath && <MathAssets slot="head" />}
```

`MathAssets.astro` importa `katex/dist/katex.min.css?url` em vez de `import 'katex/dist/katex.min.css'`. Uma
importação simples de CSS entra no CSS de **toda** página cujo grafo de módulos alcance o componente, mesmo que
ele não seja renderizado. Com `?url`, o Vite processa o CSS como um arquivo independente (reescrevendo os
`url(fonts/…)` para as fontes com hash, que também são emitidas) e a importação devolve só o endereço; o `<link>`
existe apenas onde o componente é renderizado. Verificado com `astro build`: uma página que importa o componente
sem renderizá-lo não referencia nenhum arquivo do KaTeX; a que o renderiza aponta para
`/_astro/katex.min.<hash>.css`, cujas 60 URLs de fonte existem em `dist/`. Sob a CSP do site, folha e fontes
externas do próprio domínio são cobertas por `style-src 'self'` e `font-src 'self'`; nada inline é emitido. O
CSS do KaTeX fica fora das camadas de cascata de propósito: as regras dele vencem o _reset_ do site nos
elementos do KaTeX.

## 7. Exportação para LaTeX (`src/core/latex/export.ts`)

`exportLatex(árvore, metadados, opções)` é uma função pura que recebe a mdast **antes** dos estágios do site
(`remark-parse` + `remark-gfm` + `remark-math` com `singleDollarTextMath: false` + `remark-directive`) e devolve um
documento `.tex` completo e os avisos do que o papel não representa. `parseExportMeta(frontmatter)` converte o
frontmatter (título, subtítulo, data `published`, resumo, palavras-chave, macros) e lista todos os problemas.

| Markdown                                     | LaTeX                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| idioma (`lang`)                              | `babel` (`main=brazilian` / `main=english`), `csquotes`                                    |
| ambientes                                    | `amsthm`: `\newtheorem{lemma}[theorem]{Lema}` …, `\newtheorem*{remark}`                    |
| `:::theorem{#thm:x title="T"}`               | `\begin{theorem}[{T}]\label{thm:x}`                                                        |
| `:::proof{of="thm:x"}` aninhada              | `\begin{proof}[{Demonstração do Teorema~\ref{thm:x}}]` **depois** do teorema               |
| `:ref[thm:x]` / `:eqref[eq:x]`               | `Teorema~\ref{thm:x}` / `\eqref{eq:x}`                                                     |
| `$$x$$` / bloco rotulado / sem rótulo        | `$x$` / `equation` (mantém `\label`) / `equation*`                                         |
| `:::figure{kind="chart" …}`                  | float `ftchart` (newfloat), `\caption` acima, `\label`, `\ftsource{…}`                     |
| tabela GFM                                   | `tabular` com `booktabs` (`\toprule`, `\midrule`, `\bottomrule`)                           |
| `[@k, p. 12]` · `[@a; @b]` · `[-@k]`         | `\parencite[{p.~12}]{k}` · `\parencite{a,b}` · `\parencite*{k}`                            |
| `@k [p. 3]` · `[ver @a; @b, cap. 2]`         | `\textcite[{p.~3}]{k}` · `\parencites[{ver}][{}]{a}[{cap.~2}]{b}`                          |
| bibliografia                                 | `biblatex` (`style=abnt` em pt-BR via biblatex-abnt; `style=apa` em en), `\addbibresource` |
| `:sidenote[…]` / `:marginnote[…]`            | `\footnote{…}` / `\marginpar{…}`                                                           |
| `:::stretch` e demais contêineres de leitura | parágrafos simples (o rótulo vira comentário `%`)                                          |
| diretiva desconhecida                        | o texto literal da fonte, escapado                                                         |
| títulos, ênfase, código, links, listas …     | `\section`…, `\emph`, `\texttt`/`verbatim`, `\href`, `itemize`…                            |

- Os caracteres especiais (`# $ % & ~ _ ^ \ { }`, e também `< > | "`) são escapados fora da matemática; a
  operação é inversível (`unescapeTex ∘ escapeTex = id`, testado com fast-check).
- As macros do site entram no preâmbulo por `\ftmacro`, que preserva o significado em modo texto de nomes que o
  LaTeX já usa (`\H`, `\i`, `\d`).
- Rótulos e chaves de citação inválidos nunca chegam ao TeX (viram texto literal, com aviso).
- `pdflatex` não está disponível na integração contínua: os testes comparam instantâneos
  (`tests/unit/latex/__snapshots__/*.tex`) e passam cada saída por um verificador estático
  (`tests/unit/latex/tex-lint.ts`): ambientes e chaves balanceados, matemática fechada, nenhum `# _ ^ &` solto e
  nenhum `%` engolindo texto.

## 8. Diagnósticos

| Regra (`latex:…`)   | Gravidade | Quando                                                             |
| ------------------- | --------- | ------------------------------------------------------------------ |
| `unknown-label`     | erro      | `:ref`/`:eqref`/`\ref`/`\eqref`/`of=` para rótulo inexistente      |
| `duplicate-label`   | erro      | o mesmo rótulo definido duas vezes (mostra a linha da primeira)    |
| `invalid-label`     | erro      | rótulo fora da gramática `prefixo:nome`, ou `\label` sem `{…}`     |
| `unnumbered-ref`    | erro      | referência a `remark` ou `proof`                                   |
| `inline-label`      | erro      | `\label` em fórmula no parágrafo                                   |
| `multiple-labels`   | erro      | dois `\label` no mesmo bloco                                       |
| `unknown-attribute` | erro      | atributo fora da gramática fechada (ou atributo em `:ref`)         |
| `duplicate-title`   | erro      | `[título]` e `title=""` juntos, ou `of=` e título na demonstração  |
| `proof-target`      | erro      | `of=` aponta para algo que não é enunciado numerado                |
| `invalid-kind`      | erro      | `kind` de figura desconhecido                                      |
| `missing-title`     | erro      | figura sem título                                                  |
| `missing-table`     | erro      | `kind="table"` sem tabela GFM                                      |
| `stray-fence`       | erro      | linha `:::` órfã após ou dentro de contêiner (escape: `\:::`)      |
| `missing-source`    | aviso     | figura sem `source`                                                |
| `eqref-target`      | aviso     | `:eqref` para algo que não é equação (use `:ref`)                  |
| `complex-tag`       | aviso     | `\tag{…}` com marcação TeX (as referências a mostram literalmente) |
| `missing-lang`      | aviso     | frontmatter sem `lang` válido (nomes caem para pt-BR)              |

## 9. Fundamentação

- **`amsthm`** (M. Downes e B. Beeton, _Using the amsthm package_, AMS): os três estilos (`plain`, `definition`,
  `remark`), o contador compartilhado `\newtheorem{x}[theorem]`, a cabeça corrida e o `proof` com `\qedsymbol`.
  Seguir o pacote dá ao leitor as convenções que ele já conhece dos textos matemáticos e torna a exportação direta.
- **Duas passagens** (L. Lamport, _LaTeX: A Document Preparation System_, 2.ª ed., §4.2): numerar tudo, depois
  resolver; por isso referências para a frente funcionam. Ao contrário do LaTeX, um rótulo desconhecido não vira
  “??”: é erro.
- **ABNT NBR 14724:2024**: 5.7 (equações: algarismos arábicos entre parênteses, à direita; só quando necessário —
  daí só as rotuladas), 5.8 (ilustrações: designação, número, travessão e título acima; fonte abaixo, obrigatória),
  5.9 (tabelas segundo as normas de apresentação tabular do IBGE). Resumo e fontes em `docs/research/abnt.md`.
- **Preservação de informação** (docs/arquitetura.md §2.4): o estágio só acrescenta estrutura. Todo texto gerado
  (nomes, números, legendas, textos de referência) fica em nós próprios (`latexInline`/`latexBlock`, links
  `.xref`) e todo texto reescrito tem o original num atributo (`data-tex`, `data-label`). Testes de propriedade
  (`tests/unit/latex/preservation.test.ts`) verificam que documentos sem construções LaTeX saem idênticos e que,
  em documentos aleatórios com ambientes, equações, figuras e referências, o texto do autor sai intacto e na ordem,
  e fórmulas e rótulos são recuperáveis dos atributos.
- **KaTeX** (0.19, fixado por `pnpm.overrides`): não implementa `\label`/`\ref`/`\eqref`, mas implementa `\tag` em
  modo de destaque — por isso o site resolve as referências e entrega ao KaTeX apenas `\tag{n}`.
