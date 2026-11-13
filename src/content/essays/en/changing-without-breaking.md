---
title: 'Changing without breaking: essence, information hiding and pace layers in software architecture'
subtitle: Why cleanly written systems stiffen over time, and how to separate what endures from what shifts fast
description: 'From Aristotle and Brooks to Parnas, Conway, Stewart Brand and Jorge Arango: aligning module boundaries with real rates of change and recording decisions.'
lang: en
translationKey: changing-without-breaking
slug: changing-without-breaking
stratum: value
domains: [software-engineering, methodology, information-systems, design]
concepts: [essential-and-accidental-complexity, information-hiding, pace-layering, conways-law, architecture-decision-record, abstraction, interface, visual-grammar]
published: 2026-11-13
revisions:
  - date: 2026-11-13
    note: Initial version on the site.
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  Set in the stratum of value — what is it for, for whom, at what cost? — this essay asks why software systems
  whose individual functions look clean on day one grow prohibitively expensive to change within a few years. It
  begins with the Aristotelian distinction adapted by Frederick Brooks between essential complexity, inherent in
  the domain being modelled, and accidental complexity, born of the representations and tools chosen to build it.
  Decomposing a program along execution steps scatters volatile secrets across modules, multiplying the blast
  radius of routine changes; David Parnas's information-hiding criterion is cast here as shrinking the product of
  volatility and cross-module coupling. That principle is then connected to three forces beyond source code:
  Stewart Brand's shearing layers as adapted to digital places by Jorge Arango, the structural visual grammar of
  Jan Tschichold, Timothy Samara and Angela Riechers — where quiet, stable grids support varied surfaces — and
  Melvin Conway's law linking system topology to team communication. Finally, it examines how architecture decision
  records (ADRs) preserve constraints that code alone cannot express, weighs objections against speculative
  indirection, and concludes that architecture is maintenance ethics: deciding who pays for the next change.
keywords: [software architecture, information hiding, pace layering, essential complexity, ADR]
provenance:
  assistance: generated
  reviewed: false
  note: Drafted with AI assistance (Gemini) under the site's editorial programme; primary sources and locators verified on 13 November 2026; awaiting review by the author.
draft: false
---

:::epigraph{source="@brooks1995 [p. 182]"}
“Following Aristotle, I divide them into essence—the difficulties inherent in the nature of the software—and accidents, those difficulties that today attend its production but that are not inherent.”
:::

::toc

Almost every greenfield system feels nimble in its opening months. Features ship in days, tests finish in seconds, and every file fits comfortably on one screen. Two years later, without any single function turning monstrous, swapping a payment gateway, adding a second locale or revising a regulatory report suddenly demands weeks of anxious coordination across four teams. The real cost of software rarely sits in writing version one; it sits in the long sequence of changes the system must absorb while staying alive. This essay stands in the final stratum of the bridge, **value**, where asking whether an algorithm halts or whether a model is consistent is no longer enough: the question is whom an architecture serves, and at what ongoing cost.

## Essence and accident age at different speeds {#essence-and-accident .premise}

In 1986, in an essay republished in 1987 and revisited in the anniversary edition of *The Mythical Man-Month*, Frederick Brooks reached back to an Aristotelian and Scholastic distinction to explain why no single tool can yield an order-of-magnitude leap in software productivity [@brooks1987; @brooks1995, p. 182]. :concept[Essential and accidental complexity]{ref=essential-and-accidental-complexity} separates two burdens of wholly different origin. Essence belongs to the conceptual fabric of the problem itself: interlocking tax statutes, clinical edge cases, concurrent order states, trade-offs between latency and consistency. Accident — as Brooks clarified for readers who mistook the word for “mishap” or “clumsiness” — means what is *incidental* or appurtenant to a particular material realisation: awkward syntax, manual serialisation boilerplate, the quirks of this year's web framework [@brooks1995, p. 209].

High-level languages, garbage collection, rich type systems and fast compilers swept away vast stretches of twentieth-century accidental toil. Yet fresh accidental complexity is minted whenever a contingent tool choice leaks into the representation of essence: when object-relational mapping annotations dictate domain invariants, or when a third-party vendor's endpoint shape names core business concepts [@evans2003]. Domain essence evolves at the pace of institutions and statutes; accidents churn at the nervous pace of package ecosystems and cloud vendors. Welding both into the same module guarantees that the whole assembly fractures at the tempo of its most restless dependency.

## Hiding what changes, not what executes {#parnas .claim depends="essence-and-accident"}

In December 1972, David Parnas compared two decompositions of the same key-word-in-context indexing program [@parnas1972]. The first followed the execution flowchart: module one read the input, module two generated circular shifts, module three alphabetised them, and module four printed the listing. On paper it looked tidy, yet all four modules knew the exact memory layout of strings and index tables. Changing that representation forced a rewrite of the entire program. The second decomposition asked a different question altogether: **which design secret does each module hide from the rest?** [@parnas1972].

We can make the economics of :concept[information hiding]{ref=information-hiding} explicit in one sum. Picture a system partitioned into $$m$$ modules, where the internal design decision owned by module $$i$$ changes at an average rate $$\nu_i$$ per year. If each change in $$i$$ carries probability $$d_{ij} \in [0, 1]$$ of forcing edits and re-verification in module $$j$$ at cost $$c_j > 0$$, the expected maintenance cost over a period is

$$
\E[C] = \sum_{i=1}^{m} \nu_i \sum_{j=1}^{m} d_{ij}\, c_j.
\label{eq:change-cost}
$$

Equation :eqref[eq:change-cost] shows why locally tidy functions cannot rescue a poor decomposition. Even when every individual $$c_j$$ stays modest, pairing high volatility ($$\nu_i$$ large) with wide coupling reach ($$d_{ij} > 0$$ across many $$j \neq i$$) multiplies maintenance effort across neighbours. Parnas's criterion targets those off-diagonal terms directly: enclosing each likely-to-change secret behind a narrow :concept[interface]{ref=interface} — one that promises only invariants independent of how the secret is realised — drives $$d_{ij}$$ toward zero wherever $$\nu_i$$ is high [@parnas1972]. Isolating eternal mathematical truths buys very little; isolating volatile commitments buys the future of the system.

## Shearing layers, from buildings to pages to software {#pace-layers .application depends="parnas"}

Architectural theorists and book designers arrived at the same law from physical matter. Studying how real buildings survive decades of renovation, Stewart Brand (extending Frank Duffy) modelled a building as six :concept[pace-layered]{ref=pace-layering} strata — site, structure, skin, services, space plan and stuff — revolving at incompatible speeds [@brand1994]. Embed short-lived wiring or plumbing rigidly inside sixty-year load-bearing concrete, and the first technological upgrade demands a sledgehammer: fast layers tear slow layers apart along shearing planes.

Jorge Arango brought that temporal geometry into information architecture: in a responsible digital place, purpose, governance and semantic structure — controlled vocabularies, conceptual models, durable identifiers — form the slow load-bearing core, while visual presentation and interaction patterns form the fast outer skin [@arango2018, pp. 144–146]. Modern editorial design rests on the exact same separation. Across Jan Tschichold's page canons, Timothy Samara's hierarchic grids and Angela Riechers's :concept[visual grammar]{ref=visual-grammar}, stable column proportions, active margins and horizontal flowlines do not cage expression: precisely because the underlying spatial structure stays predictable, headings, tables, marginalia and diagrams can vary freely without disorienting the reader's cognitive map [@tschichold1991, pp. 36–57; @samara2023, pp. 32–43; @riechers2024, pp. 187–190].

:::figure{#tab:paces kind="table" title="Pace layers in a software and information system" source="Prepared by the author (2026), combining Brand (1994), Arango (2018) and Parnas (1972)."}
| Layer | Typical horizon of change | What lives here in software | Shearing failure when conflated |
|---|---|---|---|
| Foundations and invariants | Many years | Algebraic laws, physical units, accounting identities | Silent integrity corruption across historical data |
| Semantic structure | Years | Domain model, concept ontology, portable document formats | Traumatic migrations, broken links and brittle contracts |
| Functional core | Months to years | Pure business rules, typed parsers, codecs and validators | Regressions testable only by booting full infrastructure |
| Adapters and infrastructure | Months | Databases, queues, static generators, third-party libraries | Vendor or framework lock-in when projects sunset |
| Surface and presentation | Days to weeks | Stylesheets, screen layouts, interface copy | Rewriting core domain logic for cosmetic redesigns |
:::

This site applies :ref[tab:paces] as an automated build rule. Authored works live in plain Markdown and concepts in a generator-agnostic Simple Knowledge Organization System (SKOS) ontology; every domain rule lives inside `src/core` as pure TypeScript barred by static lint rules from importing network, filesystem, clocks or Astro itself; adapters and views merely parse, wire and paint at the boundary. Should the static-site generator be replaced five years from now, the essays, formulas, bilingual citation engine and property tests cross over untouched.

## Teams and reasons that source code alone forgets {#conway-and-adr .premise depends="parnas"}

Modules, however, are maintained by human groups rather than compilers. In April 1968, Melvin Conway stated the sociotechnical constraint that shadows every architecture diagram: any organization that designs a system is constrained to produce a design whose structure copies the organization's communication structure [@conway1968]. Because two interfaces stay coherent only while their stewards negotiate shared assumptions, technical boundaries that cut across teams lacking a live communication channel decay rapidly, whereas separate teams naturally erect formal protocols along their organizational seam — :concept[Conway's law]{ref=conways-law}. Partitioning modules after Parnas therefore requires aligning team ownership with the same boundaries of change.

One temporal gap still remains. Source code states with complete precision **what** the system does today, yet stays mute about **which alternatives were rejected** and under which constraints the chosen boundary made sense. Six months later, an energetic newcomer spots an apparently roundabout boundary, “simplifies” two modules into one, and unknowingly restores the exact coupling or accessibility regression the boundary was built to prevent. To close that memory gap, Michael Nygard proposed in 2011 the :concept[architecture decision record]{ref=architecture-decision-record} (ADR): a brief plain-text file versioned alongside the code, stating context, decision, status and accepted consequences [@nygard2011]. Just as an accounting entry preserves the reason behind a balance in [The record is not the thing](../the-record-is-not-the-thing/), ADRs keep an architecture from forgetting its own load-bearing constraints.

## Objections {#objections .objection depends="pace-layers,conway-and-adr"}

**Speculative abstraction costs more than duplication.** The twin opposite of careless coupling is guessing every future change on day one — stacking generic interfaces, abstract factories and pass-through layers around requirements that never actually move. Every indirection raises $$c_j$$ in :eqref[eq:change-cost]: more files to traverse, more types to reconcile, wider distance between caller and effect. Where $$\nu_i \approx 0$$ — a decision that has never shifted and shows no credible pressure to shift — wrapping it in three adapters manufactures accidental complexity in the name of foresight.

**The inverse Conway manoeuvre meets human friction.** Reshuffling teams to induce a desired software topology works only up to the limits of budgets, time zones, rare specialist skills and career incentives. Treating engineers as frictionless boxes on an org chart ignores the cognitive and social cost of reorganization itself.

**Unenforced prose drifts from reality.** A folder of ADRs marooned on an external wiki quickly turns into a museum of good intentions. The durable remedy is not abandoning written rationale, but encoding every machine-decidable invariant as an automated guardrail test — layer purity, byte budgets, contrast ratios, schema laws — leaving ADR prose to carry the human judgment of *why* [@nygard2011].

## Architecture as stewardship of other people's time {#conclusion .conclusion depends="pace-layers,conway-and-adr,objections"}

Tschichold wrote that good typography rests on a quiet morality: refusing self-display so as to serve the reader's understanding faithfully [@tschichold1991, pp. 3–11; @tschichold2006, p. 66]. Software architecture answers to a parallel obligation toward everyone who will inhabit and maintain the system tomorrow. Separating essence from accident [@brooks1987], drawing module boundaries around volatile secrets [@parnas1972], honouring the unequal tempo of pace layers [@brand1994; @arango2018] and recording the rationale behind constraints [@nygard2011] are not aesthetic rituals for polishing box-and-arrow slides.

They are concrete ways of allocating cost across time. A poorly partitioned system borrows present speed at compound interest paid by every future engineer, operator and user; a well-partitioned system absorbs change where it originates, leaving what deserves to endure undisturbed.

::concept-map{focus=information-hiding depth=2}

::bibliography
