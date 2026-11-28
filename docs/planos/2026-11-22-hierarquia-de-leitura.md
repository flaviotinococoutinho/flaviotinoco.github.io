# Hierarquia de leitura: o que os blogs técnicos ensinam, e o que entrou — 22/11/2026

- Status: executado na branch `flavio/vibrant-hamilton-wowk2z`; aguarda revisão do autor
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [leitura não linear](../leitura-nao-linear.md) (`::toc`, tipos de argumento);
  [plano de 16/11/2026](2026-11-16-sala-interativa.md)

Documento de projeto desta rodada: o que foi pedido, como foi lido, o que se aprendeu com as referências, o que
entrou e o que ficou para o autor decidir. É um plano com data, não um contrato permanente.

## 1. Pedido

Revisar o blog olhando qualidades e originalidades de outros blogs do tipo (jvns.ca, martinfowler.com, The
Pragmatic Engineer, Simon Willison, Google Research, Daniel Lemire, Hackaday, Fabien Sanglard, freeCodeCamp, CITP,
Computational Complexity, Tutorialspoint, Windows on Theory, Towards Data Science, Scott Aaronson, CACM, MIT
Technology Review, John Regehr, AkitaOnRails, ScienceSoft, InfoQ Brasil, GOTO) e melhorar a hierarquia de
informações e as "anuências visuais" para ajudar a cognição na leitura.

"Anuências visuais" foi lido como _affordances_ e pistas visuais: o que a página mostra, antes de o leitor ler,
sobre o que ela contém, em que ordem e quanto custa.

## 2. Método

Cada referência foi aberta num navegador (Chromium, 1 440 × 900 e 390 × 844): a página inicial e um artigo. Do
artigo foram medidos o corpo de texto (tamanho, entrelinha, caracteres por linha), a escala dos títulos e a
presença de aparatos de leitura (sumário, pontos-chave, tempo de leitura, notas, séries). O mesmo script mediu as
nossas páginas. CACM e Towards Data Science recusaram o acesso automatizado (verificação da Cloudflare); delas
fica só o que é conhecido do formato (os quadros "Key Insights" da CACM).

| Blog                     | Corpo (px) | Entrelinha | Caracteres por linha | Título ÷ corpo |
| ------------------------ | ---------: | ---------: | -------------------: | -------------: |
| Julia Evans (jvns.ca)    |         16 |       1,25 |                   86 |            4,0 |
| Martin Fowler            |         16 |       1,60 |                   85 |            2,0 |
| The Pragmatic Engineer   |         18 |       1,75 |                   73 |            2,8 |
| Simon Willison           |         16 |       1,45 |                   72 |            1,0 |
| Google Research          |         28 |       1,29 |                   75 |            2,6 |
| Daniel Lemire            |         19 |       1,68 |                   71 |            2,1 |
| Hackaday                 |         17 |       1,40 |                  104 |            2,7 |
| Fabien Sanglard          |         16 |          — |                  108 |              — |
| freeCodeCamp             |         28 |       1,50 |                   60 |            1,8 |
| CITP (Princeton)         |         17 |       1,55 |                   82 |            2,6 |
| Computational Complexity |         16 |       1,30 |                  149 |            2,2 |
| Tutorialspoint           |         15 |       1,80 |                   83 |            1,8 |
| Windows on Theory        |         18 |       1,70 |                   76 |            1,8 |
| Shtetl-Optimized         |         16 |       1,33 |                   82 |            3,2 |
| MIT Technology Review    |         26 |       1,31 |                   78 |            2,3 |
| Embedded in Academia     |         18 |       1,60 |                   74 |            1,0 |
| AkitaOnRails             |         19 |       1,46 |                   92 |            2,9 |
| ScienceSoft              |         16 |       1,78 |                  101 |            2,5 |
| InfoQ Brasil             |         14 |       1,43 |                   95 |            2,7 |
| GOTO (gotopia.tech)      |         16 |       1,50 |                  128 |            2,2 |
| **Este site (ensaio)**   |     **20** |   **1,62** |               **79** |        **3,3** |

O parágrafo medido é o primeiro longo da página; em Google Research, freeCodeCamp e Technology Review é o lide,
maior que o corpo. Caracteres por linha estimados pela largura média de uma frase na fonte do parágrafo. A faixa
recomendada é de 45 a 75 caracteres, com 66 como ideal (Bringhurst, _The Elements of Typographic Style_, 2004,
§2.1.2); metade das referências passa de 80, e o nosso corpo já estava perto do limite superior (79).

## 3. O que as referências fazem bem

| Padrão                                                 | Onde                                                 | Função cognitiva                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Sumário logo no topo, com títulos que são afirmações   | Martin Fowler                                        | O sumário lido de cima a baixo já é o argumento: organizador prévio (Ausubel, 1960); títulos-afirmação (Alley e Neeley, 2005) |
| Sumário fixo na lateral, com a seção atual             | AkitaOnRails, ScienceSoft                            | Orientação em texto longo: onde estou, quanto falta                                                                           |
| Quadro de pontos-chave antes do texto                  | InfoQ ("Pontos Principais"), CACM, Windows on Theory | Resumo em itens, escaneável; sinalização da estrutura melhora a lembrança do que foi sinalizado (Lorch, 1989)                 |
| TL;DR recolhível                                       | AkitaOnRails, The Pragmatic Engineer                 | Decidir se lê, antes de ler                                                                                                   |
| Posição na série (lista numerada, a atual em destaque) | Simon Willison                                       | Contexto de sequência; o leitor sabe o que veio antes                                                                         |
| Etiquetas com contagem                                 | Simon Willison                                       | Rastro de informação: o tamanho de cada caminho (Pirolli e Card, 1999)                                                        |
| Aviso de atualização no topo                           | Scott Aaronson (`[Update: …]`)                       | O que mudou, antes do texto                                                                                                   |
| Rótulo de seção em versalete                           | Fabien Sanglard                                      | Hierarquia por forma, não só por tamanho                                                                                      |
| Tempo de leitura junto da data                         | Lemire, freeCodeCamp, InfoQ, ScienceSoft             | Custo de entrada                                                                                                              |
| Passo anterior / seguinte e trilha à esquerda          | Tutorialspoint                                       | Navegação de curso: posição e progresso                                                                                       |

## 4. Diagnóstico deste blog

O que já é forte e original: o estado epistêmico (confiança numa escala e a base), o resumo com palavras-chave
(ABNT), os tipos de argumento nos títulos de seção (símbolo e rótulo acima do título, "Apoia-se em" abaixo), o
mapa do argumento, as notas laterais, a capitular, o tempo de leitura, o progresso, o histórico de revisões e a
"passagem" de um estrato a outro. Nenhuma das referências tem a estrutura do argumento explícita.

O que atrapalhava a leitura:

1. **Orientação partida.** Estado e resumo vinham antes do texto; o sumário, depois do primeiro parágrafo. O
   leitor começava a ler (capitular), era interrompido pelo sumário e só então chegava à primeira seção. Nos ensaios
   com epígrafe a ordem era outra (epígrafe, sumário, abertura): o corpus não tinha regra.
2. **Sumário mudo sobre o argumento.** Uma lista de títulos, sem dizer o que cada seção é no argumento, embora o
   texto já soubesse (cada seção declara o tipo) e o mapa o desenhasse.
3. **Resumo largo demais.** Em corpo menor que o texto, o resumo ocupava a coluna inteira: cerca de 100 caracteres
   por linha, fora da faixa legível.
4. **Índice sem rastro.** Os grupos do índice de ensaios (os estratos) davam o nome e o símbolo, mas não o que
   cada estrato pergunta; a margem, nas telas largas, ficava vazia.
5. **Revisão sem caminho.** "Revisado em …" não levava ao histórico de revisões.

## 5. O que entrou

| Mudança                                                                                                                                                                                                                                                                                    | Onde                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **O sumário é o roteiro do argumento.** Cada entrada de seção com tipo leva o símbolo e o rótulo do tipo, numa coluna própria, fora do link; tese e conclusão vêm em peso maior (a espinha); cada seção de nível 2 diz quanto tempo leva, com pontilhado guia, como no sumário de um livro | `src/core/reading/toc.ts`; `src/styles/components/reading.css`         |
| **Tempo por seção.** Palavras de cada seção de nível 2 (`sectionWords`, a mesma contagem do documento) ÷ 238, arredondado ao minuto mais próximo (`sectionMinutes`), para que as seções somem perto do tempo do ensaio                                                                     | `src/core/fold/meta.ts`; `src/core/fold/words.ts`                      |
| **O aparato antes do texto.** Nos 16 ensaios o `::toc` abre o corpo: estado, resumo e sumário ficam juntos, e o texto (epígrafe, capitular) começa depois deles; um teste do contrato editorial mantém a regra                                                                             | `src/content/essays/**`; `tests/unit/content/syntax.test.ts`           |
| **Resumo na medida do texto.** O resumo e as palavras-chave ficam em `var(--measure)` (66 `ch` da própria fonte): de cerca de 100 para cerca de 79 caracteres por linha no desktop                                                                                                         | `src/styles/components/reading.css`                                    |
| **Rastro no índice.** Cada estrato mostra a pergunta-guia e o método (da coleção de estratos): na margem, à altura do título do grupo, nas telas largas; abaixo do título, nas estreitas                                                                                                   | `src/views/EssaysIndexView.astro`; `src/styles/components/reading.css` |
| **Da revisão ao histórico.** "Revisado em …" é um link para o histórico de revisões                                                                                                                                                                                                        | `src/views/EssayView.astro`                                            |

Peso: o roteiro custaria 2,8 KiB de HTML por ensaio com os símbolos copiados em cada entrada, e o ensaio mais
pesado ("Amostrar é decidir") passaria do orçamento de 160 KiB. As entradas passaram a referenciar o _sprite_ de
símbolos da página (`<use>`), o _sprite_ passou a ter só os tipos que a página usa, e o pontilhado é desenhado pela
folha de estilo: a página ficou com 159,0 KiB, abaixo dos 159,3 de antes da rodada.

Medidas no ensaio "A segunda flag" (1 440 px): o sumário começa em 1 461 px (antes, 1 631, depois do primeiro
parágrafo); a primeira seção, em 2 124 px (antes, 1 971: o resumo, mais estreito, ficou mais alto).

## 6. O que ficou para o autor

1. **Pontos-chave.** Um quadro de três a cinco afirmações antes do texto (InfoQ, CACM) pede conteúdo escrito pelo
   autor. Proposta: um campo opcional `keypoints` no frontmatter, mostrado entre o resumo e o sumário. O roteiro do
   argumento já dá a forma; os pontos-chave dariam as afirmações.
2. **Títulos-afirmação.** Os títulos de seção são temas ("Objeções", "O que é um estado"). Escritos como afirmações
   (Fowler; Alley e Neeley, 2005), o roteiro passaria a ser lido como o próprio argumento. É decisão de texto.
3. **Sumário fixo na lateral.** A margem dos ensaios é das notas laterais; o mapa do argumento já mostra a seção
   atual. Um sumário fixo competiria com as notas.
4. **Links permanentes nos títulos** (o "#" ao passar o ponteiro, de jvns.ca e Simon Willison): útil para citar uma
   seção, ficou de fora por não ser hierarquia.

## Referências

- ALLEY, M.; NEELEY, K. A. Rethinking the design of presentation slides: a case for sentence headlines and visual
  evidence. _Technical Communication_, v. 52, n. 4, p. 417–426, 2005.
- AUSUBEL, D. P. The use of advance organizers in the learning and retention of meaningful verbal material.
  _Journal of Educational Psychology_, v. 51, n. 5, p. 267–272, 1960.
- BRINGHURST, R. _The elements of typographic style_. 3. ed. Point Roberts: Hartley & Marks, 2004.
- LORCH, R. F. Text-signaling devices and their effects on reading and memory processes. _Educational Psychology
  Review_, v. 1, n. 3, p. 209–234, 1989.
- PIROLLI, P.; CARD, S. Information foraging. _Psychological Review_, v. 106, n. 4, p. 643–675, 1999.
