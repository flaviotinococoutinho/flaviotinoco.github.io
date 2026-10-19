---
title: Série de Fourier e fenômeno de Gibbs
description: 'Some harmônicas para aproximar uma onda quadrada e veja o excesso de cerca de 9 % junto ao salto persistir, por mais termos que se acrescentem.'
lang: pt-BR
translationKey: fourier-and-gibbs
slug: fourier-e-gibbs
stratum: formal
domains: [signal-processing, mathematics]
concepts: [fourier-series, gibbs-phenomenon, frequency, signal]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  Este laboratório torna visível um resultado clássico da análise de Fourier: a soma parcial da série de uma
  função com descontinuidade não converge uniformemente perto do salto. Para a onda quadrada que alterna entre
  menos um e um, a soma das primeiras harmônicas ímpares converge para a função em todo ponto de continuidade,
  mas a crista mais próxima do salto tende a cerca de 1,179, ultrapassando o patamar em aproximadamente 9 % da
  altura do salto, qualquer que seja o número de termos. O texto enuncia o resultado com precisão, esboça a
  demonstração — a primeira crista é uma soma de Riemann da integral do seno cardinal —, explica a intuição
  por trás do excesso e propõe uma sequência de observações ligadas ao controle do número de harmônicas: a
  altura da crista, sua largura, o erro longe do salto e o valor no próprio salto. Por fim, discute os limites
  do modelo: saltos instantâneos são uma idealização, a tela amostra a curva num número finito de pontos e o
  excesso é consequência do corte abrupto do espectro, que pode ser atenuado com somas ponderadas à custa de um
  salto menos íngreme. O fenômeno reaparece sempre que se reconstrói um sinal com transições bruscas a partir
  de um espectro truncado, como discute o ensaio sobre o teorema da amostragem.
keywords: [série de Fourier, fenômeno de Gibbs, convergência, onda quadrada]
provenance:
  assistance: generated
  reviewed: false
  note: Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.
draft: false
kernel: signal
widget: fourier
theorem: Fenômeno de Gibbs
---

Uma onda quadrada, que salta de $$-1$$ para $$1$$ e volta, pode ser escrita como uma soma infinita de senoides. O laboratório interrompe essa soma depois de $$N$$ harmônicas e mostra o que acontece perto dos saltos: a aproximação melhora em quase toda parte, mas não ali.

::::theorem{#thm:gibbs title="Fenômeno de Gibbs"}
Seja $$q$$ a onda quadrada de período $$2\pi$$ que vale $$1$$ em $$(0, \pi)$$ e $$-1$$ em $$(-\pi, 0)$$, e seja

$$
S_N(x) = \frac{4}{\pi} \sum_{j=1}^{N} \frac{\sin\big((2j - 1)x\big)}{2j - 1}
\label{eq:soma-parcial}
$$

a soma parcial de sua :concept[série de Fourier]{id=fourier-series} com as $$N$$ primeiras harmônicas ímpares. Então $$S_N(x) \to q(x)$$ em todo ponto de continuidade, mas a crista de $$S_N$$ mais próxima do salto em $$x = 0$$ satisfaz

$$
\lim_{N \to \infty} S_N\!\left(\frac{\pi}{2N}\right) = \frac{2}{\pi} \int_0^{\pi} \frac{\sin t}{t} \d t \approx 1{,}17898.
\label{eq:gibbs}
$$

:::proof
Esboço. A derivada de :eqref[eq:soma-parcial] é $$S_N'(x) = \frac{2}{\pi} \frac{\sin(2Nx)}{\sin x}$$, cujo primeiro zero positivo é $$x = \pi/(2N)$$. Nesse ponto, com $$t_j = (2j - 1)\pi/(2N)$$, a soma vale $$\frac{2}{\pi} \sum_{j=1}^{N} \frac{\pi}{N} \frac{\sin t_j}{t_j}$$, uma soma de Riemann, com pontos médios e passo $$\pi/N$$, da integral em :eqref[eq:gibbs].
:::
::::

O excesso é de cerca de $$0{,}179$$ sobre o patamar $$1$$, isto é, aproximadamente 9 % da altura do salto, que é $$2$$.

## Intuição

Cada harmônica acrescenta detalhe numa escala menor. Para subir de $$-1$$ a $$1$$ numa distância da ordem de $$\pi/N$$, a soma finita precisa oscilar, e a primeira oscilação ultrapassa o alvo. Quando $$N$$ cresce, as oscilações se comprimem em direção ao salto, mas sua altura tende a um valor fixo: a convergência é pontual, não uniforme. Esse é o :concept[fenômeno de Gibbs]{id=gibbs-phenomenon}.

## O que observar

O controle principal é o número de harmônicas $$N$$.

1. Com $$N = 1$$, a soma é uma única senoide de amplitude $$4/\pi \approx 1{,}27$$: ela já ultrapassa o patamar.
2. Aumente para $$N = 5$$, $$10$$ e $$50$$. A crista junto ao salto desce para cerca de $$1{,}182$$, $$1{,}180$$ e $$1{,}179$$ — e para de descer.
3. Observe a largura da crista: ela fica em $$x = \pi/(2N)$$, de modo que dobrar $$N$$ a estreita pela metade.
4. Longe do salto, o erro diminui à medida que $$N$$ cresce.
5. No próprio salto, $$S_N(0) = 0$$, a média dos limites laterais.

## Limites do modelo

A onda quadrada matemática salta instantaneamente; sinais físicos levam algum tempo para mudar de valor, e seu espectro decai mais depressa. A tela desenha a curva num número finito de pontos: com $$N$$ muito grande, a crista pode ficar entre dois pontos desenhados e parecer menor do que é — uma pequena lição de amostragem. O excesso também não é inevitável: resulta do corte abrupto dos coeficientes. Ponderá-los com fatores que decaem suavemente reduz o excesso, à custa de um salto menos íngreme; as médias de Fejér, por exemplo, nunca ultrapassam o patamar, porque o núcleo que as define é positivo. Para sinais amostrados arbitrários, os coeficientes seriam calculados com a transformada rápida de Fourier [@cooley1965].:sidenote[Pendência editorial: as referências históricas do fenômeno — os trabalhos de Henry Wilbraham (1848) e de J. Willard Gibbs (1898–1899) — ainda não constam da bibliografia do site.] O mesmo mecanismo aparece na reconstrução de sinais com transições bruscas a partir de um espectro truncado, como discute o ensaio [Amostrar é decidir](../../ensaios/amostrar-e-decidir/).

::bibliography
