---
title: O mapa logístico e a rota para o caos
description: 'Varie o parâmetro r do mapa logístico e acompanhe as duplicações de período, a constante de Feigenbaum e o expoente de Lyapunov.'
lang: pt-BR
translationKey: logistic-map
slug: mapa-logistico
stratum: formal
domains: [dynamical-systems, mathematics]
concepts: [logistic-map, bifurcation, deterministic-chaos, lyapunov-exponent, model]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  Este laboratório explora o mapa logístico, a regra de uma linha que leva um valor entre zero e um ao produto
  de um parâmetro r pelo valor e por seu complemento. Apesar da simplicidade, a regra exibe uma variedade de
  comportamentos que surpreendeu os primeiros a estudá-la com cuidado: pontos fixos estáveis, ciclos que
  dobram de período, caos e janelas periódicas no meio do caos. O texto enuncia a cascata de duplicações de
  período e a universalidade descoberta por Feigenbaum — as distâncias entre bifurcações sucessivas encolhem
  na razão de aproximadamente 4,669, a mesma para uma ampla classe de mapas —, define o expoente de Lyapunov,
  que mede a taxa média de separação de órbitas vizinhas, e propõe uma sequência de observações ligadas ao
  controle do parâmetro: o ponto fixo, os ciclos de período dois e quatro, o caos, a janela de período três e
  o caso extremo em que o expoente vale o logaritmo de dois. Discute os limites do modelo: a aritmética de
  ponto flutuante perde a órbita exata em poucas dezenas de iterações no regime caótico, as estimativas
  numéricas do expoente convergem devagar perto das bifurcações e o mapa é um modelo deliberadamente
  simplificado de populações com gerações separadas, útil para pensar, não para prever.
keywords: [mapa logístico, caos determinístico, bifurcação, constante de Feigenbaum, expoente de Lyapunov]
provenance:
  assistance: generated
  reviewed: false
  note: Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.
draft: false
kernel: dynamics
widget: logistic
theorem: Universalidade de Feigenbaum
---

O :concept[mapa logístico]{id=logistic-map}, $$x_{n+1} = r\, x_n (1 - x_n)$$, foi proposto como modelo mínimo de uma população com gerações separadas: $$x_n$$ é a fração da capacidade do ambiente ocupada na geração $$n$$, e $$r$$ mede a taxa de crescimento. Em 1976, Robert May usou exemplos como esse para mostrar que modelos matemáticos simples podem ter dinâmica muito complicada [@may1976].

::::theorem{#thm:feigenbaum title="Cascata de duplicações e universalidade"}
Seja $$f_r(x) = r x (1 - x)$$ em $$[0, 1]$$, com $$0 \leq r \leq 4$$. Para $$1 < r < 3$$, o ponto fixo $$x^* = 1 - 1/r$$ atrai as órbitas que partem de $$(0, 1)$$. Em $$r_1 = 3$$, ele perde a estabilidade e surge uma órbita atratora de período 2, que se desestabiliza em $$r_2 = 1 + \sqrt{6} \approx 3{,}449$$, dando lugar ao período 4, e assim por diante: uma cascata de :concept[bifurcações]{id=bifurcation} $$r_1 < r_2 < r_3 < \cdots$$ que se acumula em $$r_\infty \approx 3{,}5699$$. As razões

$$
\delta_n = \frac{r_n - r_{n-1}}{r_{n+1} - r_n}
\label{eq:razao}
$$

convergem para $$\delta = 4{,}669201609\ldots$$, a mesma constante para uma ampla classe de mapas unimodais com máximo quadrático [@feigenbaum1978].
::::

:::definition{#def:lyapunov title="Expoente de Lyapunov"}
Para uma órbita $$x_0, x_1, \ldots$$ do mapa logístico, o :concept[expoente de Lyapunov]{id=lyapunov-exponent} é

$$
\lambda = \lim_{n \to \infty} \frac{1}{n} \sum_{k=0}^{n-1} \ln \left| f_r'(x_k) \right| = \lim_{n \to \infty} \frac{1}{n} \sum_{k=0}^{n-1} \ln \left| r (1 - 2 x_k) \right|.
\label{eq:lyapunov}
$$

Se $$\lambda < 0$$, órbitas vizinhas se aproximam; se $$\lambda > 0$$, pequenas diferenças crescem, em média, como $$\e^{\lambda n}$$.
:::

## Intuição

Cada duplicação de período acontece num intervalo de $$r$$ cerca de $$\delta$$ vezes menor que o anterior, por isso a cascata se acumula num ponto finito. Além de $$r_\infty$$, para a maior parte dos valores de $$r$$ a órbita nunca se repete e depende sensivelmente do ponto de partida: é o :concept[caos determinístico]{id=deterministic-chaos}, imprevisível na prática embora a regra não tenha nenhum acaso. Edward Lorenz encontrara a mesma sensibilidade, em 1963, num modelo simplificado de convecção atmosférica [@lorenz1963].

## O que observar

O controle é o parâmetro $$r$$.

1. Com $$r = 2{,}8$$, a órbita converge para $$x^* = 1 - 1/r \approx 0{,}643$$; o expoente da :eqref[eq:lyapunov] é negativo, cerca de $$-0{,}22$$.
2. Com $$r = 3{,}2$$, a órbita alterna entre dois valores: período 2.
3. Com $$r = 3{,}5$$, período 4. Meça os pontos de duplicação e calcule a :eqref[eq:razao].
4. Com $$r = 3{,}7$$, a órbita não se repete e $$\lambda \approx 0{,}35 > 0$$.
5. A partir de $$r = 1 + \sqrt{8} \approx 3{,}828$$, abre-se uma janela de período 3 em meio ao caos, e $$\lambda$$ volta a ser negativo.
6. Com $$r = 4$$, $$\lambda = \ln 2 \approx 0{,}693$$: em média, a distância entre órbitas vizinhas dobra a cada iteração.

## Limites do modelo

A aritmética de ponto flutuante de dupla precisão guarda cerca de 16 algarismos significativos. Com $$\lambda = \ln 2$$, um erro inicial da ordem de $$10^{-16}$$ dobra a cada passo e atinge a ordem da unidade em pouco mais de 50 iterações: a partir daí, a órbita desenhada já não é a do ponto inicial escolhido. O diagrama de bifurcação e o expoente são médias de longo prazo e não dependem de seguir uma órbita exata, mas a justificativa rigorosa disso vai além deste laboratório. As estimativas numéricas de $$\lambda$$ usam um número finito de iterações e convergem devagar perto das bifurcações, onde o valor exato é zero. Por fim, o mapa é um :concept[modelo]{id=model} deliberadamente simplificado: populações reais estão sujeitas a ruído, estrutura espacial e interações que ele ignora. Serve para pensar, não para prever.

::bibliography
