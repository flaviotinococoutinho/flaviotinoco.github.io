---
title: 'Amostrar é decidir: o teorema de Nyquist–Shannon'
subtitle: Quando uma sequência de números basta para determinar um sinal contínuo — e o que essa garantia pressupõe
description: 'Sinais, frequência e transformada de Fourier; o teorema da amostragem com esboço de prova, sua história repartida e o aliasing, passo a passo.'
lang: pt-BR
translationKey: to-sample-is-to-decide
slug: amostrar-e-decidir
stratum: theory
bridgesTo: formal
domains: [signal-processing, mathematics, information-theory]
concepts: [signal, frequency, fourier-transform, fourier-series, sampling-theorem, aliasing, gibbs-phenomenon, fast-fourier-transform, noise, model, channel-capacity]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  Este ensaio atravessa do estrato teórico ao formal por meio de um resultado que transforma um modelo em
  garantia: o teorema da amostragem. Começa pelas noções de sinal, frequência e transformada de Fourier, que
  permitem descrever o mesmo sinal pelo valor em cada instante ou pela quantidade de cada frequência que ele
  contém. Enuncia o teorema — um sinal de energia finita cujo espectro se anula fora da faixa de menos B a B
  fica inteiramente determinado por amostras tomadas à taxa de pelo menos 2B por segundo — e esboça uma
  demonstração pela periodização do espectro e pela interpolação com a função sinc. Expõe com cautela a
  história repartida do resultado, de Whittaker (1915) e Nyquist (1928) a Kotelnikov (1933) e Shannon (1949),
  e mostra, numa sequência guiada pela rolagem, o que acontece quando a taxa de amostragem cai abaixo do limite:
  frequências altas reaparecem disfarçadas de baixas, o aliasing. Uma digressão relaciona o corte abrupto do
  espectro ao fenômeno de Gibbs. Por fim, distingue o determinismo da implicação, que é completo, das hipóteses
  do modelo, que nenhum sinal real satisfaz exatamente, e conclui que amostrar é decidir duas vezes: quais
  frequências importam e quanto se aceita pagar, em números por segundo, para preservá-las.
keywords: [amostragem, transformada de Fourier, aliasing, teorema de Nyquist–Shannon, sinais]
provenance:
  assistance: generated
  reviewed: false
  note: Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.
draft: false
---

Um microfone converte variações de pressão do ar numa tensão elétrica que muda continuamente; um computador só guarda listas finitas de números. Entre os dois há uma decisão: em que instantes medir. O teorema da amostragem diz quando essa decisão não perde nada — e é um exemplo nítido de como uma hipótese de modelo, uma vez aceita, se converte em garantia matemática. Este ensaio é a segunda travessia do site, do estrato teórico ao formal.

::toc

## Sinal, frequência e transformada {#sinal-e-frequencia .definition}

Um :concept[sinal]{ref=signal} é uma grandeza que varia no tempo — a pressão diante de um microfone, a tensão num cabo — representada por uma função $$x(t)$$. A :concept[frequência]{ref=frequency} de uma oscilação periódica é o número de ciclos por unidade de tempo, medida em hertz (Hz). A ideia que organiza todo o resto é que um sinal pode ser descrito de dois modos equivalentes: pelo valor que assume em cada instante ou pela quantidade de cada frequência que contém.

:::definition{#def:fourier title="Transformada de Fourier"}
A transformada de Fourier de um sinal $$x$$ de energia finita é

$$
X(f) = \int_{-\infty}^{\infty} x(t)\, \e^{-\i 2\pi f t} \d t,
\label{eq:fourier}
$$

e o sinal é recuperado pela transformada inversa, $$x(t) = \int_{-\infty}^{\infty} X(f)\, \e^{\i 2\pi f t} \d f$$. Diz-se que $$x$$ é *limitado em banda* a $$B$$ quando $$X(f) = 0$$ para todo $$|f| > B$$.
:::

A :eqref[eq:fourier] define a :concept[transformada de Fourier]{ref=fourier-transform}:sidenote[Para sinais de energia finita, a integral deve ser entendida no sentido da energia (teorema de Plancherel); para sinais absolutamente integráveis, as duas leituras coincidem.] e descreve o espectro do sinal: quanto de cada frequência ele contém e com que fase. Nas aplicações, o espectro de sequências finitas de amostras é calculado pela transformada discreta de Fourier, que o algoritmo de Cooley e Tukey tornou rápida o suficiente para uso cotidiano [@cooley1965] — a :concept[transformada rápida de Fourier]{ref=fast-fourier-transform}.

A descrição em frequência não é capricho matemático. Sistemas lineares e invariantes no tempo, como filtros e muitos meios de transmissão, tratam cada frequência separadamente: multiplicam cada componente senoidal por um fator que depende apenas da frequência. Para eles, a pergunta útil não é que valor o sinal assume neste instante, mas até que frequência ele vai — e é exatamente essa pergunta que o teorema da amostragem transforma numa regra de projeto.

## O teorema {#o-teorema .claim depends="sinal-e-frequencia"}

Amostrar um sinal a intervalos regulares de $$T$$ segundos significa reter apenas os valores $$x(nT)$$, com $$n$$ inteiro; a taxa de amostragem é $$f_s = 1/T$$ amostras por segundo. O :ref[thm:amostragem] afirma que, se o sinal for limitado em banda no sentido da :ref[def:fourier], nada se perde quando a taxa é alta o bastante.

::::theorem{#thm:amostragem title="Nyquist–Shannon"}
Seja $$x$$ um sinal de energia finita cuja transformada de Fourier se anula fora do intervalo $$[-B, B]$$. Se $$f_s = 1/T \geq 2B$$, então $$x$$ é inteiramente determinado pelas amostras $$x(nT)$$, $$n \in \Z$$, e

$$
x(t) = \sum_{n=-\infty}^{\infty} x(nT)\, \sinc\!\left(\frac{t - nT}{T}\right), \qquad \sinc(u) = \frac{\sin(\pi u)}{\pi u}.
\label{eq:interpolacao}
$$

:::proof
Esboço. Representemos as amostras pelo trem de impulsos $$x_s(t) = \sum_n x(nT)\, \delta(t - nT)$$. Pela fórmula de soma de Poisson, sua transformada é o espectro original repetido a cada $$f_s$$:

$$
X_s(f) = \frac{1}{T} \sum_{k=-\infty}^{\infty} X(f - k f_s).
\label{eq:replicas}
$$

Se $$f_s \geq 2B$$, as réplicas da :eqref[eq:replicas] não se sobrepõem (no máximo se tocam nas bordas, um conjunto de medida nula). Multiplicar $$X_s$$ pelo filtro passa-baixas ideal, que vale $$T$$ para $$|f| < f_s/2$$ e zero fora, devolve exatamente $$X$$. No tempo, essa multiplicação é a convolução com a resposta ao impulso do filtro, $$\sinc(t/T)$$, e a convolução do trem de impulsos com ela é a soma da :eqref[eq:interpolacao]. @shannon1949 dá um argumento equivalente: as amostras são, a menos de um fator constante, os coeficientes da série de Fourier do espectro no intervalo de $$-B$$ a $$B$$ e, portanto, determinam o espectro e, com ele, o sinal.
:::
::::

:::remark
O caso-limite $$f_s = 2B$$ vale para sinais de energia finita, mas não para uma senoide pura de frequência exatamente $$B$$, que não tem energia finita: amostrada nos cruzamentos por zero, ela produz apenas zeros. Por isso, na prática, amostra-se com folga acima de $$2B$$.
:::

A intuição oferecida por Shannon é simples: um sinal sem frequências acima de $$B$$ não consegue mudar substancialmente de valor em menos de meio ciclo da frequência mais alta, isto é, em menos de $$1/(2B)$$ segundo; amostras tomadas a esse intervalo não deixam escapar nada de essencial [@shannon1949]. A demonstração mostra que a intuição vale não apenas de modo aproximado, mas exato — e o :concept[teorema da amostragem]{ref=sampling-theorem} passa a ser uma regra de projeto: para preservar até $$B$$ hertz, bastam $$2B$$ números por segundo.

## Uma descoberta de muitos nomes {#atribuicao .premise}

O resultado tem uma história longa e, por isso, vários nomes. Em 1915, o matemático E. T. Whittaker estudou, no contexto da teoria da interpolação, a série que hoje se escreve como na :eqref[eq:interpolacao] e a chamou de função cardinal [@whittaker1915]. Em 1928, Harry Nyquist, ao analisar a telegrafia, mostrou que uma faixa de largura $$W$$ comporta cerca de $$2W$$ elementos de sinal independentes por segundo [@nyquist1928]; daí o nome “taxa de Nyquist” para $$2B$$. Em 1933, Vladimir Kotelnikov enunciou e demonstrou o teorema para a engenharia de comunicações, num trabalho publicado em russo [@kotelnikov1933]. Em 1949, Shannon publicou enunciado e demonstração explícitos. Apresentou o resultado como algo já conhecido na prática das comunicações, lembrou que matemáticos o haviam formulado de outras maneiras e registrou que Nyquist e, mais tarde, Dennis Gabor tinham observado que cerca de $$2TW$$ números bastam para descrever um sinal de banda $$W$$ e duração $$T$$ [@shannon1949].:sidenote[O matemático que Shannon cita é J. M. Whittaker, filho de E. T. Whittaker, autor de um livro de 1935 sobre teoria da interpolação [@shannon1949].]

Os nomes compostos — Whittaker–Kotelnikov–Shannon, Nyquist–Shannon, entre outros — registram essa autoria distribuída. O título deste ensaio usa a forma Nyquist–Shannon por convenção, não como juízo de prioridade.

## Quando a amostragem engana {#aliasing .claim depends="o-teorema"}

Se $$f_s < 2B$$, as réplicas da :eqref[eq:replicas] se sobrepõem, e nenhum filtro consegue separá-las depois: componentes acima de $$f_s/2$$ reaparecem “dobradas” abaixo desse limite. É o :concept[aliasing]{ref=aliasing}, às vezes chamado em português de falseamento ou dobramento espectral. Para uma senoide de frequência $$f$$, a frequência aparente é

$$
f_a = \left| f - k f_s \right|, \qquad k = \operatorname{round}\!\left(\frac{f}{f_s}\right),
\label{eq:alias}
$$

isto é, a distância de $$f$$ até o múltiplo de $$f_s$$ mais próximo. A sequência abaixo acompanha um tom de 3 kHz amostrado a taxas cada vez menores.

::::scrolly
::lab{widget=sampling}

:::step{state="fs=12000"}
**12 kHz.** Quatro amostras por ciclo, com folga sobre o limite de 6 kHz. A interpolação da :eqref[eq:interpolacao] devolve a senoide original.
:::

:::step{state="fs=6000"}
**6 kHz.** Exatamente o dobro da frequência do tom: duas amostras por ciclo. O resultado depende da fase — se as amostras caem nos picos, a senoide é recuperada; se caem nos cruzamentos por zero, todas valem zero e o tom desaparece. É o caso-limite da observação acima.
:::

:::step{state="fs=4000"}
**4 kHz.** Abaixo do limite. Pela :eqref[eq:alias], o tom de 3 kHz aparece como um tom de $$|3 - 4| = 1$$ kHz: as mesmas amostras seriam produzidas por uma senoide de 1 kHz, e a reconstrução escolhe a de menor frequência.
:::

:::step{state="fs=3000"}
**3 kHz.** A taxa iguala a frequência do tom. Cada amostra cai na mesma fase do ciclo, todas têm o mesmo valor, e o tom vira uma constante: frequência aparente zero.
:::
::::

Por isso os conversores analógico-digitais costumam ser precedidos por um filtro que atenua o que está acima de $$f_s/2$$ antes da amostragem: depois dela, o dobramento já não pode ser desfeito.

:::aside
**O fenômeno de Gibbs.** O filtro passa-baixas ideal da demonstração corta o espectro de forma abrupta, e cortes abruptos têm um preço. Quando uma função com descontinuidade, como uma onda quadrada, é aproximada pelos primeiros $$N$$ termos de sua :concept[série de Fourier]{ref=fourier-series}, a soma parcial ultrapassa o salto em cerca de 9 % da altura dele, perto da descontinuidade, e esse excesso não diminui quando $$N$$ cresce — apenas se estreita. É o :concept[fenômeno de Gibbs]{ref=gibbs-phenomenon}. O mesmo mecanismo aparece na reconstrução pela função sinc, cujos lóbulos laterais decaem devagar: transições bruscas, reconstruídas a partir de um espectro truncado, vêm acompanhadas de oscilações. O [laboratório de Fourier e Gibbs](../../laboratorio/fourier-e-gibbs/) permite aumentar $$N$$ e ver o excesso persistir.
:::

## O que “determinístico” quer dizer aqui {#deterministico .claim depends="o-teorema"}

O teorema é determinístico num sentido preciso: a conclusão segue necessariamente das hipóteses. Não há nele probabilidade nem estimativa; dadas as amostras, cada valor intermediário do sinal está fixado pela :eqref[eq:interpolacao].:sidenote[Determinístico não quer dizer decidível. @godel1931 mostrou que sistemas formais consistentes e suficientemente expressivos contêm sentenças que não podem provar nem refutar, e @turing1936 mostrou que não existe procedimento mecânico geral para decidir certas propriedades das próprias máquinas de calcular.] Mas o determinismo é da implicação, não do mundo, e as hipóteses são idealizações.

Nenhum sinal não nulo é, ao mesmo tempo, limitado em banda e limitado no tempo: se fosse nulo fora de um intervalo de tempo, sua transformada se estenderia a uma função analítica em todo o plano complexo, e uma função assim que se anula num intervalo é identicamente nula. Sinais reais começam e terminam; logo, nenhum satisfaz exatamente a hipótese do :ref[thm:amostragem]. Além disso, a soma da :eqref[eq:interpolacao] exige amostras de todo o passado e de todo o futuro, e cada amostra real é registrada com um número finito de bits e afetada por :concept[ruído]{ref=noise}. Na prática, filtra-se antes de amostrar, amostra-se com folga e aceita-se um erro pequeno e controlado. O teorema não descreve o conversor real; descreve o limite do qual ele se aproxima e serve de referência para medir quanto ele se afasta.

## Decidir o que importa {#decidir .conclusion depends="deterministico,aliasing"}

Amostrar é decidir duas vezes. Primeiro, decide-se o :concept[modelo]{ref=model}: quais frequências importam, isto é, qual é o $$B$$ abaixo do qual está tudo o que se quer preservar. Depois, decide-se o custo: $$2B$$ números por segundo, cada um com certa precisão. O teorema garante que, feitas essas escolhas, nada mais se perde; não garante que as escolhas foram boas.

Shannon usou exatamente essa contagem — um sinal de banda $$W$$ e duração $$T$$ fica especificado por $$2TW$$ números — para calcular quantos bits por segundo um canal limitado em banda e sujeito a ruído branco pode transmitir [@shannon1949]:

$$
C = W \log_2 \frac{P + N}{N},
\label{eq:capacidade}
$$

em que $$P$$ é a potência média do sinal e $$N$$ a do ruído na faixa. A :eqref[eq:capacidade] é uma :concept[capacidade de canal]{ref=channel-capacity}: o teorema da amostragem converte uma escolha de modelo em contas de custo. O próximo ensaio da ponte, [Escolher custa bits](../escolher-custa-bits/), leva essas contas do sinal para as escolhas de quem usa um produto.

::bibliography
