---
title: The binary symmetric channel
description: 'Set the error probability of a binary channel and see its capacity, C = 1 − H₂(p): the limit set by the noisy-channel coding theorem.'
lang: en
translationKey: noisy-channel
slug: noisy-channel
stratum: formal
domains: [information-theory, probability]
concepts: [channel, channel-capacity, noise, mutual-information, redundancy]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: First version (seed text).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  This lab deals with the most surprising result of Shannon's theory: over a noisy channel it is possible to
  transmit with a frequency of errors as small as desired, provided the rate stays below a limit called the
  capacity. The model is the binary symmetric channel, which flips each bit with probability p, independently of
  the others; its capacity is one minus the binary entropy of p. The text states the channel coding theorem for
  discrete memoryless channels, explains why the right correction is not simply to subtract the error rate —
  using Shannon's own example, in which one per cent of errors at a thousand symbols per second leaves about 919
  bits per second rather than 990 — and proposes a sequence of observations tied to the error-probability
  control: the perfect channel, Shannon's example, the point at which capacity falls to one half, the useless
  channel at p equal to one half, and the symmetry above that value. It closes with the limits of the model: the
  theorem is asymptotic and requires long blocks, and therefore delay; its classic proof shows that good codes
  exist without saying how to build them efficiently; real errors often come in bursts rather than
  independently; and the error probability has to be known.
keywords: [channel capacity, binary symmetric channel, noise, Shannon's theorem]
provenance:
  assistance: generated
  reviewed: false
  note: Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.
draft: false
kernel: information
widget: channel
theorem: Noisy-channel coding theorem
---

A binary symmetric :concept[channel]{ref=channel} takes bits in and gives bits out; each one is flipped with probability $$p$$, independently of the rest. The question is how much information gets through per use of the channel — and how much of it can arrive without errors.

::::theorem{#thm:channel title="Noisy-channel coding"}
Consider a discrete memoryless channel with :concept[capacity]{ref=channel-capacity} $$C = \max_{p(x)} \I(X; Y)$$, where $$\I(X; Y)$$ is the :concept[mutual information]{ref=mutual-information} between input and output. For every rate $$R < C$$ there are block codes whose probability of error tends to zero as the block length grows; for $$R > C$$ this is impossible [@shannon1948; @cover2006, ch. 7]. For the binary symmetric channel with flip probability $$p$$,

$$
C = 1 - \H_2(p), \qquad \H_2(p) = -p \log_2 p - (1 - p) \log_2 (1 - p),
\label{eq:bsc-capacity}
$$

in bits per channel use.
::::

## Intuition

If 1 % of the bits arrive flipped, it is tempting to say that 99 % of the information gets through. Shannon showed why that is wrong: the receiver does not know which bits were flipped, and that uncertainty has to be paid for too. In his example, a source of 1000 bits per second on a channel with 1 % errors loses about 81 bits per second to this uncertainty — the equivocation — and transmits about 919, not 990 [@shannon1948]. Those 81 bits per second correspond to $$\H_2(0.01) \approx 0.081$$ bits per symbol, the term subtracted in :eqref[eq:bsc-capacity]. Below capacity, the :concept[redundancy]{ref=redundancy} added by a good code makes it possible to correct almost all errors; above it, no code can.

Comparing with the naive fix shows how surprising this is. Sending each bit three times and taking a majority vote lowers the error probability, for $$p = 0.01$$, from $$0.01$$ to $$3p^2 - 2p^3 \approx 0.0003$$ — but the rate drops to $$1/3$$ of a bit per use, and more repetitions would drive the rate to zero. The theorem says that this price need not be paid: any rate below $$C \approx 0.919$$ allows errors as rare as one wishes.

## What to observe

The control is the flip probability $$p$$.

1. With $$p = 0$$ the channel is perfect: $$C = 1$$ bit per use.
2. With $$p = 0.01$$, $$C \approx 0.919$$: Shannon's example.
3. Around $$p \approx 0.11$$ the capacity halves, $$C \approx 0.50$$.
4. With $$p = 0.5$$ the output is independent of the input and $$C = 0$$: the :concept[noise]{ref=noise} has wiped everything out.
5. Above $$0.5$$ the capacity rises again: a channel that almost always flips is almost perfect for a receiver who knows it and flips back. With $$p = 1$$, $$C = 1$$.

## Limits of the model

The theorem is asymptotic: its guarantees hold for longer and longer blocks, and long blocks mean delay. The classic proof draws codes at random and shows that on average they work; this proves that good codes exist, but says nothing about how to build or decode them with reasonable effort [@cover2006, ch. 7]. The binary symmetric channel assumes independent errors; on many real channels, errors come in bursts. And the capacity depends on $$p$$, which in practice has to be estimated — and may drift.

::bibliography
