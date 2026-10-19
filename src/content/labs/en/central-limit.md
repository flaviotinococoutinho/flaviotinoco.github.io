---
title: The central limit theorem
description: 'Add up n uniform random variables and watch the histogram of the standardised sum approach the normal curve as n grows.'
lang: en
translationKey: central-limit
slug: central-limit
stratum: formal
domains: [probability, mathematics]
concepts: [central-limit-theorem, model, entropy]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: First version (seed text).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  This lab shows the central limit theorem at work. The reader chooses how many independent random variables,
  uniform between zero and one, are added together; the lab draws many such sums, standardises each one by
  subtracting the mean and dividing by the standard deviation, and plots the histogram next to the normal curve.
  The text states the theorem for independent, identically distributed variables with finite variance,
  sketches the proof through characteristic functions and offers two intuitions: the density of a sum of
  independent variables is the convolution of their densities, an operation that smooths the shape at every
  step, and among all distributions with a given variance the normal one has the greatest entropy. It proposes
  a sequence of observations tied to the control for the number of terms: the flat histogram of a single
  uniform, the triangle of the sum of two, the bell shape already present with three, the classic
  approximation with twelve, and the behaviour of the tails, which a sum of uniforms never goes beyond. It
  closes with the limits of the model: without finite variance the theorem fails, as the Cauchy distribution
  shows; dependence between the terms can prevent convergence; skewed distributions converge more slowly; and
  the histogram, built from a finite number of pseudo-random draws, fluctuates around the limiting shape.
keywords: [central limit theorem, normal distribution, probability, convolution]
provenance:
  assistance: generated
  reviewed: false
  note: Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.
draft: false
kernel: dynamics
widget: clt
theorem: Central limit theorem
---

Add up $$n$$ numbers drawn uniformly between 0 and 1, standardise the result and repeat many times. The histogram of these sums takes a shape that does not depend on the details of the terms — or hardly does. That is the claim of the :concept[central limit theorem]{id=central-limit-theorem}.

::::theorem{#thm:clt title="Lindeberg–Lévy"}
Let $$X_1, X_2, \ldots$$ be independent, identically distributed random variables with mean $$\mu$$ and variance $$\sigma^2$$, $$0 < \sigma^2 < \infty$$. Let $$S_n = X_1 + \cdots + X_n$$ and

$$
Z_n = \frac{S_n - n\mu}{\sigma \sqrt{n}}.
\label{eq:standardised}
$$

Then, for every real $$z$$, $$\Prob(Z_n \leq z) \to \Phi(z) = \frac{1}{\sqrt{2\pi}} \int_{-\infty}^{z} \e^{-u^2/2} \d u$$ as $$n \to \infty$$.

:::proof
Sketch. Let $$\varphi$$ be the characteristic function of the standardised variable $$Y = (X_1 - \mu)/\sigma$$. Since $$\E[Y] = 0$$ and $$\E[Y^2] = 1$$, we have $$\varphi(s) = 1 - s^2/2 + o(s^2)$$. By independence, the characteristic function of $$Z_n$$ is $$\varphi(t/\sqrt{n})^n = \left(1 - \frac{t^2}{2n} + o(1/n)\right)^n \to \e^{-t^2/2}$$, the characteristic function of the standard normal; Lévy's continuity theorem completes the proof.
:::
::::

In the lab, the terms are uniform on $$[0, 1]$$, with $$\mu = 1/2$$ and $$\sigma^2 = 1/12$$, so :eqref[eq:standardised] becomes $$Z_n = (S_n - n/2)/\sqrt{n/12}$$.

## Intuition

The density of the sum of two independent variables is the convolution of their densities, and convolution smooths: corners become curves, and with every new term the shape forgets more of the original distribution. There is also an information-theoretic reading: among all densities with the same variance, the normal has the greatest differential entropy [@cover2006, ch. 8]. Adding independent terms and standardising tends to wash out the particular structure of each one, until what is left is the least structured shape compatible with the variance.

Notice the scale, too. The mean $$S_n/n$$ concentrates around $$\mu$$ as $$n$$ grows; the central limit theorem describes the fluctuations around it, which are of the order of $$\sigma/\sqrt{n}$$. That is why :eqref[eq:standardised] divides by $$\sqrt{n}$$ rather than by $$n$$: it is the scale at which the shape of the fluctuations settles down.

## What to observe

The control is the number $$n$$ of terms added.

1. With $$n = 1$$ the histogram is flat between $$-\sqrt{3}$$ and $$\sqrt{3}$$: the uniform itself, standardised.
2. With $$n = 2$$ the shape is a triangle.
3. With $$n = 3$$ there is already a bell, made of pieces of parabolas, close to the normal curve in the middle.
4. With $$n = 12$$ the standardisation is simply $$S_{12} - 6$$, a classic approximation of the normal.
5. Watch the tails: since $$0 \leq S_n \leq n$$, always $$|Z_n| \leq \sqrt{3n}$$. A sum of uniforms never produces values beyond that limit; the normal does. The tails are the last part to converge.

## Limits of the model

The finite-variance assumption is not a technicality. If the terms follow a Cauchy distribution, the mean of $$n$$ of them has exactly the same Cauchy distribution for every $$n$$, and no normal approximation ever appears. Dependence between the terms can also prevent convergence. Strongly skewed distributions converge more slowly than the uniform, which is symmetric. And the lab uses a pseudo-random generator and a finite number of draws: the bar heights fluctuate around the limiting shape, with deviations that grow roughly like the square root of each bar's count. A normal :concept[model]{id=model} is therefore an approximation whose quality depends on $$n$$, on the tails and on independence — not an automatic law for any sum.

::bibliography
