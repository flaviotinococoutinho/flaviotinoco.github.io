# Programa editorial

> O que o site quer dizer, em que ordem, e como as disciplinas que ele atravessa se encaixam numa só ponte.
> Este documento é o mapa do conteúdo; a arquitetura do software está em [arquitetura.md](arquitetura.md), a
> ontologia em [ontologia.md](ontologia.md) e as normas de escrita no [guia editorial](guia-editorial.md).

## 1. A tese

O site percorre quatro estratos, sempre na mesma ordem: **filosofia** (o que é isto, e como sabemos?),
**teoria** (que modelo explica isto?), **formal** (o que se segue necessariamente?) e **valor** (para que serve,
a quem, a que custo?). Cada texto diz o que se ganha e o que se perde ao passar de um estrato ao seguinte. A
unidade editorial é a travessia: um ensaio é uma passagem entre dois estratos; um laboratório mostra um resultado
do estrato formal; um conceito é um nó em que travessias se cruzam.

## 2. As disciplinas e onde cada uma entra

A ponte não é uma sequência de disciplinas; cada disciplina tem partes em mais de um estrato. O que muda de um
estrato a outro é a pergunta, não a matéria.

| Disciplina                                      | Filosofia                                                 | Teoria                                               | Formal                                                      | Valor                                                 |
| ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| Filosofia (semiótica, epistemologia, ontologia) | signo, sentido e referência, conhecimento, ser, abstração | modelo (a representação que preserva o relevante)    | — (o que é formalizável já mudou de estrato)                | valor; ética do produto; decisão                      |
| Teoria da informação                            | o que a medida de Shannon põe entre parênteses            | informação, entropia, canal, redundância, capacidade | códigos de prefixo, Kraft, Huffman, teoremas de codificação | lei de Hick–Hyman; carga cognitiva; custo de escolher |
| Processamento de sinais e dinâmica              | o que é um sinal, o que é ruído                           | amostragem, frequência, sistema dinâmico             | Fourier, Nyquist–Shannon, mapa logístico, Lyapunov          | o que um modelo determinista permite prever e decidir |
| Ciência da computação                           | abstração: o ato de omitir                                | heurística: a regra sem garantia                     | complexidade computacional; otimização combinatória; FFT    | satisficing: parar no suficiente                      |
| Engenharia de software                          | essência e acidente (Aristóteles → Brooks)                | modularidade como decisão sob mudança                | — (a engenharia raramente prova; mede)                      | ocultação de informação (Parnas); interface; produto  |
| Otimização combinatória                         | o que é "melhor"; o que é uma restrição                   | otimização: escolher o melhor sob restrições         | programação, aproximação, NP-completude                     | compromissos; orçamentos; o custo de buscar o ótimo   |

As três últimas linhas entram nesta rodada. O ensaio "Escolher custa bits" já as pressupõe: uma interface é um
código de prefixo; dispor um menu é um problema de otimização combinatória sob uma restrição informacional; a
engenharia que o resolve para no suficiente e precisa justificar onde parou.

## 3. Cobertura atual (21/10/2026)

| Forma        | Quantidade                                                             | Estratos                                                                                                |
| ------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Ensaios      | 3 por língua                                                           | filosofia → teoria; teoria → formal; formal → valor                                                     |
| Laboratórios | 6 por língua                                                           | formal (Fourier e Gibbs, amostragem, entropia e Huffman, canal ruidoso, mapa logístico, limite central) |
| Conceitos    | 46 + 7                                                                 | filosofia 11, teoria 13, formal 16, valor 6 (antes desta rodada)                                        |
| Páginas      | sobre, colofão, quatro estratos, ontologia (quatro páginas), glossário |

Domínios mais representados: teoria da informação (13 conceitos), processamento de sinais (10), matemática
(10), semiótica (7). Menos representados: ciência da computação (3), design e produto (4 cada); engenharia de
software, metodologia e tecnologia ainda sem conceito.

## 4. Os conceitos-ponte desta rodada

Sete conceitos ligam a teoria da informação à computação, à engenharia e à otimização, cada um com fontes
primárias verificadas e identificador no Wikidata:

| Conceito                   | Estrato   | Papel                                                                                       | Fontes                                                       |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Abstração                  | filosofia | o ato de omitir o que não importa para um propósito; de onde partem o modelo e o módulo     | Dijkstra (1972)                                              |
| Heurística                 | teoria    | regra que guia a busca sem garantia de ótimo; o oposto operacional da otimização            | Pólya (1945); Simon (1956)                                   |
| Otimização                 | teoria    | escolher o melhor sob restrições; pressupõe um valor a maximizar                            | Boyd e Vandenberghe (2004); Papadimitriou e Steiglitz (1982) |
| Otimização combinatória    | formal    | otimização sobre conjuntos finitos; Huffman é um caso resolvido por um algoritmo guloso     | Papadimitriou e Steiglitz (1982); Garey e Johnson (1979)     |
| Complexidade computacional | formal    | o custo de um problema em função do tamanho; a NP-completude explica por que há heurísticas | Cook (1971); Garey e Johnson (1979)                          |
| Ocultação de informação    | valor     | o critério de Parnas para dividir módulos: esconder as decisões que mudam                   | Parnas (1972)                                                |
| Satisficing                | valor     | parar no suficientemente bom; decisão sob racionalidade limitada                            | Simon (1956)                                                 |

## 5. O que vem a seguir (issues abertas)

| Frente                                                                              | Issue    | Estrato(s)        |
| ----------------------------------------------------------------------------------- | -------- | ----------------- |
| Conceitos de TI em crise: dados, informação, conhecimento e medida                  | #11      | filosofia, teoria |
| Conceitos de TI em crise: computação, algoritmos e inteligência artificial          | #12      | teoria, formal    |
| Conceitos de TI em crise: engenharia de software — leis, mitos e práticas           | #13      | valor             |
| Camada de acidentes: ferramentas que realizam conceitos (Aristóteles; Brooks, 1987) | #14      | valor             |
| Ensaios "Essência e acidente" e "Meta-produtos"                                     | #16      | filosofia → valor |
| Motor e conteúdo das resenhas (registro imparcial e leitura)                        | #17, #18 | todos             |
| Complementos de leitura; CLI do site                                                | #19, #20 | —                 |

Ensaios previstos que usam os conceitos-ponte: "Escolher custa bits" ganha a leitura pela otimização
combinatória (o menu como código de prefixo ótimo); "Essência e acidente" (#16) usa abstração e ocultação de
informação; um ensaio sobre heurística e satisficing fecha a passagem formal → valor pela via da computação.

## 6. O site aplica a própria teoria

Decisões de projeto que usam o que os textos explicam, com o registro correspondente:

- o orçamento de bytes é uma restrição de capacidade, e as decisões de projeto são as de um codificador de
  fonte (ADR 0009, [requisitos não funcionais](requisitos-nao-funcionais.md) §0);
- a paleta de cores é um problema de otimização sob restrições de contraste e de discromatopsia, resolvido
  numericamente e verificado a cada mudança (ADR 0004);
- a ontologia é validada como um grafo tipado, com as medidas de informação que os ensaios explicam
  ([ontologia.md](ontologia.md) §6);
- cada transformação de texto prova que não perde informação (ADR 0002).

Um ensaio que trate de uma dessas decisões cita o ADR; o ADR passa a citar o ensaio.

## 7. Regras de proveniência

Todo texto declara estatuto epistêmico e proveniência ([guia editorial](guia-editorial.md) §2–3). Os
textos-semente atuais estão marcados como não revisados pelo autor; nada neste programa muda esse rótulo: só
a revisão do autor o muda.
