---
title: Amostragem e aliasing
description: 'Varie a taxa de amostragem de uma senoide e veja quando as amostras bastam para reconstruí-la e quando ela se disfarça de outra frequência.'
lang: pt-BR
translationKey: sampling
slug: amostragem
stratum: formal
domains: [signal-processing, mathematics]
concepts: [sampling-theorem, aliasing, signal, frequency]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  Este laboratório põe à prova o teorema da amostragem de Nyquist–Shannon. Uma senoide de frequência conhecida
  é amostrada a uma taxa que o leitor controla, e as amostras são usadas para reconstruir o sinal pela fórmula
  de interpolação de Whittaker–Shannon, uma soma de funções seno cardinal centradas nos instantes de
  amostragem. O texto enuncia o teorema para sinais de energia finita limitados em banda, explica a intuição de
  que duas amostras por ciclo da frequência mais alta bastam e propõe uma sequência de observações ligadas ao
  controle da taxa: a reconstrução fiel quando a taxa supera com folga o dobro da frequência, o caso-limite em
  que o resultado depende da fase, o aliasing abaixo do limite, com a frequência aparente dada pela distância
  ao múltiplo mais próximo da taxa, e os erros de borda causados pela janela finita. Discute, por fim, os
  limites do modelo: nenhuma senoide real é limitada no tempo, a soma de interpolação exige infinitas amostras,
  as amostras reais são quantizadas e ruidosas e, na prática, um filtro anterior à amostragem é indispensável
  para que componentes fora da faixa não se dobrem sobre as que interessam. O ensaio correspondente discute a
  história repartida do resultado e o sentido em que ele é determinístico.
keywords: [amostragem, aliasing, teorema de Nyquist–Shannon, interpolação]
provenance:
  assistance: generated
  reviewed: false
  note: Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.
draft: false
kernel: signal
widget: sampling
theorem: Teorema da amostragem de Nyquist–Shannon
---

Uma senoide é amostrada à taxa $$f_s$$ que você escolhe, e as amostras alimentam a fórmula de interpolação do teorema. Quando a taxa é suficiente, a curva reconstruída coincide com a original; quando não é, surge outra senoide, igualmente compatível com as mesmas amostras.

::::theorem{#thm:amostragem title="Nyquist–Shannon"}
Seja $$x$$ um sinal de energia finita cuja transformada de Fourier se anula fora de $$[-B, B]$$. Se $$f_s = 1/T \geq 2B$$, então

$$
x(t) = \sum_{n=-\infty}^{\infty} x(nT)\, \sinc\!\left(\frac{t - nT}{T}\right), \qquad \sinc(u) = \frac{\sin(\pi u)}{\pi u}.
\label{eq:interpolacao}
$$
::::

A série da :eqref[eq:interpolacao] é a função cardinal estudada por @whittaker1915; o resultado foi formulado para a engenharia de comunicações por @kotelnikov1933 e por @shannon1949, e a taxa $$2B$$ leva o nome de Nyquist [@nyquist1928]. O ensaio [Amostrar é decidir](../../ensaios/amostrar-e-decidir/) esboça a demonstração e discute essa história.

## Intuição

Um sinal sem frequências acima de $$B$$ não consegue mudar substancialmente de valor em menos de meio ciclo de sua frequência mais alta [@shannon1949]. Duas amostras por ciclo dessa frequência capturam, então, tudo o que ele pode fazer. Abaixo desse ritmo, frequências diferentes passam a produzir as mesmas amostras, e a reconstrução escolhe a mais baixa: é o :concept[aliasing]{id=aliasing}. Para uma senoide de frequência $$f$$, a frequência aparente é

$$
f_a = \left| f - k f_s \right|, \qquad k = \operatorname{round}\!\left(\frac{f}{f_s}\right).
\label{eq:alias}
$$

Uma imagem útil é a de um ponteiro de relógio iluminado por uma luz que pisca. Se a luz pisca exatamente uma vez por volta, o ponteiro parece parado; se pisca um pouco mais devagar, ele parece andar lentamente — e, se pisca um pouco mais depressa, parece andar para trás. As amostras não registram quantas voltas completas aconteceram entre dois clarões, e é isso que a :eqref[eq:alias] contabiliza: frequências que diferem por um múltiplo de $$f_s$$ são indistinguíveis depois da amostragem.

## O que observar

O controle principal é a taxa de amostragem $$f_s$$; a frequência $$f$$ da senoide fica fixa.

1. Comece com $$f_s$$ bem acima de $$2f$$, por exemplo $$f_s = 4f$$: a curva reconstruída coincide com a original no meio da janela.
2. Aproxime $$f_s$$ de $$2f$$. No limite exato, o resultado depende da fase: amostras que caem nos cruzamentos por zero valem todas zero.
3. Desça abaixo de $$2f$$ e compare a frequência que você vê com a :eqref[eq:alias]. Com $$f_s = 4f/3$$, por exemplo, a senoide reaparece com frequência $$f/3$$.
4. Com $$f_s = f$$, todas as amostras são iguais, e a reconstrução é uma constante.
5. Observe as bordas da janela: a soma usa apenas as amostras visíveis, não infinitas, e o erro cresce perto das extremidades.

## Limites do modelo

O :concept[teorema da amostragem]{id=sampling-theorem} supõe um sinal limitado em banda; uma senoide pura não tem energia finita, e nenhum sinal real é limitado em banda e no tempo ao mesmo tempo. A soma de interpolação exige amostras de todo o passado e de todo o futuro; o laboratório a trunca, e por isso as bordas erram. Amostras reais são quantizadas num número finito de bits e afetadas por ruído. Por fim, componentes acima de $$f_s/2$$ que cheguem ao conversor se dobram sobre a faixa útil e não podem ser separadas depois; por isso, na prática, filtra-se o sinal antes de amostrá-lo.

::bibliography
