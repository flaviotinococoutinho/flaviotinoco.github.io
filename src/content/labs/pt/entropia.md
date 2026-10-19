---
title: Entropia e códigos de Huffman
description: 'Digite um texto e compare sua entropia com o comprimento médio de um código de Huffman: o teorema da codificação de fonte, em tempo real.'
lang: pt-BR
translationKey: entropy
slug: entropia
stratum: formal
domains: [information-theory, computation]
concepts: [entropy, prefix-code, huffman-code, kraft-inequality, redundancy]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  Este laboratório ilustra o teorema da codificação de fonte de Shannon com textos digitados pelo leitor. A
  partir das frequências dos símbolos do texto, calcula a entropia empírica, em bits por símbolo, e constrói
  um código de Huffman, cujo comprimento médio é comparado com a entropia e com o de um código de comprimento
  fixo. O texto enuncia o teorema — o menor comprimento médio de um código de prefixo binário fica entre a
  entropia e a entropia mais um bit, e o algoritmo de Huffman atinge esse mínimo —, esboça a demonstração pela
  desigualdade de Kraft e pela desigualdade da informação e propõe uma sequência de observações ligadas à
  caixa de texto: um símbolo repetido, dois símbolos alternados, uma frase comum, um símbolo tornado mais
  frequente e uma frase embaralhada, cuja entropia não muda. Discute os limites do modelo: a contagem de
  símbolos isolados ignora as dependências entre eles, que respondem por boa parte da redundância das línguas;
  textos curtos dão estimativas ruidosas da fonte; o código por símbolo pode desperdiçar até um bit, perda que a
  codificação em blocos reduz; e a própria tabela do código teria de ser transmitida. O ensaio sobre o custo de
  escolher aplica as mesmas ideias à organização de menus.
keywords: [entropia, código de Huffman, codificação de fonte, compressão]
provenance:
  assistance: generated
  reviewed: false
  note: Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.
draft: false
kernel: information
widget: entropy
theorem: Teorema da codificação de fonte
---

Digite um texto. O laboratório conta quantas vezes cada símbolo aparece, calcula a :concept[entropia]{ref=entropy} dessa distribuição e constrói um :concept[código de Huffman]{ref=huffman-code} para ela. A pergunta é quanto um código pode economizar — e o teorema responde com precisão.

::::theorem{#thm:fonte title="Codificação de fonte"}
Seja $$X$$ uma fonte com probabilidades $$p_1, \dots, p_m$$ e entropia $$\H(X) = -\sum_i p_i \log_2 p_i$$. O menor comprimento médio $$L^* = \min \sum_i p_i \ell_i$$ entre os :concept[códigos de prefixo]{ref=prefix-code} binários para $$X$$ satisfaz

$$
\H(X) \leq L^* < \H(X) + 1,
\label{eq:limites}
$$

e o algoritmo de Huffman constrói um código com comprimento médio $$L^*$$ [@huffman1952].

:::proof
Esboço. Os comprimentos de qualquer código de prefixo binário obedecem à :concept[desigualdade de Kraft]{ref=kraft-inequality}, $$\sum_i 2^{-\ell_i} \leq 1$$; daí e da desigualdade da informação resulta $$\sum_i p_i \ell_i \geq \H(X)$$. Na outra direção, os comprimentos $$\ell_i = \lceil \log_2 (1/p_i) \rceil$$ satisfazem a desigualdade de Kraft e têm média menor que $$\H(X) + 1$$ [@cover2006, cap. 5].
:::
::::

## Intuição

O código de Huffman junta repetidamente os dois símbolos menos frequentes num só, até restar um; desfazendo as junções, os símbolos raros acabam com palavras longas e os frequentes, com palavras curtas [@huffman1952]. A entropia é o limite dessa economia: nenhuma escolha de comprimentos consegue, em média, menos bits por símbolo do que a incerteza que cada símbolo carrega [@shannon1948].

## O que observar

O controle é a caixa de texto.

1. Digite uma única letra repetida. A entropia é zero. Em princípio, a palavra vazia bastaria ($$L^* = 0$$), mas um código prático gasta pelo menos 1 bit por símbolo, porque uma palavra vazia não delimita nada; é o único caso em que se chega a $$\H(X) + 1$$, fora da :eqref[eq:limites].
2. Digite duas letras alternadas: a entropia é 1 bit, e o código de Huffman atinge exatamente esse valor. O mesmo ocorre sempre que todas as probabilidades são potências de $$1/2$$.
3. Digite uma frase comum. Compare a entropia com $$\log_2 m$$, em que $$m$$ é o número de símbolos distintos, e com o código de comprimento fixo, que gasta $$\lceil \log_2 m \rceil$$ bits por símbolo.
4. Repita uma das letras várias vezes e veja sua palavra de código encurtar.
5. Embaralhe as palavras da frase: a entropia calculada não muda, porque o modelo só conta frequências.

## Limites do modelo

O laboratório trata cada símbolo isoladamente, como se fosse sorteado de novo a cada posição. As línguas não funcionam assim: boa parte de sua :concept[redundância]{ref=redundancy} está nas dependências entre símbolos vizinhos, que só modelos com contexto capturam [@shannon1948]. Um texto curto, além disso, é uma estimativa ruidosa da fonte que o produziu. Codificar símbolo a símbolo pode desperdiçar até 1 bit; codificar blocos de $$n$$ símbolos reduz esse desperdício para menos de $$1/n$$ bit por símbolo [@cover2006, cap. 5]. Por fim, quem recebe a mensagem precisa conhecer o código, e transmitir a tabela também custa. Conforme o modo como o texto é dividido em símbolos, letras acentuadas podem contar como um ou como dois símbolos. O ensaio [Escolher custa bits](../../ensaios/escolher-custa-bits/) aplica essas ideias à organização de menus.

::bibliography
