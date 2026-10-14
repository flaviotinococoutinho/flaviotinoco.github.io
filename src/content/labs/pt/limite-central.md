---
title: O teorema central do limite
description: 'Some n variáveis uniformes e veja o histograma da soma padronizada aproximar-se da curva normal à medida que n cresce.'
lang: pt-BR
translationKey: central-limit
slug: limite-central
stratum: formal
domains: [probability, mathematics]
concepts: [central-limit-theorem, model, entropy]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  Este laboratório mostra o teorema central do limite em ação. O leitor escolhe quantas variáveis aleatórias
  independentes e uniformes entre zero e um são somadas; o laboratório sorteia muitas dessas somas, padroniza
  cada uma subtraindo a média e dividindo pelo desvio-padrão, e desenha o histograma ao lado da curva normal. O
  texto enuncia o teorema para variáveis independentes e identicamente distribuídas com variância finita,
  esboça a demonstração pelas funções características e oferece duas intuições: a soma de variáveis
  independentes tem densidade igual à convolução das densidades, operação que suaviza a forma a cada passo, e,
  entre as distribuições de variância fixa, a normal é a de maior entropia. Propõe uma sequência de
  observações ligadas ao controle do número de parcelas: o histograma plano de uma única uniforme, o
  triângulo da soma de duas, a forma de sino já com três, a aproximação clássica com doze e o comportamento das
  caudas, que a soma de uniformes nunca ultrapassa. Discute os limites do modelo: sem variância finita o
  teorema falha, como mostra a distribuição de Cauchy; dependência entre as parcelas pode impedir a
  convergência; distribuições assimétricas convergem mais devagar; e o histograma, feito com um número finito
  de sorteios pseudoaleatórios, flutua em torno da forma limite.
keywords: [teorema central do limite, distribuição normal, probabilidade, convolução]
provenance:
  assistance: generated
  reviewed: false
  note: Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.
draft: false
kernel: dynamics
widget: clt
theorem: Teorema central do limite
---

Some $$n$$ números sorteados uniformemente entre 0 e 1, padronize o resultado e repita muitas vezes. O histograma dessas somas tem uma forma que não depende do detalhe das parcelas — ou quase não depende. Essa é a afirmação do :concept[teorema central do limite]{id=central-limit-theorem}.

::::theorem{#thm:tcl title="Lindeberg–Lévy"}
Sejam $$X_1, X_2, \ldots$$ variáveis aleatórias independentes e identicamente distribuídas, com média $$\mu$$ e variância $$\sigma^2$$, $$0 < \sigma^2 < \infty$$. Seja $$S_n = X_1 + \cdots + X_n$$ e

$$
Z_n = \frac{S_n - n\mu}{\sigma \sqrt{n}}.
\label{eq:padronizada}
$$

Então, para todo $$z$$ real, $$\Prob(Z_n \leq z) \to \Phi(z) = \frac{1}{\sqrt{2\pi}} \int_{-\infty}^{z} \e^{-u^2/2} \d u$$ quando $$n \to \infty$$.

:::proof
Esboço. Seja $$\varphi$$ a função característica da variável padronizada $$Y = (X_1 - \mu)/\sigma$$. Como $$\E[Y] = 0$$ e $$\E[Y^2] = 1$$, vale $$\varphi(s) = 1 - s^2/2 + o(s^2)$$. Pela independência, a função característica de $$Z_n$$ é $$\varphi(t/\sqrt{n})^n = \left(1 - \frac{t^2}{2n} + o(1/n)\right)^n \to \e^{-t^2/2}$$, que é a função característica da normal padrão; o teorema da continuidade de Lévy conclui a demonstração.
:::
::::

No laboratório, as parcelas são uniformes em $$[0, 1]$$, com $$\mu = 1/2$$ e $$\sigma^2 = 1/12$$; a :eqref[eq:padronizada] fica $$Z_n = (S_n - n/2)/\sqrt{n/12}$$.

## Intuição

A densidade da soma de duas variáveis independentes é a convolução das densidades, e convoluir suaviza: quinas viram curvas, e a cada parcela a forma perde memória da distribuição original. Há também uma leitura informacional: entre todas as densidades com a mesma variância, a normal é a de maior entropia diferencial [@cover2006, cap. 8]. Somar parcelas independentes e padronizar tende a apagar a estrutura particular de cada uma, até restar a forma menos estruturada compatível com a variância.

Repare também na escala. A média $$S_n/n$$ concentra-se em torno de $$\mu$$ à medida que $$n$$ cresce; o teorema central do limite descreve as flutuações em torno dela, que são da ordem de $$\sigma/\sqrt{n}$$. Por isso a :eqref[eq:padronizada] divide por $$\sqrt{n}$$, e não por $$n$$: é a escala em que a forma das flutuações se estabiliza.

## O que observar

O controle é o número $$n$$ de parcelas somadas.

1. Com $$n = 1$$, o histograma é plano entre $$-\sqrt{3}$$ e $$\sqrt{3}$$: a própria uniforme, padronizada.
2. Com $$n = 2$$, a forma é um triângulo.
3. Com $$n = 3$$, já há um sino, feito de arcos de parábola, próximo da curva normal no centro.
4. Com $$n = 12$$, a padronização é simplesmente $$S_{12} - 6$$, uma aproximação clássica da normal.
5. Observe as caudas: como $$0 \leq S_n \leq n$$, sempre $$|Z_n| \leq \sqrt{3n}$$. A soma de uniformes nunca produz valores além desse limite; a normal, sim. As caudas são a última parte a convergir.

## Limites do modelo

A hipótese de variância finita não é um detalhe. Se as parcelas seguem a distribuição de Cauchy, a média de $$n$$ delas tem exatamente a mesma distribuição de Cauchy, para todo $$n$$, e nenhuma aproximação normal aparece. Dependência entre as parcelas também pode impedir a convergência. Distribuições muito assimétricas convergem mais devagar que a uniforme, que é simétrica. E o laboratório usa um gerador pseudoaleatório e um número finito de sorteios: as alturas das barras flutuam em torno da forma limite, com desvios que crescem, aproximadamente, com a raiz quadrada da contagem de cada barra. Um :concept[modelo]{id=model} normal é, portanto, uma aproximação cuja qualidade depende de $$n$$, das caudas e da independência — não uma lei automática para qualquer soma.

::bibliography
