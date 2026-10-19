---
title: The logistic map and the road to chaos
description: 'Vary the parameter r of the logistic map and follow the period doublings, Feigenbaum’s constant and the Lyapunov exponent.'
lang: en
translationKey: logistic-map
slug: logistic-map
stratum: formal
domains: [dynamical-systems, mathematics]
concepts: [logistic-map, bifurcation, deterministic-chaos, lyapunov-exponent, model]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: First version (seed text).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  This lab explores the logistic map, the one-line rule that takes a value between zero and one to the product
  of a parameter r, the value and its complement. Despite its simplicity, the rule displays a range of behaviour
  that surprised the first people to study it carefully: stable fixed points, cycles that double their period,
  chaos, and periodic windows in the middle of chaos. The text states the period-doubling cascade and the
  universality discovered by Feigenbaum — the gaps between successive bifurcations shrink by a ratio of about
  4.669, the same for a broad class of maps — defines the Lyapunov exponent, which measures the average rate at
  which neighbouring orbits separate, and proposes a sequence of observations tied to the parameter control:
  the fixed point, the cycles of period two and four, chaos, the period-three window, and the extreme case in
  which the exponent equals the logarithm of two. It closes with the limits of the model: floating-point
  arithmetic loses the exact orbit within a few dozen iterations in the chaotic regime, numerical estimates of
  the exponent converge slowly near the bifurcations, and the map is a deliberately simplified model of
  populations with separate generations, useful for thinking rather than for forecasting.
keywords: [logistic map, deterministic chaos, bifurcation, Feigenbaum constant, Lyapunov exponent]
provenance:
  assistance: generated
  reviewed: false
  note: Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.
draft: false
kernel: dynamics
widget: logistic
theorem: Feigenbaum universality
---

The :concept[logistic map]{ref=logistic-map}, $$x_{n+1} = r\, x_n (1 - x_n)$$, serves as a minimal model of a population with separate generations: $$x_n$$ is the fraction of the environment's capacity occupied in generation $$n$$, and $$r$$ measures the growth rate. In 1976, Robert May used examples like this one to show that simple mathematical models can have very complicated dynamics [@may1976].

::::theorem{#thm:feigenbaum title="Period-doubling cascade and universality"}
Let $$f_r(x) = r x (1 - x)$$ on $$[0, 1]$$, with $$0 \leq r \leq 4$$. For $$1 < r < 3$$, the fixed point $$x^* = 1 - 1/r$$ attracts the orbits that start in $$(0, 1)$$. At $$r_1 = 3$$ it loses stability and an attracting orbit of period 2 appears; that orbit loses stability at $$r_2 = 1 + \sqrt{6} \approx 3.449$$, giving way to period 4, and so on: a cascade of :concept[bifurcations]{ref=bifurcation} $$r_1 < r_2 < r_3 < \cdots$$ that accumulates at $$r_\infty \approx 3.5699$$. The ratios

$$
\delta_n = \frac{r_n - r_{n-1}}{r_{n+1} - r_n}
\label{eq:ratio}
$$

converge to $$\delta = 4.669201609\ldots$$, the same constant for a broad class of unimodal maps with a quadratic maximum [@feigenbaum1978].
::::

:::definition{#def:lyapunov title="Lyapunov exponent"}
For an orbit $$x_0, x_1, \ldots$$ of the logistic map, the :concept[Lyapunov exponent]{ref=lyapunov-exponent} is

$$
\lambda = \lim_{n \to \infty} \frac{1}{n} \sum_{k=0}^{n-1} \ln \left| f_r'(x_k) \right| = \lim_{n \to \infty} \frac{1}{n} \sum_{k=0}^{n-1} \ln \left| r (1 - 2 x_k) \right|.
\label{eq:lyapunov}
$$

If $$\lambda < 0$$, neighbouring orbits draw together; if $$\lambda > 0$$, small differences grow, on average, like $$\e^{\lambda n}$$.
:::

## Intuition

Each period doubling happens over a range of $$r$$ about $$\delta$$ times narrower than the one before, which is why the cascade accumulates at a finite point. Beyond $$r_\infty$$, for most values of $$r$$, the orbit never repeats and depends sensitively on where it starts: this is :concept[deterministic chaos]{ref=deterministic-chaos}, unpredictable in practice although the rule contains no randomness at all. Edward Lorenz had found the same sensitivity in 1963, in a simplified model of atmospheric convection [@lorenz1963].

## What to observe

The control is the parameter $$r$$.

1. With $$r = 2.8$$ the orbit converges to $$x^* = 1 - 1/r \approx 0.643$$; the exponent in :eqref[eq:lyapunov] is negative, about $$-0.22$$.
2. With $$r = 3.2$$ the orbit alternates between two values: period 2.
3. With $$r = 3.5$$, period 4. Locate the doubling points and compute :eqref[eq:ratio].
4. With $$r = 3.7$$ the orbit never repeats and $$\lambda \approx 0.35 > 0$$.
5. From $$r = 1 + \sqrt{8} \approx 3.828$$, a window of period 3 opens in the middle of chaos, and $$\lambda$$ turns negative again.
6. With $$r = 4$$, $$\lambda = \ln 2 \approx 0.693$$: on average, the distance between neighbouring orbits doubles at every iteration.

## Limits of the model

Double-precision floating point keeps about 16 significant digits. With $$\lambda = \ln 2$$, an initial error of the order of $$10^{-16}$$ doubles at every step and reaches order one after a little more than 50 iterations: from then on, the plotted orbit is no longer that of the chosen starting point. The bifurcation diagram and the exponent are long-run averages and do not depend on following one exact orbit, but the rigorous justification of that goes beyond this lab. Numerical estimates of $$\lambda$$ use a finite number of iterations and converge slowly near the bifurcations, where the exact value is zero. Finally, the map is a deliberately simplified :concept[model]{ref=model}: real populations are subject to noise, spatial structure and interactions that it ignores. It is for thinking with, not for forecasting.

::bibliography
