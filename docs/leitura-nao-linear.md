# Leitura não linear

> Como os ensaios do site são lidos — e escritos. Complementa `docs/arquitetura.md` §5.5 (linguagem de
> autoria), §6 (interface) e §7 (ilhas). Código: estágio `reading` (`src/adapters/unified/remark-reading.ts` →
> `src/core/reading/transform.ts`), estágio `meta` (`remark-meta.ts` → `src/core/fold/meta.ts`), ilhas
> `src/islands/elements/ft-*.ts`, vistas `src/views/EssayView.astro` e `EssaysIndexView.astro`, estilos
> `src/styles/components/reading.css`.

## 1. O modelo de leitura

**Silencioso por padrão, expansível pelo leitor.** A página de um ensaio abre como uma página de livro: uma
coluna de texto na medida de 66 caracteres, entrelinha φ, parágrafos marcados por recuo e não por espaço
(Bringhurst, _The Elements of Typographic Style_). Tudo o que não é o fio principal do argumento existe, mas
espera ser pedido — é a **revelação progressiva** (_progressive disclosure_): o leitor decide quanto texto quer.

O texto também não precisa ser percorrido em linha reta. Cinco mecanismos rompem a linearidade, cada um com
uma tradição por trás:

| Mecanismo                  | Tradição                                                        | O que o leitor faz                                           |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| _Stretchtext_              | T. H. Nelson (1967), _Getting It Out of Our System_             | abre uma expansão que **continua o parágrafo**               |
| Notas laterais e de margem | E. Tufte, _Beautiful Evidence_ (2006); Tufte CSS                | lê o comentário ao lado da linha, sem perder o lugar         |
| _Scrollytelling_           | narrativa visual do jornalismo de dados (_Snow Fall_, NYT 2012) | rola o texto enquanto uma figura fixa muda de estado         |
| Passagem horizontal        | álbum de painéis, _storyboard_                                  | atravessa uma sequência lateral sem sair da leitura vertical |
| Mapa do argumento          | S. Toulmin, _The Uses of Argument_ (1958)                       | salta entre as seções pela estrutura lógica, não pela ordem  |

### 1.1 Stretchtext (Nelson)

Ted Nelson chamou de _stretchtext_ o texto que "se estica" quando o leitor pede mais detalhe. Aqui ele é um
`<details class="stretch">` cujo rótulo (`<summary>`) é uma pergunta e cujo conteúdo, aberto, **continua o fluxo
do parágrafo**: não é uma caixa, não tem borda nem fundo — só um filete discreto na medianiz indica o trecho
expandido. O primeiro parágrafo expandido não recebe recuo, como continuação que é. As palavras dentro das
expansões contam à parte (`expandableWordCount`) e o tempo de leitura informa quanto há "em expansões opcionais".

### 1.2 Notas laterais e de margem (Tufte)

`:sidenote[…]` é uma nota numerada: a chamada sobrescrita é um link para a nota; em telas largas a nota fica
**na coluna de margem, na altura da linha que a chama** (posicionamento por âncora do CSS; `ft-sidenotes`
empilha as notas para que nunca se sobreponham, mantendo cada uma o mais perto possível da sua linha). Em
telas estreitas a chamada vira um `<button aria-expanded>` que abre a nota no próprio texto — sem o truque do
_checkbox_ de Tufte CSS. Sem JavaScript a nota simplesmente aparece em linha, recuada e menor.
`:marginnote[…]` é a variante sem número (o botão em telas estreitas mostra ⊕).

Diferença para as notas de rodapé (GFM `[^1]`): a nota lateral é um comentário que acompanha a leitura; a de
rodapé é aparato (fonte, ressalva técnica) e vai para o fim, sob um filete curto (ABNT NBR 14724, 5.2.1).

### 1.3 Scrollytelling

Em `::::scrolly`, a primeira figura (`::lab`, uma imagem ou um `:::figure`) fica fixa enquanto os passos
(`:::step{state="…"}`) rolam por cima dela. O passo ativo é o que cruza a linha média da janela — escolhido por
`IntersectionObserver`, **nunca** por eventos de rolagem — e é publicado como `data-step`/`data-state` no
elemento e como o evento `scrolly:step` (`{index, state}`), que qualquer ilha embutida pode ouvir. Dentro de
cada passo, o progresso linear λ ∈ [0, 1] passa pela curva _smoothstep_ s(λ) = λ²(3 − 2λ) (`--scrolly-progress`
e evento `scrolly:progress`): **distância rolada não é tempo narrativo** — a narrativa demora no início e no fim
do passo, onde se lê, e anda depressa no meio. A curva é monotônica, simétrica e bijetiva em [0, 1] (provado em
`tests/unit/reading/scroll.test.ts`), de modo que nada é pulado e voltar refaz os mesmos estados.

Movimento reduzido (preferência do sistema ou do leitor, `--motion: 0`): sem transições, mas os passos
continuam a mudar. Sem JavaScript: os passos são lidos em sequência e a figura fica parada no início.

### 1.4 Passagem horizontal

`::::horizontal{label="…"}` com painéis `:::panel` é, por padrão, uma **região rolável nativa** com
_scroll-snap_, `role="region"`, `aria-label`, `tabindex="0"` e uma indicação visível ("Deslize para o lado: 3
painéis →"): funciona com teclado, toque e leitor de tela, sem JavaScript, em telas estreitas e com movimento
reduzido. Em telas largas com movimento permitido, `ft-horizontal` "fixa" a passagem: a rolagem vertical
desliza a faixa de painéis (animação guiada por rolagem do CSS, `view()` com intervalo `contain`; onde não
existe — Firefox —, o mesmo progresso calculado no núcleo a partir da rolagem). O foco de teclado que entra num
painel leva a página até a posição que mostra esse painel.

### 1.5 Mapa do argumento (Toulmin)

Cada seção pode declarar o seu papel no argumento e do que depende:

```markdown
## O canal é ruidoso {#premissa-ruido .premise}

## Há um limite de transmissão {#tese .claim depends="def:entropia, premissa-ruido"}
```

Os tipos e a sua correspondência com o modelo de Toulmin (1958):

| Tipo          | Rótulo (pt / en)        | Forma                 | Papel de Toulmin                                     |
| ------------- | ----------------------- | --------------------- | ---------------------------------------------------- |
| `question`    | Questão / Question      | círculo vazado ○      | — (a questão em disputa, _stasis_ clássica)          |
| `definition`  | Definição / Definition  | quadrado □            | _warrant_ (garantia)                                 |
| `premise`     | Premissa / Premise      | triângulo △           | _data / grounds_ (dados)                             |
| `claim`       | Tese / Claim            | círculo cheio ●       | _claim_ (alegação)                                   |
| `proof`       | Prova / Proof           | quadrado cheio ■      | _backing_ (respaldo da garantia)                     |
| `example`     | Exemplo / Example       | triângulo invertido ▽ | _data_ (caso particular)                             |
| `objection`   | Objeção / Objection     | losango ◇             | _rebuttal_ (refutação)                               |
| `reply`       | Réplica / Reply         | losango cheio ◆       | _qualifier_ (qualificação da tese diante da objeção) |
| `application` | Aplicação / Application | hexágono ⬡            | — (o estrato do valor: uso prático)                  |
| `conclusion`  | Conclusão / Conclusion  | alvo ◎                | _claim_ (alegação final)                             |

Pares vazado/cheio compartilham sentido (questão ○ → tese ●; definição □ → prova ■; objeção ◇ → réplica ◆).
O tipo é sempre **forma + rótulo**, nunca só cor (WCAG 1.4.1).

As dependências formam um grafo dirigido que precisa ser **acíclico** (um ciclo seria petição de princípio:
a compilação falha e mostra o ciclo). O mapa é desenhado em camadas (método de Sugiyama: camadas pelo caminho
mais longo, vértices fictícios em arestas longas, redução de cruzamentos pelo baricentro — determinístico,
`src/core/reading/layout.ts`): **toda dependência fica acima do que nela se apoia**. Cada nó é um link para a sua
seção; a seção em leitura é destacada (`aria-current="location"`). Em telas largas o mapa fica fixo na coluna de
margem — aberto quando o ensaio não tem notas laterais, recolhido quando a margem é das notas —; em telas
estreitas é uma divulgação (`<details>`) antes do texto. Sem JavaScript: uma lista ordenada do argumento, com os
tipos por extenso e "apoia-se em …".

No próprio texto, cada seção com tipo recebe acima do título o símbolo e o rótulo do tipo e, abaixo, os links
"Apoia-se em: …" para as seções de que depende.

## 2. Autoria (exemplos)

```markdown
:::epigraph[Plutarco, _Vida de Pompeu_, 50]{lang=la}
Navigare necesse est; vivere non est necesse.
:::

::toc

## O que é informação? {#questao .question}

Shannon evitou a palavra significado:sidenote[No artigo de 1948 a palavra aparece só para ser
posta de lado.] e mediu outra coisa :marginnote[A margem guarda o que o texto pode dispensar.].

:::stretch{label="Por que logaritmo?"}
Porque a informação de fontes independentes deve somar, e o logaritmo transforma produtos em somas.
:::

::::scrolly{label="O canal passo a passo"}
::lab{widget=channel}

:::step{state="fonte"}
A fonte emite símbolos.
:::

:::step{state="ruido"}
O ruído corrompe alguns deles.
:::
::::

::::horizontal{label="Três leituras do teorema"}
:::panel{label="Engenharia"}
Um limite de projeto.
:::

:::panel
Um limite epistemológico.
:::
::::

:::aside{label="Digressão"}
Nem toda redundância é desperdício.
:::
```

Regras da linguagem (fechada — erros param a compilação, listados de uma vez):

- **Atributos de título** (sintaxe do Pandoc): só um bloco `{…}` **final e válido** conta — `{#id}`, `.tipo`,
  `depends="a, b"` (vírgulas, espaços ou ponto e vírgula). Títulos que terminam com chaves legítimas ficam
  intactos: `## O conjunto {1, 2}`, `## Escapado \{.claim}`, ou fórmulas e código no fim. Tipo desconhecido,
  dependência inexistente (ou de seção sem tipo), ciclo, `#id` repetido ou reservado pela página = erro. Ids
  podem ter dois-pontos (`def:entropia`). Títulos sem `#id` recebem _slug_ compatível com o do Astro
  (github-slugger), evitando os ids da página.
- `:::stretch` exige rótulo (`label="…"` **ou** `[…]`); `::::horizontal` exige `label` (nomeia a região);
  `::::scrolly` aceita `label` (vira `role="group"` com nome).
- `:::step` só dentro de `::::scrolly`; `:::panel` só dentro de `::::horizontal`; um `::::scrolly` contém uma
  figura opcional e depois apenas passos.
- Notas não podem ficar dentro de títulos, links, rótulos de _stretchtext_ ou de outras notas, nem vazias.
- `:::epigraph`: fonte em `[…]` (com marcação) **ou** `source="…"`; `lang=` marca citações em outra língua
  (WCAG 3.1.2). O estágio de citações roda **antes**: se ele marcar um filho da epígrafe com
  `data.epigraphSource = true` (por exemplo a citação renderizada de `source="@chave"`), esse nó vira a legenda.
- `::toc` (um por documento): sumário aninhado com os títulos do fluxo principal (fora de expansões, digressões,
  epígrafes, painéis e notas), até `depth` (2–6, padrão 3); título localizado ("Sumário" / "Contents") ou `[…]`.
- Atributos desconhecidos são erro; a língua do documento vem de `lang` no frontmatter (`pt-BR` | `en`).

## 3. Preservação de informação

O estágio só **acrescenta estrutura** (docs/arquitetura.md §2.4). As três exceções ficam registradas para que a
inversa à esquerda `recoverText` (`src/core/reading/recover.ts`) devolva exatamente o texto de partida:

1. texto gerado (números das notas, rótulos traduzidos, o sumário) é marcado e ignorado;
2. o bloco de atributos removido do título fica em `data-attrs` (HTML) e no registro `readingAttrs` (mdast);
3. conteúdo reordenado (a fonte de uma epígrafe escrita antes da citação) leva a permutação original.

A lei `recoverText(T(x)) = recoverText(x)` é verificada por fast-check sobre documentos gerados que usam todas
as diretivas (válidas e inválidas) e sobre cadeias arbitrárias (`tests/unit/reading/injectivity.test.ts`);
idempotência e não mutação da entrada também.

## 4. Metadados exportados (estágio `meta`)

Em `file.data.astro.frontmatter` (chega à página como `remarkPluginFrontmatter`; decodificado por
`parseDocumentMeta`):

| Campo                              | Conteúdo                                                                                                                                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wordCount`                        | palavras da prosa: segmentação Unicode (UAX #29, `Intl.Segmenter` na língua do documento); compostos com hífen contam uma vez; exclui código, matemática (antes de o KaTeX duplicar a fórmula na anotação MathML), HTML cru, texto alternativo de imagens e rótulos gerados |
| `readingMinutes`                   | ⌈palavras / 238⌉, no mínimo 1 — M. Brysbaert (2019), _J. Memory and Language_ 109, 104047: 238 palavras/min na leitura silenciosa de não ficção                                                                                                                             |
| `expandableWordCount`              | palavras dentro de _stretchtext_                                                                                                                                                                                                                                            |
| `outline`                          | `[{depth, id, text, inToc}]`                                                                                                                                                                                                                                                |
| `argument`                         | `{nodes: [{id, kind, title, depends}], edges: [{from, to}]}`                                                                                                                                                                                                                |
| `embeds`, `hasEmbeds`              | tags `ft-*` presentes                                                                                                                                                                                                                                                       |
| `hasMath`                          | há `$$…$$`                                                                                                                                                                                                                                                                  |
| `sidenoteCount`, `marginnoteCount` | número de notas                                                                                                                                                                                                                                                             |

## 5. A página do ensaio

Cabeçalho: marca do estrato (simplexo + rótulo + cor do estrato), título, subtítulo, a passagem da ponte
("Passagem de Filosofia para Teoria"), datas (`<time datetime>`), tempo de leitura e palavras. Depois, o
**estado epistêmico** — a palavra estimativa de Kent (1964) numa escala ordinal de seis posições (forma: losango
cheio na posição; texto: a palavra e a faixa de probabilidade) e o tipo de evidência — e, quando houver
assistência de IA ou faltar a revisão do autor, o **aviso de procedência**. Resumo e palavras-chave segundo a
ABNT NBR 6028:2021, 4.1.7 ("Palavras-chave: a; b; c."). O texto (`<article class="prose" lang>`), o histórico de
revisões (`<details>`), os conceitos discutidos e "Próximo na ponte" (ensaios e laboratórios do estrato seguinte)
fecham a página.

Linha de progresso: um filete no topo que mede o progresso **no artigo**, não na página. É decorativa e
escondida das tecnologias assistivas (`aria-hidden`): quem usa leitor de tela já tem a posição pelos títulos,
marcos e sumário; um `role="progressbar"` anunciaria um valor a cada rolagem; e no caminho só-CSS nenhum script
manteria `aria-valuenow` verdadeiro.

## 6. Tipografia

Medida e entrelinha dos tokens; recuo de 1,618 em só entre parágrafos (nunca após títulos, figuras ou listas);
algarismos de texto (_oldstyle_) na prosa e alinhados/tabulares em tabelas, código e datas; títulos com espaço
generoso acima (passos de φ); citações longas pela ABNT NBR 10520:2023, 7.1.1 (bloco recuado, corpo menor,
entrelinha simples, sem aspas); tabelas só com filetes horizontais (_booktabs_); separador `---` como três pontos
espaçados; capitular no primeiro parágrafo com `initial-letter` (e `::first-letter` flutuante como alternativa);
pontuação pendente onde houver suporte; nunca texto justificado. Blocos de código usam os dois temas do Shiki
(`--shiki-light`/`--shiki-dark`), escolhidos por `[data-theme]` ou por `prefers-color-scheme`.

## 7. Notas de implementação

- Uma nota posicionada por âncora num parágrafo com `initial-letter` derruba o Chromium 141; o primeiro
  parágrafo que contém notas usa a capitular flutuante.
- O minificador de CSS funde `animation` + `animation-timeline` num atalho com linha do tempo, que os
  navegadores rejeitam; as animações guiadas por rolagem são escritas só com propriedades longas.
- Imagens locais em Markdown exigem o serviço de imagens configurado (o `sharp` não está instalado).
