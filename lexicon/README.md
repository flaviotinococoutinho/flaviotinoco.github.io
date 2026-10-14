# Léxico do site

Dicionários estáticos que alimentam a marcação normativa automática (estágio `abnt` do pipeline de Markdown):
estrangeirismos em itálico com `lang`, locuções latinas, nomes próprios sem hifenização, siglas com `<abbr title>`.
O motor está em `src/core/lexicon/` (análise, compilação, casamento) e `src/core/abnt/` (regras); o carregador em
`src/adapters/unified/load-lexicon.ts`; as regras editoriais para quem escreve estão em
[`docs/guia-editorial.md`](../docs/guia-editorial.md).

| Arquivo               | Tipo              | Marcação                                                      | Entradas |
| --------------------- | ----------------- | ------------------------------------------------------------- | -------- |
| `estrangeirismos.tsv` | termo estrangeiro | `<i lang="xx" class="foreign">`                               | 240      |
| `latim.tsv`           | locução latina    | `<i lang="la" class="locution">`                              | 84       |
| `nomes-proprios.tsv`  | nome próprio      | `<span class="proper-name" translate="no">` (obras: `<cite>`) | 198      |
| `siglas.tsv`          | sigla             | `<abbr class="acronym" title="…">`                            | 103      |
| `homografos.tsv`      | homógrafo         | **nunca marcado**; só aviso                                   | 12       |

## 1. Por que TSV, e não YAML

A pesquisa propôs um esquema em YAML (`docs/research/lexicon.md` §4). Ele foi descartado por causa da **tipagem
implícita do YAML 1.1**, que reinterpreta palavras sem avisar — exatamente o tipo de “interpretação acidental” que
este projeto proíbe:

| Escrito em YAML 1.1    | Lido como                                                       |
| ---------------------- | --------------------------------------------------------------- |
| `no`, `NO`, `off`, `n` | `false` (o _Norway problem_: o código do país NO vira booleano) |
| `yes`, `on`, `y`       | `true`                                                          |
| `0755`                 | `493` (octal)                                                   |
| `12:30`                | `750` (sexagesimal)                                             |

Num dicionário de **palavras**, qualquer uma dessas linhas é plausível — _no_, _on_ e _off_ são palavras de línguas
reais. Em TSV todo campo é texto; o significado vem só do **esquema explícito** de cada arquivo,
aplicado uma única vez pelo analisador do núcleo (`src/core/lexicon/parse.ts`). TSV também dispensa aspas e
escapes: termos nunca contêm tabulação.

## 2. Formato

- Codificação UTF-8; quebras de linha LF ou CRLF; uma marca de ordem de bytes inicial é ignorada.
- Linhas vazias são ignoradas. Uma linha que começa com `#` **na coluna 1** é comentário; um `#` dentro de um campo é
  dado (pense em `C#`).
- A primeira linha que não é comentário é o **cabeçalho**, que deve ser exatamente o do tipo do arquivo.
- Campos separados por **uma** tabulação; toda linha tem o mesmo número de campos do cabeçalho.
- Campos não são aparados: espaço sobrando no início ou no fim é **erro**, nunca é removido em silêncio.
- Termos: uma ou mais palavras separadas por **um** espaço U+0020 (nada de NBSP, tabulação ou espaços duplos), com
  pelo menos uma letra ou dígito. São normalizados para **NFC** (UAX #15): grafias canonicamente equivalentes
  (`é` precomposto e `e` + U+0301) são o mesmo termo. No texto, um espaço do termo casa com qualquer sequência de
  espaços em branco (quebra de linha do Markdown, NBSP, espaço duplo).

### Colunas

| Coluna                         | Arquivos                                  | Valores                                                                                                    |
| ------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `term`                         | todos                                     | o termo, como deve aparecer no texto                                                                       |
| `lang`                         | todos                                     | etiqueta BCP 47 (RFC 5646), validada e canonizada (`pt-br` → `pt-BR`)                                      |
| `case`                         | todos                                     | `exact` (como escrito), `sentence` (como escrito ou com inicial maiúscula), `insensitive` (qualquer caixa) |
| `variants`                     | estrangeirismos, latim                    | formas flexionadas ou grafias alternativas, separadas por `\|` (`tokens`, `techne\|tékhne`)                |
| `vernacular_in`                | estrangeirismos, latim                    | línguas em que o termo já é vernáculo (fica em redondo): `en` para _a priori_                              |
| `note`                         | estrangeirismos, latim, nomes, homógrafos | glosa ou fonte (livre, opcional)                                                                           |
| `category`                     | nomes-proprios                            | `person`, `place`, `institution`, `work`                                                                   |
| `expansion_pt`, `expansion_en` | siglas                                    | forma completa usada no `title` e esperada no texto, por língua do documento                               |
| `lang_of_expansion`            | siglas                                    | língua do nome que as letras abreviam (FFT → `en`; ABNT → `pt-BR`; SI → `fr`)                              |
| `homograph_of`                 | homógrafos                                | línguas (subetiqueta primária) em que a mesma grafia também é palavra nativa                               |

**Etiquetas de língua.** Além da boa formação (RFC 5646 §2.1, sem variantes ou extensões repetidas), a subetiqueta
primária precisa estar num subconjunto curado do registro IANA (`KNOWN_LANGUAGES` em
`src/core/lexicon/language-tag.ts`). Assim `eng` (em vez de `en`) ou `gr` (em vez de `el`/`grc`) são erros, e não
etiquetas silenciosamente inúteis para hifenização e leitores de tela. O grego antigo romanizado usa **`grc-Latn`**
(grego antigo, escrita latina) — não `el`, que é o grego moderno.

### A língua decide o que é estrangeiro

| Tipo                  | Ativo num documento de língua L quando…                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| estrangeirismo, latim | língua do termo ≠ L, e L ∉ `vernacular_in`                                     |
| homógrafo             | L ∈ `homograph_of` e língua do termo ≠ L                                       |
| sigla                 | `lang` = `mul`, ou língua da sigla = L (CLT só em inglês; TCL só em português) |
| nome próprio          | sempre                                                                         |

Em um ensaio em inglês, _software_ não é estrangeiro e _saudade_ é; _a priori_ fica em redondo (APA 7 não italiciza
estrangeirismos correntes em inglês), mas continua em itálico no texto em português (prática tipográfica das próprias
normas ABNT).

## 3. Critério de inclusão e exclusão

**Política padrão.** Estrangeirismos não adaptados vão em itálico: “palavras estrangeiras devem ser grafadas em
itálico” (_Manual de Redação da Presidência da República_, 3. ed., 2018). As próprias normas da ABNT compõem em itálico
_online_, _e-mail_, _e-book_, _slide_, _hyperlink_, _blended learning_, _et al._, _apud_, _Ibid._ (NBR 6023:2025 e
NBR 10520:2023, conferido nas fontes dos PDFs — ver `docs/research/abnt.md`, REF-36 e CIT-31). Nenhuma cláusula das
normas **exige** o itálico; é convenção tipográfica, e os manuais divergem (Senado e Embrapa deixam em redondo o que o
VOLP registra; a FUNAG italiciza até _site_). O site adota a convenção das normas e do MRPR, com as exclusões abaixo.

**Fica de fora (naturalizado ou de uso corrente):**

- palavras com forma aportuguesada dicionarizada — _estresse_, _leiaute_, _xampu_, _futebol_: essas são português.
  (Se o autor usar o original — _layout_ —, ele é estrangeiro e está no dicionário);
- `internet` e `site`: substantivos comuns do português brasileiro corrente, em minúsculas e em redondo (a Lei
  nº 12.965/2014, o Marco Civil da Internet, escreve “uso da internet”; _site_ consta como palavra portuguesa no
  verificador ortográfico VERO do LibreOffice). A FUNAG italiciza _site_; quem quiser seguir a FUNAG num documento
  declara `lexicon.foreign` no frontmatter;
- nomes de unidades (_hertz_, _watt_; _bit_ e _byte_, da IEC 80000-13): substantivos comuns, em minúsculas e em
  redondo (Brochura do SI, 9. ed., §5.3);
- abreviaturas latinas de uso corrente que a tradição tipográfica mantém em redondo: _etc._, _e.g._, _i.e._; e
  latinismos aportuguesados como _vice-versa_;
- o latim _in_ isolado (o “_In_:” das referências): coincide com a preposição inglesa de _check-in_ e _plug-in_ e
  seria marcado errado. As locuções com _in_ estão no dicionário (_in vitro_, _in situ_, _in loco_, _in memoriam_…),
  e o “_In_:” das referências é produzido pelo estágio de citações;
- **na dúvida, fora**: um falso negativo se corrige com `:foreign[…]{lang=xx}`; um falso positivo (italicizar uma
  palavra portuguesa) é pior.

**Homógrafos** (estrangeiros num sentido, vernáculos noutro: _data_, _come_, _pane_, _time_, _case_…) nunca são
marcados automaticamente. Cada um foi conferido como forma portuguesa corrente; _fair_ foi descartado (não é palavra
portuguesa), e _real_, _base_, _total_ também (o sentido inglês coincide com um sentido português). Um homógrafo não
pode aparecer também em `estrangeirismos.tsv` ou `latim.tsv` — o analisador acusa a contradição.

**Siglas ambíguas** no domínio do site ficam de fora, porque a expansão automática poderia estar errada: _IC_
(conteúdo informacional × intervalo de confiança × circuito integrado) e _LCS_ (menor subsumidor comum × maior
subsequência comum). Escreva `:abbr[IC]{title="conteúdo informacional"}`. O plural de sigla terminada em maiúscula
(_CPUs_, _APIs_) é reconhecido automaticamente, sem apóstrofo (Senado, _Manual de Comunicação_, “Siglas”).

**Nomes que coincidem com palavras comuns** entram só pela forma completa: _Umberto Eco_ (não _Eco_), _Alonzo Church_,
_Robert May_, _Vannevar Bush_, _Alan Kay_, _Christopher Alexander_, _Walter Benjamin_.

## 4. Como o motor usa os dicionários

1. **Análise** (`parse.ts`): TSV → entradas tipadas; **todos** os erros de **todos** os arquivos, com arquivo, linha e
   coluna (ver §5). A compilação do site falha se houver qualquer erro.
2. **Formas de superfície** (`forms.ts`): termo + variantes + variantes de caixa (+ plural de siglas), cada uma com uma
   prioridade (homógrafo > sigla > nome > latim > estrangeirismo; exato antes de insensível).
3. **Compilação** (`trie.ts`, `matcher.ts`): uma trie de caracteres sobre as formas em NFC é compilada numa expressão
   regular com **fatoração de prefixos**, envolvida por limites de palavra Unicode
   `(?<![\p{L}\p{N}\p{M}])…(?![\p{L}\p{N}\p{M}])` (flag `u`; o `\b` do JavaScript só conhece ASCII e acharia _ação_
   dentro de _reação_). Duas expressões: formas sensíveis à caixa sobre o texto, formas insensíveis sobre o texto
   dobrado (_case fold_ que preserva o comprimento, logo os deslocamentos).
4. **Escala.** O V8 desliga as otimizações do _irregexp_ quando a fonte de uma expressão passa de 20 KB
   (`RegExp::kRegExpTooLargeToOptimize`); uma alternância ingênua de 2 mil para 20 mil termos fica três ordens de
   grandeza mais lenta. Por isso há **dois motores atrás da mesma interface**: a expressão fatorada enquanto cada fonte
   cabe em **16 KiB**, e um autômato **Aho–Corasick** (Aho & Corasick, 1975) acima disso (ou quando forçado). Os dois
   alimentam o **mesmo resolvedor** _leftmost-longest_, e testes de propriedade (fast-check) provam que ambos
   encontram exatamente os casamentos de um casador ingênuo de referência. Hoje as fontes têm 10,9 KB (pt-BR) e
   5,6 KB (en): o motor ativo é a expressão regular.

   | Entradas | ingênua   | trie    | Aho–Corasick |
   | -------- | --------- | ------- | ------------ |
   | 2 059    | 19,4 ms   | 12,0 ms | 9,1 ms       |
   | 5 059    | 3 406 ms  | 37,1 ms | 10,8 ms      |
   | 20 059   | 26 642 ms | 78,3 ms | 12,1 ms      |

   Tempo para casar um corpus de 50 592 palavras (285 KB), Node 22 / V8 12.4 (`docs/research/lexicon.md` §1).

5. **Aplicação** (`src/core/abnt/engine.ts`): o texto de cada nó é normalizado para NFC numa **cópia**; os casamentos
   são mapeados de volta para os pontos de código originais do autor; nada é reescrito, só envolvido.

## 5. Erros que a análise acusa

| Código                                  | Exemplo                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `bad-header` / `missing-header`         | cabeçalho diferente do esperado                                                          |
| `field-count`                           | linha com mais ou menos campos que o cabeçalho                                           |
| `empty-field` / `whitespace`            | coluna obrigatória vazia; espaço sobrando                                                |
| `bad-term`                              | espaço duplo, NBSP ou controle no termo; termo sem letra                                 |
| `bad-lang`                              | etiqueta mal formada ou fora do registro; latim sem `la`; `mul`/`und` num estrangeirismo |
| `bad-case`, `bad-category`              | valor fora do conjunto fechado                                                           |
| `bad-homograph-of`, `bad-vernacular-in` | lista de línguas inválida, ou contendo a própria língua do termo                         |
| `duplicate`                             | mesmo termo (ou variante) duas vezes no mesmo tipo                                       |
| `conflict`                              | homógrafo listado também como estrangeirismo/latim                                       |
| `unknown-file`                          | `.tsv` com nome fora do conjunto fechado                                                 |

Para conferir localmente: `./node_modules/.bin/vitest run tests/unit/lexicon`.

## 6. Como crescer os dicionários

1. Verifique o termo em dicionário (Houaiss, Aulete, Michaelis) e, à mão, no VOLP da Academia Brasileira de Letras.
   **Não copie listas** do VOLP (“direitos reservados”); o Wiktionary é CC BY-SA, o VERO é LGPL/MPL — derivar listas
   deles obriga a registrar fonte e licença num arquivo `NOTICE` ao lado do arquivo gerado.
2. Decida o tipo: estrangeirismo, latim, nome, sigla — ou **homógrafo**, se a grafia também for palavra portuguesa
   (então ele nunca será marcado, só avisado).
3. Escolha `case`: `sentence` para substantivos comuns; `exact` para nomes, siglas e substantivos alemães;
   `insensitive` só quando a caixa varia muito no uso (_gestalt_/_Gestalt_).
4. Acrescente plurais e grafias alternativas em `variants`; preencha `vernacular_in` se o termo for corrente em inglês.
5. Rode os testes. Ao passar de ~16 KiB por expressão, o motor troca sozinho para Aho–Corasick — nada a fazer.

O autor também pode sobrepor o dicionário **num único documento** (frontmatter `lexicon.ignore` /
`lexicon.foreign`) ou num único trecho (diretivas `:foreign`, `:raw`, …): ver o guia editorial.

## 7. Para o terminal: filtro de Bloom (e a alternativa exata)

`src/core/lexicon/bloom.ts` implementa um filtro de Bloom (Bloom, 1970) para a futura ferramenta de terminal
(“esta palavra é portuguesa conhecida?” → aviso de palavra desconhecida e sugestões):

- _double hashing_ de Kirsch e Mitzenmacher, gᵢ(x) = h₁(x) + i·h₂(x) mod m, com h₁ = FNV-1a 32 bits e
  h₂ = MurmurHash3 x86_32 (forçado ímpar), sobre os bytes UTF-8 da chave normalizada (NFC + _case fold_);
- dimensionamento ótimo m = ⌈−n ln p / (ln 2)²⌉ bits (múltiplo de 8) e k = round((m/n) ln 2);
- serialização binária pura `encodeBloom`/`decodeBloom` (`Uint8Array`) com cabeçalho versionado de 48 bytes
  (`LXBF`, versão, ids das funções de hash, normalização, k, semente, m, n, p, tamanho e CRC-32 da carga); a leitura é
  total e devolve um erro tipado para cada defeito.

O erro é assimétrico: um “não” é certo; um “sim” erra com probabilidade ≈ p. Por isso o filtro serve para **avisos e
sugestões, nunca para marcação** — os dicionários de marcação são exatos. A pesquisa (`docs/research/lexicon.md` §2)
mostrou ainda que, para o léxico flexionado do português (2,73 milhões de formas do VERO), um **DAFSA mínimo**
(autômato acíclico determinístico; 155 239 estados) é exato e de tamanho comparável ao de um filtro de Bloom a 1 %
— é a alternativa recomendada se a ferramenta precisar de respostas sem erro. Não está implementado.
