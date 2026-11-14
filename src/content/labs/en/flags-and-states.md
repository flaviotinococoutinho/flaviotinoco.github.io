---
title: Flags and states
description: 'Send events to a video player and compare three boolean flags with a state machine: eight configurations for four situations.'
lang: en
translationKey: flags-and-states
slug: flags-and-states
stratum: formal
domains: [computer-science, software-engineering, information-theory]
concepts: [state, finite-state-machine, redundancy, entropy]
published: 2026-11-14
revisions:
  - date: 2026-11-14
    note: First version, from the example of the essay “The second flag”.
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  This lab places two representations of the same video player side by side and sends both the same events.
  The first keeps the situation in three boolean flags, updated by the methods of the demonstration code of
  the essay “The second flag”; the second is a deterministic finite automaton with the transition table of the
  same essay. Three flags allow eight configurations, and the player has four situations: the other four
  configurations describe nothing, yet they can be written to memory. The lab shows at which point of a history
  of events that happens, which events the automaton refuses and when the two representations start to
  disagree. It also shows the measure the essay uses: the entropy of the configurations that actually occurred,
  computed by the information-theory kernel, and the redundancy that follows from it, the share of the three
  bits that tells nothing. The text states the extended transition function, which takes a whole history to a
  single state, proposes a sequence of observations that reproduces the trace of the essay, and records the
  limits of the model: the stop method is a choice of this lab, the four situations are taken as mutually
  exclusive, and a flat machine with several independent dimensions grows the way the flags did.
keywords: [state machine, boolean flags, finite automaton, redundancy]
provenance:
  assistance: generated
  reviewed: false
  note: Drafted with AI assistance (Claude) in the scope round of 14 November 2026, from the example and the sources of the essay “The second flag”; awaiting review by the author.
draft: false
kernel: information
widget: flags
theorem: Extended transition function of a deterministic finite automaton
---

A video player is stopped, playing, paused or rewinding. This lab represents it in two ways and sends the same events to both. On one side, three boolean flags, updated by the methods of the demonstration code of the essay [The second flag](../../essays/the-second-flag/). On the other, a deterministic :concept[finite automaton]{ref=finite-state-machine} with the transition table of the same essay [@rabin1959; @hopcroft2007, ch. 2].

## Intuition

Each method of the code with flags sets the flags its author remembered. `play()` turns one on and the other two off; `pause()` only turns its own on; `rewind()` turns its own on and the playing one off. No line is wrong on its own, but the order of the calls decides which configuration the object ends in — and three flags allow $$2^3 = 8$$ configurations for four situations.

In the automaton, the :concept[state]{ref=state} is one value out of four. The transition function says, for each state and each event, which state comes next; when the table has no such cell, the event is refused, and whoever sent it is told. A whole history leads to a single state, which the extended transition function computes event by event. That is why the state of this lab is the history itself: the link to a state stores only the sequence of events.

The measure comes from information theory. If $$X$$ is the configuration of the flags along a history, $$\mathcal{X}$$ is the set of the eight configurations and $$\H(X)$$ is the :concept[entropy]{ref=entropy} of the configurations that occurred, the :concept[redundancy]{ref=redundancy} of the history is the share of the three bits that tells nothing [@shannon1948]:

$$
R = 1 - \frac{\H(X)}{\log_2 \lvert \mathcal{X} \rvert} = 1 - \frac{\H(X)}{3}.
\label{eq:redundancy-flags}
$$

With the four situations equally frequent and no meaningless configuration, :eqref[eq:redundancy-flags] gives $$1 - 2/3 \approx 0.33$$: the floor the essay computes.

## What to observe

The four buttons send events; the last one can be undone.

1. With no event at all, the flags read 000 and the machine is in “stopped”: the two representations agree.
2. Send `play()`: 100, “playing”, on both sides.
3. Send `pause()`: the flags become 110, playing and paused at once, a configuration that describes no situation at all. The machine is in “paused”.
4. Send `rewind()`: 011, another meaningless configuration. This is the trace of the table in the essay.
5. Start over and send `pause()` with the player stopped. The flags accept it and now say “paused”; the machine refuses the event and stays in “stopped”. The two representations describe different situations, and only one of them said so.
6. Send `stop()` at any time: the flags return to 000. Watch the count of occurrences of each configuration and the redundancy of the history.

## Limits of the model

The code excerpt in the essay does not show `stop()`; here it turns the three flags off, the reading under which “stopped” is configuration 000 of the table in the essay. Another implementation would reach other traces, and that is the point: with flags, the behaviour depends on what each method remembered to do.

The entropy shown is that of the configurations that occurred in the history sent, a short sample chosen by whoever clicks, not that of a system in use. The four situations are taken as mutually exclusive; flags that describe genuinely independent dimensions are legitimate and have no meaningless configuration. And the flat state machine has its own limit: with several independent dimensions, the number of states grows as the number of configurations did, and machines have to be composed, as the essay discusses.

::bibliography
