---
title: From sign to information
subtitle: What is lost, and what is gained, when information is measured without meaning
description: 'From Peirce, Saussure and Frege to Shannon: how information theory measures choice by bracketing meaning, and what that bracketing costs.'
lang: en
translationKey: from-sign-to-information
slug: from-sign-to-information
stratum: philosophy
bridgesTo: theory
domains: [semiotics, information-theory, epistemology]
concepts: [sign, symbol, meaning, sense-and-reference, information, entropy, redundancy, channel, model]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: First version (seed text).
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  This essay walks the first passage of the site, from the philosophical stratum to the theoretical one: from
  the sign, a relation that always involves someone, to information, a measure of choice that names no one in
  particular. It starts from three classic analyses of the sign — Peirce's triad of representamen, object and
  interpretant; Saussure's pairing of signifier and signified; and Frege's distinction between sense and
  reference — and argues that in all three, meaning depends on an interpreter, on a shared system or on a mode
  of presentation. It then turns to Weaver's three levels of communication problems (technical, semantic and
  effectiveness) and to Shannon's methodological decision to address only the first, declaring the semantic
  aspects of communication irrelevant to the engineering problem. Self-information and entropy are defined, the
  choice of a logarithmic measure is explained, and the essay weighs what this decision gives up (reference,
  truth and, apparently, the interpreter) against what it buys (generality, and theorems about compression and
  transmission). The conclusion is that Shannon's measure does not replace semiotics but presupposes part of it:
  a repertoire of possible messages shared by sender and receiver, a receiver able to tell them apart, and a
  probability distribution assigned by someone, that is, a model. That presupposition is the bridge to theory.
keywords: [sign, information, entropy, meaning, semiotics]
provenance:
  assistance: generated
  reviewed: false
  note: Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.
draft: false
---

:::epigraph{source="@shannon1948 [p. 379]"}
“Frequently the messages have meaning; that is they refer to or are correlated according to some system with certain physical or conceptual entities. These semantic aspects of communication are irrelevant to the engineering problem.”
:::

::toc

Reading this page involves several things at once: telling letter shapes apart, recognising words, giving them sense, judging whether what is said is true, and deciding whether to keep going. The mathematical theory of communication that Claude Shannon published in 1948 chose to measure only the first of these — and that act of restraint is part of what made it so productive. This essay is the site's first crossing. It begins with the :concept[sign]{id=sign}, a relation that always involves someone, and ends with :concept[information]{id=information} in the technical sense, a measure of choice that mentions no one in particular. The aim is to make visible what is left behind on the way.

## What kind of relation is a sign? {#what-is-a-sign .question}

For Charles S. Peirce, a sign is not a thing but one term of a three-place relation. In his most quoted formulation, from around 1897, “a sign, or representamen, is something which stands to somebody for something in some respect or capacity” [@peirce1931, v. 2, § 228].:sidenote[Peirce scholars cite the *Collected Papers* by volume and paragraph — here CP 2.228 — a convention that does not depend on the pagination of any particular printing.] The sign addresses somebody: it “creates in the mind of that person an equivalent sign, or perhaps a more developed sign”, which Peirce calls the interpretant. And it stands for its object “not in all respects, but in reference to a sort of idea, which I have sometimes called the ground of the representamen” [@peirce1931, v. 2, § 228].

Three consequences matter here. First, there is no sign without a possible interpreter: the relation is triadic and does not break down into pairs. Second, the interpretant is itself a sign that can give rise to a further interpretant, so signification is an open process rather than a label stuck onto a thing. Third, a sign represents “in some respect”: every representation selects. Among the many classifications Peirce proposed, the best known separates icons, indices and :concept[symbols]{id=symbol}, the last being tied to their objects by convention or habit, as most words are [@peirce1931].

## Two sides and a mode of presentation {#saussure-and-frege .premise}

A little later, in courses taught in Geneva between 1907 and 1911, Ferdinand de Saussure proposed a two-term model. According to the :foreign[Cours de linguistique générale]{lang=fr}, the linguistic sign unites not a thing and a name but a concept and an acoustic image, which Saussure renames :foreign[signifié]{lang=fr} and :foreign[signifiant]{lang=fr} — the signified and the signifier [@saussure1916].:sidenote[The :foreign[Cours]{lang=fr} was published in 1916, after Saussure's death, by Charles Bally and Albert Sechehaye, from students' lecture notes [@saussure1916]. Attributing every formulation in it to Saussure himself calls for some caution.] The bond between the two sides is arbitrary: nothing in the sound of “tree” requires the concept it is paired with. And the value of each sign comes from its position in a system of differences, the language [@saussure1916]. The object out in the world is left outside the pair, and deliberately so: Saussure's interest is the system that makes distinctions possible.

Gottlob Frege reached a different distinction by way of a logical puzzle. If “a = a” and “a = b” are both true, why can only the second extend what we know? His answer separates, in every expression, its reference — the object designated — from its sense, the way in which that object is presented to us. “The evening star” and “the morning star” have the same reference and different senses [@frege1892]; that both name the planet Venus was an astronomical discovery, not a consequence of grammar. The distinction between :concept[sense and reference]{id=sense-and-reference}:sidenote[Translations of :foreign[Bedeutung]{lang=de} vary: “reference”, “denotation”, “nominatum” and even “meaning” have all been used. “Reference” is used here to keep the term apart from Saussure's signified.] shows that two expressions can agree on what they pick out and still differ in what they tell someone who understands them.

The three analyses disagree on almost everything, but they agree on the point that matters for this crossing: :concept[meaning]{id=meaning} is not an intrinsic property of physical marks. It depends on an interpreter (Peirce), on a shared system of differences (Saussure), or on a mode of presentation that a thought can grasp (Frege). In none of the three is meaning a quantity that can be added up.

## The problem on three levels {#three-levels .premise depends="what-is-a-sign,saussure-and-frege"}

In 1949, Warren Weaver introduced Shannon's theory to a wider audience by separating three levels of communication problems: the technical problem (how accurately can the symbols be sent?), the semantic problem (how precisely do they carry the meaning intended?) and the effectiveness problem (does the meaning received change conduct in the way intended?) [@weaver1949]. The mathematical theory addresses only the first. Weaver nevertheless argued that it is not indifferent to the other two, since meaning and effectiveness are inevitably limited by the accuracy that symbol transmission can achieve [@weaver1949].

Shannon's paper opens by stating that “the fundamental problem of communication is that of reproducing at one point either exactly or approximately a message selected at another point” [@shannon1948, p. 379]. The next sentence is the one in the epigraph. The one after it dissolves the apparent paradox: “The significant aspect is that the actual message is one selected from a set of possible messages” [@shannon1948, p. 379]. A communication system has to work for whichever message is chosen, since the designer cannot know in advance which one it will be. Information in this sense is not a property of a message on its own, but of the relation between the message and the set of alternatives it was drawn from.

## Measuring choice {#measuring-choice .definition depends="three-levels"}

If there are $$M$$ equally likely messages, any monotonic function of $$M$$ will do as a measure of choice; following a suggestion by Ralph Hartley, Shannon takes the logarithm [@shannon1948]. When the alternatives are not equally likely, the measure generalises as follows.

:::definition{#def:entropy title="Self-information and entropy"}
Let $$X$$ be a discrete random variable taking values in a finite set $$\mathcal{X}$$ with probabilities $$p(x) > 0$$. The *self-information* of an outcome $$x$$ is

$$
I(x) = -\log_2 p(x),
\label{eq:self-information}
$$

measured in bits, and the *entropy* of $$X$$ is the average self-information:

$$
\H(X) = \sum_{x \in \mathcal{X}} p(x)\, I(x) = -\sum_{x \in \mathcal{X}} p(x) \log_2 p(x).
\label{eq:entropy}
$$
:::

A fair coin has an entropy of 1 bit; a fair die, $$\log_2 6 \approx 2.585$$ bits; a biased coin that lands heads 90 % of the time, about 0.469 bits. :concept[Entropy]{id=entropy} is largest when the alternatives are equally likely and zero when the outcome is certain: it measures the uncertainty that an observation removes. Shannon showed that if we ask three things of a measure of uncertainty — that it be continuous in the probabilities, that it grow with the number of equally likely alternatives, and that it stay consistent when one choice is broken down into successive choices — then the only possible form is the one in :eqref[eq:entropy], up to a constant that sets the unit [@shannon1948]. He was careful to add that this theorem mainly lent plausibility to the definition: its real justification would lie in its implications [@shannon1948].

:::stretch{label="Why the logarithm?"}
Shannon gives three reasons for a logarithmic measure [@shannon1948]. The first is practical: the quantities engineers care about — time, bandwidth, the number of relays — tend to grow linearly with the logarithm of the number of possibilities; adding one relay to a group doubles the number of possible states and adds 1 to its base-2 logarithm. The second is intuitive: we expect two punched cards to hold twice as much information as one. The third is mathematical: many limiting operations become simple in terms of logarithms. There is also a structural reason, visible in :eqref[eq:self-information]. If two independent outcomes have probabilities $$p$$ and $$q$$, the pair has probability $$pq$$, and the logarithm turns that product into a sum: $$-\log_2(pq) = -\log_2 p - \log_2 q$$. Information from independent observations accumulates. Base 2 fixes the unit, the bit, a word Shannon credits to John W. Tukey [@shannon1948].
:::

With this measure, Shannon estimated that written English, taking into account statistical structure over no more than about eight letters, has a :concept[redundancy]{id=redundancy} of roughly 50 %: about half of a text is fixed by the structure of the language, and only the other half is free choice [@shannon1948]. Redundancy is what lets us read a sentence with letters missing — and what makes it possible to correct errors on a noisy :concept[channel]{id=channel}.

## What is lost {#what-is-lost .objection depends="measuring-choice"}

The entropy in :eqref[eq:entropy] depends on nothing but probabilities. Swap the labels of the messages — “yes” for “no”, a poem for a string of nonsense with the same statistics — and the entropy does not move. Weaver drew attention to this: for the theory, a message full of meaning and a meaningless one may carry exactly the same amount of information [@weaver1949]. Three things are left out of the measure.

The first is reference, in Frege's sense: the measure does not know what a message is about. The second is truth: a false statement and a true one can carry the same self-information. It is for reasons of this kind that Luciano Floridi proposes to distinguish well-formed, meaningful data from semantic information proper, which on his account must also be truthful [@floridi2011]. The third is the interpreter — or rather, the interpreter does not vanish but goes into hiding. The probabilities $$p(x)$$ are not written on the messages. Someone assigns them, from observed frequencies, from a model of the source, or from a conviction, and two people with different models of the same source will compute different entropies.

## What is gained {#what-is-gained .reply depends="what-is-lost"}

Bracketing meaning is not denying it; it is a methodological cut. Shannon does not say that messages lack meaning — the epigraph's own sentence says they frequently have it. The cut buys generality: the same measure applies to text, radio signals, images and sequences over any alphabet, precisely because it does not depend on what the messages mean.

It also buys theorems. With entropy defined this way, Shannon could prove how far a source can be compressed without loss and how much a noisy channel can carry with an arbitrarily small frequency of errors [@shannon1948]. These results rest on the algebraic properties of :eqref[eq:entropy] — continuity, additivity over independent events, decomposition of choices — and we have no measure of meaning with those properties. There is a philosophical gain as well: by showing exactly how much of the problem of communication can be solved without touching meaning, the theory marks out, by contrast, what only semantics and pragmatics can address.

## A bridge, not a reduction {#a-bridge .conclusion depends="what-is-lost,what-is-gained"}

The crossing from sign to information does not replace semiotics with mathematics. Shannon's measure presupposes at least three things that come from the previous stratum. It presupposes a repertoire of possible messages shared by sender and receiver — something close to Saussure's system of differences. It presupposes a receiver able to tell the alternatives apart — the bare minimum of a Peircean interpreter. And it presupposes a probability distribution assigned by someone: a :concept[model]{id=model}. Entropy is exact given the model; the model itself is a hypothesis.

This is where the essay hands over to the theoretical stratum, whose question is which model explains the phenomenon. The next essay on the bridge, [To sample is to decide](../to-sample-is-to-decide/), looks at a case in which a single modelling assumption — that a signal contains no frequencies above some limit — is enough for a continuous function to be completely determined by a sequence of numbers.

::concept-map{focus=information depth=2}

::bibliography
