---
title: 'To sample is to decide: the Nyquist–Shannon theorem'
subtitle: When a sequence of numbers is enough to pin down a continuous signal — and what that guarantee takes for granted
description: 'Signals, frequency and the Fourier transform; the sampling theorem with a proof sketch, its shared history, and aliasing, step by step.'
lang: en
translationKey: to-sample-is-to-decide
slug: to-sample-is-to-decide
stratum: theory
bridgesTo: formal
domains: [signal-processing, mathematics, information-theory]
concepts: [signal, frequency, fourier-transform, fourier-series, sampling-theorem, aliasing, gibbs-phenomenon, fast-fourier-transform, noise, model, channel-capacity]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: First version (seed text).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  This essay crosses from the theoretical stratum to the formal one through a result that turns a model into a
  guarantee: the sampling theorem. It begins with the notions of signal, frequency and Fourier transform, which
  let us describe the same signal either by its value at each instant or by how much of each frequency it
  contains. It states the theorem — a finite-energy signal whose spectrum vanishes outside the band from minus B
  to B is completely determined by samples taken at a rate of at least 2B per second — and sketches a proof
  through the periodisation of the spectrum and interpolation with the sinc function. It sets out, with due
  care, the shared history of the result, from Whittaker (1915) and Nyquist (1928) to Kotelnikov (1933) and
  Shannon (1949), and shows, in a scroll-driven sequence, what happens when the sampling rate drops below the
  limit: high frequencies come back disguised as low ones, which is aliasing. A digression connects the abrupt
  cut-off of the spectrum with the Gibbs phenomenon. Finally, the essay separates the determinism of the
  implication, which is complete, from the assumptions of the model, which no real signal meets exactly, and
  concludes that sampling means deciding twice: which frequencies matter, and how much one is willing to pay,
  in numbers per second, to keep them.
keywords: [sampling, Fourier transform, aliasing, Nyquist–Shannon theorem, signals]
provenance:
  assistance: generated
  reviewed: false
  note: Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.
draft: false
---

A microphone turns changes in air pressure into a voltage that varies continuously; a computer can only store finite lists of numbers. Between the two lies a decision: at which instants to measure. The sampling theorem says when that decision loses nothing — a clear example of how a modelling assumption, once granted, becomes a mathematical guarantee. This essay is the site's second crossing, from the theoretical stratum to the formal one.

::toc

## Signal, frequency and transform {#signal-and-frequency .definition}

A :concept[signal]{id=signal} is a quantity that varies over time — the pressure in front of a microphone, the voltage on a cable — represented by a function $$x(t)$$. The :concept[frequency]{id=frequency} of a periodic oscillation is its number of cycles per unit of time, measured in hertz (Hz). The idea that organises everything else is that a signal can be described in two equivalent ways: by the value it takes at each instant, or by how much of each frequency it contains.

:::definition{#def:fourier title="Fourier transform"}
The Fourier transform of a finite-energy signal $$x$$ is

$$
X(f) = \int_{-\infty}^{\infty} x(t)\, \e^{-\i 2\pi f t} \d t,
\label{eq:fourier}
$$

and the signal is recovered by the inverse transform, $$x(t) = \int_{-\infty}^{\infty} X(f)\, \e^{\i 2\pi f t} \d f$$. The signal $$x$$ is *band-limited* to $$B$$ when $$X(f) = 0$$ for every $$|f| > B$$.
:::

Equation :eqref[eq:fourier] defines the :concept[Fourier transform]{id=fourier-transform}:sidenote[For finite-energy signals the integral is to be read in the mean-square sense (Plancherel's theorem); for absolutely integrable signals, both readings agree.] and describes the spectrum of the signal: how much of each frequency it contains, and with which phase. In practice, the spectrum of a finite run of samples is computed by the discrete Fourier transform, which the algorithm of Cooley and Tukey made fast enough for everyday use [@cooley1965] — the :concept[fast Fourier transform]{id=fast-fourier-transform}.

Describing signals by frequency is not a mathematical whim. Linear time-invariant systems, such as filters and many transmission media, treat each frequency separately: they multiply each sinusoidal component by a factor that depends only on its frequency. For such systems the useful question is not what value the signal takes right now, but how high its frequencies go — and that is exactly the question the sampling theorem turns into a design rule.

## The theorem {#the-theorem .claim depends="signal-and-frequency"}

To sample a signal at regular intervals of $$T$$ seconds is to keep only the values $$x(nT)$$ for integer $$n$$; the sampling rate is $$f_s = 1/T$$ samples per second. :ref[thm:sampling] says that if the signal is band-limited in the sense of :ref[def:fourier], nothing is lost when the rate is high enough.

::::theorem{#thm:sampling title="Nyquist–Shannon"}
Let $$x$$ be a finite-energy signal whose Fourier transform vanishes outside the interval $$[-B, B]$$. If $$f_s = 1/T \geq 2B$$, then $$x$$ is completely determined by its samples $$x(nT)$$, $$n \in \Z$$, and

$$
x(t) = \sum_{n=-\infty}^{\infty} x(nT)\, \sinc\!\left(\frac{t - nT}{T}\right), \qquad \sinc(u) = \frac{\sin(\pi u)}{\pi u}.
\label{eq:interpolation}
$$

:::proof
Sketch. Represent the samples by the impulse train $$x_s(t) = \sum_n x(nT)\, \delta(t - nT)$$. By the Poisson summation formula, its transform is the original spectrum repeated every $$f_s$$:

$$
X_s(f) = \frac{1}{T} \sum_{k=-\infty}^{\infty} X(f - k f_s).
\label{eq:replicas}
$$

If $$f_s \geq 2B$$, the copies in :eqref[eq:replicas] do not overlap (at most they touch at the edges, a set of measure zero). Multiplying $$X_s$$ by the ideal low-pass filter, equal to $$T$$ for $$|f| < f_s/2$$ and zero elsewhere, gives back exactly $$X$$. In the time domain that multiplication is convolution with the filter's impulse response, $$\sinc(t/T)$$, and convolving the impulse train with it yields the sum in :eqref[eq:interpolation]. @shannon1949 gives an equivalent argument: the samples are, up to a constant factor, the coefficients of the Fourier series of the spectrum over the interval from $$-B$$ to $$B$$, so they determine the spectrum, and with it the signal.
:::
::::

:::remark
The limiting case $$f_s = 2B$$ holds for finite-energy signals, but not for a pure sinusoid at exactly $$B$$, which does not have finite energy: sampled at its zero crossings, it yields nothing but zeros. This is why, in practice, signals are sampled with some margin above $$2B$$.
:::

The intuition Shannon offers is simple: a signal with no frequencies above $$B$$ cannot change to a substantially new value in less than half a cycle of its highest frequency, that is, in less than $$1/(2B)$$ seconds, so samples taken at that spacing miss nothing essential [@shannon1949]. The proof shows that the intuition is not merely approximately but exactly right — and the :concept[sampling theorem]{id=sampling-theorem} becomes a design rule: to keep everything up to $$B$$ hertz, $$2B$$ numbers per second suffice.

## A discovery with many names {#attribution .premise}

The result has a long history and therefore several names. In 1915 the mathematician E. T. Whittaker studied, in the setting of interpolation theory, the series now written as in :eqref[eq:interpolation], which he called the cardinal function [@whittaker1915]. In 1928 Harry Nyquist, analysing telegraphy, showed that a band of width $$W$$ can carry about $$2W$$ independent signal elements per second [@nyquist1928]; hence the name “Nyquist rate” for $$2B$$. In 1933 Vladimir Kotelnikov stated and proved the theorem for communications engineering, in a paper published in Russian [@kotelnikov1933]. In 1949 Shannon published an explicit statement and proof. He presented the result as something already known in the practice of communications, noted that mathematicians had stated it in other forms, and recorded that Nyquist and, later, Dennis Gabor had pointed out that about $$2TW$$ numbers suffice to describe a signal of band $$W$$ and duration $$T$$ [@shannon1949].:sidenote[The mathematician Shannon cites is J. M. Whittaker, E. T. Whittaker's son, author of a 1935 book on interpolation theory [@shannon1949].]

Compound names — Whittaker–Kotelnikov–Shannon, Nyquist–Shannon and others — record this distributed authorship. The title of this essay uses “Nyquist–Shannon” as a convention, not as a verdict on priority.

## When sampling deceives {#aliasing .claim depends="the-theorem"}

If $$f_s < 2B$$, the copies in :eqref[eq:replicas] overlap and no filter can pull them apart afterwards: components above $$f_s/2$$ come back “folded” below that limit. This is :concept[aliasing]{id=aliasing}. For a sinusoid of frequency $$f$$, the apparent frequency is

$$
f_a = \left| f - k f_s \right|, \qquad k = \operatorname{round}\!\left(\frac{f}{f_s}\right),
\label{eq:alias}
$$

that is, the distance from $$f$$ to the nearest multiple of $$f_s$$. The sequence below follows a 3 kHz tone sampled at ever lower rates.

::::scrolly
::lab{widget=sampling}

:::step{state="fs=12000"}
**12 kHz.** Four samples per cycle, comfortably above the 6 kHz limit. Interpolation by :eqref[eq:interpolation] returns the original sinusoid.
:::

:::step{state="fs=6000"}
**6 kHz.** Exactly twice the tone's frequency: two samples per cycle. The outcome depends on phase — if the samples land on the peaks, the sinusoid is recovered; if they land on the zero crossings, every sample is zero and the tone disappears. This is the limiting case of the remark above.
:::

:::step{state="fs=4000"}
**4 kHz.** Below the limit. By :eqref[eq:alias], the 3 kHz tone shows up as a tone of $$|3 - 4| = 1$$ kHz: a 1 kHz sinusoid would produce the very same samples, and reconstruction picks the lower frequency.
:::

:::step{state="fs=3000"}
**3 kHz.** The rate equals the tone's frequency. Every sample falls at the same phase of the cycle, all of them have the same value, and the tone turns into a constant: an apparent frequency of zero.
:::
::::

This is why analogue-to-digital converters are usually preceded by a filter that attenuates everything above $$f_s/2$$ before sampling: once the samples are taken, the folding can no longer be undone.

:::aside
**The Gibbs phenomenon.** The ideal low-pass filter in the proof cuts the spectrum off abruptly, and abrupt cuts have a price. When a function with a jump, such as a square wave, is approximated by the first $$N$$ terms of its :concept[Fourier series]{id=fourier-series}, the partial sum overshoots the jump by about 9 % of its height near the discontinuity, and that overshoot does not shrink as $$N$$ grows — it only gets narrower. This is the :concept[Gibbs phenomenon]{id=gibbs-phenomenon}. The same mechanism shows up in sinc reconstruction, whose side lobes decay slowly: sharp transitions rebuilt from a truncated spectrum come with ripples. The [Fourier and Gibbs lab](../../lab/fourier-and-gibbs/) lets you raise $$N$$ and watch the overshoot persist.
:::

## What “deterministic” means here {#deterministic .claim depends="the-theorem"}

The theorem is deterministic in a precise sense: its conclusion follows necessarily from its assumptions. There is no probability or estimate in it; given the samples, every intermediate value of the signal is fixed by :eqref[eq:interpolation].:sidenote[Deterministic does not mean decidable. @godel1931 showed that consistent, sufficiently expressive formal systems contain sentences they can neither prove nor refute, and @turing1936 showed that there is no general mechanical procedure for deciding certain properties of computing machines themselves.] But the determinism belongs to the implication, not to the world, and the assumptions are idealisations.

No non-zero signal is both band-limited and time-limited: if it were zero outside an interval of time, its transform would extend to a function analytic on the whole complex plane, and such a function that vanishes on an interval vanishes everywhere. Real signals start and stop, so none of them meets the assumption of :ref[thm:sampling] exactly. Moreover, the sum in :eqref[eq:interpolation] needs samples from the entire past and the entire future, and every real sample is stored with a finite number of bits and corrupted by :concept[noise]{id=noise}. In practice one filters before sampling, samples with a margin, and accepts a small, controlled error. The theorem does not describe the real converter; it describes the limit the converter approaches, and serves as the reference for measuring how far it falls short.

## Deciding what matters {#deciding .conclusion depends="deterministic,aliasing"}

To sample is to decide twice. First one decides on a :concept[model]{id=model}: which frequencies matter, that is, the $$B$$ below which everything worth keeping lies. Then one decides on a cost: $$2B$$ numbers per second, each with some precision. The theorem guarantees that once these choices are made nothing more is lost; it does not guarantee that the choices were good.

Shannon used exactly this count — a signal of band $$W$$ and duration $$T$$ is specified by $$2TW$$ numbers — to work out how many bits per second a band-limited channel with white noise can carry [@shannon1949]:

$$
C = W \log_2 \frac{P + N}{N},
\label{eq:capacity}
$$

where $$P$$ is the average signal power and $$N$$ the noise power in the band. Equation :eqref[eq:capacity] is a :concept[channel capacity]{id=channel-capacity}: the sampling theorem turns a modelling choice into an account of costs. The next essay on the bridge, [Choosing costs bits](../choosing-costs-bits/), carries that accounting from signals to the choices made by the people who use a product.

::bibliography
