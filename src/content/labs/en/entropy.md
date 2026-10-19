---
title: Entropy and Huffman codes
description: 'Type a text and compare its entropy with the mean length of a Huffman code: the source coding theorem, live.'
lang: en
translationKey: entropy
slug: entropy
stratum: formal
domains: [information-theory, computer-science]
concepts: [entropy, prefix-code, huffman-code, kraft-inequality, redundancy]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: First version (seed text).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  This lab illustrates Shannon's source coding theorem with texts typed by the reader. From the frequencies of
  the symbols in the text it computes the empirical entropy, in bits per symbol, and builds a Huffman code whose
  mean length is compared with the entropy and with the length of a fixed-length code. The text states the
  theorem — the smallest mean length of a binary prefix code lies between the entropy and the entropy plus one
  bit, and Huffman's algorithm attains that minimum — sketches its proof through Kraft's inequality and the
  information inequality, and proposes a sequence of observations tied to the text box: a single repeated
  symbol, two alternating symbols, an ordinary sentence, a symbol made more frequent, and a shuffled sentence
  whose entropy does not change. It then discusses the limits of the model: counting isolated symbols ignores
  the dependencies between them, which account for much of the redundancy of natural languages; short texts
  give noisy estimates of their source; coding symbol by symbol can waste up to one bit, a loss that coding in
  blocks reduces; and the code table itself would have to be transmitted. The essay on the cost of choosing
  applies the same ideas to the organisation of menus.
keywords: [entropy, Huffman coding, source coding, compression]
provenance:
  assistance: generated
  reviewed: false
  note: Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.
draft: false
kernel: information
widget: entropy
theorem: Source coding theorem
---

Type a text. The lab counts how often each symbol occurs, computes the :concept[entropy]{ref=entropy} of that distribution and builds a :concept[Huffman code]{ref=huffman-code} for it. The question is how much a code can save — and the theorem gives a precise answer.

::::theorem{#thm:source title="Source coding"}
Let $$X$$ be a source with probabilities $$p_1, \dots, p_m$$ and entropy $$\H(X) = -\sum_i p_i \log_2 p_i$$. The smallest mean length $$L^* = \min \sum_i p_i \ell_i$$ among binary :concept[prefix codes]{ref=prefix-code} for $$X$$ satisfies

$$
\H(X) \leq L^* < \H(X) + 1,
\label{eq:bounds}
$$

and Huffman's algorithm constructs a code with mean length $$L^*$$ [@huffman1952].

:::proof
Sketch. The lengths of any binary prefix code obey :concept[Kraft's inequality]{ref=kraft-inequality}, $$\sum_i 2^{-\ell_i} \leq 1$$; together with the information inequality this gives $$\sum_i p_i \ell_i \geq \H(X)$$. In the other direction, the lengths $$\ell_i = \lceil \log_2 (1/p_i) \rceil$$ satisfy Kraft's inequality and have a mean below $$\H(X) + 1$$ [@cover2006, ch. 5].
:::
::::

## Intuition

Huffman's code repeatedly merges the two least frequent symbols into one until a single node is left; undoing the merges, rare symbols end up with long words and frequent ones with short words [@huffman1952]. Entropy is the limit of that saving: no choice of lengths can spend, on average, fewer bits per symbol than the uncertainty each symbol carries [@shannon1948].

## What to observe

The control is the text box.

1. Type a single letter over and over. The entropy is zero. In principle the empty word would do ($$L^* = 0$$), but a practical code spends at least 1 bit per symbol, because an empty word delimits nothing; this is the only case that reaches $$\H(X) + 1$$, outside :eqref[eq:bounds].
2. Type two letters in alternation: the entropy is 1 bit, and the Huffman code achieves exactly that. The same happens whenever every probability is a power of $$1/2$$.
3. Type an ordinary sentence. Compare the entropy with $$\log_2 m$$, where $$m$$ is the number of distinct symbols, and with a fixed-length code, which spends $$\lceil \log_2 m \rceil$$ bits per symbol.
4. Repeat one of the letters several times and watch its codeword get shorter.
5. Shuffle the words of the sentence: the computed entropy does not change, because the model only counts frequencies.

## Limits of the model

The lab treats each symbol in isolation, as if it were drawn afresh at every position. Natural languages do not work that way: much of their :concept[redundancy]{ref=redundancy} lies in the dependencies between neighbouring symbols, which only models with context can capture [@shannon1948]. A short text, moreover, is a noisy estimate of the source that produced it. Coding symbol by symbol can waste up to 1 bit; coding blocks of $$n$$ symbols reduces the waste to less than $$1/n$$ bits per symbol [@cover2006, ch. 5]. Finally, the receiver has to know the code, and sending the table costs something too. Depending on how the text is split into symbols, accented letters may count as one symbol or as two. The essay [Choosing costs bits](../../essays/choosing-costs-bits/) applies these ideas to the organisation of menus.

::bibliography
