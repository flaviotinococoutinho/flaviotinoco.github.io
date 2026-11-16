---
title: Flags e estados
description: 'Envie eventos a um reprodutor de vídeo e compare três flags booleanas com uma máquina de estados: oito configurações para quatro situações.'
lang: pt-BR
translationKey: flags-and-states
slug: flags-e-estados
stratum: formal
domains: [computer-science, software-engineering, information-theory]
concepts: [state, finite-state-machine, redundancy, entropy]
published: 2026-11-14
revisions:
  - date: 2026-11-14
    note: Versão inicial, a partir do exemplo do ensaio “A segunda flag”.
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  Este laboratório põe lado a lado duas representações do mesmo reprodutor de vídeo e envia às duas os mesmos
  eventos. A primeira guarda a situação em três flags booleanas, atualizadas pelos métodos do código de
  demonstração do ensaio “A segunda flag”; a segunda é um autômato finito determinístico com a tabela de
  transições do mesmo ensaio. Três flags admitem oito configurações, e o reprodutor tem quatro situações: as
  outras quatro configurações não descrevem nada, mas podem ser escritas na memória. O laboratório mostra em
  que ponto de um histórico de eventos isso acontece, quais eventos o autômato recusa e quando as duas
  representações passam a discordar. Mostra também a medida que o ensaio usa: a entropia das configurações
  que de fato ocorreram, calculada pelo núcleo de teoria da informação, e a redundância que resulta dela, a
  fração dos três bits que não informa nada. O texto enuncia a função de transição estendida, que leva um
  histórico inteiro a um único estado, propõe uma sequência de observações que reproduz o rastro do ensaio e
  registra os limites do modelo: o método de parada é uma escolha deste laboratório, as quatro situações são
  tomadas como mutuamente exclusivas, e uma máquina plana com mais dimensões independentes cresce como as
  flags cresciam.
keywords: [máquina de estados, flags booleanas, autômato finito, redundância]
draft: false
kernel: information
widget: flags
theorem: Função de transição estendida de um autômato finito determinístico
---

Um reprodutor de vídeo está parado, tocando, pausado ou rebobinando. Este laboratório o representa de duas maneiras e envia os mesmos eventos às duas. De um lado, três flags booleanas, atualizadas pelos métodos do código de demonstração do ensaio [A segunda flag](../../ensaios/a-segunda-flag/). Do outro, um :concept[autômato finito]{ref=finite-state-machine} determinístico com a tabela de transições do mesmo ensaio [@rabin1959; @hopcroft2007, cap. 2].

## Intuição

Cada método do código com flags acerta as flags de que quem o escreveu se lembrou. `play()` liga uma e desliga as outras duas; `pause()` só liga a sua; `rewind()` liga a sua e desliga a de reprodução. Nenhuma linha está errada isoladamente, mas a ordem das chamadas decide em que configuração o objeto fica — e três flags admitem $$2^3 = 8$$ configurações para quatro situações.

No autômato, o :concept[estado]{ref=state} é um só valor entre quatro. A função de transição diz, para cada estado e cada evento, qual é o estado seguinte; quando a tabela não tem a célula, o evento é recusado, e quem o enviou fica sabendo. Um histórico inteiro leva a um único estado, o que a função de transição estendida calcula evento a evento. É por isso que o estado deste laboratório é o próprio histórico: o link para um estado guarda só a sequência de eventos.

A medida vem da teoria da informação. Se $$X$$ é a configuração das flags ao longo de um histórico, $$\mathcal{X}$$ é o conjunto das oito configurações e $$\H(X)$$ é a :concept[entropia]{ref=entropy} das configurações que ocorreram, a :concept[redundância]{ref=redundancy} do histórico é a fração dos três bits que não informa nada [@shannon1948]:

$$
R = 1 - \frac{\H(X)}{\log_2 \lvert \mathcal{X} \rvert} = 1 - \frac{\H(X)}{3}.
\label{eq:redundancia-flags}
$$

Com as quatro situações igualmente frequentes e nenhuma configuração sem significado, a :eqref[eq:redundancia-flags] dá $$1 - 2/3 \approx 0{,}33$$: o piso que o ensaio calcula.

## O que observar

Os quatro botões enviam eventos; o último pode ser desfeito.

1. Sem evento algum, as flags valem 000 e a máquina está em “parado”: as duas representações concordam.
2. Envie `play()`: 100, “tocando”, nos dois lados.
3. Envie `pause()`: as flags passam a 110, tocando e pausado ao mesmo tempo, uma configuração que não descreve situação alguma. A máquina está em “pausado”.
4. Envie `rewind()`: 011, outra configuração sem significado. É o rastro da tabela do ensaio.
5. Recomece e envie `pause()` com o reprodutor parado. As flags aceitam e passam a dizer “pausado”; a máquina recusa o evento e continua em “parado”. As duas representações descrevem situações diferentes, e só uma delas avisou.
6. Envie `stop()` a qualquer momento: as flags voltam a 000. Observe a contagem de ocorrências de cada configuração e a redundância do histórico.

## Limites do modelo

O trecho de código do ensaio não mostra `stop()`; aqui ele desliga as três flags, a leitura em que “parado” é a configuração 000 da tabela do ensaio. Outra implementação chegaria a outros rastros, e é esse o ponto: com flags, o comportamento depende do que cada método lembrou de fazer.

A entropia mostrada é a das configurações que ocorreram no histórico enviado, uma amostra curta e escolhida por quem clica, não a de um sistema em uso. As quatro situações são tomadas como mutuamente exclusivas; flags que descrevem dimensões de fato independentes são legítimas e não têm configuração sem significado. E a máquina de estados plana tem o próprio limite: com várias dimensões independentes, o número de estados cresce como o das configurações crescia, e passa a ser preciso compor máquinas, como discute o ensaio.

::bibliography
