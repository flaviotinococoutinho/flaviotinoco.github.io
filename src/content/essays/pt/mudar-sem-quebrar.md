---
title: 'Mudar sem quebrar: essência, ocultação de informação e camadas de ritmo na arquitetura de software'
subtitle: Por que sistemas bem escritos endurecem com o tempo, e como separar o que dura do que muda depressa
description: 'De Aristóteles e Brooks a Parnas, Conway, Stewart Brand e Jorge Arango: como alinhar fronteiras de módulos às velocidades reais de mudança e registrar decisões.'
lang: pt-BR
translationKey: changing-without-breaking
slug: mudar-sem-quebrar
stratum: value
domains: [software-engineering, methodology, information-systems, design]
concepts: [essential-and-accidental-complexity, information-hiding, pace-layering, conways-law, architecture-decision-record, abstraction, interface, visual-grammar]
published: 2026-11-13
revisions:
  - date: 2026-11-13
    note: Versão inicial no site.
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  Este ensaio situa-se no estrato do valor — para que serve, a quem, a que custo? — para investigar por que
  sistemas de software cujas funções parecem limpas na primeira entrega se tornam proibitivamente caros de alterar
  poucos anos depois. Parte da distinção tomada de Aristóteles por Frederick Brooks entre complexidade essencial,
  própria do domínio que o programa modela, e complexidade acidental, nascida das representações e ferramentas
  escolhidas. Mostra que a decomposição tradicional por etapas de execução espalha segredos voláteis por vários
  módulos, multiplicando o alcance de cada mudança, e formaliza o critério de ocultação de informação de David
  Parnas como redução do produto entre volatilidade e acoplamento. Articula esse critério a três forças que operam
  fora do código: as camadas de cisalhamento de Stewart Brand adaptadas aos lugares digitais por Jorge Arango, a
  gramática visual e tipográfica de Jan Tschichold, Timothy Samara e Angela Riechers — onde grades estáveis
  sustentam superfícies variadas — e a lei de Conway sobre estruturas de comunicação entre equipes. Examina como
  registros de decisão arquitetural (ADRs) preservam as restrições invisíveis no código-fonte e discute objeções
  contra a abstração prematura. Conclui que arquitetura é ética da manutenção: decidir quem pagará a próxima mudança.
keywords: [arquitetura de software, ocultação de informação, camadas de ritmo, complexidade essencial, ADR]
provenance:
  assistance: generated
  reviewed: false
  note: Redigido com assistência de IA (Gemini) segundo o programa editorial do site; fontes primárias e paginações conferidas em 13 de novembro de 2026; aguarda revisão do autor.
draft: false
---

:::epigraph{source="@brooks1995 [p. 182, tradução nossa]"}
:foreign[“Following Aristotle, I divide them into essence—the difficulties inherent in the nature of the software—and accidents, those difficulties that today attend its production but that are not inherent.”]{lang=en}

“Seguindo Aristóteles, divido-as em essência — as dificuldades inerentes à natureza do software — e acidentes, aquelas dificuldades que hoje acompanham sua produção, mas não lhe são inerentes.”
:::

::toc

Quase todo sistema novo parece ágil nos primeiros meses. As entregas saem em dias, os testes correm depressa e cada arquivo tem tamanho razoável. Dois anos depois, sem que nenhuma linha isolada pareça monstruosa, trocar um fornecedor de pagamentos, acrescentar um segundo idioma ou mudar o formato de um relatório passa a exigir semanas de coordenação cuidadosa entre quatro equipes. O custo de um programa raramente mora na primeira escrita; mora na sequência de mudanças que ele precisará absorver enquanto permanecer vivo. Este ensaio ocupa o último estrato da ponte, o do **valor**, onde já não basta perguntar se um algoritmo termina ou se um modelo é consistente, mas a quem uma estrutura serve e quanto custa mantê-la de pé.

## Essência e acidente não envelhecem juntos {#essencia-e-acidente .premise}

Em 1986, num ensaio republicado em 1987 e revisto na edição de aniversário de :name[The Mythical Man-Month]{category=work lang=en}, Frederick Brooks recorreu a uma distinção escolástica de origem aristotélica para explicar por que nenhuma ferramenta isolada multiplica por dez a produtividade do desenvolvimento [@brooks1987; @brooks1995, p. 182]. A :concept[complexidade essencial e acidental]{ref=essential-and-accidental-complexity} separa dois pesos de natureza diferente. A essência reside na própria teia conceitual do problema: regras fiscais contraditórias, casos clínicos de exceção, estados concorrentes de um pedido, compromissos entre latência e consistência. O acidente, esclareceu Brooks diante de leitores que confundiram o termo com “acaso” ou “descuido”, significa aquilo que é *incidental* ou contingente à realização material: sintaxes desajeitadas, conversões repetitivas de formato, peculiaridades de um framework da estação [@brooks1995, p. 209].

Linguagens de alto nível, coletores de lixo, sistemas de tipos e compiladores rápidos eliminaram imensa parcela do esforço acidental das décadas passadas. Contudo, um novo tipo de acidente surge sempre que uma decisão contingente de ferramenta contamina a representação da essência: quando anotações de um mapeador objeto-relacional ditam as invariantes do domínio, ou quando a estrutura dos endereços de um serviço externo molda os nomes internos do negócio [@evans2003]. A essência muda no compasso da instituição e das leis; os acidentes mudam no compasso ansioso dos pacotes e fornecedores. Soldá-los na mesma peça garante que a peça quebre no ritmo do elo mais nervoso.

## Esconder o que muda, não o que executa {#parnas .claim depends="essencia-e-acidente"}

Em dezembro de 1972, David Parnas comparou duas maneiras de dividir o mesmo programa de índice rotacionado de palavras-chave em módulos [@parnas1972]. A primeira seguia o fluxograma de execução: um módulo lia a entrada, o segundo gerava os deslocamentos circulares, o terceiro ordenava a lista e o quarto imprimia a saída. Parecia cristalina, mas todos os quatro módulos conheciam o formato exato em que as cadeias de caracteres e os índices estavam guardados na memória. Mudar a estrutura de armazenamento obrigava a reescrever o sistema inteiro. A segunda decomposição fazia outra pergunta: **qual segredo de projeto cada módulo esconde do resto?** [@parnas1972].

Podemos explicitar a economia da :concept[ocultação de informação]{ref=information-hiding} numa soma simples. Suponha um sistema dividido em $$m$$ módulos, em que a decisão interna de projeto associada ao módulo $$i$$ sofra alterações com frequência média $$\nu_i$$ por ano. Se cada alteração em $$i$$ tiver probabilidade $$d_{ij} \in [0, 1]$$ de exigir retrabalho e reverificação no módulo $$j$$, ao custo $$c_j > 0$$, o custo esperado de mudança num período é

$$
\E[C] = \sum_{i=1}^{m} \nu_i \sum_{j=1}^{m} d_{ij}\, c_j.
\label{eq:custo-mudanca}
$$

A :eqref[eq:custo-mudanca] mostra por que “código limpo” local não salva uma decomposição ruim. Mesmo quando cada $$c_j$$ individual parece pequeno, decisões de alta volatilidade ($$\nu_i$$ elevado) acopladas a vários vizinhos ($$d_{ij} > 0$$ para muitos $$j \neq i$$) multiplicam o custo total pelo leque de dependências. O critério de Parnas atua diretamente sobre os termos cruzados: cercar cada decisão provável de mudar atrás de uma :concept[interface]{ref=interface} estreita, que só promete o que não depende daquele segredo, empurra $$d_{ij}$$ para perto de zero fora da diagonal onde $$\nu_i$$ é grande [@parnas1972]. Não importa isolar o que jamais mudará; importa isolar o que quase certamente mudará.

## Camadas de cisalhamento, do edifício à página e ao software {#camadas-de-ritmo .application depends="parnas"}

Arquitetos de edifícios e projetistas gráficos chegaram ao mesmo princípio por caminhos independentes. Ao estudar como construções reais sobrevivem a décadas de reforma, Stewart Brand (desenvolvendo uma ideia de Frank Duffy) descreveu um edifício como seis :concept[camadas de ritmo]{ref=pace-layering} — terreno, estrutura portante, fachada, instalações, planta interna e mobília — que giram em velocidades incompatíveis [@brand1994]. Quando alguém chumba tubulações elétricas de vida curta dentro de vigas estruturais de concreto, a primeira atualização técnica exige marreta: a camada rápida rasga a lenta por cisalhamento (:foreign[shearing layers]{lang=en}).

Jorge Arango transpôs essa geometria temporal para os lugares digitais: num ambiente de informação responsável, o propósito, a governança e a estrutura conceitual — vocabulários controlados, esquemas semânticos, identificadores duráveis — formam o alicerce lento, enquanto a forma visual e os arranjos de interação constituem a superfície rápida [@arango2018, p. 144-146]. A mesma lógica governa a tradição editorial moderna. Em Jan Tschichold, na grade hierárquica de Timothy Samara e na :concept[gramática visual]{ref=visual-grammar} de Angela Riechers, proporções constantes de página, margens ativas e linhas de fluxo (:foreign[flowlines]{lang=en}) não engessam o texto: exatamente porque a grade estrutural permanece estável e previsível, títulos, tabelas, notas marginais e diagramas podem variar com liberdade e clareza sem desorientar o olho do leitor [@tschichold1991, p. 36-57; @samara2023, p. 32-43; @riechers2024, p. 187-190].

:::figure{#tab:ritmos kind="table" title="Camadas de ritmo num sistema de software e informação" source="Elaborado pelo autor (2026), combinando Brand (1994), Arango (2018) e Parnas (1972)."}
| Camada | Horizonte típico de mudança | O que mora aqui no software | Risco de cisalhamento se misturada |
|---|---|---|---|
| Fundamento e invariantes | Muitos anos | Leis algébricas, unidades, regras contábeis ou físicas | Erros silenciosos de integridade em todo o acervo |
| Estrutura semântica | Anos | Modelo do domínio, ontologia de conceitos, formatos abertos de arquivo | Migrações traumáticas e quebra de links ou contratos |
| Núcleo funcional | Meses a anos | Funções puras de regra de negócio, validadores e codecs tipados | Regressões difíceis de testar sem subir infraestrutura inteira |
| Adaptadores e infraestrutura | Meses | Bancos, filas, geradores estáticos, bibliotecas de terceiros | Aprisionamento (:foreign[lock-in]{lang=en}) a ferramentas descontinuadas |
| Superfície e apresentação | Dias a semanas | Folhas de estilo, leiaute de telas, textos de interface | Retrabalho da lógica central a cada ajuste visual |
:::

Este próprio site aplica a :ref[tab:ritmos] como regra verificada por máquina. Os textos vivem em Markdown puro e os conceitos numa ontologia no Sistema Simples de Organização do Conhecimento (SKOS, do inglês :foreign[Simple Knowledge Organization System]{lang=en}), independente de qualquer gerador; toda regra de negócio habita `src/core` em TypeScript puro, proibido pelo verificador estático de importar rede, sistema de arquivos, relógio ou o próprio Astro; os adaptadores e componentes visuais apenas leem e desenham sobre essa fronteira. Se amanhã o gerador estático mudar, os ensaios, as fórmulas, as referências da Associação Brasileira de Normas Técnicas (ABNT) e os testes do núcleo atravessam a troca intactos.

## Equipes e decisões que o código sozinho não guarda {#conway-e-adr .premise depends="parnas"}

Módulos, contudo, não flutuam no vácuo; são mantidos por grupos humanos. Em abril de 1968, Melvin Conway formulou a restrição sociotécnica que limita todo diagrama de caixas e setas: uma organização que projeta um sistema produz inevitavelmente um desenho cuja divisão copia a estrutura de comunicação dessa organização [@conway1968]. Porque duas interfaces só permanecem compatíveis quando seus responsáveis negociam pressupostos e exceções, fronteiras técnicas que cruzam equipes sem canal vivo de conversa degradam-se rapidamente, enquanto equipes separadas tendem a erguer protocolos formais exatamente na divisa entre si — é a :concept[lei de Conway]{ref=conways-law}. Desenhar módulos à maneira de Parnas exige alinhar responsabilidades humanas às mesmas fronteiras de mudança.

Resta ainda uma lacuna temporal. O código-fonte mostra com precisão **o que** o sistema faz hoje, mas cala sobre **quais alternativas foram rejeitadas** e sob quais restrições aquele desenho fazia sentido. Seis meses depois, um colega bem-intencionado enxerga uma separação aparentemente indireta, “simplifica” os dois módulos num só e reintroduz exatamente o acoplamento ou a falha de contraste que a separação evitava. Para fechar essa perda de contexto, Michael Nygard propôs em 2011 o :concept[registro de decisão arquitetural]{ref=architecture-decision-record} (ADR, do inglês :foreign[architecture decision record]{lang=en}): um texto curto, versionado no próprio repositório ao lado do código, declarando contexto, decisão tomada, estado de vigência e consequências aceitas [@nygard2011]. Assim como um lançamento contábil preserva a razão de um saldo em [O registro não é a coisa](../o-registro-nao-e-a-coisa/), um conjunto de ADRs impede que a arquitetura perca a memória das próprias restrições.

## Objeções {#objecoes .objection depends="camadas-de-ritmo,conway-e-adr"}

**Abstração especulativa custa mais caro que duplicação.** O erro oposto ao acoplamento descuidado é tentar adivinhar todas as mudanças futuras no dia zero, empilhando interfaces genéricas, fábricas abstratas e camadas vazias em torno de requisitos que nunca variarão. Toda camada de indireção aumenta $$c_j$$ na :eqref[eq:custo-mudanca]: mais arquivos para abrir, mais tipos para conciliar, mais distância entre quem chama e o que realmente acontece. Quando $$\nu_i \approx 0$$ — uma decisão que jamais mudou nem dá sinal realista de mudar —, escondê-la atrás de três adaptadores é fabricar complexidade acidental em nome da pureza.

**A manobra inversa de Conway tem atrito humano real.** Reorganizar equipes para forçar a arquitetura desejada funciona até o ponto em que esbarra em orçamentos, fusos horários, especializações raras e incentivos de carreira. Tratar pessoas como blocos reconfiguráveis num diagrama ignora o custo cognitivo e político da própria transição.

**Documentação descola do código quando ninguém a cobra.** Um diretório de ADRs esquecido numa wiki paralela vira museu de boas intenções. A resposta eficaz não é desistir de registrar decisões, mas amarrar o que for verificável a testes de guarda automatizados — pureza de camadas, orçamentos, contratos de esquemas — deixando ao texto do ADR apenas o juízo humano do *porquê* [@nygard2011].

## Arquitetura como responsabilidade pelo tempo alheio {#conclusao .conclusion depends="camadas-de-ritmo,conway-e-adr,objecoes"}

Tschichold escreveu que a boa tipografia tem uma moralidade silenciosa: recusar a vaidade ornamental para servir com lealdade à compreensão de quem lê [@tschichold1991, p. 3-11; @tschichold2006, p. 66]. A arquitetura de software responde a um dever análogo diante de quem manterá e habitará o sistema amanhã. Separar essência de acidente [@brooks1987], traçar fronteiras pelo segredo que muda [@parnas1972], respeitar o compasso desigual das camadas de ritmo [@brand1994; @arango2018] e deixar registradas as razões das escolhas [@nygard2011] não são rituais estéticos para admirar diagramas.

São formas concretas de distribuir custo no tempo. Um sistema mal partido transfere pressa presente para juros compostos pagos por cada engenheiro, operador e usuário futuro; um sistema bem partido absorve a mudança onde ela nasce, deixando intocado o que merece durar.

::concept-map{focus=information-hiding depth=2}

::bibliography
