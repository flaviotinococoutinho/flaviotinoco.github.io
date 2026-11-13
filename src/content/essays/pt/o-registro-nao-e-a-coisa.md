---
title: 'O registro não é a coisa: memória, fato e estado em sistemas de informação'
subtitle: O que uma organização grava quando julga gravar a realidade, e o que perde ao sobrescrever o passado
description: 'De William Kent e da semiótica do índice aos diários imutáveis: por que um sistema de informação guarda atos de inscrição, não coisas, e como o estado nasce deles.'
lang: pt-BR
translationKey: the-record-is-not-the-thing
slug: o-registro-nao-e-a-coisa
stratum: philosophy
bridgesTo: theory
domains: [information-systems, applied-philosophy, semiotics, software-engineering]
concepts: [information-system, record, state, sign, model, transaction, idempotence, pace-layering]
published: 2026-11-13
revisions:
  - date: 2026-11-13
    note: Versão inicial no site.
epistemic:
  confidence: probable
  evidence: argument
abstract: >-
  Este ensaio atravessa do estrato filosófico ao teórico perguntando o que um sistema de informação realmente
  guarda quando afirma guardar clientes, estoques ou contratos. Parte da crítica ontológica de William Kent em
  Data and Reality: identificadores, categorias e fronteiras de entidades não são reflexos neutros do mundo, mas
  recortes institucionais impostos para coordenar ações. Aplica a semiótica de Peirce para mostrar que uma linha
  de banco de dados funciona antes como índice de um ato de inscrição — alguém declarou algo num instante sob
  uma regra — do que como cópia fiel de um objeto externo. Examina o hábito dominante de criar, ler, atualizar e
  excluir no lugar (CRUD), argumentando que sobrescrever uma célula confunde dois estratos temporais distintos:
  o registro imutável do que ocorreu e o estado presente derivado dele. Retoma a prática contábil descrita por
  Pat Helland e a dualidade entre fluxo e tabela sistematizada por Martin Kleppmann para formular o estado como
  dobra determinística sobre uma sequência append-only de fatos, articulada à ordenação parcial de eventos em
  sistemas distribuídos de Lamport e à necessidade de idempotência sob reentregas. Discute três objeções sérias:
  o custo físico de reter tudo, o dever legal e ético do esquecimento e a inevitabilidade da evolução de
  esquemas. Conclui que projetar um sistema de informação é decidir o que uma instituição promete lembrar e o
  que aceita esquecer.
keywords: [sistema de informação, registro, imutabilidade, estado, filosofia aplicada]
provenance:
  assistance: generated
  reviewed: false
  note: Redigido com assistência de IA (Gemini) segundo o programa editorial do site; fontes primárias e paginações conferidas em 13 de novembro de 2026; aguarda revisão do autor.
draft: false
---

:::epigraph{source="@helland2015 [p. 102, tradução nossa]"}
:foreign[“Accountants don't use erasers; otherwise they may go to jail. All entries in a ledger are additive.”]{lang=en}

“Contadores não usam borracha; do contrário podem ir presos. Todos os lançamentos num livro-razão são aditivos.”
:::

::toc

Quando um hospital diz que o paciente está na enfermaria 4, ou um banco informa que o saldo da conta é de R$ 1 200,00, fala-se do banco de dados como se fosse uma janela aberta sobre o edifício ou sobre o cofre. Na maior parte dos dias a metáfora funciona; nos dias de auditoria, disputa judicial ou incidente em produção, ela se desfaz. O paciente já havia recebido alta, mas a passagem não fora lançada; um pagamento entrara duas vezes após uma falha de rede, e uma correção manual sobrescrevera o valor anterior sem deixar rastro de quem o alterou nem do motivo. Este ensaio examina o equívoco filosófico sob esse defeito técnico. Parte da pergunta ontológica — que espécie de coisa é um :concept[registro]{ref=record}? — e atravessa para o estrato teórico, onde um :concept[sistema de informação]{ref=information-system} deixa de ser visto como vitrine estática de objetos e passa a ser modelado como memória institucional construída sobre inscrições no tempo.

## A ilusão do espelho {#ilusao-do-espelho .question}

Manuais introdutórios costumam apresentar a modelagem de dados como exercício de observação direta: haveria no mundo entidades bem recortadas — pessoas, produtos, pedidos, endereços — dotadas de atributos intrínsecos, cabendo ao analista apenas transcrevê-las em tabelas ou classes. Em 1978, depois de anos projetando sistemas corporativos na IBM, William Kent desmontou essa tranquilidade num livro curto, :name[Data and Reality]{category=work lang=en} [@kent1978]. O que é “um” livro no acervo de uma biblioteca: a obra intelectual *Dom Casmurro*, a edição de 1899 ou o exemplar físico número 342 com a capa rasgada? O que conta como “o mesmo” voo aéreo quando a companhia troca a aeronave, o comandante e o horário, mantendo apenas o código comercial? Nenhuma dessas perguntas se decide olhando mais de perto para o avião ou para o papel [@kent1978].

A tese de Kent é ontológica no sentido estrito, embora escrita para engenheiros: identidade, unidade e classificação nos dados não emanam passivamente das coisas; decorrem dos propósitos de quem mantém o cadastro. Dois departamentos da mesma empresa recortam o mundo de modos incompatíveis porque respondem a obrigações distintas — para a logística, dois pacotes com dimensões diferentes são itens distintos; para o faturamento, podem ser uma só linha contratual. Quando o discurso da área trata a tecnologia como ferramenta transparente ou ignora o artefato informacional concreto, como observaram @orlikowski2001, esconde precisamente esse trabalho normativo: decidir o que existe para a organização, sob qual identificador e durante quanto tempo.

## Que espécie de signo é um registro {#signo-e-ato .premise depends="ilusao-do-espelho"}

Se uma linha gravada em disco não é a coisa nem uma miniatura natural dela, que relação mantém com o mundo? Em [Do signo à informação](../do-signo-a-informacao/), vimos que Charles S. Peirce distingue três modos pelos quais um :concept[signo]{ref=sign} se liga ao seu objeto: pela semelhança (ícone), pela conexão causal ou existencial com um acontecimento singular (índice) ou por hábito e convenção compartilhada (símbolo) [@peirce1931, v. 2, § 228]. Uma fotografia aproxima-se do ícone; o nome de uma coluna em linguagem de consulta estruturada (SQL, do inglês :foreign[Structured Query Language]{lang=en}), como `saldo_atual`, é símbolo convencional; mas o lançamento gravado às 14h03 — “transferência recebida de R$ 500,00, autorizada pela chave `k9`” — opera decisivamente como **índice**: é o vestígio durável de um ato ocorrido num ponto da história.

Essa distinção muda o estatuto epistêmico do banco de dados. Um cadastro nunca armazena diretamente o fato bruto de que Maria mora na Rua das Flores; armazena o fato institucional de que, em certa ocasião, alguém munido de credencial apresentou ou digitou essa declaração segundo um formulário vigente. Entre o endereço físico e o byte gravado interpõem-se pelo menos três mediações: a observação ou declaração humana, o :concept[modelo]{ref=model} conceitual que filtra o que cabe nos campos permitidos e o protocolo técnico que confirma a gravação. Confundir o registro com a coisa leva a tratar divergências entre sistema e mundo apenas como “dados sujos”, quando muitas vezes revelam defasagem temporal legítima entre quando um fato ocorre no mundo (*tempo válido*) e quando a instituição toma conhecimento dele (*tempo de transação*) [@kleppmann2017].:sidenote[A literatura de bancos de dados temporais chama *bitemporal* o modelo que separa explicitamente essas duas linhas de tempo: a história do domínio e a história do próprio arquivo. Sem a segunda, corrigir retroativamente o salário de janeiro apaga o motivo pelo qual a folha fechada em janeiro pagou outro valor.]

## A borracha do CRUD {#borracha-do-crud .claim depends="signo-e-ato"}

A arquitetura mais difundida na indústria reduz a persistência às quatro operações de criar, ler, atualizar e excluir (CRUD, do inglês :foreign[create, read, update and delete]{lang=en}). Historicamente, a escolha tinha razão material sólida: quando discos magnéticos e memória principal custavam caro nos anos 1960 e 1970, manter apenas a fotografia mais recente de cada entidade economizava ordens de grandeza em armazenamento [@helland2015; @kleppmann2017]. O comando `UPDATE` sobrescreve os bytes antigos no lugar; o comando `DELETE` libera o espaço.

O preço conceitual dessa economia é colapsar dois objetos diferentes numa única célula mutável: a **memória dos fatos** e o **resumo operacional do presente**. Quando o endereço de um cliente ou a etapa de um pedido é sobrescrito no lugar, o sistema conserva o :concept[estado]{ref=state} corrente ao custo de destruir a prova de como chegou ali. Para uma aplicação efêmera, perder o caminho pode ser irrelevante; num sistema de informação organizacional — prontuário clínico, razão contábil, cadeia de custódia logística, controle de permissões —, o caminho faz parte do próprio domínio. Como resume Pat Helland na epígrafe, a contabilidade resolveu esse problema séculos antes do computador: quando um lançamento sai errado, o contador jamais apaga a tinta; escreve um lançamento compensatório, preservando tanto o erro quanto o estorno [@helland2015, p. 102].

:::figure{#tab:memoria kind="table" title="Duas arquiteturas da memória num sistema de informação" source="Elaborado pelo autor (2026), a partir de Helland (2015) e Kleppmann (2017)."}
| Dimensão | Estado mutável no lugar (CRUD) | Registros imutáveis e projeção |
|---|---|---|
| Unidade primária guardada | Situação corrente da entidade | Fato ocorrido em instante determinado |
| Correção de erro | Sobrescrita destrutiva (`UPDATE` / `DELETE`) | Novo registro compensatório ou retificador |
| Auditoria e causalidade | Exige tabelas auxiliares ou se perde | Nativa na própria sequência de registros |
| Consultas do presente | Leitura direta da linha atual | Leitura sobre visão materializada (projeção) |
| Mudança nas regras de negócio | Irreversível sobre detalhes já descartados | Reprocessável sobre o histórico preservado |
:::

## O estado como dobra sobre fatos {#estado-como-dobra .definition depends="borracha-do-crud"}

Separar registro e estado não obriga a abrir mão de consultas rápidas sobre o presente; obriga apenas a reconhecer quem deriva de quem. Na teoria dos autômatos, vimos em [A segunda flag](../a-segunda-flag/) que a função de transição estendida percorre uma palavra de entrada símbolo a símbolo. Sistemas intensivos em dados obedecem ao mesmo esqueleto algébrico, conhecido como dualidade entre fluxo de eventos e tabela de estado [@kleppmann2017, cap. 11].

:::definition{#def:projecao title="Projeção de estado sobre um diário append-only"}
Seja $$r_{1..t} = (r_1, r_2, \dots, r_t)$$ uma sequência ordenada de registros imutáveis, à qual novos fatos só se acrescentam no fim, e seja $$g : S \times R \to S$$ uma função determinística de atualização a partir do estado inicial $$s_0 \in S$$. O estado projetado no passo $$t$$ é a dobra

$$
s_t = \operatorname{fold}(g, s_0, r_{1..t}) = g\bigl(\cdots g(s_0, r_1) \cdots, r_t\bigr).
\label{eq:projecao-estado}
$$
:::

A :eqref[eq:projecao-estado] esclarece três fenômenos de uma só vez. Primeiro, o estado deixa de ser a fonte última da verdade e passa a ser um cache derivado — uma visão materializada que pode ser mantida em memória ou indexada para leitura imediata, mas reconstruída a qualquer momento a partir do diário append-only [@helland2015; @kleppmann2017]. Segundo, um único histórico de fatos admite múltiplas funções $$g_1, g_2, \dots, g_k$$ em paralelo: a mesma sequência de pedidos alimenta o saldo de estoque da operação, o índice de busca textual do atendimento e a série analítica de finanças, sem que nenhum consumidor precise disputar travas sobre uma única tabela central. Terceiro, quando a organização descobre amanhã uma pergunta que não fazia ontem — ou corrige um bug num cálculo fiscal —, pode escrever uma nova função $$g'$$ e aplicá-la desde $$r_1$$. Onde houve sobrescrita, o que não cabia na coluna antiga desapareceu para sempre.

:::stretch{label="E quando não há um relógio único nem entrega exata?"}
A :ref[def:projecao] supõe uma sequência ordenada $$r_{1..t}$$ e uma aplicação limpa de cada registro. Em máquinas separadas por rede, nenhuma das duas coisas vem de graça. @lamport1978 mostrou que, sem memória compartilhada nem sincronização física perfeita, dois processos distantes só dispõem de uma ordem parcial de causalidade (“aconteceu antes”), sendo preciso escolher um protocolo explícito — relógios lógicos, consenso ou particionamento por chave de entidade — quando a função $$g$$ não comuta. Além disso, num canal sujeito a quedas, quem envia um comando e não recebe confirmação precisa reenviá-lo. Se a operação de gravação ou projeção satisfizer a propriedade de :concept[idempotência]{ref=idempotence},

$$
f\bigl(f(x)\bigr) = f(x),
\label{eq:idempotencia}
$$

associando a cada ato um identificador único de requisição ou número de sequência verificado dentro de uma :concept[transação]{ref=transaction} [@gray1981], processar a segunda cópia deixa o estado idêntico ao da primeira. Sem a :eqref[eq:idempotencia], toda falha transitória de rede obriga a escolher entre perder um fato e contá-lo em dobro.
:::

Essa separação ecoa, no desenho de sistemas digitais, a arquitetura de :concept[camadas de ritmo]{ref=pace-layering} proposta por Stewart Brand para edifícios [@brand1994] e levada aos ambientes de informação por Jorge Arango [@arango2018, p. 142-146]. Num lugar digital bem construído, os conceitos do domínio e o histórico de fatos pertencem às camadas lentas e estruturais, enquanto telas, relatórios e índices específicos pertencem às camadas rápidas de forma. Misturar tudo numa tabela moldada pela tela do dia faz com que cada redesenho superficial rasgue a memória de longo prazo da organização [@arango2018, p. 146].

## Quando guardar tudo é erro {#objecoes .objection depends="estado-como-dobra"}

Transformar o diário imutável em dogma universal seria repetir, com sinal trocado, a cegueira do CRUD. Três restrições reais impõem limites severos ao modelo de event sourcing e à retenção integral.

**O custo físico e cognitivo da acumulação.** Armazenar cada leitura de sensor de telemetria como evento eterno encarece disco, rede e tempo de reconstrução. Mesmo com instantâneos periódicos (:foreign[snapshots]{lang=en}) e compactação por chave — que descarta valores intermediários preservando apenas o último registro de cada identificador [@kleppmann2017, cap. 3] —, acrescentar filas, projetores assíncronos e consistência eventual a um cadastro simples com meia dúzia de usuários e sem exigência histórica é complexidade acidental sem contrapartida.

**O dever de esquecer.** Memória institucional ilimitada colide com direitos fundamentais das pessoas registradas. Tanto a Lei Geral de Proteção de Dados Pessoais (LGPD) no Brasil quanto o Regulamento Geral sobre a Proteção de Dados (GDPR, do inglês :foreign[General Data Protection Regulation]{lang=en}) na União Europeia impõem limites de finalidade e, em várias hipóteses, o direito à eliminação de dados pessoais. Num diário estritamente imutável, apagar um registro individual no meio da cadeia é cirurgicamente difícil: exige técnicas como segregação de dados sensíveis em cofres externos ou criptografia por titular com descarte deliberado da chave (*crypto-shredding*), além de políticas formais de expurgo. Lembrar tudo não é virtude automática; às vezes é violação.

**Esquemas também envelhecem.** Imutabilidade protege os bytes gravados em 2020, mas não congela o vocabulário da empresa em 2026. Quando o significado de um campo muda ou duas categorias se fundem — exatamente o problema de Kent [@kent1978] —, leitores novos precisam traduzir versões antigas de registros em tempo de leitura (*upcasting*) ou reescrever fluxos inteiros sob governança explícita.

## Projetar a memória {#conclusao .conclusion depends="estado-como-dobra,objecoes"}

A engenharia de sistemas de informação começa antes do banco de dados, na filosofia aplicada ao domínio: distinguir o acontecimento no mundo, o ato institucional que o atesta num :concept[registro]{ref=record} e o :concept[estado]{ref=state} resumido que orienta a próxima decisão. Sobrescrever no lugar é legítimo quando o passado genuinamente não importa, quando a finalidade legal proíbe conservá-lo ou quando o volume físico exige compactação explícita. É um defeito grave quando acontece apenas por inércia de ferramenta, apagando em silêncio a única evidência capaz de explicar como um número surgiu ou de permitir que uma regra corrigida recalcule o presente [@hevner2004; @kleppmann2017].

Como lembra Arango, sistemas de informação não são vitrines descartáveis; são lugares habitados por pessoas que dependem da estabilidade semântica do ambiente para compreender onde estão e agir com responsabilidade [@arango2018, p. 26-31]. Uma organização é, em larga medida, aquilo que seus registros lhe permitem lembrar com honestidade — e aquilo que ela decide, às claras e sob regra, deixar passar.

::concept-map{focus=record depth=2}

::bibliography
