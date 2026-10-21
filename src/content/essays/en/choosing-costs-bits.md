---
title: 'Choosing costs bits: entropy, decision and product'
subtitle: The Hick–Hyman law, Huffman codes, and what an interface owes the people who use it
description: 'From the Hick–Hyman law to prefix codes: an information model of what choosing costs in an interface, a worked redesign, and its ethical limits.'
lang: en
translationKey: choosing-costs-bits
slug: choosing-costs-bits
stratum: formal
bridgesTo: value
domains: [information-theory, design, product]
concepts: [decision, hick-hyman-law, cognitive-load, entropy, prefix-code, huffman-code, kraft-inequality, interface, value, product]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: First version (seed text).
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  This essay makes the site's last crossing, from the formal stratum to the stratum of value, by asking what it
  costs to choose in an interface. It starts from the Hick–Hyman law, according to which, in reaction-time
  experiments, the mean time to choose grows linearly with the information carried by the choice, and it sets
  out the caveats that limit how far the law can be carried over to real products. It then introduces prefix
  codes, Kraft's inequality and the source coding theorem, which bounds the mean length of any code from below
  by the entropy of the source, together with Huffman's algorithm, which attains that bound. A hierarchical menu
  is then treated as a code: if every choice costs the logarithm of the number of options on offer, the mean
  cost for someone who does not yet know how often each item is used equals the entropy plus the divergence
  between the actual usage and the weights that the menu's structure assigns to each item. A redesign with
  illustrative numbers shows that reorganising a menu does not remove information but only redistributes it,
  and that who gains depends on who the users are. The essay treats the deliberate use of decision costs against
  users as a measurable abuse, and concludes that value, in this narrow sense, is a reduction of uncertainty for
  someone at some cost, and that deciding who pays that cost is an ethical question rather than a technical one.
keywords: [Hick–Hyman law, Huffman coding, entropy, interface design, decision]
provenance:
  assistance: generated
  reviewed: false
  note: Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.
draft: false
---

Every interface asks for choices: which button, which menu item, which of the ways to send something. Each choice takes some of the user's time and attention. This essay asks whether that cost can be measured in bits — and answers that, in part and under explicit assumptions, it can. It is the site's third crossing, from the formal stratum to the stratum of :concept[value]{ref=value}: from what follows necessarily to what is useful to someone, and at what cost.

::toc

## A law of choice time {#hick-hyman-law .premise}

In 1952, William Edmund Hick applied Shannon's theory to choice-reaction-time experiments with up to ten alternatives: for each stimulus, the participant had to give the matching response as quickly as possible. Mean reaction time grew roughly with the logarithm of the number of alternatives, and Hick estimated that the average rate of gain of information was roughly constant, of the order of five bits per second [@hick1952]. In a second experiment, participants deliberately allowed themselves some proportion of errors in order to respond faster; their times remained related to the information actually transmitted rather than to the nominal number of alternatives [@hick1952]. The relation is usually written as

$$
\mathrm{RT} = a + b \log_2(n + 1),
\label{eq:hick}
$$

where $$\mathrm{RT}$$ is the mean reaction time, $$n$$ the number of equally likely alternatives, and $$a$$, $$b$$ constants fitted to the data. The $$+1$$ is commonly read as the extra uncertainty about whether a stimulus will occur at all.

In 1953, Ray Hyman kept the idea and pulled apart the number of alternatives from the information they carry: besides varying how many there were, he also varied their probabilities. Mean reaction time tracked the average information of the stimulus linearly, not the number of alternatives [@hyman1953]:

$$
\mathrm{RT} = a + b\, \H(X).
\label{eq:hyman}
$$

For equally likely alternatives $$\H(X) = \log_2 n$$, and :eqref[eq:hyman] differs from :eqref[eq:hick] only by the $$+1$$. Together the two formulations make up the :concept[Hick–Hyman law]{ref=hick-hyman-law}: what weighs on a :concept[decision]{ref=decision} is not the number of options but the uncertainty they represent for the person choosing.

## Caveats {#caveats .objection depends="hick-hyman-law"}

The law is empirical and local. The constants $$a$$ and $$b$$ are estimated by regression for each task and each group of people; Hick himself reported an average rate, not a constant of nature [@hick1952]. The experiments measured choices among stimulus–response pairings that had already been learned, under controlled conditions. Using a menu involves more than that: searching visually, reading labels, remembering where things are, moving a pointer.:sidenote[Editorial note: the later literature on Hick's law — on the effects of extended practice and of stimulus–response compatibility, among others — is not yet in the site's bibliography. The claims in this paragraph are limited to what Hick's and Hyman's studies support; the author's review should add the missing references.] What follows is therefore a model to think with, not a prediction: the epistemic status of this essay is “probable”, and the calculations below hold if, and to the extent that, their assumptions do.

## Choosing is coding {#choosing-is-coding .definition depends="hick-hyman-law"}

A hierarchical menu resembles a code. Each item is reached by a sequence of choices, and no complete path is the beginning of another — exactly the property that defines prefix codes.

:::definition{#def:prefix title="Prefix code"}
A $$k$$-ary code assigns to each symbol of a source a word over an alphabet of $$k$$ letters. It is a :concept[prefix code]{ref=prefix-code} when no word is a prefix of another, so that each word can be decoded as soon as it ends, without looking ahead.
:::

::::theorem{#thm:kraft title="Kraft's inequality"}
A $$k$$-ary prefix code with word lengths $$\ell_1, \dots, \ell_m$$ exists if and only if

$$
\sum_{i=1}^{m} k^{-\ell_i} \leq 1.
\label{eq:kraft}
$$

:::proof
Sketch. The words of a prefix code are leaves of a $$k$$-ary tree, none of them an ancestor of another. If $$\ell_{\max}$$ is the greatest length, a word of length $$\ell_i$$ covers $$k^{\ell_{\max} - \ell_i}$$ of the $$k^{\ell_{\max}}$$ nodes on the deepest level, and these sets are disjoint; adding them up and dividing by $$k^{\ell_{\max}}$$ gives :eqref[eq:kraft]. Conversely, if the sum does not exceed 1, the words can be assigned in order of increasing length, each to the first free node on its level [@cover2006, ch. 5].
:::
::::

:concept[Kraft's inequality]{ref=kraft-inequality} works like a budget: short paths are expensive, and there is no room for all of them to be short. The next theorem says how much, on average, the budget allows us to save.

:::theorem{#thm:source title="Source coding"}
Let $$X$$ be a source with probabilities $$p_i$$, and let $$L^*$$ be the smallest mean length $$\sum_i p_i \ell_i$$ among $$k$$-ary prefix codes for $$X$$. Then

$$
\frac{\H(X)}{\log_2 k} \leq L^* < \frac{\H(X)}{\log_2 k} + 1,
\label{eq:source-coding}
$$

and Huffman's algorithm constructs a code that attains $$L^*$$ [@huffman1952; @cover2006, ch. 5].
:::

A :concept[Huffman code]{ref=huffman-code} gives short words to frequent symbols and long ones to rare symbols. For a menu the translation is direct: what is used often should be close at hand; what is used rarely can live further away.

## The menu as a code {#menu-as-code .claim depends="choosing-is-coding"}

To connect the Hick–Hyman law with :ref[thm:source], we need to say what each step costs. The simplest assumption describes someone who does not yet know how often each item is used: every choice among $$k$$ options costs $$\log_2 k$$ bits, as if the options were equally likely.

::::proposition{#prop:menu title="Cost of a menu before learning"}
In a tree-shaped menu, let $$k_1(x), \dots, k_{d(x)}(x)$$ be the number of options at each level on the path to item $$x$$, and let $$w(x) = \prod_j 1/k_j(x)$$ be the weight of that path, so that $$\sum_x w(x) = 1$$. If every choice costs $$\log_2 k_j(x)$$ bits and items are used with probabilities $$p(x)$$, the mean cost is

$$
\sum_x p(x) \log_2 \frac{1}{w(x)} = \H(X) + \KL{p}{w} \geq \H(X),
\label{eq:cross-entropy}
$$

with equality if and only if $$w = p$$.

:::proof
The equality is the definition of relative entropy, $$\KL{p}{w} = \sum_x p(x) \log_2 \frac{p(x)}{w(x)}$$. The inequality is the information inequality: relative entropy is never negative, and it vanishes only when the two distributions coincide [@cover2006, ch. 2].
:::
::::

:ref[prop:menu] separates two groups of users. Those who have already learned the usage frequencies pay, by :eqref[eq:hyman], the entropy $$\H(X)$$ whatever the organisation — plus the fixed cost $$a$$ of each level they go through. Those who have not yet learned them also pay the divergence $$\KL{p}{w}$$, which measures the mismatch between the menu's structure and actual use. Organising by frequency means bringing $$w$$ closer to $$p$$.

## A redesign in numbers {#redesign .example depends="menu-as-code,caveats"}

::::horizontal{label="Redesigning a share menu, in five steps"}
:::panel
**1. The starting point.** A share menu lists 12 destinations in alphabetical order. The numbers in this example are illustrative, chosen for the demonstration, and do not come from any real product. Without knowing the frequencies, a user pays, by :eqref[eq:cross-entropy], $$\log_2 12 \approx 3.58$$ bits per choice.
:::

:::panel
**2. Measure before changing.** A hypothetical usage log shows a concentrated distribution:

| Destinations, most to least used | Share of uses |
|---|---|
| 1st to 3rd | 34 %, 22 %, 14 % |
| 4th to 6th | 9 %, 6 %, 4 % |
| 7th to 12th | 3 %, 2 %, 2 %, 2 %, 1 %, 1 % |

The entropy of this distribution is about 2.77 bits. The alphabetical menu charges a newcomer an excess of $$\KL{p}{w} \approx 0.81$$ bits per choice.
:::

:::panel
**3. Reorganise by frequency.** The three most used destinations move up to the first level, next to a “More…” option that opens the other nine. Path weights become $$1/4$$ for the top three and $$1/36$$ for the rest; they add up to 1, as in :ref[prop:menu]. The cost before learning falls to about 2.95 bits, and the excess over the entropy from 0.81 to 0.18 bits.
:::

:::panel
**4. The sum that does not change.** For someone who has learned the frequencies, the choice splits in two: one among four options (1.93 bits) and, 30 % of the time, one among nine (2.81 bits). By Shannon's rule for decomposing choices, $$1.93 + 0.30 \times 2.81 \approx 2.77$$ bits — exactly the entropy. Reorganising does not remove information; it redistributes it across levels. Meanwhile the mean depth goes from 1 to 1.3 levels, each with its fixed cost.
:::

:::panel
**5. Put a price on time.** With $$b = 0.2$$ s per bit — the order of magnitude of the five bits per second Hick reported — and $$a = 0.2$$ s, a value chosen only for illustration, :eqref[eq:hyman] predicts:

| Menu | Before learning | After learning |
|---|---|---|
| Alphabetical, one level | 0.92 s | 0.75 s |
| By frequency, two levels | 0.85 s | 0.81 s |

The redesign helps newcomers and slightly slows down those who already know their way. Which effect dominates depends on the mix of users and on the real values of $$a$$ and $$b$$ — empirical questions that the model can pose but not answer.
:::
::::

The lab below computes the entropy of any text you type and the mean length of a Huffman code for it: a quick way to feel the gap between the number of possible symbols and the uncertainty they actually carry.

::lab{widget=entropy}

## When the cost is imposed on purpose {#imposed-cost .objection depends="menu-as-code"}

Equation :eqref[eq:cross-entropy] has an uncomfortable reading: whoever designs the interface chooses the weights $$w$$, and with them how much excess each of the user's intentions will cost. Burying the option to cancel a subscription deep in a tree gives a long path to something the person wants to do; adding decoy options raises the number of alternatives; pre-selecting whatever suits the business turns the default into a trap. Practices like these, sometimes called dark patterns, are not design mistakes: they are decision costs deliberately shifted onto users without their consent.

The model is not enough to condemn them — the condemnation is ethical — but it helps make them visible and, in principle, measurable. Nor is :concept[cognitive load]{ref=cognitive-load} shared equally: an excess that costs a fraction of a second to someone rested and familiar with the product may cost far more — plausibly in errors as well — to someone short of time, short of attention, or new to the :concept[interface]{ref=interface}.

## Value as reduction of uncertainty {#value .conclusion depends="redesign,imposed-cost"}

The journey ends where the bridge was meant to end. Philosophy asked for whom a sign means anything; theory offered a model of choice; the formal stratum set a bound — entropy is the least that any organisation can charge someone who has learned the frequencies —; and the stratum of value asks what to do with all this. The answer proposed here is modest: a :concept[product]{ref=product} has value, in this narrow sense, when it reduces someone's uncertainty at a cost that person would accept. Bits measure part of the cost; they do not say who should pay it. That decision remains ours — which is why the bridge leads back, in the end, to the [first essay](../from-sign-to-information/): the meaning that the theory bracketed returns as the question of for whom, in the end, the choice matters.

::bibliography
