---
title: 'O pipeline não cria informação: ETL e a desigualdade do processamento de dados'
subtitle: O que cada etapa de um pipeline pode conservar, o que perde sem volta e como decidir o que descartar
description: 'Um pipeline de ETL lido como cadeia de Markov: a desigualdade do processamento de dados diz o que nenhuma etapa recupera e orienta o que guardar.'
lang: pt-BR
translationKey: no-pipeline-creates-information
slug: o-pipeline-nao-cria-informacao
stratum: formal
bridgesTo: value
domains: [data-engineering, information-theory, information-systems]
concepts: [etl, data-processing-inequality, markov-chain, mutual-information, sufficient-statistic, data-lineage, idempotence, record]
published: 2026-11-14
revisions:
  - date: 2026-11-14
    note: Versão inicial, escrita na rodada que declarou o escopo do site.
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  Este ensaio atravessa do estrato formal ao do valor por um problema de engenharia de dados: o que um pipeline
  de extração, transformação e carga pode fazer com a informação que recebe. Descreve o pipeline como uma
  sequência de etapas em que cada uma lê só a saída da anterior e mostra que, nessa condição, fonte, extrato e
  resultado formam uma cadeia de Markov. Enuncia então a desigualdade do processamento de dados, da teoria da
  informação: a informação mútua entre a fonte e o resultado nunca supera a que havia entre a fonte e o extrato.
  Uma etapa pode conservar ou perder o que os dados dizem sobre a fonte, nunca acrescentar. O ensaio usa a noção
  de estatística suficiente para precisar o que significa uma transformação sem perda: sem perda para uma
  pergunta, não em geral. Daí tira consequências de projeto: guardar o extrato bruto e tratar o restante como
  derivado, reconhecer que uma junção só acrescenta informação porque acrescenta uma fonte, registrar a linhagem
  de cada dado e escrever etapas que possam ser reexecutadas sem duplicar. Liga o resultado à amostragem de
  sinais, em que a perda por subamostragem também é irreversível. Discute três objeções: transformar agrega
  valor, guardar tudo tem custo e a hipótese de Markov falha quando uma etapa lê entradas laterais. Conclui com
  um critério para decidir o que uma etapa pode descartar e com a pergunta sobre quem paga pela decisão.
keywords: [ETL, engenharia de dados, desigualdade do processamento de dados, informação mútua, linhagem de dados]
draft: false
---

Toda organização que guarda dados acaba por movê-los: de um sistema que registra vendas para outro que as soma, de um sensor para um painel, de um arquivo para um modelo. O trabalho tem nome há décadas — extrair, transformar e carregar (ETL, do inglês :foreign[extract, transform, load]{lang=en}) — e um manual clássico da área o descreve pelo que faz com os dados: extrair, limpar, conformar e entregar [@kimball2004]. Este ensaio pergunta o que esse encadeamento de etapas, o pipeline, pode fazer com a informação que recebe. A resposta é um teorema da teoria da informação, e dele saem decisões de projeto. É uma travessia do estrato formal ao do valor.

::toc

## Três etapas, uma cadeia {#cadeia .example}

Considere-se um exemplo pequeno, inventado para este texto. Uma rede de lojas registra cada venda no caixa; toda noite, um :concept[processo de ETL]{ref=etl} leva essas vendas a um armazém de dados, onde a diretoria consulta o total de cada loja.

:::figure{#tab:etapas kind="table" title="Um pipeline de vendas, etapa por etapa" source="Exemplo ilustrativo, elaborado pelo autor (2026)."}
| Etapa | O que entrega | O que não passa adiante |
|---|---|---|
| Fonte | cada venda: instante, loja, produto, valor e forma de pagamento | — |
| Extração | as vendas do dia, sem a forma de pagamento | a forma de pagamento |
| Transformação | o total por loja e por dia | o instante, o produto e o valor de cada venda |
| Carga | a mesma tabela de totais, gravada no armazém | nada, se a carga for fiel |
:::

Chamem-se $$X$$ as vendas na fonte, $$Y$$ o extrato e $$Z$$ a tabela de totais. A transformação só lê o extrato; não volta ao caixa para consultar o que a extração deixou para trás. Essa restrição, banal no desenho de um pipeline, tem nome na teoria das probabilidades.

:::definition{#def:cadeia title="Cadeia de Markov"}
As variáveis aleatórias $$X$$, $$Y$$ e $$Z$$ formam uma :concept[cadeia de Markov]{ref=markov-chain} nessa ordem, o que se escreve $$X \to Y \to Z$$, quando a distribuição de $$Z$$ depende de $$X$$ só por meio de $$Y$$:

$$
p(x, y, z) = p(x)\,p(y \mid x)\,p(z \mid y).
\label{eq:cadeia-de-markov}
$$
:::

Na :eqref[eq:cadeia-de-markov], o terceiro fator não menciona $$x$$: conhecido o extrato, a tabela de totais é independente da fonte. Em particular, se $$Z$$ é uma função de $$Y$$ — e uma transformação determinística é isso —, a cadeia vale [@cover2006, cap. 2].

## O que nenhuma etapa pode fazer {#desigualdade .claim depends="cadeia"}

A medida do que uma variável diz sobre outra é a :concept[informação mútua]{ref=mutual-information}, $$\I(X; Y)$$: a redução da incerteza sobre $$X$$ quando $$Y$$ é conhecido [@shannon1948]. Com ela, a restrição da seção anterior vira um limite.

::::theorem{#thm:dpi title="Desigualdade do processamento de dados"}
Se $$X \to Y \to Z$$ é uma cadeia de Markov, então

$$
\I(X; Z) \leq \I(X; Y).
\label{eq:processamento-de-dados}
$$

:::proof
Pela regra da cadeia, a informação que o par $$(Y, Z)$$ dá sobre $$X$$ decompõe-se de duas maneiras: $$\I(X; Y, Z) = \I(X; Z) + \I(X; Y \mid Z) = \I(X; Y) + \I(X; Z \mid Y)$$. Como $$X$$ e $$Z$$ são independentes dado $$Y$$, $$\I(X; Z \mid Y) = 0$$. Como a informação mútua condicional nunca é negativa, $$\I(X; Y \mid Z) \geq 0$$. Logo $$\I(X; Z) \leq \I(X; Y)$$ [@cover2006, cap. 2].
:::
::::

A tese deste ensaio é a leitura de engenharia da :eqref[eq:processamento-de-dados]: nenhuma etapa de um pipeline aumenta o que os dados dizem sobre a fonte. Uma etapa pode conservar essa informação ou perdê-la; não pode criá-la. A :concept[desigualdade]{ref=data-processing-inequality} não depende de a transformação ser boa ou ruim, simples ou sofisticada: vale para qualquer processamento que só consulte a etapa anterior. E a perda se acumula. Num pipeline de cinco etapas, o que a segunda descartou não está disponível para a quinta, por mais cuidadosas que sejam a terceira e a quarta.

A demonstração diz também quando nada se perde: a igualdade vale exatamente quando $$\I(X; Y \mid Z) = 0$$, isto é, quando, conhecido o resultado, o extrato não acrescenta nada sobre a fonte. Uma mudança de formato que possa ser desfeita está nesse caso. Uma soma, não.

## Suficiente para qual pergunta {#suficiencia .premise depends="desigualdade"}

Somar perde informação, e ainda assim é o que a diretoria pediu. A teoria tem um nome para a transformação que perde só o que não interessa. Uma função $$T$$ dos dados é uma :concept[estatística suficiente]{ref=sufficient-statistic} para um parâmetro $$\theta$$ quando conserva tudo o que os dados dizem sobre ele: $$\I(\theta; T(X)) = \I(\theta; X)$$ [@cover2006, cap. 2]. O total por loja e por dia é suficiente para a pergunta “quanto cada loja vendeu em cada dia?”; para ela, a tabela de totais vale o mesmo que o caixa inteiro.

A palavra que decide é *para*. Suficiência é uma relação entre uma transformação e uma pergunta, não uma propriedade da transformação. A mesma tabela não é suficiente para “a que horas as lojas vendem mais?”, porque o instante de cada venda ficou na transformação, nem para “que forma de pagamento está crescendo?”, porque esse campo ficou na extração. Um pipeline é projetado para as perguntas conhecidas hoje. A desigualdade do processamento de dados diz o que acontece com as de amanhã: só poderão ser respondidas com o que foi guardado.:sidenote[Esta leitura, que aplica a desigualdade ao desenho de pipelines, é do ensaio; as fontes citadas enunciam o teorema e a noção de suficiência, não a consequência de projeto.]

O laboratório abaixo monta essa cadeia sobre uma distribuição exata de vendas: escolha as etapas e a pergunta, e veja em que etapa a resposta deixa de ser possível.

::lab{widget=pipeline}

## O que isso decide num pipeline {#decisoes .application depends="suficiencia"}

**Guardar o extrato bruto.** Se toda transformação só perde, o lugar seguro para a informação é antes da primeira. Tratar a entrada como imutável e tudo o mais como derivado — recalculável a partir dela — é o que permite corrigir uma transformação errada e refazer as saídas [@kleppmann2017, cap. 10]. É a mesma separação entre :concept[registro]{ref=record} e estado que o ensaio [O registro não é a coisa](../o-registro-nao-e-a-coisa/) defende: o fato gravado é a fonte, e a tabela consultada é uma projeção dele [@helland2015].

**Uma junção não viola o teorema.** Cruzar as vendas com o cadastro de produtos produz uma tabela que diz mais do que o extrato dizia. Mas a cadeia deixou de ser $$X \to Y \to Z$$: a etapa passou a ler uma segunda fonte, e a informação nova veio dela. O teorema continua valendo para o par de fontes tomado em conjunto. O enriquecimento de dados é sempre isto: outra fonte, não uma transformação mais esperta.

**Registrar a linhagem.** Se o que uma saída informa depende do que cada etapa conservou, é preciso saber o que cada etapa fez. A :concept[linhagem]{ref=data-lineage} de um dado responde a duas perguntas distintas: de quais dados da fonte ele depende, e de que lugar da fonte foi copiado [@buneman2001]. Sem esse registro, a tabela de totais chega ao armazém sem dizer que a forma de pagamento ficou pelo caminho, e quem a consulta não tem como saber o que ela não pode responder.

**Reexecutar sem duplicar.** Guardar a entrada só resolve se as etapas puderem ser refeitas. Sistemas de processamento em lote reexecutam as tarefas que falham [@dean2008]; isso é seguro porque a entrada é imutável e a saída de uma tarefa que falhou é descartada [@kleppmann2017, cap. 10]. A carga pede o mesmo cuidado: uma operação com :concept[idempotência]{ref=idempotence}, que executada duas vezes deixa o destino como se tivesse sido executada uma, torna a repetição inofensiva [@kleppmann2017, cap. 11].

## Onde a amostragem já tinha dito isso {#sinais .example depends="desigualdade"}

O processamento de sinais conhece a mesma irreversibilidade por outro caminho. Amostrar um sinal abaixo do dobro de sua frequência mais alta faz frequências diferentes produzirem as mesmas amostras; depois disso, nenhum filtro digital distingue o que o conversor confundiu, como mostra o ensaio [Amostrar é decidir](../amostrar-e-decidir/). Um conversor analógico-digital é a primeira etapa de um pipeline, e a escolha da taxa de amostragem é a primeira decisão sobre o que as etapas seguintes nunca verão.

## Objeções {#objecoes .objection depends="decisoes"}

**“Transformar agrega valor.”** Agrega, e o teorema não diz o contrário. A desigualdade mede informação sobre a fonte, não utilidade para um fim. Uma tabela de totais é mais útil à diretoria do que um milhão de linhas de caixa, justamente porque descartou o que não interessava à pergunta dela. Limpar dados remove o que não é sinal; não acrescenta sinal. E preencher um campo ausente com um valor estimado usa um modelo, ou seja, informação que veio de outro lugar e que, como a de uma junção, precisa constar da linhagem.

**“Guardar tudo custa.”** Custa armazenamento, e há dados que não devem ser guardados: informações pessoais além do necessário, por exemplo, podem ter de ser descartadas por obrigação legal ou por política da organização. Nesse caso a perda é um requisito, e a desigualdade muda de lado: passa a ser uma garantia. O que uma etapa de fato descartou, nenhuma etapa posterior recupera. A dificuldade prática é o “de fato”: um campo removido que continua dedutível dos campos que ficaram não foi descartado.

**“A hipótese de Markov não se sustenta.”** Em pipelines reais, etapas consultam tabelas de referência, a hora do relógio, o resultado de execuções anteriores. Cada uma dessas entradas laterais rompe a cadeia, e o teorema, como enunciado, deixa de se aplicar à etapa. Isso não o torna irrelevante; indica onde olhar. Uma etapa cuja saída depende de algo além da entrada declarada não pode ser refeita só com essa entrada, e é exatamente esse algo que a linhagem precisa registrar.

## O que uma etapa pode descartar {#criterio .conclusion depends="objecoes"}

Do teorema sai um critério. Antes de uma etapa descartar um campo ou somar linhas, três perguntas: para quais perguntas a saída continua suficiente; se o que foi descartado continua guardado antes da etapa, e por quanto tempo; e se o descarte está registrado onde quem consulta a saída possa ver. Uma etapa que responde às três é uma decisão. Uma que não responde é uma perda que ninguém escolheu.

Resta a pergunta do estrato do valor: quem paga. Guardar o extrato bruto custa a quem opera o pipeline, hoje. Não guardar custa a quem fizer, daqui a um ano, uma pergunta que ninguém previu — e que descobrirá, pela desigualdade, que a resposta existiu e foi somada.

::bibliography
