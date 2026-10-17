---
stratum: formal
lang: pt-BR
title: Formal
question: O que se segue necessariamente?
method: prova, algoritmo e determinismo
description: O terceiro estrato. Escrever o modelo numa linguagem precisa, para que suas consequências possam ser provadas, calculadas e verificadas.
---

No estrato formal, o modelo é reescrito numa linguagem em que nada fica implícito: definições exatas, axiomas
declarados, regras de inferência conhecidas. O ganho é que as consequências deixam de depender de quem as lê. Um teorema
provado vale para qualquer leitor que aceite as premissas; um algoritmo determinístico produz a mesma saída para a mesma
entrada, em qualquer máquina.

O método é a prova e o algoritmo. Provar é mostrar que uma afirmação se segue das premissas; implementar é tornar essa
consequência calculável e, por isso, verificável por terceiros. Boa parte dos laboratórios do site pertence a este
estrato: cada um torna tangível um teorema ou uma lei, e o leitor pode variar os parâmetros para ver onde a afirmação se
sustenta e onde as hipóteses deixam de valer.

Na simbologia do site, o formal é o **triângulo**, o 2-simplexo: o polígono rígido mais simples. Três pontos ligados
dois a dois não se deformam sem que algum lado mude de comprimento, ao passo que um quadrilátero articulado nos vértices
pode se deformar. Em coordenadas, o simplexo de dimensão $$k$$ é o conjunto

$$
\Delta^k = \{\, x \in \mathbb{R}^{k+1} \mid x_i \ge 0,\ x_0 + x_1 + \dots + x_k = 1 \,\}
$$

e é ele que serve de emblema aos quatro estratos.

O rigor tem limites que convém dizer. Uma prova garante a conclusão apenas relativamente às premissas; a escolha das
premissas pertence aos estratos anteriores, e o uso do resultado, ao seguinte.
