---
title: Fourier series and the Gibbs phenomenon
description: 'Add harmonics to approximate a square wave and watch the overshoot of about 9 % next to the jump persist, however many terms you include.'
lang: en
translationKey: fourier-and-gibbs
slug: fourier-and-gibbs
stratum: formal
domains: [signal-processing, mathematics]
concepts: [fourier-series, gibbs-phenomenon, frequency, signal]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: First version (seed text).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  This lab makes visible a classic result of Fourier analysis: the partial sums of the series of a function
  with a jump do not converge uniformly near the jump. For the square wave that alternates between minus one
  and one, the sum of the first odd harmonics converges to the function at every point of continuity, yet the
  crest closest to the jump tends to about 1.179, overshooting the level by roughly 9 % of the height of the
  jump, however many terms are used. The text states the result precisely, sketches the proof — the first crest
  is a Riemann sum for the integral of the cardinal sine — and explains the intuition behind the overshoot. It
  then proposes a sequence of observations tied to the control for the number of harmonics: the height of the
  crest, its width, the error far from the jump and the value at the jump itself. Finally, it discusses the
  limits of the model: instantaneous jumps are an idealisation, the screen samples the curve at a finite number
  of points, and the overshoot is a consequence of cutting the spectrum off abruptly, which weighted sums can
  soften at the price of a less steep jump. The same phenomenon reappears whenever a signal with sharp
  transitions is rebuilt from a truncated spectrum, as the essay on the sampling theorem discusses.
keywords: [Fourier series, Gibbs phenomenon, convergence, square wave]
provenance:
  assistance: generated
  reviewed: false
  note: Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.
draft: false
kernel: signal
widget: fourier
theorem: Gibbs phenomenon
---

A square wave, jumping from $$-1$$ to $$1$$ and back, can be written as an infinite sum of sinusoids. The lab stops that sum after $$N$$ harmonics and shows what happens near the jumps: the approximation improves almost everywhere, but not there.

::::theorem{#thm:gibbs title="Gibbs phenomenon"}
Let $$q$$ be the square wave of period $$2\pi$$ equal to $$1$$ on $$(0, \pi)$$ and to $$-1$$ on $$(-\pi, 0)$$, and let

$$
S_N(x) = \frac{4}{\pi} \sum_{j=1}^{N} \frac{\sin\big((2j - 1)x\big)}{2j - 1}
\label{eq:partial-sum}
$$

be the partial sum of its :concept[Fourier series]{id=fourier-series} with the first $$N$$ odd harmonics. Then $$S_N(x) \to q(x)$$ at every point of continuity, but the crest of $$S_N$$ closest to the jump at $$x = 0$$ satisfies

$$
\lim_{N \to \infty} S_N\!\left(\frac{\pi}{2N}\right) = \frac{2}{\pi} \int_0^{\pi} \frac{\sin t}{t} \d t \approx 1.17898.
\label{eq:gibbs}
$$

:::proof
Sketch. The derivative of :eqref[eq:partial-sum] is $$S_N'(x) = \frac{2}{\pi} \frac{\sin(2Nx)}{\sin x}$$, whose first positive zero is $$x = \pi/(2N)$$. There, writing $$t_j = (2j - 1)\pi/(2N)$$, the sum equals $$\frac{2}{\pi} \sum_{j=1}^{N} \frac{\pi}{N} \frac{\sin t_j}{t_j}$$, a midpoint Riemann sum with step $$\pi/N$$ for the integral in :eqref[eq:gibbs].
:::
::::

The overshoot is about $$0.179$$ above the level $$1$$, that is, roughly 9 % of the height of the jump, which is $$2$$.

## Intuition

Each harmonic adds detail at a finer scale. To climb from $$-1$$ to $$1$$ over a distance of the order of $$\pi/N$$, a finite sum has to oscillate, and its first oscillation overshoots the target. As $$N$$ grows, the oscillations squeeze towards the jump, but their height tends to a fixed value: convergence is pointwise, not uniform. This is the :concept[Gibbs phenomenon]{id=gibbs-phenomenon}.

## What to observe

The main control is the number of harmonics $$N$$.

1. With $$N = 1$$ the sum is a single sinusoid of amplitude $$4/\pi \approx 1.27$$: it already overshoots the level.
2. Raise $$N$$ to $$5$$, $$10$$ and $$50$$. The crest next to the jump drops to about $$1.182$$, $$1.180$$ and $$1.179$$ — and then stops dropping.
3. Watch the width of the crest: it sits at $$x = \pi/(2N)$$, so doubling $$N$$ halves its width.
4. Away from the jump, the error shrinks as $$N$$ grows.
5. At the jump itself, $$S_N(0) = 0$$, the average of the one-sided limits.

## Limits of the model

The mathematical square wave jumps instantly; physical signals take some time to change value, and their spectra fall off faster. The screen draws the curve at a finite number of points: when $$N$$ is very large, the crest may fall between two plotted points and look smaller than it is — a small lesson in sampling. Nor is the overshoot inevitable: it comes from cutting the coefficients off abruptly. Weighting them with factors that taper smoothly reduces the overshoot at the price of a less steep jump; Fejér means, for instance, never exceed the level, because the kernel that defines them is positive. For arbitrary sampled signals, the coefficients would be computed with the fast Fourier transform [@cooley1965].:sidenote[Editorial note: the historical references for the phenomenon — the work of Henry Wilbraham (1848) and of J. Willard Gibbs (1898–1899) — are not yet in the site's bibliography.] The same mechanism shows up when a signal with sharp transitions is rebuilt from a truncated spectrum, as the essay [To sample is to decide](../../essays/to-sample-is-to-decide/) discusses.

::bibliography
