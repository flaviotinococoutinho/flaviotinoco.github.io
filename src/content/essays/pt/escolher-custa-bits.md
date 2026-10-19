---
title: 'Escolher custa bits: entropia, decisão e produto'
subtitle: A lei de Hick–Hyman, os códigos de Huffman e o que uma interface deve a quem a usa
description: 'Da lei de Hick–Hyman aos códigos de prefixo: um modelo informacional do custo de escolher numa interface, um redesenho com números e seus limites éticos.'
lang: pt-BR
translationKey: choosing-costs-bits
slug: escolher-custa-bits
stratum: formal
bridgesTo: value
domains: [information-theory, design, product]
concepts: [decision, hick-hyman-law, cognitive-load, entropy, prefix-code, huffman-code, kraft-inequality, interface, value, product]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  Este ensaio faz a última travessia do site, do estrato formal ao do valor, perguntando quanto custa escolher
  numa interface. Parte da lei de Hick–Hyman, segundo a qual, em experimentos de tempo de reação, o tempo
  médio de escolha cresce linearmente com a informação da escolha, e registra as ressalvas que limitam sua
  aplicação a produtos reais. Apresenta os códigos de prefixo, a desigualdade de Kraft e o teorema da
  codificação de fonte, que limitam por baixo o comprimento médio de qualquer código pela entropia da fonte,
  e o algoritmo de Huffman, que atinge esse mínimo. Propõe tratar um menu hierárquico como um código: mostra
  que, se cada escolha custa o logaritmo do número de opções, o custo médio de quem ainda não conhece as
  frequências de uso é a entropia mais a divergência entre essas frequências e os pesos que a estrutura do
  menu atribui a cada item. Um redesenho com números ilustrativos mostra que reorganizar não elimina
  informação, apenas a redistribui, e que o ganho depende de quem usa o produto. Discute o uso deliberado do
  custo de decisão contra o usuário como abuso mensurável e conclui que valor, neste sentido, é redução de
  incerteza para alguém, a algum custo, e que decidir quem paga esse custo é uma questão ética, não técnica.
keywords: [lei de Hick–Hyman, código de Huffman, entropia, interface, decisão]
provenance:
  assistance: generated
  reviewed: false
  note: Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.
draft: false
---

Toda interface pede escolhas: qual botão, qual item do menu, qual das opções de envio. Cada escolha consome tempo e atenção de quem usa o produto. Este ensaio pergunta se esse custo pode ser medido em bits — e responde que, em parte e sob hipóteses explícitas, pode. É a terceira travessia do site, do estrato formal ao do :concept[valor]{ref=value}: do que se segue necessariamente ao que serve a alguém, e a que custo.

::toc

## Uma lei do tempo de escolha {#lei-de-hick-hyman .premise}

Em 1952, William Edmund Hick aplicou a teoria de Shannon a experimentos de tempo de reação de escolha, com até dez alternativas: a cada estímulo, a pessoa devia dar a resposta correspondente o mais rápido possível. O tempo médio cresceu aproximadamente com o logaritmo do número de alternativas, e Hick estimou que a taxa média de ganho de informação era aproximadamente constante, da ordem de cinco bits por segundo [@hick1952]. Num segundo experimento, os participantes aceitavam deliberadamente certa proporção de erros para responder mais depressa; os tempos continuaram relacionados à informação efetivamente transmitida, não ao número nominal de alternativas [@hick1952]. A forma usual da relação é

$$
\mathrm{TR} = a + b \log_2(n + 1),
\label{eq:hick}
$$

em que $$\mathrm{TR}$$ é o tempo médio de reação, $$n$$ o número de alternativas equiprováveis e $$a$$, $$b$$ constantes ajustadas aos dados. O termo $$+1$$ costuma ser lido como a incerteza adicional sobre haver ou não um estímulo.

Em 1953, Ray Hyman manteve a ideia e separou o número de alternativas da informação que elas carregam: além de variar quantas eram, variou também suas probabilidades. O tempo médio acompanhou linearmente a informação média do estímulo, não o número de alternativas [@hyman1953]:

$$
\mathrm{TR} = a + b\, \H(X).
\label{eq:hyman}
$$

Para alternativas equiprováveis, $$\H(X) = \log_2 n$$, e a :eqref[eq:hyman] difere da :eqref[eq:hick] só pelo termo $$+1$$. Juntas, as duas formulações compõem a :concept[lei de Hick–Hyman]{ref=hick-hyman-law}: o que pesa na :concept[decisão]{ref=decision} não é o número de opções, mas a incerteza que elas representam para quem escolhe.

## Ressalvas {#ressalvas .objection depends="lei-de-hick-hyman"}

A lei é empírica e local. As constantes $$a$$ e $$b$$ são estimadas por regressão para cada tarefa e cada grupo de pessoas; o próprio Hick relatou uma taxa média, não uma constante da natureza [@hick1952]. Os experimentos mediam escolhas entre associações estímulo–resposta já aprendidas, em condições controladas. Usar um menu envolve mais do que isso: procurar visualmente, ler rótulos, lembrar onde algo está, mover o ponteiro.:sidenote[Pendência editorial: a literatura posterior sobre a lei de Hick — efeitos de prática prolongada e de compatibilidade entre estímulo e resposta, entre outros — ainda não consta da bibliografia do site. As afirmações deste parágrafo limitam-se ao que os estudos de Hick e Hyman sustentam; a revisão do autor deve acrescentar as referências que faltam.] O que segue é, portanto, um modelo para pensar, não uma previsão: o status epistêmico deste ensaio é “provável”, e as contas abaixo valem se e na medida em que suas hipóteses valerem.

## Escolher é codificar {#escolher-e-codificar .definition depends="lei-de-hick-hyman"}

Um menu hierárquico se parece com um código. Cada item é alcançado por uma sequência de escolhas, e nenhum caminho completo é o começo de outro — exatamente a propriedade que define os códigos de prefixo.

:::definition{#def:prefixo title="Código de prefixo"}
Um código $$k$$-ário atribui a cada símbolo de uma fonte uma palavra sobre um alfabeto de $$k$$ letras. Ele é um :concept[código de prefixo]{ref=prefix-code} quando nenhuma palavra é prefixo de outra; assim, cada palavra pode ser decodificada assim que termina, sem olhar adiante.
:::

::::theorem{#thm:kraft title="Desigualdade de Kraft"}
Existe um código de prefixo $$k$$-ário com comprimentos $$\ell_1, \dots, \ell_m$$ se e somente se

$$
\sum_{i=1}^{m} k^{-\ell_i} \leq 1.
\label{eq:kraft}
$$

:::proof
Esboço. As palavras de um código de prefixo são folhas de uma árvore $$k$$-ária, e nenhuma é ancestral de outra. Se $$\ell_{\max}$$ é o maior comprimento, uma palavra de comprimento $$\ell_i$$ ocupa $$k^{\ell_{\max} - \ell_i}$$ dos $$k^{\ell_{\max}}$$ nós do nível mais profundo, e esses conjuntos são disjuntos; somando e dividindo por $$k^{\ell_{\max}}$$, obtém-se a :eqref[eq:kraft]. Reciprocamente, se a soma não passa de 1, basta atribuir as palavras em ordem crescente de comprimento, cada uma ao primeiro nó livre de seu nível [@cover2006, cap. 5].
:::
::::

A :concept[desigualdade de Kraft]{ref=kraft-inequality} funciona como um orçamento: caminhos curtos são caros, e não há espaço para que todos o sejam. O teorema seguinte diz quanto, em média, esse orçamento permite economizar.

:::theorem{#thm:fonte title="Codificação de fonte"}
Seja $$X$$ uma fonte com probabilidades $$p_i$$, e seja $$L^*$$ o menor comprimento médio $$\sum_i p_i \ell_i$$ entre os códigos de prefixo $$k$$-ários para $$X$$. Então

$$
\frac{\H(X)}{\log_2 k} \leq L^* < \frac{\H(X)}{\log_2 k} + 1,
$$

e o algoritmo de Huffman constrói um código que atinge $$L^*$$ [@huffman1952; @cover2006, cap. 5].
:::

O :concept[código de Huffman]{ref=huffman-code} dá palavras curtas aos símbolos frequentes e longas aos raros. Num menu, a tradução é direta: o que se usa muito deve ficar perto; o que se usa pouco pode ficar longe.

## O menu como código {#menu-como-codigo .claim depends="escolher-e-codificar"}

Para ligar a lei de Hick–Hyman ao :ref[thm:fonte], é preciso dizer quanto custa cada passo. A hipótese mais simples é a de quem ainda não conhece as frequências de uso: cada escolha entre $$k$$ opções custa $$\log_2 k$$ bits, como se fossem equiprováveis.

::::proposition{#prop:menu title="Custo de um menu sem aprendizado"}
Num menu em árvore, seja $$k_1(x), \dots, k_{d(x)}(x)$$ o número de opções em cada nível do caminho até o item $$x$$, e seja $$w(x) = \prod_j 1/k_j(x)$$ o peso desse caminho, de modo que $$\sum_x w(x) = 1$$. Se cada escolha custa $$\log_2 k_j(x)$$ bits e os itens são usados com probabilidades $$p(x)$$, o custo médio é

$$
\sum_x p(x) \log_2 \frac{1}{w(x)} = \H(X) + \KL{p}{w} \geq \H(X),
\label{eq:entropia-cruzada}
$$

com igualdade se e somente se $$w = p$$.

:::proof
A igualdade é a definição da entropia relativa, $$\KL{p}{w} = \sum_x p(x) \log_2 \frac{p(x)}{w(x)}$$. A desigualdade é a desigualdade da informação: a entropia relativa nunca é negativa e só se anula quando as duas distribuições coincidem [@cover2006, cap. 2].
:::
::::

A :ref[prop:menu] separa dois públicos. Quem já aprendeu as frequências paga, pela :eqref[eq:hyman], a entropia $$\H(X)$$, qualquer que seja a organização — além do custo fixo $$a$$ de cada nível percorrido. Quem ainda não aprendeu paga também a divergência $$\KL{p}{w}$$, que mede o desacordo entre a estrutura do menu e o uso real. Organizar por frequência é aproximar $$w$$ de $$p$$.

## Um redesenho em números {#redesenho .example depends="menu-como-codigo,ressalvas"}

::::horizontal{label="Redesenho de um menu de compartilhamento, em cinco passos"}
:::panel
**1. O ponto de partida.** Um menu de compartilhamento lista 12 destinos em ordem alfabética. Os números deste exemplo são ilustrativos, escolhidos para a demonstração, e não vêm de nenhum produto real. Sem conhecer as frequências, quem usa o menu paga, pela :eqref[eq:entropia-cruzada], $$\log_2 12 \approx 3{,}58$$ bits por escolha.
:::

:::panel
**2. Medir antes de mudar.** O registro de uso hipotético mostra uma distribuição concentrada:

| Destinos, do mais ao menos usado | Frequência de uso |
|---|---|
| 1.º ao 3.º | 34 %, 22 %, 14 % |
| 4.º ao 6.º | 9 %, 6 %, 4 % |
| 7.º ao 12.º | 3 %, 2 %, 2 %, 2 %, 1 %, 1 % |

A entropia dessa distribuição é de cerca de 2,77 bits. O menu alfabético cobra de quem chega um excesso de $$\KL{p}{w} \approx 0{,}81$$ bit por escolha.
:::

:::panel
**3. Reorganizar pela frequência.** Os três destinos mais usados sobem para o primeiro nível, ao lado de uma opção “Mais…” que abre os outros nove. Os pesos de caminho passam a ser $$1/4$$ para os três primeiros e $$1/36$$ para os demais; somam 1, como na :ref[prop:menu]. O custo sem aprendizado cai para cerca de 2,95 bits, e o excesso sobre a entropia, de 0,81 para 0,18 bit.
:::

:::panel
**4. A conta que não muda.** Para quem já aprendeu as frequências, a escolha se decompõe em duas: entre quatro opções (1,93 bit) e, em 30 % dos casos, entre nove (2,81 bits). Pela regra de decomposição de Shannon, $$1{,}93 + 0{,}30 \times 2{,}81 \approx 2{,}77$$ bits, exatamente a entropia. Reorganizar não elimina informação; redistribui-a entre níveis. E a profundidade média passa de 1 para 1,3 nível, cada um com seu custo fixo.
:::

:::panel
**5. Pôr preço no tempo.** Com $$b = 0{,}2$$ s por bit — a ordem de grandeza dos cinco bits por segundo relatados por Hick — e $$a = 0{,}2$$ s, valor escolhido apenas para ilustrar, a :eqref[eq:hyman] prevê:

| Menu | Sem aprendizado | Com aprendizado |
|---|---|---|
| Alfabético, um nível | 0,92 s | 0,75 s |
| Por frequência, dois níveis | 0,85 s | 0,81 s |

O redesenho ajuda quem chega e atrapalha um pouco quem já sabe. Qual efeito domina depende da proporção de cada grupo e dos valores reais de $$a$$ e $$b$$ — perguntas empíricas que o modelo formula, mas não responde.
:::
::::

O laboratório abaixo calcula a entropia de um texto qualquer e o comprimento médio de um código de Huffman para ele: um modo rápido de sentir a distância entre o número de símbolos possíveis e a incerteza que eles de fato carregam.

::lab{widget=entropy}

## Quando o custo é imposto de propósito {#custo-imposto .objection depends="menu-como-codigo"}

A :eqref[eq:entropia-cruzada] tem uma leitura incômoda: quem projeta a interface escolhe os pesos $$w$$, e com eles escolhe quanto excesso cada intenção de quem usa vai custar. Esconder a opção de cancelar uma assinatura no fundo de uma árvore é dar um caminho longo a algo que a pessoa quer fazer; acrescentar opções-isca aumenta o número de alternativas; pré-selecionar o que convém ao negócio transforma a opção predefinida numa armadilha. Práticas desse tipo, às vezes chamadas de padrões obscuros (:foreign[dark patterns]{lang=en}), não são erros de projeto: são custos de decisão transferidos deliberadamente para o usuário, sem o seu consentimento.

O modelo não basta para condená-las — a condenação é ética —, mas ajuda a torná-las visíveis e, em princípio, mensuráveis. E a :concept[carga cognitiva]{ref=cognitive-load} não se distribui igualmente: um excesso que custa frações de segundo a quem está descansado e conhece o produto pode custar bem mais — plausivelmente também em erros — a quem tem pouco tempo, pouca atenção disponível ou pouca familiaridade com a :concept[interface]{ref=interface}.

## Valor como redução de incerteza {#valor .conclusion depends="redesenho,custo-imposto"}

O percurso termina onde a ponte foi pensada para terminar. A filosofia perguntou para quem um signo significa; a teoria ofereceu um modelo de escolha; o formalismo estabeleceu um limite — a entropia é o mínimo que qualquer organização pode cobrar de quem já aprendeu —; e o estrato do valor pergunta o que fazer com isso. A resposta proposta aqui é modesta: um :concept[produto]{ref=product} tem valor, neste sentido estreito, quando reduz a incerteza de alguém a um custo que essa pessoa aceitaria pagar. Os bits medem parte do custo; não dizem quem deve pagá-lo. Essa decisão continua sendo nossa — e é por isso que a ponte volta, no fim, ao [primeiro ensaio](../do-signo-a-informacao/): o significado que a teoria pôs entre parênteses reaparece como a pergunta sobre para quem, afinal, a escolha importa.

::bibliography
