---
title: Sampling and aliasing
description: 'Change the sampling rate of a sinusoid and see when the samples are enough to rebuild it, and when it masquerades as another frequency.'
lang: en
translationKey: sampling
slug: sampling
stratum: formal
domains: [signal-processing, mathematics]
concepts: [sampling-theorem, aliasing, signal, frequency]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: First version (seed text).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  This lab puts the Nyquist–Shannon sampling theorem to the test. A sinusoid of known frequency is sampled at a
  rate the reader controls, and the samples are used to rebuild the signal with the Whittaker–Shannon
  interpolation formula, a sum of cardinal sine functions centred on the sampling instants. The text states the
  theorem for band-limited signals of finite energy, explains the intuition that two samples per cycle of the
  highest frequency are enough, and proposes a sequence of observations tied to the rate control: faithful
  reconstruction when the rate comfortably exceeds twice the frequency, the limiting case in which the outcome
  depends on phase, aliasing below the limit, with the apparent frequency given by the distance to the nearest
  multiple of the rate, and the edge errors caused by a finite window. It closes with the limits of the model:
  no real sinusoid is limited in time, the interpolation sum needs infinitely many samples, real samples are
  quantised and noisy, and in practice a filter placed before sampling is indispensable, so that components
  outside the band do not fold onto the ones that matter. The companion essay discusses the shared history of
  the result and the sense in which it is deterministic.
keywords: [sampling, aliasing, Nyquist–Shannon theorem, interpolation]
provenance:
  assistance: generated
  reviewed: false
  note: Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.
draft: false
kernel: signal
widget: sampling
theorem: Nyquist–Shannon sampling theorem
---

A sinusoid is sampled at a rate $$f_s$$ of your choosing, and the samples feed the interpolation formula of the theorem. When the rate is high enough, the rebuilt curve matches the original; when it is not, another sinusoid appears, equally consistent with the very same samples.

::::theorem{#thm:sampling title="Nyquist–Shannon"}
Let $$x$$ be a finite-energy signal whose Fourier transform vanishes outside $$[-B, B]$$. If $$f_s = 1/T \geq 2B$$, then

$$
x(t) = \sum_{n=-\infty}^{\infty} x(nT)\, \sinc\!\left(\frac{t - nT}{T}\right), \qquad \sinc(u) = \frac{\sin(\pi u)}{\pi u}.
\label{eq:interpolation}
$$
::::

The series in :eqref[eq:interpolation] is the cardinal function studied by @whittaker1915; the result was stated for communications engineering by @kotelnikov1933 and by @shannon1949, and the rate $$2B$$ bears Nyquist's name [@nyquist1928]. The essay [To sample is to decide](../../essays/to-sample-is-to-decide/) sketches the proof and discusses this history.

## Intuition

A signal with no frequencies above $$B$$ cannot change to a substantially new value in less than half a cycle of its highest frequency [@shannon1949]. Two samples per cycle of that frequency therefore capture everything it can do. Below that pace, different frequencies start producing the same samples, and reconstruction picks the lowest of them: this is :concept[aliasing]{id=aliasing}. For a sinusoid of frequency $$f$$, the apparent frequency is

$$
f_a = \left| f - k f_s \right|, \qquad k = \operatorname{round}\!\left(\frac{f}{f_s}\right).
\label{eq:alias}
$$

A helpful picture is a clock hand lit by a flashing light. If the light flashes exactly once per turn, the hand seems to stand still; if it flashes slightly less often, the hand seems to creep forward — and if slightly more often, to creep backwards. The samples do not record how many full turns happened between two flashes, and that is what :eqref[eq:alias] accounts for: frequencies that differ by a multiple of $$f_s$$ cannot be told apart once sampled.

## What to observe

The main control is the sampling rate $$f_s$$; the frequency $$f$$ of the sinusoid stays fixed.

1. Start with $$f_s$$ well above $$2f$$, say $$f_s = 4f$$: the rebuilt curve matches the original in the middle of the window.
2. Bring $$f_s$$ down towards $$2f$$. At exactly $$2f$$ the outcome depends on phase: samples that land on the zero crossings are all zero.
3. Go below $$2f$$ and compare the frequency you see with :eqref[eq:alias]. With $$f_s = 4f/3$$, for example, the sinusoid comes back at frequency $$f/3$$.
4. With $$f_s = f$$ every sample is the same, and the reconstruction is a constant.
5. Watch the edges of the window: the sum uses only the visible samples, not infinitely many, and the error grows near the ends.

## Limits of the model

The :concept[sampling theorem]{id=sampling-theorem} assumes a band-limited signal; a pure sinusoid does not have finite energy, and no real signal is limited in both band and time. The interpolation sum needs samples from the entire past and future; the lab truncates it, which is why the edges go wrong. Real samples are quantised to a finite number of bits and corrupted by noise. Finally, any components above $$f_s/2$$ that reach the converter fold onto the useful band and cannot be separated afterwards, which is why, in practice, signals are filtered before they are sampled.

::bibliography
