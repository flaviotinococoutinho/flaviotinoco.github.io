---
stratum: formal
lang: en
title: Formal
question: What follows necessarily?
method: proof, algorithm and determinism
description: The third stratum. Writing the model in a precise language, so that its consequences can be proved, computed and checked.
---

In the formal stratum the model is rewritten in a language where nothing is left implicit: exact definitions, stated
axioms, known rules of inference. The gain is that the consequences no longer depend on who reads them. A proved theorem
holds for any reader who accepts the premises; a deterministic algorithm produces the same output for the same input,
on any machine.

The method is proof and algorithm. To prove is to show that a claim follows from the premises; to implement is to make
that consequence computable and, for that reason, checkable by others. Most of the labs on the site belong to this
stratum: each one makes a theorem or a law tangible, and the reader can vary the parameters to see where the claim holds
and where its hypotheses stop applying.

In the symbology of the site, the formal is the **triangle**, the 2-simplex: the simplest rigid polygon. Three points
joined pairwise cannot be deformed unless some side changes length, whereas a quadrilateral hinged at its vertices can.
In coordinates, the simplex of dimension $$k$$ is the set

$$
\Delta^k = \{\, x \in \mathbb{R}^{k+1} \mid x_i \ge 0,\ x_0 + x_1 + \dots + x_k = 1 \,\}
$$

and it is the emblem of all four strata.

Rigour has limits worth stating. A proof guarantees its conclusion only relative to the premises; the choice of premises
belongs to the earlier strata, and the use of the result to the next one.
