:::epigraph[Plutarco, *Vida de Pompeu*, 50]{lang=la}
Navigare necesse est; vivere non est necesse.
:::

::toc

## O que é informação? {#questao .question}

Começa às 10:30 com uma pergunta simples:sidenote[Shannon evitou a palavra *significado* de propósito.] e uma
observação lateral :marginnote[A margem guarda o que o texto principal pode dispensar.] sobre medidas.

:::stretch{label="Por que logaritmo?"}
Porque a informação de duas fontes independentes deve somar, e o logaritmo
transforma produtos de probabilidades em somas.
:::

## Entropia como medida {#def:entropia .definition depends="questao"}

A entropia de uma fonte é a média da surpresa, $$H = -\sum p \log p$$, medida em bits.

```python
def H(p): return -sum(x * log2(x) for x in p)
```

## O canal é ruidoso {#premissa-ruido .premise}

Todo canal físico tem ruído[^ruido].

[^ruido]: Térmico, no mínimo (Johnson–Nyquist).

## Há um limite de transmissão {#tese .claim depends="def:entropia, premissa-ruido"}

::::scrolly{label="Capacidade passo a passo"}
![Diagrama de um canal com ruído](./canal.svg)

:::step{state="fonte"}
A fonte emite símbolos.
:::

:::step{state="ruido"}
O ruído corrompe alguns deles.
:::
::::

::::horizontal{label="Três leituras do teorema"}
:::panel{label="Engenharia"}
Um limite de projeto.
:::

:::panel
Um limite epistemológico.
:::

:::panel
Um limite econômico.
:::
::::

:::aside{label="Digressão"}
Nem toda redundância é desperdício.
:::

## Mas e o significado? {#objecao .objection depends="tese"}

## Nível sintático {.reply depends="objecao"}

Conjuntos como {1, 2} e chaves literais \{.claim} permanecem texto.
