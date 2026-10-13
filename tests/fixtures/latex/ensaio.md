## Amostragem e informação {#amostragem .claim}

A teoria de Shannon [@shannon1948, p. 379] mede a informação em bits; ver também
[ver @nyquist1928; @kotelnikov1933, cap. 2] e a releitura de @gallager2008 [p. 12].
Já [-@shannon1949] tratou do ruído. Escrever `R$ 5,00 & 10%` não é fórmula, e
"aspas" com # $ % & ~ _ ^ \ { } devem sobreviver; o e-mail fulano@exemplo.com também.
Às 10:30 a proporção é 1:2 e \[@escapado] não é citação.

:::definition{#def:entropia title="Entropia"}
A **entropia** de uma variável $$X$$ é

$$
\H(X) = -\sum_{x} p(x) \log_2 p(x) \label{eq:entropia}
$$
:::

::::theorem{#thm:amostragem title="Nyquist–Shannon"}
Se $$x$$ é limitado em banda a $$B$$, então $$x$$ é determinado por amostras a $$2B$$
(compare :eqref[eq:entropia] e :ref[def:entropia]).

:::proof{of="thm:amostragem"}
Pela :ref[eq:sinc], segue o resultado.
:::
::::

$$
x(t) = \sum_{n} x(nT) \sinc\left(\frac{t - nT}{T}\right) \label{eq:sinc}
$$

:::figure{#fig:dobramento kind="chart" title="Dobramento espectral" source="Elaborado pelo autor (2026)."}
![Espectro dobrado em torno de f_s/2](./dobramento.svg)
:::

:::figure{#tab:taxas kind="table" title="Taxas de amostragem usuais" source="[@iso80000]"}
| Sinal   | Banda (kHz) | Taxa (kHz) |
|:--------|:-----------:|-----------:|
| Voz     | 4           | 8          |
| CD      | 22,05       | 44,1       |
:::

:::remark
Uma *observação* com :sidenote[nota lateral] e :foreign[Zeitgeist]{lang=de},
:name[Ferdinand de Saussure] e :abbr[FFT]{title="Fast Fourier Transform"}.
:::

1. primeiro item
2. [segundo] item com colchete

- [x] tarefa feita
- [ ] tarefa pendente

> Citação em bloco.[^1]

[^1]: Nota de rodapé com `código`.

```ts
const x = 1; // \end{verbatim}
```

::toc
