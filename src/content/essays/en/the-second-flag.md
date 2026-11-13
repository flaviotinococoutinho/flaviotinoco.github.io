---
title: 'The second flag: impossible states and state machines'
subtitle: What n booleans allow a program to represent, what the domain needs, and what the difference costs
description: 'Why boolean flags admit impossible states, what a finite automaton guarantees in their place, and when a state machine is worth its cost.'
lang: en
translationKey: the-second-flag
slug: the-second-flag
stratum: formal
bridgesTo: value
domains: [computer-science, software-engineering, information-theory]
concepts: [state, finite-state-machine, statechart, redundancy, abstraction, information-hiding]
published: 2026-11-10
revisions:
  - date: 2026-11-10
    note: First version on the site, rewritten from the article and the talk the author presented on 23 November 2025.
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  This essay starts from a common problem in software engineering, that of objects whose situation is kept in
  several boolean flags, and carries it from the formal stratum to the stratum of value. A video player with
  three flags admits eight configurations for four real situations, and two method calls are enough to leave it
  playing and paused at once. The essay generalises the count: with n flags and k mutually exclusive
  situations there are 2^n − k configurations that mean nothing, and Shannon's redundancy measures the fraction
  of the representation that carries no information. It argues that flags have the redundancy of a code
  without the checker that would make it useful. It then gives the definition of a deterministic finite
  automaton, in which the system is in exactly one state and a transition function determines the next, and
  maintains that the table of that function is the specification of the behaviour: sixteen cells in the
  example, six of which are decisions the flag-based code left implicit. It compares three ways of writing the
  table, an enumeration with a pure function, the State pattern and a declarative library, and records that
  Spring Statemachine, used in the example, is no longer maintained as open source. It discusses objections:
  independent flags are legitimate, flat machines explode too, and the table settles neither concurrency nor
  persistence. It closes with a criterion for choosing and with the cost that the criterion places on whoever
  maintains the system.
keywords: [state machine, boolean flags, finite automaton, redundancy, software engineering]
provenance:
  assistance: generated
  reviewed: false
  note: Drafted with AI assistance (Claude) from the article, the slides and the demonstration code the author presented on 23 November 2025; sources checked against the originals on 10 November 2026; awaiting review by the author.
draft: false
---

A video player is stopped, playing, paused or rewinding: four situations, one at a time. The code that controls it usually starts with one boolean — playing or not — and grows by another, and then another. This essay examines that growth: it counts how many configurations the booleans allow, compares that number with what the domain needs, and shows what an explicit state machine guarantees in their place. It is a crossing from the formal stratum to the stratum of value: from a definition in automata theory to an engineering decision, with its cost.:sidenote[This text rewrites an article and a talk given by the author on 23 November 2025. The Java examples come from the talk's demonstration code.]

::toc

## Three flags, eight configurations {#three-flags .example}

The starting version keeps three flags and, in each method, sets the ones its author remembered to set. The excerpt below condenses the demonstration code:

```java
private boolean isPlaying;
private boolean isPaused;
private boolean isRewinding;

public void play() {
    isPlaying = true;
    isPaused = false;
    isRewinding = false;
}

public void pause() {
    isPaused = true;       // isPlaying stays true
}

public void rewind() {     // a requirement added later
    isRewinding = true;
    isPlaying = false;     // isPaused keeps its value
}
```

No single line is wrong. But three calls in a row take the object to two configurations that describe no situation at all:

:::figure{#tab:trace kind="table" title="Trace of the flags over three calls" source="Prepared by the author (2026), from the talk's demonstration code."}
| Call | `isPlaying` | `isPaused` | `isRewinding` | Situation of the player |
|---|---|---|---|---|
| (start) | false | false | false | stopped |
| `play()` | true | false | false | playing |
| `pause()` | true | true | false | none |
| `rewind()` | false | true | true | none |
:::

The compiler accepts it, the runtime accepts it, and the tests of the demonstration code record the fact. The defect is neither in `pause()` nor in `rewind()`; it is in the representation. Three independent booleans admit $$2^3 = 8$$ configurations, and the domain has four situations. The other four correspond to nothing, yet they can be written to memory — and every new method is one more chance to write them.

## Counting what the representation allows {#counting .premise depends="three-flags"}

The general case is a count. If a domain has $$k$$ mutually exclusive situations and the code keeps them in $$n$$ independent flags, there are $$2^n$$ representable configurations and, at best, $$k$$ of them mean something. The other $$2^n - k$$ are states that are impossible in the domain and possible in memory. Each new flag doubles the total; each new situation of the domain adds one.

:::figure{#tab:count kind="table" title="Representable configurations and situations of the domain" source="Prepared by the author (2026)."}
| Representation | Situations ($$k$$) | Flags ($$n$$) | Configurations ($$2^n$$) | Meaningless | Minimum redundancy |
|---|---|---|---|---|---|
| Player, three flags | 4 | 3 | 8 | 4 | 0.33 |
| Player, one flag per situation | 4 | 4 | 16 | 12 | 0.50 |
| Payment, one flag per situation | 11 | 11 | 2 048 | 2 037 | 0.69 |
:::

The payment in the last row is the one from the original article: a card payment that goes through eleven situations, from “new” to “refunded”, with authorisations, captures and refunds pending or declined along the way.

Information theory has a name for the last column. The :concept[redundancy]{ref=redundancy} of a source is the fraction of its capacity to represent that it does not use [@shannon1948]. Take the situation of the object, $$X$$, as the source, and the $$2^n$$ configurations of the flags as its alphabet. If the code is correct, only $$k$$ configurations occur, the entropy of $$X$$ is at most $$\log_2 k$$, and

$$
R = 1 - \frac{\H(X)}{\log_2 \lvert \mathcal{X} \rvert} \geq 1 - \frac{\log_2 k}{n}.
\label{eq:redundancy}
$$

By :eqref[eq:redundancy], the three-flag player spends three bits to say what fits in two: a third of the representation carries no information. Redundancy is not a defect in itself; it is what makes it possible to detect and correct errors on a noisy channel. But it only works because the receiver knows the code and rejects the words that do not belong to it. Flags have the redundancy without the checker: a meaningless configuration is accepted in silence, and every method that reads the flags has to ask again, on its own, “is this combination valid?”. Each question is one more branch in the code, and each branch one more path to test — which is what cyclomatic complexity measures [@mccabe1976].

:::aside
**An indicator that rolled over to zero.** In the Therac-25 medical accelerator, a one-byte variable served as an indicator: zero meant that the parameters were consistent, and the beam was not inhibited. The code incremented it on every pass through a routine instead of assigning it a fixed value; on every 256th pass it returned to zero, and a position check was not performed [@leveson1993, p. 34]. The authors of the investigation warn, however, that the lesson of the case is not one particular coding error but a design that entrusted safety to the software [@leveson1993, p. 29].
:::

## What a state is {#state .definition depends="counting"}

The way out is not to watch the flags more closely; it is to change the question. A :concept[state]{ref=state} is what a system has to remember of its own history in order to decide how to respond to whatever comes next: keeping the relevant part of the past, and only that, is its purpose [@hopcroft2007, ch. 1]. It is an :concept[abstraction]{ref=abstraction} in the strict sense, because it leaves out what does not matter for future behaviour. The player does not need to know how many times it has been paused; it needs to know whether it is paused. Automata theory fixed this idea in a definition [@rabin1959], given here in the textbook notation [@hopcroft2007, ch. 2].

:::definition{#def:dfa title="Deterministic finite automaton"}
A deterministic finite automaton is a five-tuple

$$
M = (Q, \Sigma, \delta, q_0, F),
\label{eq:automaton}
$$

where $$Q$$ is a finite set of states, $$\Sigma$$ is a finite set of input symbols (the events), $$\delta : Q \times \Sigma \to Q$$ is the transition function, $$q_0 \in Q$$ is the initial state and $$F \subseteq Q$$ is the set of final states.
:::

Two properties of :ref[def:dfa] do the work the flags left undone. First, the system is, at every instant, in exactly one element of $$Q$$. With $$Q$$ equal to the four situations of the player, “playing and paused” is not a forbidden value; it is a value that does not exist. Second, $$\delta$$ is a function. The current state and the event determine the next state, with no ambiguity. Extended to sequences of events, it says where the system is after a whole history:

$$
\hat{\delta}(q, \varepsilon) = q, \qquad \hat{\delta}(q, wa) = \delta\bigl(\hat{\delta}(q, w),\, a\bigr).
\label{eq:extended-transition}
$$

Equation :eqref[eq:extended-transition] is a fold: the current state is the result of applying $$\delta$$, event by event, from the initial state. It follows that the same history always leads to the same state, and that keeping the events is enough to rebuild, audit or debug any past state.

## The transition table {#table .claim depends="state"}

Over finite sets, a function is a table. The player's has four rows, four columns and sixteen cells:

:::figure{#tab:transitions kind="table" title="Transition function of the video player" source="Prepared by the author (2026), from the declarative configuration in the demonstration code."}
| Current state | `PLAY` | `PAUSE` | `STOP` | `REWIND` |
|---|---|---|---|---|
| stopped | playing | — | — | — |
| playing | — | paused | stopped | rewinding |
| paused | playing | — | stopped | rewinding |
| rewinding | playing | paused | stopped | — |
:::

The ten filled cells are the transitions; the six empty ones are the events the state does not accept. The claim of this essay is that this table, and not the conditionals, is the specification of the behaviour — and that writing it in one place changes what can go wrong. With flags, the rule “one situation at a time” is a convention repeated in every method; with a type that has exactly four values, it is a property of the representation. This is the principle of making illegal states unrepresentable [@minsky2011], a relative of another one: parse once, at the boundary, instead of validating everywhere [@king2019]. And it is :concept[information hiding]{ref=information-hiding} in Parnas's sense: the encoding of the state is a design decision that is likely to change, and whoever sends events does not need to know it [@parnas1972].

:ref[def:dfa] asks for a total function, and the table has empty cells. Each of them is a decision: reject the event, ignore it, or fail. The two explicit-state versions in the demonstration code decided differently, and nothing anywhere recorded it: in one, `PLAY` during playback is silently ignored; in the other it is rejected, and the sender is told. Neither is wrong. But only with the table in view does the divergence appear as what it is: cells in which a decision was missing.

## Three ways of writing the table {#implementations .application depends="table"}

**An enumeration and a pure function.** In Java, the table fits in one function over two enumerated types:

```java
enum State { STOPPED, PLAYING, PAUSED, REWINDING }
enum Event { PLAY, PAUSE, STOP, REWIND }

static Optional<State> next(State state, Event event) {
    return switch (state) {
        case STOPPED -> switch (event) {
            case PLAY -> Optional.of(State.PLAYING);
            case PAUSE, STOP, REWIND -> Optional.empty();
        };
        case PLAYING -> switch (event) {
            case PAUSE -> Optional.of(State.PAUSED);
            case STOP -> Optional.of(State.STOPPED);
            case REWIND -> Optional.of(State.REWINDING);
            case PLAY -> Optional.empty();
        };
        case PAUSED -> switch (event) {
            case PLAY -> Optional.of(State.PLAYING);
            case STOP -> Optional.of(State.STOPPED);
            case REWIND -> Optional.of(State.REWINDING);
            case PAUSE -> Optional.empty();
        };
        case REWINDING -> switch (event) {
            case PLAY -> Optional.of(State.PLAYING);
            case PAUSE -> Optional.of(State.PAUSED);
            case STOP -> Optional.of(State.STOPPED);
            case REWIND -> Optional.empty();
        };
    };
}
```

A `switch` expression with no default branch has to cover every value: adding a state without saying what it does with each event does not compile.:sidenote[Checked with the Java 21 compiler: when a fifth state is added, compilation fails with the message that the expression does not cover all possible input values.] The compiler now checks the table.

**The State pattern.** Each state becomes an object that knows how to respond to each event, and a context holds the reference to the current state [@gamma1995, pp. 305-313]. Polymorphism replaces the conditionals; in exchange, the table is spread over several classes, one row in each.

**A declarative table.** State machine libraries take the table as data and add what surrounds a transition: guards (conditions it requires), actions (effects it triggers) and listeners that record every change. In the demonstration code, with Spring Statemachine, two cells are written like this:

```java
transitions
    .withExternal()
        .source(VideoState.STOPPED).target(VideoState.PLAYING)
        .event(VideoEvent.PLAY)
        .guard(subscriptionGuard())
    .and()
    .withExternal()
        .source(VideoState.PLAYING).target(VideoState.PAUSED)
        .event(VideoEvent.PAUSE)
        .action(analyticsPauseAction());
```

The library's own documentation lists, among the signs that a project is already trying to implement a state machine, the use of boolean flags and of conditionals that test combinations of them [@spring2023].

The choice of a library, however, is a decision with an expiry date. In April 2025 the Spring team announced that Spring Statemachine would no longer be maintained as an open-source project and that the 4.0 line would be the last open one [@minella2025]; [the repository](https://github.com/spring-attic/spring-statemachine) was archived, read-only, in July 2026. The example remains valid as an illustration; as a new dependency, it requires weighing that fact. The transition table, which belongs to the domain, survives a change of library — provided it was written as a table.

## Objections {#objections .objection depends="table"}

**Not every second flag calls for a machine.** The rule of thumb that closed the talk — whoever needs a second flag needs a state machine — is too strong. “Muted” and “playing” are independent properties: all four combinations exist and mean something. There the product is real, and two booleans are the exact representation. Harel gave this a form in :concept[statecharts]{ref=statechart}: orthogonal components hold at the same time, and the state of the whole is the product of the states of the parts, with no need to enumerate it [@harel1987]. The criterion, then, is not the number of flags; it is whether some combination of them is forbidden.

**Machines explode too.** A flat machine that mixes independent aspects — the payment and the delivery of an order, say, with ten states each — needs a hundred states to say what two machines of ten say. The combinatorial explosion that the flags were hiding reappears in the diagram. Hierarchy and orthogonality exist to contain it [@harel1987], as does the habit of keeping counters and data in variables beside the state rather than in states.

**The machine does not settle what surrounds it.** Two simultaneous events, an event repeated by a delivery retry, an action that fails after the new state has been stored: none of this is in $$\delta$$. The transition function is deterministic; the delivery of events, persistence and side effects are not. A payment system needs concurrency control, idempotency and compensation as much as it needs a correct table — a subject for another essay.

**The cost.** For two states and no rules, a boolean is the right tool, and a library would be ceremony.

## What it is for, for whom, at what cost {#value .conclusion depends="implementations,objections"}

What follows necessarily is little, and it is solid: if the state is a value of a finite set and every change goes through a function, there is no meaningless configuration, and the same history produces the same state. The rest is an engineering decision, and the scale suggested here is short. For independent properties, flags. For mutually exclusive situations, an enumerated type and a transition function, which any language offers. For rules per transition, auditing, persistence and long-running processes, a declarative table, with or without a library — weighing who maintains it.

The compiler is not the only one to gain from the table. So does whoever reads the code six months later and finds sixteen cells instead of eight combinations scattered across conditionals; whoever tests it, because each cell is a case; whoever answers for an incident, because each change of state is an event with a name, an origin and a destination. The cost is that of every abstraction: deciding in advance what the system has to remember, and accepting that it will know nothing of the rest. In [Choosing costs bits](../choosing-costs-bits/), the cost of an interface was the uncertainty of the person using it; here it is the uncertainty of the person maintaining it. In both cases, designing well means not charging anyone for bits that carry no information.

::bibliography
