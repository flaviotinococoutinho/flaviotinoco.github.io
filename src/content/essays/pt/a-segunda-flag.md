---
title: 'A segunda flag: estados impossíveis e máquinas de estado'
subtitle: O que n booleanos permitem representar, o que o domínio precisa e quanto custa a diferença
description: 'Por que flags booleanas admitem estados impossíveis, o que um autômato finito garante no lugar delas e quando uma máquina de estados vale o custo.'
lang: pt-BR
translationKey: the-second-flag
slug: a-segunda-flag
stratum: formal
bridgesTo: value
domains: [computer-science, software-engineering, information-theory]
concepts: [state, finite-state-machine, statechart, redundancy, abstraction, information-hiding]
published: 2026-11-10
revisions:
  - date: 2026-11-10
    note: Versão inicial no site, reescrita a partir do artigo e da palestra apresentados pelo autor em 23 de novembro de 2025.
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  Este ensaio parte de um problema comum de engenharia de software, o de objetos cuja situação é guardada em
  várias flags booleanas, e o atravessa do estrato formal ao do valor. Um reprodutor de vídeo com três flags
  admite oito configurações para quatro situações reais, e duas chamadas de método bastam para deixá-lo tocando
  e pausado ao mesmo tempo. O ensaio generaliza a conta: com n flags e k situações mutuamente exclusivas, há
  2^n − k configurações sem significado, e a redundância de Shannon mede a fração da representação que não
  informa nada. Argumenta que as flags têm a redundância de um código sem o verificador que a tornaria útil.
  Apresenta então a definição de autômato finito determinístico, em que o sistema está em exatamente um estado
  e uma função de transição determina o seguinte, e sustenta que a tabela dessa função é a especificação do
  comportamento: dezesseis células no exemplo, das quais seis são decisões que o código com flags deixava
  implícitas. Compara três maneiras de escrever a tabela, a enumeração com função pura, o padrão State e a
  biblioteca declarativa, e registra que o Spring Statemachine, usado no exemplo, deixou de ser mantido como
  código aberto. Discute objeções: flags independentes são legítimas, máquinas planas também explodem, e a
  tabela não resolve concorrência nem persistência. Conclui com um critério de escolha e com o custo que ele
  impõe a quem mantém o sistema.
keywords: [máquina de estados, flags booleanas, autômato finito, redundância, engenharia de software]
provenance:
  assistance: generated
  reviewed: false
  note: Redigido com assistência de IA (Claude) a partir do artigo, dos slides e do código de demonstração que o autor apresentou em 23 de novembro de 2025; fontes conferidas nos originais em 10 de novembro de 2026; aguarda revisão do autor.
draft: false
---

Um reprodutor de vídeo está parado, tocando, pausado ou rebobinando: quatro situações, uma de cada vez. O código que o controla costuma começar com um booleano — está tocando ou não — e crescer com outro, e mais outro. Este ensaio examina esse crescimento: conta quantas configurações os booleanos permitem, compara esse número com o que o domínio precisa e mostra o que uma máquina de estados explícita garante no lugar deles. É uma travessia do estrato formal ao do valor: de uma definição da teoria dos autômatos a uma decisão de engenharia, com o seu custo.:sidenote[Este texto reescreve um artigo e uma palestra do autor, de 23 de novembro de 2025. Os exemplos em Java vêm do código de demonstração da palestra.]

::toc

## Três flags, oito configurações {#tres-flags .example}

A versão de partida guarda três flags e, em cada método, acerta as que quem o escreveu lembrou de acertar. O trecho abaixo condensa o código de demonstração:

```java
private boolean isPlaying;
private boolean isPaused;
private boolean isRewinding;

public void play() {
    isPlaying = true;
    isPaused = false;
    isRewinding = false;
}

public void pause() {
    isPaused = true;       // isPlaying continua verdadeiro
}

public void rewind() {     // requisito acrescentado depois
    isRewinding = true;
    isPlaying = false;     // isPaused fica como estava
}
```

Nenhuma linha está errada isoladamente. Mas três chamadas em sequência levam o objeto a duas configurações que não descrevem situação alguma:

:::figure{#tab:rastro kind="table" title="Rastro das flags em três chamadas" source="Elaborado pelo autor (2026), a partir do código de demonstração da palestra."}
| Chamada | `isPlaying` | `isPaused` | `isRewinding` | Situação do reprodutor |
|---|---|---|---|---|
| (início) | falso | falso | falso | parado |
| `play()` | verdadeiro | falso | falso | tocando |
| `pause()` | verdadeiro | verdadeiro | falso | nenhuma |
| `rewind()` | falso | verdadeiro | verdadeiro | nenhuma |
:::

O compilador aceita, a execução aceita, e os testes do código de demonstração registram o fato. O defeito não está em `pause()` nem em `rewind()`; está na representação. Três booleanos independentes admitem $$2^3 = 8$$ configurações, e o domínio tem quatro situações. As outras quatro não correspondem a nada, mas podem ser escritas na memória — e cada método novo é uma oportunidade de escrevê-las.

## Contar o que a representação permite {#contar .premise depends="tres-flags"}

O caso geral é uma conta. Se um domínio tem $$k$$ situações mutuamente exclusivas e o código as guarda em $$n$$ flags independentes, há $$2^n$$ configurações representáveis e, no melhor caso, $$k$$ delas têm significado. As outras $$2^n - k$$ são estados impossíveis no domínio e possíveis na memória. Cada flag nova dobra o total; cada situação nova do domínio acrescenta uma.

:::figure{#tab:contagem kind="table" title="Configurações representáveis e situações do domínio" source="Elaborado pelo autor (2026)."}
| Representação | Situações ($$k$$) | Flags ($$n$$) | Configurações ($$2^n$$) | Sem significado | Redundância mínima |
|---|---|---|---|---|---|
| Reprodutor, três flags | 4 | 3 | 8 | 4 | 0,33 |
| Reprodutor, uma flag por situação | 4 | 4 | 16 | 12 | 0,50 |
| Pagamento, uma flag por situação | 11 | 11 | 2 048 | 2 037 | 0,69 |
:::

O pagamento da última linha é o do artigo de origem: um pagamento com cartão que passa por onze situações, de “novo” a “reembolsado”, com autorizações, capturas e reembolsos pendentes ou recusados no caminho.

A teoria da informação dá nome à última coluna. A :concept[redundância]{ref=redundancy} de uma fonte é a fração da capacidade de representação que ela não usa [@shannon1948]. Tome-se como fonte a situação do objeto, $$X$$, e como alfabeto as $$2^n$$ configurações das flags. Se o código estiver correto, só $$k$$ configurações ocorrem, a entropia de $$X$$ não passa de $$\log_2 k$$, e

$$
R = 1 - \frac{\H(X)}{\log_2 \lvert \mathcal{X} \rvert} \geq 1 - \frac{\log_2 k}{n}.
\label{eq:redundancia}
$$

Pela :eqref[eq:redundancia], o reprodutor de três flags gasta três bits para dizer o que cabe em dois: um terço da representação não informa nada. Redundância não é defeito em si; é ela que permite detectar e corrigir erros num canal com ruído. Mas só funciona porque o receptor conhece o código e recusa as palavras que não pertencem a ele. As flags têm a redundância sem o verificador: uma configuração sem significado é aceita em silêncio, e cada método que as lê precisa refazer, por conta própria, a pergunta “esta combinação é válida?”. Cada pergunta é um desvio a mais no código, e cada desvio, um caminho a mais para testar — o que a complexidade ciclomática mede [@mccabe1976].

:::aside
**Um indicador que voltou a zero.** No acelerador médico Therac-25, uma variável de um byte servia de indicador: zero significava que os parâmetros estavam consistentes, e o feixe não era inibido. O código a incrementava a cada passagem por uma rotina, em vez de lhe atribuir um valor fixo; a cada 256 passagens ela voltava a zero, e uma verificação de posição deixava de ser feita [@leveson1993, p. 34]. Os autores da investigação advertem, porém, que a lição do caso não é um defeito de código em particular, e sim um projeto que confiou a segurança ao software [@leveson1993, p. 29].
:::

## O que é um estado {#estado .definition depends="contar"}

A saída não é vigiar melhor as flags; é trocar a pergunta. Um :concept[estado]{ref=state} é o que um sistema precisa lembrar da própria história para decidir como responder ao que vier: guardar a parte relevante do passado, e só ela, é o seu propósito [@hopcroft2007, cap. 1]. É uma :concept[abstração]{ref=abstraction} no sentido estrito, porque omite o que não importa para o comportamento futuro. O reprodutor não precisa saber quantas vezes foi pausado; precisa saber se está pausado. A teoria dos autômatos fixou essa ideia numa definição [@rabin1959], aqui na notação dos livros-texto [@hopcroft2007, cap. 2].

:::definition{#def:afd title="Autômato finito determinístico"}
Um autômato finito determinístico é uma quíntupla

$$
M = (Q, \Sigma, \delta, q_0, F),
\label{eq:automato}
$$

em que $$Q$$ é um conjunto finito de estados, $$\Sigma$$ é um conjunto finito de símbolos de entrada (os eventos), $$\delta : Q \times \Sigma \to Q$$ é a função de transição, $$q_0 \in Q$$ é o estado inicial e $$F \subseteq Q$$ é o conjunto dos estados finais.
:::

Duas propriedades da :ref[def:afd] fazem o trabalho que as flags deixavam por fazer. A primeira: o sistema está, a cada instante, em exatamente um elemento de $$Q$$. Com $$Q$$ igual às quatro situações do reprodutor, “tocando e pausado” não é um valor proibido; é um valor que não existe. A segunda: $$\delta$$ é uma função. O estado atual e o evento determinam o estado seguinte, sem ambiguidade. Estendida a sequências de eventos, ela diz onde o sistema está depois de uma história inteira:

$$
\hat{\delta}(q, \varepsilon) = q, \qquad \hat{\delta}(q, wa) = \delta\bigl(\hat{\delta}(q, w),\, a\bigr).
\label{eq:transicao-estendida}
$$

A :eqref[eq:transicao-estendida] é uma dobra: o estado atual resulta de aplicar $$\delta$$, evento a evento, a partir do estado inicial. Segue-se que a mesma história leva sempre ao mesmo estado, e que guardar os eventos basta para reconstruir, auditar ou depurar qualquer estado passado.

## A tabela de transições {#tabela .claim depends="estado"}

Sobre conjuntos finitos, uma função é uma tabela. A do reprodutor tem quatro linhas, quatro colunas e dezesseis células:

:::figure{#tab:transicoes kind="table" title="Função de transição do reprodutor de vídeo" source="Elaborado pelo autor (2026), a partir da configuração declarativa do código de demonstração."}
| Estado atual | `PLAY` | `PAUSE` | `STOP` | `REWIND` |
|---|---|---|---|---|
| parado | tocando | — | — | — |
| tocando | — | pausado | parado | rebobinando |
| pausado | tocando | — | parado | rebobinando |
| rebobinando | tocando | pausado | parado | — |
:::

As dez células preenchidas são as transições; as seis vazias, os eventos que o estado não aceita. A tese deste ensaio é que essa tabela, e não os condicionais, é a especificação do comportamento — e que escrevê-la num só lugar muda o que pode dar errado. Com flags, a regra “uma situação de cada vez” é uma convenção repetida em cada método; com um tipo que tem exatamente quatro valores, é uma propriedade da representação. É o princípio de tornar irrepresentáveis os estados ilegais [@minsky2011], parente de outro: analisar uma vez, na fronteira, em vez de validar em toda parte [@king2019]. E é :concept[ocultação de informação]{ref=information-hiding} no sentido de Parnas: a codificação do estado é uma decisão de projeto sujeita a mudança, e quem envia eventos não precisa conhecê-la [@parnas1972].

A :ref[def:afd] pede uma função total, e a tabela tem células vazias. Cada uma delas é uma decisão: recusar o evento, ignorá-lo ou falhar. As duas versões com estado explícito do código de demonstração decidiram de modo diferente sem que isso fosse anotado em parte alguma: numa, `PLAY` durante a reprodução é ignorado em silêncio; na outra, é recusado, e quem o enviou fica sabendo. Nenhuma das duas está errada. Mas só com a tabela à vista a divergência aparece como o que é: células em que faltou decidir.

## Três formas de escrever a tabela {#implementacoes .application depends="tabela"}

**Enumeração e função pura.** Em Java, a tabela cabe numa função sobre dois tipos enumerados:

```java
enum State { STOPPED, PLAYING, PAUSED, REWINDING }
enum Event { PLAY, PAUSE, STOP, REWIND }

static Optional<State> next(State state, Event event) {
    return switch (state) {
        case STOPPED -> switch (event) {
            case PLAY -> Optional.of(State.PLAYING);
            case PAUSE, STOP, REWIND -> Optional.empty();
        };
        case PLAYING -> switch (event) {
            case PAUSE -> Optional.of(State.PAUSED);
            case STOP -> Optional.of(State.STOPPED);
            case REWIND -> Optional.of(State.REWINDING);
            case PLAY -> Optional.empty();
        };
        case PAUSED -> switch (event) {
            case PLAY -> Optional.of(State.PLAYING);
            case STOP -> Optional.of(State.STOPPED);
            case REWIND -> Optional.of(State.REWINDING);
            case PAUSE -> Optional.empty();
        };
        case REWINDING -> switch (event) {
            case PLAY -> Optional.of(State.PLAYING);
            case PAUSE -> Optional.of(State.PAUSED);
            case STOP -> Optional.of(State.STOPPED);
            case REWIND -> Optional.empty();
        };
    };
}
```

Uma expressão `switch` sem ramo padrão precisa cobrir todos os valores: acrescentar um estado sem dizer o que ele faz com cada evento não compila.:sidenote[Conferido com o compilador do Java 21: ao acrescentar um quinto estado, a compilação falha com a mensagem de que a expressão não cobre todos os valores possíveis.] O compilador passa a conferir a tabela.

**O padrão State.** Cada estado vira um objeto que sabe responder a cada evento, e um contexto guarda a referência ao estado atual [@gamma1995, p. 305-313]. O polimorfismo substitui os condicionais; em troca, a tabela se espalha por várias classes, uma linha em cada.

**Uma tabela declarativa.** Bibliotecas de máquinas de estado recebem a tabela como dado e acrescentam o que orbita a transição: guardas (condições que ela exige), ações (efeitos que ela dispara) e ouvintes que registram cada mudança. No código de demonstração, com o Spring Statemachine, duas células se escrevem assim:

```java
transitions
    .withExternal()
        .source(VideoState.STOPPED).target(VideoState.PLAYING)
        .event(VideoEvent.PLAY)
        .guard(subscriptionGuard())
    .and()
    .withExternal()
        .source(VideoState.PLAYING).target(VideoState.PAUSED)
        .event(VideoEvent.PAUSE)
        .action(analyticsPauseAction());
```

A documentação da própria biblioteca lista, entre os sinais de que um projeto já está tentando implementar uma máquina de estados, o emprego de flags booleanas e de condicionais que testam combinações delas [@spring2023].

A escolha da biblioteca, porém, é uma decisão com prazo de validade. Em abril de 2025, a equipe do Spring anunciou que o Spring Statemachine deixaria de ser mantido como projeto de código aberto e que a série 4.0 seria a última aberta [@minella2025]; [o repositório](https://github.com/spring-attic/spring-statemachine) foi arquivado, somente para leitura, em julho de 2026. O exemplo continua válido como ilustração; como dependência nova, exige pesar esse fato. A tabela de transições, que pertence ao domínio, sobrevive à troca da biblioteca — desde que tenha sido escrita como tabela.

## Objeções {#objecoes .objection depends="tabela"}

**Nem toda segunda flag pede uma máquina.** A regra de bolso que fechava a palestra — quem precisa de uma segunda flag precisa de uma máquina de estados — é forte demais. “Sem som” e “tocando” são propriedades independentes: as quatro combinações existem e têm significado. Aí o produto é real, e dois booleanos são a representação exata. Harel deu forma a isso nos :concept[statecharts]{ref=statechart}: componentes ortogonais valem ao mesmo tempo, e o estado do todo é o produto dos estados das partes, sem que seja preciso enumerá-lo [@harel1987]. O critério, portanto, não é o número de flags; é se alguma combinação delas é proibida.

**Máquinas também explodem.** Uma máquina plana que misture aspectos independentes — o pagamento e a entrega de um pedido, digamos, com dez estados cada — precisa de cem estados para dizer o que duas máquinas de dez dizem. A explosão combinatória que as flags escondiam reaparece no diagrama. Hierarquia e ortogonalidade existem para contê-la [@harel1987], assim como o hábito de guardar contadores e dados em variáveis ao lado do estado, e não em estados.

**A máquina não resolve o que está em volta dela.** Dois eventos simultâneos, um evento repetido por uma nova tentativa de entrega, uma ação que falha depois de o novo estado ter sido gravado: nada disso está em $$\delta$$. A função de transição é determinística; a entrega de eventos, a persistência e os efeitos colaterais não são. Um sistema de pagamentos precisa de controle de concorrência, de idempotência e de compensação tanto quanto de uma tabela correta — assunto para outro ensaio.

**O custo.** Para dois estados e nenhuma regra, um booleano é a ferramenta certa, e uma biblioteca seria cerimônia.

## Para que serve, a quem, a que custo {#valor .conclusion depends="implementacoes,objecoes"}

O que se segue necessariamente é pouco, e é sólido: se o estado é um valor de um conjunto finito e toda mudança passa por uma função, não há configuração sem significado, e a mesma história produz o mesmo estado. O resto é decisão de engenharia, e a escala sugerida aqui é curta. Para propriedades independentes, flags. Para situações mutuamente exclusivas, um tipo enumerado e uma função de transição, que qualquer linguagem oferece. Para regras por transição, auditoria, persistência e processos longos, uma tabela declarativa, com biblioteca ou sem — pesando quem a mantém.

Quem ganha com a tabela não é só o compilador. Ganha quem lê o código seis meses depois e encontra dezesseis células em vez de oito combinações espalhadas em condicionais; quem testa, porque cada célula é um caso; quem responde por um incidente, porque cada mudança de estado é um evento com nome, origem e destino. O custo é o de toda abstração: decidir de antemão o que o sistema precisa lembrar, e aceitar que, do resto, ele não saberá. Em [Escolher custa bits](../escolher-custa-bits/), o custo de uma interface era a incerteza de quem a usa; aqui, é a incerteza de quem a mantém. Nos dois casos, projetar bem é não cobrar de ninguém bits que não informam nada.

::bibliography
