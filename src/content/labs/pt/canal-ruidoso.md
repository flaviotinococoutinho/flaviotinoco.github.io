---
title: O canal binário simétrico
description: 'Ajuste a probabilidade de erro de um canal binário e veja sua capacidade, C = 1 − H₂(p): o limite do teorema da codificação de canal ruidoso.'
lang: pt-BR
translationKey: noisy-channel
slug: canal-ruidoso
stratum: formal
domains: [information-theory, probability]
concepts: [channel, channel-capacity, noise, mutual-information, redundancy]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  Este laboratório trata do resultado mais surpreendente da teoria de Shannon: num canal ruidoso, é possível
  transmitir com frequência de erros tão pequena quanto se queira, desde que a taxa fique abaixo de um limite
  chamado capacidade. O modelo é o canal binário simétrico, que inverte cada bit com probabilidade p,
  independentemente dos demais; sua capacidade é um menos a entropia binária de p. O texto enuncia o teorema da
  codificação de canal para canais discretos sem memória, explica por que a correção certa não é subtrair a
  taxa de erros — com o próprio exemplo de Shannon, em que um por cento de erros a mil símbolos por segundo
  deixa cerca de 919 bits por segundo, e não 990 — e propõe uma sequência de observações ligadas ao controle
  da probabilidade de erro: o canal perfeito, o exemplo de Shannon, o ponto em que a capacidade cai à metade,
  o canal inútil em p igual a meio e a simetria acima desse valor. Discute os limites do modelo: o teorema é
  assintótico e exige blocos longos, portanto atraso; sua demonstração clássica mostra que bons códigos
  existem sem dizer como construí-los de modo eficiente; erros reais costumam vir em rajadas, não
  independentes; e a probabilidade de erro precisa ser conhecida.
keywords: [capacidade de canal, canal binário simétrico, ruído, teorema de Shannon]
provenance:
  assistance: generated
  reviewed: false
  note: Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.
draft: false
kernel: information
widget: channel
theorem: Teorema da codificação de canal ruidoso
---

Um :concept[canal]{id=channel} binário simétrico recebe bits e entrega bits; cada um é invertido com probabilidade $$p$$, independentemente dos outros. A pergunta é quanta informação atravessa esse canal por uso — e quanto dela pode chegar sem erros.

::::theorem{#thm:canal title="Codificação de canal ruidoso"}
Seja um canal discreto sem memória com :concept[capacidade]{id=channel-capacity} $$C = \max_{p(x)} \I(X; Y)$$, em que $$\I(X; Y)$$ é a :concept[informação mútua]{id=mutual-information} entre entrada e saída. Para toda taxa $$R < C$$ existem códigos de bloco cuja probabilidade de erro tende a zero quando o comprimento dos blocos cresce; para $$R > C$$, isso é impossível [@shannon1948; @cover2006, cap. 7]. No canal binário simétrico com probabilidade de inversão $$p$$,

$$
C = 1 - \H_2(p), \qquad \H_2(p) = -p \log_2 p - (1 - p) \log_2 (1 - p),
\label{eq:capacidade-bsc}
$$

em bits por uso do canal.
::::

## Intuição

Se 1 % dos bits chega invertido, a tentação é dizer que 99 % da informação passa. Shannon mostrou por que isso está errado: quem recebe não sabe quais bits foram invertidos, e essa incerteza também precisa ser descontada. No exemplo dele, uma fonte de 1000 bits por segundo num canal com 1 % de erros perde cerca de 81 bits por segundo para essa incerteza — a equivocação — e transmite cerca de 919, não 990 [@shannon1948]. Esses 81 bits por segundo correspondem a $$\H_2(0{,}01) \approx 0{,}081$$ bit por símbolo, o termo subtraído na :eqref[eq:capacidade-bsc]. Abaixo da capacidade, a :concept[redundância]{id=redundancy} acrescentada por um bom código permite corrigir quase todos os erros; acima dela, nenhum código consegue.

O contraste com a solução ingênua ajuda a medir a surpresa. Repetir cada bit três vezes e decidir por maioria reduz a probabilidade de erro, com $$p = 0{,}01$$, de $$0{,}01$$ para $$3p^2 - 2p^3 \approx 0{,}0003$$ — mas a taxa cai para $$1/3$$ de bit por uso, e mais repetições levariam a taxa a zero. O teorema diz que não é preciso pagar esse preço: qualquer taxa abaixo de $$C \approx 0{,}919$$ admite erros tão raros quanto se queira.

## O que observar

O controle é a probabilidade de inversão $$p$$.

1. Com $$p = 0$$, o canal é perfeito: $$C = 1$$ bit por uso.
2. Com $$p = 0{,}01$$, $$C \approx 0{,}919$$: o exemplo de Shannon.
3. Com $$p \approx 0{,}11$$, a capacidade cai à metade, $$C \approx 0{,}50$$.
4. Com $$p = 0{,}5$$, a saída é independente da entrada e $$C = 0$$: o :concept[ruído]{id=noise} apagou tudo.
5. Acima de $$0{,}5$$, a capacidade volta a subir: um canal que quase sempre inverte é quase perfeito para quem sabe disso e inverte de volta. Com $$p = 1$$, $$C = 1$$.

## Limites do modelo

O teorema é assintótico: as garantias valem para blocos cada vez mais longos, e blocos longos significam atraso. A demonstração clássica sorteia códigos ao acaso e mostra que, em média, eles funcionam; isso prova que bons códigos existem, mas não diz como construí-los nem decodificá-los com esforço razoável [@cover2006, cap. 7]. O canal binário simétrico supõe erros independentes; em muitos canais reais, os erros vêm em rajadas. E a capacidade depende de $$p$$, que na prática precisa ser estimado — e pode mudar.

::bibliography
