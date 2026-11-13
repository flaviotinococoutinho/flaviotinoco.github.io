---
title: 'O ótimo é inimigo do prazo: otimização combinatória, aproximação e satisficing em engenharia'
subtitle: Quando medir o gargalo dispensa o algoritmo, quando a estrutura entrega o ótimo e quando parar é a escolha racional
description: 'Da lei de Amdahl à NP-completude, aos algoritmos de aproximação e ao satisficing de Simon: um critério formal para decidir o que otimizar em software e onde parar.'
lang: pt-BR
translationKey: the-optimum-is-the-enemy-of-the-deadline
slug: o-otimo-e-inimigo-do-prazo
stratum: theory
bridgesTo: formal
domains: [computer-science, software-engineering, mathematics]
concepts: [optimization, combinatorial-optimization, computational-complexity, amdahls-law, approximation-algorithm, heuristic, satisficing, huffman-code]
published: 2026-11-13
revisions:
  - date: 2026-11-13
    note: Versão inicial no site.
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  Este ensaio atravessa do estrato teórico ao formal examinando o que significa otimizar em engenharia de
  software e por que a busca indiscriminada pelo ótimo costuma produzir atraso ou desperdício. Parte da distinção
  entre o verbo frouxo do cotidiano técnico — tornar um trecho de código um pouco mais rápido — e o problema
  matemático de otimização, que exige declarar explicitamente um conjunto viável de restrições e uma função
  objetivo. Antes de escolher qualquer algoritmo, aplica a lei de Amdahl para mostrar que acelerar uma fração
  pequena do sistema tem teto rígido de retorno, explicando matematicamente o alerta clássico de Knuth contra a
  otimização prematura sem perfilamento prévio. Em seguida, entra na otimização combinatória presente na rotina
  do software — resolução de dependências de pacotes (SAT), alocação de contêineres em máquinas e escolha da
  ordem de junções num planejador de consultas —, separando os raros casos em que a estrutura algébrica permite
  que uma escolha gulosa atinja o ótimo exato, como nos códigos de Huffman, daqueles em que a NP-completude fecha
  a busca exata em grande escala. Compara então duas saídas honestas: algoritmos de aproximação com razão de pior
  caso provada e heurísticas orientadas pelo satisficing de Herbert Simon. Conclui que a maturidade em engenharia
  consiste em casar a garantia formal com o orçamento real de decisão.
keywords: [otimização combinatória, lei de Amdahl, algoritmo de aproximação, satisficing, engenharia de software]
provenance:
  assistance: generated
  reviewed: false
  note: Redigido com assistência de IA (Gemini) segundo o programa editorial do site; fontes primárias e teoremas conferidos em 13 de novembro de 2026; aguarda revisão do autor.
draft: false
---

Poucas palavras sofrem tanta erosão no vocabulário diário de desenvolvimento quanto “otimizar”. Chama-se de otimização trocar uma lista encadeada por um vetor contíguo, remover uma consulta repetida, comprimir imagens ou reescrever um serviço inteiro em outra linguagem — muitas vezes antes de medir onde o tempo ou o dinheiro estão sendo gastos. No extremo oposto, especificações de produto pedem candidamente “a alocação ótima de rotas”, “a seleção ótima de versões compatíveis” ou “o agrupamento ótimo de tarefas”, sem notar que acabaram de enunciar problemas para os quais nenhum computador conhecido encontra o ótimo exato em tempo razoável quando a entrada cresce. Este ensaio percorre a passagem do estrato teórico ao formal para pôr ordem nos dois excessos: primeiro delimita onde vale a pena mexer; depois separa o ótimo tratável, a aproximação com garantia e a parada deliberada no suficiente.

::toc

## Dizer “melhor” exige duas declarações {#dizer-melhor .definition}

Fora da matemática, “melhorar um sistema” costuma esconder objetivos rivais: menor latência mediana, menor cauda no percentil 99, menor consumo de memória, menor fatura mensal em nuvem ou menor esforço cognitivo da equipe que dará manutenção. Reduzir um deles frequentemente agrava outro — um cache agressivo encurta a leitura ao preço de memória e de invalidação mais delicada. Por isso a teoria começa forçando quem projeta a separar o que não pode ser violado do que se deseja minimizar [@boyd2004, cap. 1; @papadimitriou1982, cap. 1].

:::definition{#def:otimizacao title="Problema de otimização"}
Dado um conjunto de alternativas $$X$$, um subconjunto viável $$\F \subseteq X$$ definido pelas restrições que toda solução admissível precisa cumprir e uma função objetivo $$f : \F \to \R$$ que mede o custo de cada alternativa, resolver o problema de :concept[otimização]{ref=optimization} consiste em encontrar

$$
x^{*} = \operatorname*{arg\,min}_{x \in \F} f(x),
\label{eq:otimizacao}
$$

isto é, um elemento viável $$x^{*} \in \F$$ tal que $$f(x^{*}) \leq f(x)$$ para todo $$x \in \F$$.
:::

A :eqref[eq:otimizacao] parece austera, mas já desfaz metade das discussões improdutivas numa revisão técnica. Dois engenheiros que discordam sobre qual arquitetura é “mais otimizada” quase sempre estão resolvendo problemas com conjuntos viáveis diferentes (um trata o orçamento máximo de 160 KiB por página como restrição dura; o outro o trata como preferência negociável) ou com funções objetivo diferentes (tempo de compilação contra tempo da primeira pintura no cliente). Onde há mais de um objetivo irredutível, não existe um único mínimo escalar sem que alguém atribua pesos — escolha de valor, não de álgebra [@boyd2004, cap. 4].

## O teto do gargalo {#teto-de-amdahl .premise depends="dizer-melhor"}

Mesmo depois de fixada uma grandeza clara — digamos, o tempo de resposta de uma requisição —, a pergunta seguinte ainda não é qual algoritmo adotar, e sim **em qual parte do sistema intervir**. Em 1967, num artigo de três páginas sobre os limites do processamento paralelo em relação a um processador sequencial, Gene Amdahl enunciou a conta elementar que governa toda melhoria localizada [@amdahl1967].

::::proposition{#prop:amdahl title="Lei de Amdahl"}
Se uma parte de um sistema responde pela fração $$p \in [0, 1]$$ do custo total original e uma intervenção reduz o custo dessa parte por um fator $$s \geq 1$$ sem alterar o restante, a aceleração global $$S(s)$$ satisfaz

$$
S(s) = \frac{1}{(1 - p) + \dfrac{p}{s}} \leq \frac{1}{1 - p}.
\label{eq:amdahl}
$$

:::proof
Seja $$T_0 > 0$$ o custo original. A fração intocada conserva o custo $$(1 - p)T_0$$, e a fração modificada passa a custar $$(p/s)T_0$$. A razão entre o custo inicial e o novo total $$(1 - p + p/s)T_0$$ fornece a igualdade da :eqref[eq:amdahl]. Como $$p/s > 0$$ para todo fator finito, suprimir esse termo positivo do denominador só pode aumentar a fração, resultando na cota superior $$1/(1 - p)$$.
:::
::::

A consequência prática da :concept[lei de Amdahl]{ref=amdahls-law} é implacável. Se uma rotina de serialização consome 5 % do tempo de uma transação e uma semana de trabalho em baixo nível a torna dez vezes mais rápida, a requisição inteira acelera por $$1 / (0{,}95 + 0{,}005) \approx 1{,}047$$: menos de 5 %. Ainda que um milagre eliminasse completamente aquela rotina, o ganho jamais passaria de $$1 / 0{,}95 \approx 1{,}053$$. Em compensação, cortar pela metade uma consulta ao banco que responde por 80 % do tempo rende de imediato $$S = 1 / (0{,}20 + 0{,}40) \approx 1{,}67$$.:sidenote[A conta vale para qualquer recurso aditivo sujeito a orçamento — bytes transferidos numa página, consumo energético, tempo de esteira de integração contínua. É por essa razão aritmética que o projeto deste site mede custos fixos repetidos em todas as páginas antes de micro-otimizar trechos isolados.] Medir antes de reescrever não é prudência moral; é verificar se o teto de Amdahl justifica o esforço.

## Quando o discreto explode — e quando cede {#discreto .claim depends="dizer-melhor"}

Uma vez localizado um gargalo real onde a fração dominante é grande, muitos dos problemas centrais do software revelam-se instâncias de :concept[otimização combinatória]{ref=combinatorial-optimization}: o conjunto viável é finito, mas cresce exponencialmente com o tamanho da entrada [@papadimitriou1982]. Eles aparecem disfarçados sob ferramentas cotidianas:

- **Resolução de pacotes e versões.** Decidir se existe um conjunto de versões de bibliotecas que satisfaça simultaneamente todas as restrições de compatibilidade e conflito de um projeto reduz-se à satisfatibilidade booleana (SAT, do inglês :foreign[Boolean satisfiability]{lang=en}), o problema inaugural da NP-completude demonstrado por @cook1971.
- **Empacotamento de cargas em servidores.** Distribuir contêineres com demandas de memória e processador no menor número possível de nós físicos é o problema clássico de :foreign[bin packing]{lang=en}, NP-difícil no caso geral [@garey1979].
- **Planejamento de consultas relacionais.** Escolher a árvore de execução de menor custo estimado para unir uma dezena de tabelas envolve um espaço de ordens de junção que cresce fatorialmente com o número de tabelas.

Nem todo espaço exponencial, porém, é intratável. O divisor de águas da ciência da computação passa pela estrutura matemática das restrições e do objetivo. Em [Escolher custa bits](../escolher-custa-bits/), o algoritmo de Huffman encontrou, em tempo $$O(m \log m)$$, a árvore de prefixo de menor comprimento médio entre um número astronômico de árvores possíveis [@huffman1952; @cover2006, cap. 5]. Ali, duas propriedades raras — subestrutura ótima e escolha gulosa segura — permitem decidir localmente, passo a passo, sem jamais precisar voltar atrás. Caminhos mínimos com pesos não negativos (Dijkstra) e árvores geradoras mínimas gozam de privilégio semelhante.

Basta uma pequena mudança no enunciado para o chão ceder. Se além de minimizar o atraso quisermos visitar um conjunto de pontos sem repetir paradas e voltar à origem, caímos no caixeiro-viajante; se cada item tiver peso e valor indivisíveis sob limite rígido de capacidade, caímos na mochila 0–1 [@garey1979]. Nesses problemas, a :concept[complexidade computacional]{ref=computational-complexity} ensina uma lição humilde: salvo colapso improvável de $$\mathrm{P} \neq \mathrm{NP}$$, nenhum algoritmo exato escapará do crescimento superpolinomial no pior caso [@cook1971; @garey1979]. Exigir “o ótimo absoluto em milissegundos para qualquer entrada” não é meta ambiciosa; é contradição nos termos.

## Três saídas diante da intratabilidade {#tres-saidas .application depends="teto-de-amdahl,discreto"}

Quando a busca exata custa caro demais para o prazo da resposta ou do projeto, restam três caminhos distintos que a prática costuma embaralhar sob o mesmo rótulo de “heurística”. Convém separá-los pelo que cada um promete.

:::figure{#tab:regimes kind="table" title="Regimes de decisão diante de um problema de otimização" source="Elaborado pelo autor (2026), a partir de Garey e Johnson (1979), Williamson e Shmoys (2011) e Simon (1956)."}
| Regime | Tempo de execução | O que garante sobre o resultado | Exemplo típico em software |
|---|---|---|---|
| Algoritmo exato | Polinomial só com estrutura especial; exponencial em NP-difíceis | Atinge o custo mínimo ótimo | :concept[Código de Huffman]{ref=huffman-code}; resolvedor SAT em instâncias pequenas |
| :concept[Algoritmo de aproximação]{ref=approximation-algorithm} | Polinomial | Cota provada no pior caso: $$f(x) \leq \rho\,f(x^{*})$$ | Alocação gulosa ordenada em escalonamento de cargas |
| :concept[Heurística]{ref=heuristic} e :concept[satisficing]{ref=satisficing} | Limitado por orçamento fixo | Nenhuma cota universal; para ao atingir meta aceitável | Planejador de consultas relacionais com corte de tempo; políticas de despejo de cache |
:::

O segundo regime preserva o rigor do estrato formal mesmo sem atingir o ótimo. Um algoritmo de aproximação multiplicativa corre em tempo polinomial e prova um teorema sobre o próprio erro máximo [@williamson2011, cap. 1]: para toda instância do problema de minimização, a solução devolvida satisfaz

$$
f(x) \leq \rho\, f(x^{*}), \qquad \rho \geq 1.
\label{eq:aproximacao}
$$

Na :eqref[eq:aproximacao], a razão $$\rho$$ não é uma média empírica observada em testes amigáveis; é uma fronteira intransponível até para a entrada mais adversa. Distribuir tarefas independentes pela máquina atualmente menos carregada (*list scheduling* de Graham), por exemplo, jamais excede $$2 - 1/m$$ vezes a duração ótima em $$m$$ máquinas idênticas [@williamson2011, cap. 2]. Paga-se uma margem conhecida de subotimalidade para comprar previsibilidade estrita de tempo.

O terceiro regime abandona a garantia de pior caso porque, em muitos problemas reais, ou até aproximar dentro de constante baixa é NP-difícil, ou a própria função de custo é apenas um modelo grosseiro de um ambiente incerto [@polya1945; @simon1956]. Em 1956, Herbert Simon observou que agentes reais raramente dispõem nem do catálogo completo de alternativas, nem do tempo computacional para avaliá-lo: em vez de maximizar, fixam um **nível de aspiração** — latência abaixo de 100 ms, pacote de JavaScript inicial abaixo de 12 KiB, plano de consulta suficientemente barato — e adotam a primeira alternativa viável que cumpra $$f(x) \leq \tau$$ [@simon1956]. É o satisficing: parar no suficientemente bom não por desleixo, mas porque o custo de continuar procurando supera o ganho esperado da margem restante até o ótimo.

## Objeções {#objecoes .objection depends="tres-saidas"}

**Solucionadores exatos modernos resolvem instâncias enormes.** É verdade, e ignorá-lo seria erro simétrico. A NP-completude descreve o pior caso assintótico, não toda instância prática: solucionadores modernos de SAT e de programação linear inteira mista exploram simetrias, propagação de restrições e cortes para resolver exatamente problemas industriais com centenas de milhares de variáveis — como fazem gerenciadores de pacotes contemporâneos. Quando o problema roda fora do caminho crítico ou as instâncias reais têm estrutura favorável, delegar a um solucionador exato costuma ser mais simples e mais seguro do que inventar uma heurística caseira cheia de casos de borda.

**O ótimo de um modelo errado pode destruir a folga do sistema.** Otimizar até a última gota contra uma distribuição histórica torna a solução frágil assim que o tráfego muda de forma: filas dimensionadas a 99 % de utilização explodem ao menor desvio de variância, e interfaces afinadas apenas para o caso médio punem severamente exceções críticas [@simon1969]. Parte do que parece desperdício num plano “não ótimo” funciona, na verdade, como margem de absorção contra o que o modelo omitiu.

## Onde gastar o rigor {#conclusao .conclusion depends="tres-saidas,objecoes"}

Uma engenharia madura percorre essas perguntas em ordem estrita. Primeiro mede o sistema para descobrir a fração dominante da :eqref[eq:amdahl]: onde essa fração é irrisória, a melhor otimização é não tocar no código e preservar sua legibilidade. Segundo explicita as restrições e o objetivo da :eqref[eq:otimizacao], convertendo desejos vagos em orçamentos verificáveis — exatamente o papel dos limites automáticos de bytes, contraste e tempo neste próprio site. Terceiro examina a estrutura do subproblema: se houver algoritmo exato limpo ou solucionador pronto que caiba no orçamento de tempo, usa-o; se o pior caso importar num caminho crítico difícil, procura uma garantia como a da :eqref[eq:aproximacao]; se o próprio modelo de custo for aproximado e o tempo de engenharia escasso, define um limiar claro de satisficing e encerra a busca quando ele é atingido [@simon1956; @williamson2011].

Saber demonstrar um ótimo e saber recusar a busca por ele não são atitudes opostas. Pertencem à mesma disciplina: usar o estrato formal para calcular até onde a conta compensa.

::concept-map{focus=combinatorial-optimization depth=1}

::bibliography
