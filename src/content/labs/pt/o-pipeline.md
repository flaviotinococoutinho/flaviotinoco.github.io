---
title: O pipeline
description: 'Monte um pipeline de ETL sobre 144 vendas e acompanhe, etapa por etapa, o que a saída ainda diz sobre a fonte e sobre uma pergunta.'
lang: pt-BR
translationKey: the-pipeline
slug: o-pipeline
stratum: formal
domains: [data-engineering, information-theory, information-systems]
concepts: [etl, data-processing-inequality, markov-chain, mutual-information, sufficient-statistic]
published: 2026-11-15
revisions:
  - date: 2026-11-15
    note: Versão inicial, a partir do exemplo do ensaio “O pipeline não cria informação”.
  - date: 2026-11-16
    note: As observações falam do indicador em contorno e preenchimento, que substituiu as duas barras.
epistemic:
  confidence: almost-certain
  evidence: proof
abstract: >-
  Este laboratório executa o exemplo do ensaio “O pipeline não cria informação” sobre uma distribuição exata.
  A fonte é uma venda descrita por quatro campos — loja, período do dia, forma de pagamento e valor —, com 144
  resultados possíveis e campos que dependem uns dos outros. Quem usa o laboratório monta um pipeline de até
  seis etapas, escolhidas entre descartar um campo, agrupar o período em dia e noite, introduzir um erro de
  digitação na loja e reformatar, e escolhe a pergunta que alguém fará à saída. Depois de cada etapa, o
  núcleo de teoria da informação calcula duas informações mútuas: entre a saída e a venda inteira, e entre a
  saída e a pergunta. Nenhuma das duas sobe, o que é a desigualdade do processamento de dados; a saída é
  suficiente para a pergunta quando a segunda continua igual à entropia da pergunta. O texto enuncia a
  desigualdade, propõe uma sequência de observações que reproduz a tabela do ensaio e registra os limites do
  modelo: a distribuição é inventada, as etapas são poucas e uma junção com outra fonte fica de fora, porque
  quebra a cadeia.
keywords: [ETL, desigualdade do processamento de dados, informação mútua, estatística suficiente]
draft: false
kernel: information
widget: pipeline
theorem: Desigualdade do processamento de dados
---

Uma rede de lojas registra cada venda no caixa; toda noite, um processo de extrair, transformar e carregar (:concept[ETL]{ref=etl}, do inglês :foreign[extract, transform, load]{lang=en}) leva as vendas a um armazém de dados. O ensaio [O pipeline não cria informação](../../ensaios/o-pipeline-nao-cria-informacao/) argumenta que nenhuma etapa desse caminho aumenta o que os dados dizem sobre a fonte. Este laboratório deixa montar o caminho e medir.

## Intuição

A fonte $$X$$ é uma venda: loja (quatro), período do dia (quatro), forma de pagamento (três) e valor (três), 144 combinações com probabilidades fixas. Os campos não são independentes: cada loja tem seus horários de movimento, e vendas pequenas são pagas em dinheiro com mais frequência. Por isso descartar um campo também apaga parte do que ele dizia sobre os outros.

Cada etapa lê só a saída da anterior. A venda, a saída da primeira etapa e a da segunda formam então uma :concept[cadeia de Markov]{ref=markov-chain}, e a :concept[desigualdade do processamento de dados]{ref=data-processing-inequality} vale a cada passo [@cover2006, cap. 2]:

$$
\I(X; Y_{k+1}) \leq \I(X; Y_k).
\label{eq:processamento-de-dados-lab}
$$

O laboratório calcula a :concept[informação mútua]{ref=mutual-information} exata, não uma estimativa: o modelo carrega a distribuição conjunta da venda e da saída ao longo do pipeline, e o núcleo de teoria da informação faz a soma. A mesma desigualdade vale para a pergunta $$Q$$, que é uma função da venda. A saída é uma :concept[estatística suficiente]{ref=sufficient-statistic} para a pergunta quando $$\I(Q; Y_n) = \H(Q)$$: ela responde tão bem quanto a venda inteira respondia.

## O que observar

O pipeline começa com as três etapas da tabela do ensaio: descartar o pagamento, o período e o valor.

1. Com a pergunta “a loja”, o preenchimento não encolhe em nenhuma etapa: o total por loja é suficiente para saber a loja. O contorno, a venda inteira, encolhe a cada etapa.
2. Troque a pergunta para “a forma de pagamento”. A perda aparece na primeira etapa, marcada com ✕, mas não é total: restam 0,12 bits, porque o valor ainda diz algo sobre como a venda foi paga. Na terceira etapa, quando o valor também sai, não resta nada. O que a extração deixou para trás nenhuma etapa seguinte recupera.
3. Troque para “o valor”. Nada se perde até a terceira etapa, e ali a informação cai a zero: o pagamento, que dizia algo sobre o valor, já tinha saído na primeira. Com o pipeline reduzido a “descartar o valor”, sobram 0,12 bits sobre o valor, guardados no pagamento.
4. Volte para “a loja” e acrescente um erro de digitação. Nenhum campo some, a saída tem as mesmas 144 possibilidades, e mesmo assim deixa de ser suficiente: um canal com ruído também é uma etapa que perde.
5. Acrescente “reformatar” em qualquer ponto. As duas medidas ficam iguais: uma etapa reversível é o caso em que a desigualdade vira igualdade.
6. Tente fazer o contorno ou o preenchimento crescer. Nenhuma combinação de etapas consegue.

## Limites do modelo

A distribuição é inventada para o exemplo; os números mudam com outra, a desigualdade não. As etapas são poucas e simples. Falta, de propósito, a junção com outra tabela: ela acrescenta informação porque acrescenta uma fonte, e então a saída deixa de depender da venda só pela etapa anterior, como o ensaio discute. O erro de digitação troca a loja por outra ao acaso com probabilidade de 10 %, um modelo de ruído escolhido por ser o mais simples, não por descrever um caixa real [@kimball2004].

::bibliography
