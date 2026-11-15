---
title: The pipeline
description: 'Build an ETL pipeline over 144 sales and follow, stage by stage, what the output still says about the source and about a question.'
lang: en
translationKey: the-pipeline
slug: the-pipeline
stratum: formal
domains: [data-engineering, information-theory, information-systems]
concepts: [etl, data-processing-inequality, markov-chain, mutual-information, sufficient-statistic]
published: 2026-11-15
revisions:
  - date: 2026-11-15
    note: First version, from the example of the essay “No pipeline creates information”.
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  This lab runs the example of the essay “No pipeline creates information” on an exact distribution. The
  source is a sale described by four fields — shop, time of day, payment method and amount — with 144 possible
  outcomes and fields that depend on one another. Whoever uses the lab builds a pipeline of up to six stages,
  chosen among dropping a field, grouping the time of day into day and night, introducing a typing error in
  the shop and reformatting, and chooses the question someone will ask of the output. After each stage, the
  information theory kernel computes two mutual informations: between the output and the whole sale, and
  between the output and the question. Neither ever rises, which is the data processing inequality; the
  output is sufficient for the question when the second stays equal to the entropy of the question. The text
  states the inequality, proposes a sequence of observations that reproduces the essay’s table and records
  the limits of the model: the distribution is made up, the stages are few, and a join with another source is
  left out, because it breaks the chain.
keywords: [ETL, data processing inequality, mutual information, sufficient statistic]
provenance:
  assistance: generated
  reviewed: false
  note: Drafted with AI assistance (Claude) on 15 November 2026, from the example and the sources of the essay “No pipeline creates information”; awaiting review by the author.
draft: false
kernel: information
widget: pipeline
theorem: Data processing inequality
---

A chain of shops records every sale at the till; every night, an extract, transform, load (:concept[ETL]{ref=etl}) process takes the sales to a data warehouse. The essay [No pipeline creates information](../../essays/no-pipeline-creates-information/) argues that no stage on that way increases what the data say about the source. This lab lets you build the way and measure.

## Intuition

The source $$X$$ is a sale: shop (four), time of day (four), payment method (three) and amount (three), 144 combinations with fixed probabilities. The fields are not independent: each shop has its own busy hours, and small sales are paid in cash more often. So dropping a field also erases part of what it said about the others.

Each stage reads only the output of the previous one. The sale, the output of the first stage and that of the second then form a :concept[Markov chain]{ref=markov-chain}, and the :concept[data processing inequality]{ref=data-processing-inequality} holds at every step [@cover2006, ch. 2]:

$$
\I(X; Y_{k+1}) \leq \I(X; Y_k).
\label{eq:data-processing-lab}
$$

The lab computes the exact :concept[mutual information]{ref=mutual-information}, not an estimate: the model carries the joint distribution of the sale and the output through the pipeline, and the information theory kernel does the sum. The same inequality holds for the question $$Q$$, which is a function of the sale. The output is a :concept[sufficient statistic]{ref=sufficient-statistic} for the question when $$\I(Q; Y_n) = \H(Q)$$: it answers as well as the whole sale did.

## What to observe

The pipeline starts with the three stages of the essay’s table: drop the payment, the period and the amount.

1. With the question “the shop”, the short bar does not fall at any stage: the total per shop is sufficient to know the shop. The long bar, the whole sale, falls at every stage.
2. Change the question to “the payment method”. The loss appears at the first stage, marked with ✕, but it is not total: 0.12 bits are left, because the amount still says something about how the sale was paid. At the third stage, when the amount goes too, nothing is left. What the extraction left behind no later stage recovers.
3. Change to “the amount”. Nothing is lost until the third stage, and there the information drops to zero: the payment, which said something about the amount, had already gone at the first. With the pipeline reduced to “drop the amount”, 0.12 bits about the amount are left, kept in the payment.
4. Go back to “the shop” and add a typing error. No field disappears, the output has the same 144 possibilities, and yet it stops being sufficient: a noisy channel is also a stage that loses.
5. Add “reformat” anywhere. Both bars stay the same: a reversible stage is the case in which the inequality becomes an equality.
6. Try to make a bar rise. No combination of stages can.

## Limits of the model

The distribution is made up for the example; the numbers change with another one, the inequality does not. The stages are few and simple. A join with another table is left out on purpose: it adds information because it adds a source, and then the output no longer depends on the sale only through the previous stage, as the essay discusses. The typing error replaces the shop with another one at random with probability 10 %, a noise model chosen for being the simplest, not for describing a real till [@kimball2004].

::bibliography
