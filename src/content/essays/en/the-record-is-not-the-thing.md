---
title: 'The record is not the thing: memory, fact and state in information systems'
subtitle: What an organization stores when it thinks it stores reality, and what it loses by overwriting the past
description: 'From William Kent and indexical semiotics to immutable logs: why an information system keeps acts of inscription rather than things, and how state arises from them.'
lang: en
translationKey: the-record-is-not-the-thing
slug: the-record-is-not-the-thing
stratum: philosophy
bridgesTo: theory
domains: [information-systems, applied-philosophy, semiotics, software-engineering]
concepts: [information-system, record, state, sign, model, transaction, idempotence, pace-layering]
published: 2026-11-13
revisions:
  - date: 2026-11-13
    note: Initial version on the site.
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  This essay crosses from the philosophical to the theoretical stratum by asking what an information system
  actually keeps when it claims to store customers, inventory or contracts. It starts from William Kent's
  ontological critique in Data and Reality: entity identifiers, boundaries and categories are not neutral mirrors
  of the world, but institutional carvings imposed to coordinate action. Using Peirce's semiotics, it argues that
  a database row functions primarily as an index of an act of inscription — somebody declared something at an
  instant under a rule — rather than a copy of an external object. It examines the dominant habit of in-place
  create, read, update and delete (CRUD), showing that overwriting a cell collapses two distinct temporal objects:
  the immutable record of what happened and the present state derived from it. Drawing on Pat Helland's account
  of double-entry bookkeeping and Martin Kleppmann's stream–table duality, it formulates current state as a
  deterministic fold over an append-only sequence of facts, paired with Lamport's partial ordering of distributed
  events and idempotence under message retries. Three serious objections set the boundary: the physical cost of
  unbounded retention, the legal and ethical duty to erase personal data, and schema drift over decades. Designing
  an information system, it concludes, is deciding openly what an institution promises to remember and what it
  chooses to forget.
keywords: [information system, record, immutability, state, applied philosophy]
provenance:
  assistance: generated
  reviewed: false
  note: Drafted with AI assistance (Gemini) under the site's editorial programme; primary sources and locators verified on 13 November 2026; awaiting review by the author.
draft: false
---

:::epigraph{source="@helland2015 [p. 102]"}
“Accountants don't use erasers; otherwise they may go to jail. All entries in a ledger are additive.”
:::

::toc

When a hospital screen says that a patient is in Ward 4, or a bank reports an account balance of \$1,200.00, people speak of the database as though it were a clear window onto the building or the vault. On ordinary days the metaphor holds; on the day of an audit, a legal dispute or a production incident, it comes apart. The patient had already been discharged, though the transfer was never entered; a payment arrived twice after a network timeout, and a manual fix overwrote the earlier figure without leaving any trace of who changed it or why. This essay examines the philosophical mistake beneath that engineering failure. It begins with an ontological question — what kind of thing is a :concept[record]{ref=record}? — and crosses into the theoretical stratum, where an :concept[information system]{ref=information-system} is modelled not as a static cabinet of objects, but as institutional memory built from inscriptions in time.

## The mirror illusion {#mirror-illusion .question}

Introductory textbooks often treat data modelling as an exercise in plain observation: the world supposedly comes pre-sliced into tidy entities — people, products, orders, addresses — bearing intrinsic attributes, leaving the analyst only to transcribe them into tables or classes. In 1978, after years designing corporate systems at IBM, William Kent dismantled that comfort in a short book, *Data and Reality* [@kent1978]. What counts as “one” book in a library catalogue: the intellectual work *Dom Casmurro*, the 1899 first edition, or physical copy 342 with the torn binding? What makes two flights “the same” flight when the airline swaps the aircraft, the crew and the departure hour while keeping the flight number? None of those questions can be settled by staring harder at the aeroplane or the paper [@kent1978].

Kent's point is strictly ontological, even though it was written for practitioners: identity, individuation and classification in data do not flow passively out of objects; they follow from the purposes of whoever maintains the file. Two departments inside the same firm carve reality differently because they answer to different obligations — to warehouse logistics, two boxes of different sizes are distinct items; to billing, they may be a single contract line. When industry talk treats software as a transparent pipe or leaves the concrete informational artefact untheorised, as @orlikowski2001 observed, it hides precisely that normative act: deciding what counts as existing for the organization, under which identifier, and for how long.

## What kind of sign a record is {#sign-and-act .premise depends="mirror-illusion"}

If a row written to disk is neither the object itself nor a natural miniature of it, how does it relate to the world? In [From sign to information](../from-sign-to-information/), we saw Charles S. Peirce distinguish three ways in which a :concept[sign]{ref=sign} stands for its object: by likeness (icon), by causal or existential connection to a singular occurrence (index), or by shared convention and habit (symbol) [@peirce1931, v. 2, § 228]. A photograph leans toward the icon; a column identifier in Structured Query Language (SQL) such as `current_balance` is a conventional symbol; yet the entry committed at 14:03 — “credit transfer of \$500.00 authorised under key `k9`” — works decisively as an **index**: it is the durable trace of an institutional act performed at a specific moment.

That shift changes the epistemic standing of a database. A system never directly stores the bare fact that Maria lives on Oak Street; it stores the institutional fact that, on a given date, an authenticated agent submitted or recorded that assertion under a prevailing rule. Between the house on the street and the bytes on disk stand at least three mediations: human observation or testimony, the conceptual :concept[model]{ref=model} that admits some fields while omitting everything else, and the technical commit protocol. Mistaking the record for the thing encourages teams to dismiss mismatches between system and world as “dirty data”, when they often reflect a genuine lag between when a change occurred in the domain (*valid time*) and when the institution learned of it (*transaction time*) [@kleppmann2017].:sidenote[Temporal database research calls a model *bitemporal* when it tracks both timelines explicitly: the history of the domain and the history of the ledger itself. Without the second timeline, retroactively correcting January's salary erases why January's payroll run legitimately paid another amount.]

## The eraser of CRUD {#eraser-of-crud .claim depends="sign-and-act"}

Mainstream application design reduces persistence to the four verbs of create, read, update and delete (CRUD). Historically, that habit had a compelling physical justification: when magnetic drums, disks and core memory were scarce in the 1960s and 1970s, keeping only the latest snapshot of each entity saved orders of magnitude in storage [@helland2015; @kleppmann2017]. An `UPDATE` overwrites old bytes in place; a `DELETE` reclaims the slot.

The conceptual price of that economy is collapsing two different temporal objects into one mutable cell: **memory of past facts** and **operational summary of the present**. Whenever a customer's address or an order's status is overwritten in place, the system keeps its current :concept[state]{ref=state} by destroying the evidence of how that state was reached. For a throwaway scratchpad, losing the path hardly matters; in an organizational information system — clinical records, financial ledgers, supply-chain custody, access governance — the path is part of the domain itself. As Pat Helland notes in the epigraph, double-entry accounting solved this centuries before digital computers: when a clerk posts a mistaken figure, nobody reaches for an eraser; a compensating entry is appended, preserving both the mistake and its reversal [@helland2015, p. 102].

:::figure{#tab:memory kind="table" title="Two memory architectures in an information system" source="Prepared by the author (2026), drawing on Helland (2015) and Kleppmann (2017)."}
| Dimension | Mutable in-place state (CRUD) | Immutable records and projection |
|---|---|---|
| Primary unit stored | Current snapshot of the entity | Fact recorded at a determinate instant |
| Error correction | Destructive overwrite (`UPDATE` / `DELETE`) | Appended compensating or amending record |
| Auditability and lineage | Requires bolted-on side tables or is lost | Native to the sequence of records itself |
| Present-state queries | Direct read of the current row | Read against a materialised view (projection) |
| Change in business rules | Irreversible over discarded details | Replayable across preserved history |
:::

## State as a fold over facts {#state-as-fold .definition depends="eraser-of-crud"}

Separating record from state does not forfeit fast queries over the present; it clarifies which one is primary and which one is derived. In [The second flag](../the-second-flag/), the extended transition function of a finite automaton walked an input history event by event. Data-intensive architectures obey the exact same algebraic skeleton, framed by Martin Kleppmann as the duality between event streams and state tables [@kleppmann2017, ch. 11].

:::definition{#def:projection title="State projection over an append-only log"}
Let $$r_{1..t} = (r_1, r_2, \dots, r_t)$$ be an ordered sequence of immutable records to which new facts are only appended at the tail, and let $$g : S \times R \to S$$ be a deterministic update function starting from an initial state $$s_0 \in S$$. The projected state at step $$t$$ is the left fold

$$
s_t = \operatorname{fold}(g, s_0, r_{1..t}) = g\bigl(\cdots g(s_0, r_1) \cdots, r_t\bigr).
\label{eq:state-projection}
$$
:::

Equation :eqref[eq:state-projection] explains three architectural properties at once. First, current state ceases to be the ultimate source of truth and becomes a derived cache — a materialised view kept in memory or indexed on disk for fast reads, yet reproducible at any moment from the append-only log [@helland2015; @kleppmann2017]. Second, one immutable history of facts supports multiple projection functions $$g_1, g_2, \dots, g_k$$ side by side: the same stream of order events feeds warehouse inventory counts, customer-support search indexes and financial revenue schedules without forcing rival teams to contend for locks on a single master table. Third, when an organization discovers a question tomorrow that it neglected to ask last year — or fixes a bug in a tax calculation — engineers can write a new function $$g'$$ and replay the log from $$r_1$$. Where values were overwritten in place, whatever did not fit the old schema is gone for good.

:::stretch{label="What when there is no global clock or single delivery?"}
:ref[def:projection] assumes a clean total sequence $$r_{1..t}$$ and single application of every record. Across networked machines, neither comes for free. @lamport1978 proved that, without shared memory or perfectly synchronised physical clocks, distributed processes observe only a partial causal order (“happened before”); whenever $$g$$ does not commute, the system must impose an explicit ordering protocol — logical clocks, consensus, or partitioning by entity key. Moreover, across any channel that can drop acknowledgements, a sender who hears silence must retry. Provided the write or projection step satisfies :concept[idempotence]{ref=idempotence},

$$
f\bigl(f(x)\bigr) = f(x),
\label{eq:idempotence}
$$

by binding each act to a unique idempotency key checked inside an atomic :concept[transaction]{ref=transaction} [@gray1981], processing the duplicate leaves the state identical to processing the original once. Without :eqref[eq:idempotence], every transient timeout forces a blind gamble between dropping a fact and counting it twice.
:::

This separation mirrors, inside software, the architecture of :concept[pace layering]{ref=pace-layering} proposed by Stewart Brand for buildings [@brand1994] and brought to digital information environments by Jorge Arango [@arango2018, pp. 142–146]. In a durable digital place, domain concepts and recorded facts belong to the slow, load-bearing structural layers, whereas screens, reports and specialised query indexes belong to the fast surface layers. Welding both into a single mutable table shaped after today's user interface guarantees that every surface redesign tears through long-term institutional memory [@arango2018, p. 146].

## When keeping everything is wrong {#objections .objection depends="state-as-fold"}

Turning append-only logs into an unconditional creed would merely invert the blindness of CRUD. Three hard constraints bound event sourcing and full historical retention in practice.

**Physical and operational cost.** Storing every high-frequency telemetry ping as an eternal business event wastes storage, bandwidth and replay time. Even with periodic snapshots and log compaction — discarding superseded values while keeping the latest record per key [@kleppmann2017, ch. 3] — introducing message brokers, asynchronous projectors and eventual consistency into a modest administrative tool with no historical mandate imposes accidental complexity for zero institutional return.

**The duty to forget.** Unbounded organizational memory collides with fundamental human rights. Privacy statutes such as Brazil's General Data Protection Law (:foreign[Lei Geral de Proteção de Dados Pessoais]{lang=pt-BR}, LGPD) and the European Union's General Data Protection Regulation (GDPR) enforce purpose limitation and, in key circumstances, the right to erasure. Inside a strictly append-only log, excising one person's payload mid-stream is nontrivial: it demands architectural foresight such as isolating personal identifiers in a purgeable side store or encrypting personal fields with per-subject keys that can be permanently destroyed (*crypto-shredding*). Remembering everything is not an automatic virtue; sometimes it is a breach.

**Schemas age too.** Immutability preserves the bytes written in 2020, not the company's vocabulary in 2026. When domain categories split or merge — Kent's problem returning across time [@kent1978] — new readers must translate legacy record shapes on read (*upcasting*) or migrate streams under explicit governance.

## Designing institutional memory {#conclusion .conclusion depends="state-as-fold,objections"}

Information-systems engineering begins upstream of database engines, in philosophy applied to the domain: distinguishing the occurrence in the world, the institutional act attested in a :concept[record]{ref=record}, and the summarised :concept[state]{ref=state} that guides the next decision. In-place overwrite is sound engineering when history genuinely carries no value, when privacy law forbids retention, or when physical volume demands deliberate compaction. It becomes a structural defect when adopted out of tool inertia, silently erasing the only trail that could explain how a balance arose or let a corrected rule recompute the present [@hevner2004; @kleppmann2017].

As Arango argues, information systems are not disposable transactions; they are places inhabited by people who rely on semantic stability to understand where they stand and act responsibly [@arango2018, pp. 26–31]. An institution is, to a surprising degree, what its records allow it to remember honestly — and what it decides, openly and by rule, to let go.

::concept-map{focus=record depth=2}

::bibliography
