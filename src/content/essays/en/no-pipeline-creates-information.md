---
title: 'No pipeline creates information: ETL and the data processing inequality'
subtitle: What each stage of a pipeline can keep, what it loses for good and how to decide what to discard
description: 'An ETL pipeline read as a Markov chain: the data processing inequality says what no stage can recover and guides what to keep.'
lang: en
translationKey: no-pipeline-creates-information
slug: no-pipeline-creates-information
stratum: formal
bridgesTo: value
domains: [data-engineering, information-theory, information-systems]
concepts: [etl, data-processing-inequality, markov-chain, mutual-information, sufficient-statistic, data-lineage, idempotence, record]
published: 2026-11-14
revisions:
  - date: 2026-11-14
    note: First version, written in the round that declared the scope of the site.
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  This essay crosses from the formal stratum to that of value through a problem of data engineering: what an
  extract, transform and load pipeline can do with the information it receives. It describes the pipeline as a
  sequence of stages in which each one reads only the output of the previous one and shows that, under that
  condition, source, extract and result form a Markov chain. It then states the data processing inequality of
  information theory: the mutual information between the source and the result never exceeds the one there was
  between the source and the extract. A stage can keep or lose what the data say about the source, never add to
  it. The essay uses the notion of a sufficient statistic to say precisely what a lossless transformation means:
  lossless for a question, not in general. From there it draws design consequences: keep the raw extract and
  treat everything else as derived, recognise that a join adds information only because it adds a source,
  record the lineage of every piece of data and write stages that can be re-run without duplicating. It links
  the result to the sampling of signals, where the loss caused by undersampling is also irreversible. It
  discusses three objections: transforming adds value, keeping everything has a cost, and the Markov assumption
  fails when a stage reads side inputs. It closes with a criterion for deciding what a stage may discard and
  with the question of who pays for the decision.
keywords: [ETL, data engineering, data processing inequality, mutual information, data lineage]
provenance:
  assistance: generated
  reviewed: false
  note: Drafted with AI assistance (Claude) in the scope round of 14 November 2026; sources checked against Crossref and Open Library on that date; awaiting review by the author.
draft: false
---

Every organization that keeps data ends up moving them: from a system that records sales to one that adds them up, from a sensor to a dashboard, from a file to a model. The work has had a name for decades — extract, transform, load (ETL) — and a classic handbook of the field describes it by what it does to data: extracting, cleaning, conforming and delivering [@kimball2004]. This essay asks what that chain of stages, the pipeline, can do with the information it receives. The answer is a theorem of information theory, and design decisions follow from it. It is a crossing from the formal stratum to that of value.

::toc

## Three stages, one chain {#chain .example}

Consider a small example, made up for this text. A chain of shops records every sale at the till; every night, an :concept[ETL process]{ref=etl} takes those sales to a data warehouse, where the board looks up the total of each shop.

:::figure{#tab:stages kind="table" title="A sales pipeline, stage by stage" source="Illustrative example by the author (2026)."}
| Stage | What it delivers | What it does not pass on |
|---|---|---|
| Source | each sale: instant, shop, product, amount and payment method | — |
| Extraction | the sales of the day, without the payment method | the payment method |
| Transformation | the total per shop and per day | the instant, the product and the amount of each sale |
| Load | the same table of totals, written to the warehouse | nothing, if the load is faithful |
:::

Call $$X$$ the sales at the source, $$Y$$ the extract and $$Z$$ the table of totals. The transformation reads only the extract; it does not go back to the till to look up what the extraction left behind. That restriction, commonplace in the design of a pipeline, has a name in probability theory.

:::definition{#def:chain title="Markov chain"}
The random variables $$X$$, $$Y$$ and $$Z$$ form a :concept[Markov chain]{ref=markov-chain} in that order, written $$X \to Y \to Z$$, when the distribution of $$Z$$ depends on $$X$$ only through $$Y$$:

$$
p(x, y, z) = p(x)\,p(y \mid x)\,p(z \mid y).
\label{eq:markov-chain}
$$
:::

In :eqref[eq:markov-chain], the third factor does not mention $$x$$: once the extract is known, the table of totals is independent of the source. In particular, if $$Z$$ is a function of $$Y$$, as every deterministic transformation is, the chain holds [@cover2006, ch. 2].

## What no stage can do {#inequality .claim depends="chain"}

The measure of what one variable says about another is :concept[mutual information]{ref=mutual-information}, $$\I(X; Y)$$: the reduction of the uncertainty about $$X$$ when $$Y$$ is known [@shannon1948]. With it, the restriction of the previous section becomes a bound.

::::theorem{#thm:dpi title="Data processing inequality"}
If $$X \to Y \to Z$$ is a Markov chain, then

$$
\I(X; Z) \leq \I(X; Y).
\label{eq:data-processing}
$$

:::proof
By the chain rule, the information the pair $$(Y, Z)$$ gives about $$X$$ splits in two ways: $$\I(X; Y, Z) = \I(X; Z) + \I(X; Y \mid Z) = \I(X; Y) + \I(X; Z \mid Y)$$. Since $$X$$ and $$Z$$ are independent given $$Y$$, $$\I(X; Z \mid Y) = 0$$. Since conditional mutual information is never negative, $$\I(X; Y \mid Z) \geq 0$$. Hence $$\I(X; Z) \leq \I(X; Y)$$ [@cover2006, ch. 2].
:::
::::

The thesis of this essay is the engineering reading of :eqref[eq:data-processing]: no stage of a pipeline increases what the data say about the source. A stage can keep that information or lose it; it cannot create it. The :concept[inequality]{ref=data-processing-inequality} does not depend on the transformation being good or bad, simple or sophisticated: it holds for any processing that consults only the previous stage. And the loss accumulates. In a pipeline of five stages, what the second one discarded is not available to the fifth, however careful the third and the fourth may be.

The proof also says when nothing is lost: equality holds exactly when $$\I(X; Y \mid Z) = 0$$, that is, when, once the result is known, the extract adds nothing about the source. A change of format that can be undone is such a case. A sum is not.

## Sufficient for which question {#sufficiency .premise depends="inequality"}

Adding up loses information, and yet it is what the board asked for. The theory has a name for the transformation that loses only what does not matter. A function $$T$$ of the data is a :concept[sufficient statistic]{ref=sufficient-statistic} for a parameter $$\theta$$ when it keeps everything the data say about it: $$\I(\theta; T(X)) = \I(\theta; X)$$ [@cover2006, ch. 2]. The total per shop and per day is sufficient for the question “how much did each shop sell on each day?”; for that question, the table of totals is worth as much as the whole till.

The word that decides is *for*. Sufficiency is a relation between a transformation and a question, not a property of the transformation. The same table is not sufficient for “at what time do the shops sell most?”, because the instant of each sale stayed behind in the transformation, nor for “which payment method is growing?”, because that field stayed behind in the extraction. A pipeline is designed for the questions known today. The data processing inequality says what happens to tomorrow's: they can only be answered with what was kept.:sidenote[This reading, which applies the inequality to the design of pipelines, is the essay's own; the sources cited state the theorem and the notion of sufficiency, not the design consequence.]

## What this decides in a pipeline {#decisions .application depends="sufficiency"}

**Keep the raw extract.** If every transformation only loses, the safe place for information is before the first one. Treating the input as immutable and everything else as derived — recomputable from it — is what makes it possible to fix a wrong transformation and redo the outputs [@kleppmann2017, ch. 10]. It is the same separation between :concept[record]{ref=record} and state that the essay [The record is not the thing](../the-record-is-not-the-thing/) argues for: the recorded fact is the source, and the table that gets queried is a projection of it [@helland2015].

**A join does not violate the theorem.** Crossing the sales with the product catalogue yields a table that says more than the extract did. But the chain is no longer $$X \to Y \to Z$$: the stage now reads a second source, and the new information came from it. The theorem still holds for the pair of sources taken together. Data enrichment is always this: another source, not a cleverer transformation.

**Record the lineage.** If what an output tells depends on what each stage kept, one needs to know what each stage did. The :concept[lineage]{ref=data-lineage} of a piece of data answers two distinct questions: which source data it depends on, and from which place in the source it was copied [@buneman2001]. Without that record, the table of totals reaches the warehouse without saying that the payment method was left on the way, and whoever queries it has no means of knowing what it cannot answer.

**Re-run without duplicating.** Keeping the input only helps if the stages can be redone. Batch processing systems re-execute the tasks that fail [@dean2008]; this is safe because the input is immutable and the output of a failed task is discarded [@kleppmann2017, ch. 10]. The load calls for the same care: an operation with :concept[idempotence]{ref=idempotence}, which executed twice leaves the destination as if it had been executed once, makes repetition harmless [@kleppmann2017, ch. 11].

## Where sampling had already said so {#signals .example depends="inequality"}

Signal processing knows the same irreversibility by another route. Sampling a signal below twice its highest frequency makes different frequencies produce the same samples; after that, no digital filter tells apart what the converter confused, as the essay [To sample is to decide](../to-sample-is-to-decide/) shows. An analogue-to-digital converter is the first stage of a pipeline, and the choice of the sampling rate is the first decision about what the following stages will never see.

## Objections {#objections .objection depends="decisions"}

**“Transforming adds value.”** It does, and the theorem does not say otherwise. The inequality measures information about the source, not usefulness for a purpose. A table of totals is more useful to the board than a million till lines, precisely because it discarded what did not matter to the board's question. Cleaning data removes what is not signal; it does not add signal. And filling a missing field with an estimated value uses a model, that is, information that came from somewhere else and that, like that of a join, has to appear in the lineage.

**“Keeping everything has a cost.”** It costs storage, and there are data that should not be kept: personal information beyond what is necessary, for instance, may have to be discarded by legal obligation or by the organization's policy. In that case the loss is a requirement, and the inequality changes sides: it becomes a guarantee. What a stage really discarded, no later stage recovers. The practical difficulty is the “really”: a removed field that can still be deduced from the fields that remained was not discarded.

**“The Markov assumption does not hold.”** In real pipelines, stages consult reference tables, the clock, the result of earlier runs. Each of those side inputs breaks the chain, and the theorem, as stated, no longer applies to the stage. That does not make it irrelevant; it shows where to look. A stage whose output depends on something besides the declared input cannot be redone with that input alone, and that something is exactly what the lineage has to record.

## What a stage may discard {#criterion .conclusion depends="objections"}

A criterion follows from the theorem. Before a stage discards a field or adds up rows, three questions: for which questions the output remains sufficient; whether what was discarded is still kept before the stage, and for how long; and whether the discarding is recorded where whoever queries the output can see it. A stage that answers all three is a decision. One that does not is a loss nobody chose.

There remains the question of the stratum of value: who pays. Keeping the raw extract costs whoever operates the pipeline, today. Not keeping it costs whoever asks, a year from now, a question nobody foresaw — and who will find out, by the inequality, that the answer existed and was added up.

::bibliography
