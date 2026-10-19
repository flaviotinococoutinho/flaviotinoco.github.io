---
title: Do signo à informação
subtitle: O que se perde e o que se ganha quando se mede a informação sem o significado
description: 'De Peirce, Saussure e Frege a Shannon: como a teoria da informação mede a escolha pondo o significado entre parênteses, e o que isso custa.'
lang: pt-BR
translationKey: from-sign-to-information
slug: do-signo-a-informacao
stratum: philosophy
bridgesTo: theory
domains: [semiotics, information-theory, epistemology]
concepts: [sign, symbol, meaning, sense-and-reference, information, entropy, redundancy, channel, model]
published: 2026-10-11
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  Este ensaio percorre a passagem entre o estrato filosófico e o teórico do site: do signo, entendido como
  relação que envolve alguém, à informação, entendida como medida de escolha. Parte de três análises clássicas
  do signo — a tríade de Peirce (representâmen, objeto e interpretante), a díade de Saussure (significante e
  significado) e a distinção de Frege entre sentido e referência — para mostrar que, em todas elas, o
  significado depende de um intérprete, de um sistema compartilhado ou de um modo de apresentação. Em seguida,
  apresenta os três níveis de problemas de comunicação descritos por Weaver (técnico, semântico e de
  efetividade) e a decisão metodológica de Shannon de tratar apenas o primeiro, declarando os aspectos
  semânticos irrelevantes para o problema de engenharia. Define autoinformação e entropia, discute por que a
  medida é logarítmica e examina o que se perde com essa escolha (a referência, a verdade e, aparentemente, o
  intérprete) e o que se ganha (generalidade e teoremas sobre compressão e transmissão). Conclui que a medida
  de Shannon não substitui a semiótica, mas pressupõe parte dela: um repertório compartilhado de mensagens
  possíveis, um receptor capaz de distingui-las e uma distribuição de probabilidades atribuída por alguém, isto
  é, um modelo. Esse pressuposto é a ponte para o estrato teórico.
keywords: [signo, informação, entropia, significado, semiótica]
provenance:
  assistance: generated
  reviewed: false
  note: Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.
draft: false
---

:::epigraph{source="@shannon1948 [p. 379, tradução nossa]"}
:foreign[“Frequently the messages have meaning; that is they refer to or are correlated according to some system with certain physical or conceptual entities. These semantic aspects of communication are irrelevant to the engineering problem.”]{lang=en}

“Frequentemente as mensagens têm significado; isto é, referem-se a certas entidades físicas ou conceituais, ou estão correlacionadas com elas segundo algum sistema. Esses aspectos semânticos da comunicação são irrelevantes para o problema de engenharia.”
:::

::toc

Quem lê esta página faz várias coisas ao mesmo tempo: distingue formas de letras, reconhece palavras, atribui-lhes sentido, avalia se o que se diz é verdadeiro e decide se vale a pena continuar. A teoria matemática da comunicação, publicada por Claude Shannon em 1948, escolheu medir apenas a primeira dessas atividades — e essa renúncia é parte do que a tornou tão fecunda. Este ensaio é a primeira travessia do site. Parte do :concept[signo]{id=sign}, uma relação que sempre envolve alguém, e chega à :concept[informação]{id=information} no sentido técnico, uma medida de escolha que não menciona ninguém em particular. O objetivo é tornar visível o que fica pelo caminho.

## Que relação é um signo? {#o-que-e-um-signo .question}

Para Charles S. Peirce, um signo não é uma coisa, mas um dos termos de uma relação de três lugares. Na formulação mais citada, de cerca de 1897, “um signo, ou representâmen, é algo que está para alguém no lugar de algo, sob algum aspecto ou capacidade” [@peirce1931, v. 2, § 228, tradução nossa].:sidenote[Os estudiosos de Peirce citam os :foreign[Collected Papers]{lang=en} pela convenção volume.parágrafo — aqui, CP 2.228 —, que independe da paginação de cada edição. No original: :foreign[“A sign, or representamen, is something which stands to somebody for something in some respect or capacity.”]{lang=en}] O signo dirige-se a alguém e cria na mente dessa pessoa um signo equivalente, ou talvez mais desenvolvido, que Peirce chama de interpretante; e está no lugar de seu objeto não em todos os aspectos, mas em referência a uma espécie de ideia que ele chama de fundamento do representâmen [@peirce1931, v. 2, § 228].

Três consequências interessam aqui. Primeiro, não há signo sem um intérprete possível: a relação é triádica e não se decompõe em pares. Segundo, o interpretante é ele mesmo um signo, que pode gerar outro interpretante; a significação é um processo aberto, não um rótulo colado a uma coisa. Terceiro, o signo representa “sob algum aspecto”: toda representação seleciona. Entre as muitas classificações que Peirce propôs, a mais conhecida distingue ícones, índices e :concept[símbolos]{id=symbol} — estes últimos ligados ao objeto por convenção ou hábito, como a maior parte das palavras [@peirce1931].

## Duas faces e um modo de apresentação {#saussure-e-frege .premise}

Pouco depois, em cursos ministrados em Genebra entre 1907 e 1911, Ferdinand de Saussure propôs um modelo de dois termos. Segundo o :foreign[Cours de linguistique générale]{lang=fr}, o signo linguístico não une uma coisa a um nome, mas um conceito a uma imagem acústica, que ele rebatiza de :foreign[signifié]{lang=fr} e :foreign[signifiant]{lang=fr} — significado e significante [@saussure1916].:sidenote[O :foreign[Cours]{lang=fr} foi publicado em 1916, depois da morte de Saussure, por Charles Bally e Albert Sechehaye, com base em anotações de alunos [@saussure1916]. Convém cautela ao atribuir cada formulação ao próprio Saussure.] O laço entre as duas faces é arbitrário: nada no som de “árvore” exige o conceito correspondente. E o valor de cada signo decorre de sua posição num sistema de diferenças, a língua [@saussure1916]. A díade deixa de fora o objeto no mundo, e de propósito: o que interessa a Saussure é o sistema que torna as distinções possíveis.

Gottlob Frege chegou a outra distinção partindo de um problema lógico. Se “a = a” e “a = b” forem ambos verdadeiros, por que apenas o segundo pode ampliar o que sabemos? Sua resposta separa, em toda expressão, a referência — o objeto designado — do sentido, o modo como esse objeto nos é apresentado. “Estrela da tarde” e “estrela da manhã” têm a mesma referência e sentidos diferentes [@frege1892]; que ambas designem o planeta Vênus foi uma descoberta astronômica, não uma consequência da gramática. A distinção entre :concept[sentido e referência]{id=sense-and-reference}:sidenote[As traduções variam: :foreign[Bedeutung]{lang=de} aparece em português como “referência”, “denotação” ou “significado”. Aqui se usa “referência” para não confundir o termo com o significado de Saussure.] mostra que duas expressões podem coincidir no que designam e divergir no que informam a quem as compreende.

As três análises divergem em quase tudo, mas concordam num ponto decisivo para esta travessia: o :concept[significado]{id=meaning} não é uma propriedade intrínseca de marcas físicas. Depende de um intérprete (Peirce), de um sistema de diferenças compartilhado (Saussure) ou de um modo de apresentação que um pensamento pode apreender (Frege). Em nenhum dos três casos o significado é uma grandeza que se possa somar.

## O problema em três níveis {#tres-niveis .premise depends="o-que-e-um-signo,saussure-e-frege"}

Em 1949, Warren Weaver apresentou a teoria de Shannon a um público mais amplo distinguindo três níveis de problemas de comunicação: o técnico (com que exatidão os símbolos chegam ao destino?), o semântico (com que precisão eles transmitem o significado pretendido?) e o de efetividade (o significado recebido altera a conduta do modo pretendido?) [@weaver1949]. A teoria matemática trata apenas do primeiro. Weaver argumentava, porém, que ela não é indiferente aos outros dois, porque o significado e a efetividade ficam inevitavelmente limitados pela exatidão alcançável na transmissão dos símbolos [@weaver1949].

O próprio Shannon formulou o problema fundamental da comunicação como o de reproduzir num ponto, exata ou aproximadamente, uma mensagem selecionada em outro ponto [@shannon1948, p. 379]. A frase seguinte é a da epígrafe. A terceira desfaz o aparente paradoxo: o aspecto relevante é que a mensagem efetiva foi selecionada de um conjunto de mensagens possíveis, e o sistema precisa funcionar para qualquer seleção, não só para a que de fato ocorrerá, porque esta é desconhecida quando o sistema é projetado [@shannon1948, p. 379]. A informação, nesse sentido, não é uma propriedade da mensagem isolada, mas da relação entre a mensagem e o conjunto de alternativas de onde ela foi tirada.

## Medir a escolha {#medir-a-escolha .definition depends="tres-niveis"}

Se há $$M$$ mensagens igualmente prováveis, qualquer função monótona de $$M$$ serve como medida da escolha; Shannon, seguindo uma sugestão de Ralph Hartley, adota o logaritmo [@shannon1948]. Quando as alternativas não são igualmente prováveis, a medida se generaliza assim.

:::definition{#def:entropia title="Autoinformação e entropia"}
Seja $$X$$ uma variável aleatória discreta com valores num conjunto finito $$\mathcal{X}$$ e probabilidades $$p(x) > 0$$. A *autoinformação* de um resultado $$x$$ é

$$
I(x) = -\log_2 p(x),
\label{eq:autoinformacao}
$$

medida em bits, e a *entropia* de $$X$$ é a autoinformação média:

$$
\H(X) = \sum_{x \in \mathcal{X}} p(x)\, I(x) = -\sum_{x \in \mathcal{X}} p(x) \log_2 p(x).
\label{eq:entropia}
$$
:::

Uma moeda honesta tem entropia de 1 bit; um dado honesto, $$\log_2 6 \approx 2{,}585$$ bits; uma moeda viciada que dá cara em 90 % dos lançamentos, cerca de 0,469 bit. A :concept[entropia]{id=entropy} é máxima quando as alternativas são equiprováveis e nula quando o resultado é certo: mede a incerteza que a observação elimina. Shannon mostrou que, se exigirmos de uma medida de incerteza três propriedades — continuidade nas probabilidades, crescimento com o número de alternativas equiprováveis e coerência quando uma escolha é decomposta em escolhas sucessivas —, a única forma possível é a da :eqref[eq:entropia], a menos de uma constante que fixa a unidade [@shannon1948]. Ele próprio advertiu que esse teorema servia sobretudo para dar plausibilidade à definição: a justificativa real estaria em suas consequências [@shannon1948].

:::stretch{label="Por que o logaritmo?"}
Shannon apresenta três razões para a escolha logarítmica [@shannon1948]. A primeira é prática: grandezas de engenharia como tempo, largura de banda e número de relés tendem a variar linearmente com o logaritmo do número de possibilidades — acrescentar um relé a um grupo dobra o número de estados possíveis e soma 1 ao logaritmo de base 2. A segunda é intuitiva: esperamos que dois cartões perfurados guardem o dobro da informação de um só. A terceira é matemática: muitas operações de limite ficam simples em termos de logaritmos. Há ainda uma razão estrutural, visível na :eqref[eq:autoinformacao]. Se dois resultados independentes têm probabilidades $$p$$ e $$q$$, o par tem probabilidade $$pq$$, e o logaritmo transforma esse produto numa soma: $$-\log_2(pq) = -\log_2 p - \log_2 q$$. A informação de observações independentes se acumula. A base 2 fixa a unidade, o bit, palavra que Shannon atribui a John W. Tukey [@shannon1948].
:::

Com essa medida, Shannon estimou que o inglês escrito, considerando dependências estatísticas de até cerca de oito letras, tem :concept[redundância]{id=redundancy} de aproximadamente 50 %: cerca de metade de um texto seria fixada pela estrutura da língua, e só a outra metade seria escolha livre [@shannon1948]. A redundância é o que permite ler uma frase com letras faltando — e o que torna possível corrigir erros num :concept[canal]{id=channel} ruidoso.

## O que se perde {#o-que-se-perde .objection depends="medir-a-escolha"}

A :eqref[eq:entropia] depende apenas das probabilidades. Troque os rótulos das mensagens — “sim” por “não”, um poema por uma sequência sem sentido com a mesma distribuição estatística — e a entropia não muda. Weaver chamou a atenção para isso: para a teoria, uma mensagem cheia de significado e outra sem sentido algum podem conter exatamente a mesma quantidade de informação [@weaver1949]. Três coisas ficam fora da medida.

A primeira é a referência, no sentido de Frege: a medida não sabe do que a mensagem fala. A segunda é a verdade: uma afirmação falsa e uma verdadeira podem ter a mesma autoinformação. É por razões desse tipo que Luciano Floridi propõe distinguir os dados bem formados e significativos da informação semântica propriamente dita, que exigiria também veracidade [@floridi2011]. A terceira é o intérprete — ou melhor, ele não desaparece; apenas se esconde. As probabilidades $$p(x)$$ não estão escritas nas mensagens. Alguém as atribui, com base em frequências observadas, num modelo da fonte ou numa convicção, e duas pessoas com modelos diferentes da mesma fonte calcularão entropias diferentes.

## O que se ganha {#o-que-se-ganha .reply depends="o-que-se-perde"}

Pôr o significado entre parênteses não é negar que ele exista; é um recorte de método. Shannon não diz que as mensagens não têm sentido — diz, na própria frase da epígrafe, que frequentemente o têm. O recorte compra generalidade: a mesma medida se aplica a textos, sinais de rádio, imagens e sequências de qualquer alfabeto, justamente porque não depende do que as mensagens querem dizer.

E compra teoremas. Com a entropia definida assim, Shannon pôde demonstrar quanto uma fonte pode ser comprimida sem perda e quanto um canal ruidoso pode transmitir com frequência de erros arbitrariamente pequena [@shannon1948]. Esses resultados dependem das propriedades algébricas da :eqref[eq:entropia] — continuidade, aditividade para eventos independentes, decomposição de escolhas —, e não dispomos de uma medida de significado que as tenha. Há também um ganho filosófico: ao mostrar com precisão quanto do problema da comunicação pode ser resolvido sem tocar no significado, a teoria delimita, por contraste, o que só a semântica e a pragmática podem tratar.

## Uma ponte, não uma redução {#uma-ponte .conclusion depends="o-que-se-perde,o-que-se-ganha"}

A travessia do signo à informação não substitui a semiótica pela matemática. A medida de Shannon pressupõe ao menos três coisas que vêm do estrato anterior. Pressupõe um repertório de mensagens possíveis, compartilhado por emissor e receptor — algo próximo do sistema de diferenças de Saussure. Pressupõe um receptor capaz de distinguir as alternativas — o mínimo de um intérprete peirciano. E pressupõe uma distribuição de probabilidades atribuída por alguém, isto é, um :concept[modelo]{id=model}. A entropia é exata dado o modelo; o modelo, ele mesmo, é uma hipótese.

É nesse ponto que o ensaio cede lugar ao estrato teórico, cuja pergunta é que modelo explica o fenômeno. O próximo ensaio da ponte, [Amostrar é decidir](../amostrar-e-decidir/), examina um caso em que uma única hipótese de modelo — a de que o sinal não contém frequências acima de certo limite — basta para que uma função contínua fique inteiramente determinada por uma sequência de números.

::concept-map{focus=information depth=2}

::bibliography
