## Sampling and aliasing {#sampling}

Sampling a signal at rate $$f_s$$ folds every frequency above $$f_s/2$$ back into the band
[@shannon1949, p. 11; see @nyquist1928]. As @kotelnikov1933 [ch. 2] showed earlier, the
condition is also sufficient. Prices such as $5 & 10% off, the path C:\temp\new and
50_000 samples ~ 1 s must survive; so must x^2 written as text and a #hashtag.

:::definition{#def:alias title="Alias"}
A frequency $$f$$ is an *alias* of $$f + k f_s$$ for every integer $$k$$.
:::

::::theorem{#thm:sampling title="Nyquist–Shannon"}
A signal band-limited to $$B$$ is determined by its samples whenever $$f_s > 2B$$, see
:eqref[eq:rate] and :ref[fig:alias].

:::proof{of="thm:sampling"}
Combine :ref[def:alias] with the reconstruction formula :eqref[eq:sinc].
:::
::::

$$
f_s > 2B \label{eq:rate}
$$

$$
\begin{align}
x(t) &= \sum_{n} x(nT)\,\sinc\!\left(\frac{t - nT}{T}\right) \label{eq:sinc}
\end{align}
$$

$$
\begin{gather}
\text{an unnumbered display}
\end{gather}
$$

:::figure{#fig:alias kind="figure" title="Spectral folding" source="Author's own work (2026)."}
![Spectrum folded around half the sampling rate](./alias.svg)
:::

:::figure{#frm:rules kind="frame" title="Rules of thumb" source="Adapted from [@shannon1949]."}
| Rule | Why |
|:-----|:----|
| Filter first | avoids `aliasing` |
| Oversample 2.5× | margin & safety |
:::

:::stretch{label="Why a factor of two?"}
Because a real sinusoid occupies two points of the spectrum.
:::

:::remark
Remarks are unnumbered:sidenote[like in amsthm.] and so are proofs; ratios like 3:2 stay.
:::

- item with [a bracket] at the start
- [link](https://example.org/a_b?x=1&y=2#frag) and <https://example.org/~user>

::bibliography
