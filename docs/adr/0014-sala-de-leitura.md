# ADR 0014 — Sala de leitura: uma cena three.js atrás da folha dos ensaios

- **Estado:** Aceito; a composição e as cores aguardam revisão do autor
- **Data:** 2026-11-15; revisto em 2026-11-16 (desligada por padrão, interruptor no ensaio, repouso, interação;
  depois, a mesa e a folha em CSS em todo ensaio; por fim, automática por padrão, controle só no painel e a
  sala em todas as telas, na faixa acima da folha: decisão 18) e em 2026-11-22 (o som da sala: decisão 19)
- **Escopo:** `src/core/chrome/room.ts`, `src/islands/elements/ft-reading-room.ts`,
  `src/islands/scenes/reading-room.ts`,
  `src/islands/preferences-store.ts`, `src/styles/components/room.css`, `src/views/EssayView.astro`,
  `src/adapters/astro/shelf.ts`, `src/pages/[lang]/shelf.json.ts`, `src/core/chrome/preferences.ts`,
  `src/core/design/tokens.json`, `scripts/lib/budgets.ts`, `tests/unit/chrome/room.test.ts`,
  `tests/e2e/room.spec.ts`; o som (decisão 19): `src/core/chrome/sound.ts`, `src/core/chrome/sound-synth.ts`,
  `src/islands/elements/ft-room-sound.ts`, `src/islands/scenes/room-sound.ts`, `src/islands/sound-store.ts`,
  `src/islands/elements/ft-preferences.ts`, `src/core/chrome/preferences-form.ts`,
  `tests/unit/chrome/sound.test.ts`, `tests/e2e/sound.spec.ts`
- **Relacionados:** ADR 0001 (núcleo funcional), ADR 0004 (cor verificável), ADR 0009 (moldura sob demanda);
  [requisitos não funcionais](../requisitos-nao-funcionais.md) §1 e §2;
  [plano de 15/11/2026](../planos/2026-11-15-sala-de-leitura.md);
  [plano de 22/11/2026](../planos/2026-11-22-som-da-sala.md)

## Contexto

O autor propôs um conceito visual para a leitura dos ensaios: uma sala de leitura com madeira envelhecida,
livros, chuva na janela e uma vela iluminando a mesa; o artigo no centro, com aparência de papel apoiado em
um suporte de madeira. A regra que ele deu para o projeto: **o ambiente cria a atmosfera, e a leitura recebe
a prioridade**. Pediu que a cena fosse feita com three.js e otimizada para este site.

A imagem de referência não chegou a quem implementou; a cena segue a descrição em texto. Por isso a
composição é uma proposta, e está entre as pendências.

O site tem restrições que a cena precisa respeitar, todas verificadas por máquina:

| Restrição                                               | Onde está                                           |
| ------------------------------------------------------- | --------------------------------------------------- |
| JavaScript inicial ≤ 12 KiB por página                  | `scripts/lib/budgets.ts`                            |
| Texto com contraste AAA sobre os tokens de papel        | `scripts/verify-palette.ts`; axe nos dois temas     |
| Cores só de tokens; nenhuma cor escrita à mão           | `CLAUDE.md`, regra 5                                |
| Movimento reduzido respeitado; estado final como padrão | `src/styles/motion.css`; `tests/e2e/motion.spec.ts` |
| Página útil sem JavaScript                              | `CLAUDE.md`, regra 9                                |
| CSP: scripts só da própria origem, sem `eval`           | `astro.config.ts`                                   |

## Decisão

1. **A sala é uma camada atrás da página; o artigo não está nela.** `<ft-reading-room>` é um elemento fixo
   com `z-index: -1`, que contém o `<canvas>` da cena. A **folha** é opaca, com os tokens de papel e um pouco
   mais larga que as colunas de texto: todo o texto do artigo fica sobre a mesma superfície de antes, com o
   mesmo contraste, e a cena só aparece onde a folha não está. O cabeçalho e o rodapé ficam opacos. O
   "suporte de madeira" é um aro da folha (`--room-board`), e a cena escurece junto às bordas dela, como se a
   folha estivesse acima da sala. Até a decisão 18 a folha era desenhada pela própria camada; desde então é a
   folha da página (decisão 17), a mesma com e sem a cena.

2. **Decide-se antes de baixar.** `roomMode` (`src/core/chrome/room.ts`, puro) devolve `off`, `still` ou
   `live` a partir do que a casca mede. O three.js só é importado quando o modo não é `off`, e em tempo
   ocioso, depois da primeira pintura.

   | Condição                                                          | `auto`  | `on`    |
   | ----------------------------------------------------------------- | ------- | ------- |
   | preferência `off`; modo de foco; cores forçadas; sem WebGL 2      | `off`   | `off`   |
   | calha e faixa acima da folha, ambas menores que 96 px             | `off`   | `off`   |
   | economia de dados; contraste aumentado; renderizador por software | `off`   | —       |
   | movimento reduzido                                                | `still` | `still` |
   | até 2 núcleos ou até 2 GiB de memória                             | `still` | —       |
   | nenhuma das anteriores                                            | `live`  | `live`  |

   Limites duros valem sempre; limites brandos só valem no automático, porque quem ligou a sala conhece o
   próprio aparelho melhor que uma heurística. Lei testada por propriedade: acrescentar uma restrição nunca
   eleva o modo. A faixa acima da folha (decisão 18) tem pelo menos 110 px em qualquer tela, então o espaço
   nunca é o que impede a sala; com a largura atual das colunas, a calha de 96 px aparece a partir de cerca
   de 1 540 px, e também entre cerca de 980 e 1 150 px, onde a coluna de margem dobra para dentro do texto.

3. **three.js entra como dependência, isolado num pedaço sob demanda.** `three@0.187.0`, versão fixada (a
   biblioteca não segue versionamento semântico), importado só por `src/islands/scenes/reading-room.ts` com
   importações nomeadas. O pedaço pesa 137,2 KiB em gzip; o elemento que decide carregá-lo, 6,0 KiB (15/11:
   135,3 e 3,9; a diferença é a interação da decisão 16 e as regiões e a faixa da decisão 18).

4. **A cena é procedural: nenhum arquivo além do código.** Veios da madeira, reboco, chuva e chama são
   _shaders_ de fragmento. Não há sistema de luzes, mapas de sombra nem pós-processamento: uma luz pontual
   analítica (a vela, Lambert com decaimento pelo inverso do quadrado) e um termo de área (a janela) são
   avaliados no _shader_ de cada material, com uniformes compartilhados; as sombras são de contato,
   analíticas. São cerca de doze chamadas de desenho por calha: mesa, parede, janela, vela, poça de cera,
   pavio, castiçal, o simplexo, uma `InstancedMesh` com todas as caixas (livros, prateleiras, peitoril,
   aparadores), uma nuvem de pontos (poeira) e dois quadriláteros aditivos (chama e halo). Padrões mais
   finos que um pixel se desfazem pela derivada em espaço de tela, em vez de produzir _moiré_.

5. **Só o que a página deixa à vista é sombreado.** `roomRegions` (puro) devolve, a cada quadro, até quatro
   retângulos disjuntos da janela entre o cabeçalho e o rodapé e fora da folha: a faixa acima dela, as duas
   calhas e o que houver abaixo. O quadro é desenhado uma vez sob a tesoura de cada um; os pixels cobertos
   custam uma limpeza do _buffer_. Os retângulos avançam 48 px sobre as partes opacas, porque a página rola no
   compositor antes do próximo quadro e um gesto rápido não pode descobrir _canvas_ vazio. Quando nenhum está
   na tela (no celular, depois que a faixa saiu), nenhum quadro é desenhado e o laço para até a próxima
   rolagem. Com movimento reduzido, o quadro único cobre a janela inteira, porque precisa servir a qualquer
   rolagem até ser refeito.

6. **A câmera é uma lente deslocada.** A câmera olha na horizontal e a imagem é os dois terços inferiores de
   um quadro mais alto (`PerspectiveCamera#setViewOffset`), como na fotografia de arquitetura: as verticais
   continuam verticais por mais longe que o objeto esteja do centro, e a mesa entra no quadro sem inclinar a
   câmera. A disposição é função da largura das calhas e de um gerador com semente: mesma janela, mesma
   sala.

7. **As cores vêm dos tokens.** Seis tokens novos (`--room-wall`, `--room-wood`, `--room-board`,
   `--room-glass`, `--room-flame`, `--room-wax`), com valores para o tema claro (dia de chuva) e o escuro
   (noite), dentro do gamut sRGB como os demais. As capas dos livros são os quatro matizes dos estratos
   misturados à madeira. A cena lê os tokens em tempo de execução, converte para luz linear, ilumina, codifica
   uma vez e aplica _dithering_ de meio passo de 8 bits. A hora do dia (`data-daypart`) regula a força da
   vela.

8. **A qualidade é governada.** O quadro é renderizado a no máximo 1,5× a densidade da tela e a 30 quadros
   por segundo. Um governador acompanha a média móvel do intervalo entre quadros: 45 amostras seguidas
   acima de 40 ms descem um degrau (1,5× → 1× → 0,75× a 24 quadros); abaixo do último degrau a animação
   para e fica um quadro. O degrau nunca sobe, então a cena não oscila. O laço para com a aba oculta.

9. **A sala se acalma com a leitura.** `calm` vai de 1, no topo da página, a 0,45, uma tela abaixo; escala
   a velocidade da chuva, a oscilação da chama e o brilho da cena.

10. **A vela não pisca.** `flicker` é a soma de três senoides abaixo de 3 Hz, com desvio máximo de 7 %: fica
    sob a taxa e sob a variação de luminância que definem um _flash_ (WCAG 2.2, critério 2.3.1).

11. **O leitor manda, num controle discreto.** A preferência `room` (`auto` | `on` | `off`) vale `auto` por
    padrão: a sala aparece onde o aparelho dá conta (decisão do autor no fim de 16/11, "a sala 3D sempre
    aparece", depois de uma manhã em que ela ficou desligada por padrão com um interruptor no ensaio). O
    controle fica só no painel de preferências, com as outras escolhas de leitura; o interruptor do cabeçalho
    do ensaio saiu, e com ele `data-scene-able`. O armazenamento compartilhado
    (`src/islands/preferences-store.ts`: toda gravação relê o armazenamento antes) continua, para que um
    controle futuro não sobrescreva o painel. O modo de foco também desliga a sala. Há, assim, um mecanismo
    para parar ou esconder o movimento (WCAG 2.2, critério 2.2.2), e a sala para sozinha quando o leitor para
    (decisão 15).

12. **A sala é a deste site, não um cenário.** Os dados saem do acervo e da leitura; a cena só os desenha.

    | O que se vê                                  | De onde vem                                                                                   |
    | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
    | Lombadas na prateleira de cima               | os ensaios da língua, na ordem de publicação; cor do estrato; espessura pelo tamanho do texto |
    | Cadernos na prateleira de baixo              | os laboratórios                                                                               |
    | Um vão na prateleira e um livro sobre a mesa | a obra que está sendo lida, sobre as obras publicadas antes e depois dela                     |
    | Um peso de latão sobre o livro               | o simplexo do estrato: ponto, segmento, triângulo, tetraedro (os glifos do site)              |
    | A altura da vela                             | o progresso da leitura: `burn`, linear, de inteira a 40 % no fim do artigo                    |
    | A intensidade da chuva                       | `rainfall`: constante nos três primeiros quintos, depois cede até uma garoa                   |
    | A inclinação da chama                        | `gust`: a corrente de ar da página rolada, com decaimento exponencial                         |

    A vela também lembra: quem volta a um ensaio a encontra tão gasta quanto a deixou, porque a altura parte
    do ponto mais adiantado já lido, guardado só no navegador (`ft-reading-memory`, `src/core/reading/memory.ts`).

    A prateleira tem o comprimento que os livros pedem, então cresce com o acervo. A estante viaja no HTML
    como um atributo compacto (`encodeShelf`, com a lei `decode ∘ encode = id`): dois caracteres por obra.
    Com movimento reduzido, a vela é um estado e não uma animação: o quadro único é refeito quando a rolagem
    para.

13. **A matéria é irregular.** Nada na cena é uma primitiva lisa: a cera tem caroços, escorridos que
    terminam em gota, borda cedida e uma poça que cresce conforme a vela queima; a chama é deformada por
    duas faixas de ruído que sobem por ela; os veios da mesa contornam nós e as tábuas têm tom próprio; as
    lombadas são arredondadas, com trama de tecido e desgaste nas pontas; o reboco é manchado; a parte
    baixa do vidro embaça e as gotas abrem trilhas no embaçado; há poeira suspensa na luz da vela; o que
    está sobre a mesa escurece a mesa. Ao aparecer, a chama pega aos poucos (`kindle`, 1,8 s).

14. **Dois orçamentos novos** em `pnpm check:budgets`: todo módulo do pacote do site pesa no máximo 16 KiB em
    gzip, e a cena, o único módulo autorizado a passar disso, no máximo 140 KiB. Antes, um módulo sob demanda
    não tinha teto.

15. **A sala para quando o leitor para.** O laço tem três ritmos (`pace`, puro): todos os quadros que o
    degrau permite enquanto o leitor rola, aponta ou digita e até 3 s depois; 15 quadros por segundo até
    20 s; depois, nenhum: o último quadro fica na tela até o próximo movimento, que religa o laço. Movimento
    na periferia captura a atenção qualquer que seja a tarefa (Franconeri e Simons, _Perception &
    Psychophysics_ 65(7), 2003): quem se fixou num parágrafo ganha uma sala parada, e a bateria descansa.

16. **A sala responde à mão, e só onde está à vista.** Os gestos são do ponteiro sobre o fundo nu da página,
    dentro de uma das regiões da decisão 5 (nunca sobre a folha, o texto, o cabeçalho, um diálogo ou um
    _popover_), com modelos puros testados:

    | Gesto                          | Resposta                                                                                           |
    | ------------------------------ | -------------------------------------------------------------------------------------------------- |
    | mover o ponteiro sobre ela     | o olho acompanha alguns centímetros (`eyeFor`, `approach`): paralaxe, as verticais continuam retas |
    | passar perto da chama          | ela se inclina com o ar que a mão move (`breath`, somado à corrente da rolagem em `gust`)          |
    | passar sobre a janela          | o vidro embaçado se limpa por onde a mão passou e embaça de novo em segundos (`refog`)             |
    | apontar um livro               | ele sai da estante, com o título num papel ao lado; o cursor vira mão                              |
    | clicar no livro                | abre a obra (com tecla modificadora, numa aba nova)                                                |
    | tocar um livro (tela de toque) | o primeiro toque o nomeia; o segundo, no mesmo livro, abre a obra                                  |

    Os títulos e os endereços vêm de `/<lang>/shelf.json`, baixado só depois que a sala acende; a lista é a
    mesma do atributo `shelf` (`siteShelf`), e o _n_-ésimo rótulo é do _n_-ésimo livro. O decodificador guarda
    as posições e recusa endereços fora do site. Nada disso é necessário para ler ou navegar: a sala continua
    `aria-hidden`, e as obras da estante estão no índice de ensaios e na paleta de comandos, pelo teclado.
    Com movimento reduzido o livro sai num quadro só, e não há paralaxe, corrente de ar nem embaçado. No toque
    não existe "passar sobre": por isso o nome vem antes da navegação, e um toque errado na faixa, perto do cabeçalho, não leva o leitor para outra obra. Pela mesma razão o olho não acompanha o dedo: se acompanhasse, a estante deslizaria sob ele entre o toque que nomeia e o que abre.

17. **O ambiente rústico vale para todo leitor; a cena é a versão acesa.** Pedido do autor em 16/11
    ("aplique o ambiente rústico"), depois de a cena ficar desligada por padrão. Em todo ensaio, o artigo é uma
    folha de papel no seu suporte de madeira, sobre uma mesa velha, desenhada só com CSS (`room.css`): a mesa é
    `--room-wood` com um veio de ruído fractal esticado ao longo das tábuas (`--wood-image`, a mesma técnica do
    grão do papel), e a folha é o `::before` de `.essay`, com os tokens de papel e um aro de `--room-board` dos
    lados. As colunas laterais de `.page-grid` são iguais e as centrais são tokens, então a folha é centrada e a
    sua largura é conhecida sem script. Não há download, movimento nem JavaScript. A mesa some no modo de
    foco, com contraste aumentado, com cores forçadas e na impressão; o veio some também com a textura
    desligada. A barra de progresso, fixa, saiu de `.essay`, que agora é um contexto de empilhamento. Com a
    decisão 18, a folha ganhou o aro dos quatro lados e uma faixa de mesa acima dela, em toda tela; quando a
    cena acende, a madeira dá lugar à sala e a folha fica onde está.

18. **A sala em todas as telas: a faixa acima da folha.** Pedido do autor no fim de 16/11: a sala aparecer
    discretamente em todas as telas, com ilusões e interações otimizadas, e o layout organizado mesmo que fosse
    preciso refazer partes. Até aqui a sala só existia nas calhas, a partir de cerca de 1 540 px.

    - **Onde.** Todo ensaio reserva, entre o cabeçalho e a folha, uma faixa (`--room-headroom`:
      `clamp(var(--space-4), 14svh, var(--space-4) + var(--space-2))`, de 110 a 152 px, cerca de um sétimo da
      altura da tela). A folha é o `::before` de `.essay`, em fluxo, recuada da faixa; o texto começa abaixo
      dela. A faixa existe com e sem a cena: sem a cena é mesa, com a cena é a sala. Ela só não existe quando a sala nunca vai acender, o que se sabe antes da primeira pintura: a preferência desligada, ou economia de dados sem pedido. Por isso acender a sala
      não desloca nada (testado: a folha e o título ficam no mesmo lugar) e a folha não precisa mais ser uma cópia
      desenhada pela camada fixa. No modo de foco, com contraste aumentado, com cores forçadas e na impressão a
      faixa é zero e o ensaio é a página de antes.
    - **Dois palcos.** `roomStage` (puro) escolhe pela calha mais estreita: com 96 px ou mais, `gutters`, a sala
      nas proporções de antes, recortada pela folha, e a faixa mostra a parede acima dela; abaixo disso, `band`,
      a sala composta como uma tira na escala da faixa: uma estante com o acervo inteiro (ensaios, depois
      laboratórios) à esquerda; à direita a janela e, no peitoril, a vela ao lado do vidro e o simplexo à
      frente dele; o meio, sobre o título, é reboco nu na luz da vela. A escala da tira (`k`) sai da altura que
      a faixa ocupa na parede; a janela encolhe por inteiro (moldura, gotas e luzes da rua, `uScale`), para
      não virar um caixilho com quatro vidros mínimos. O olho fica abaixo do peitoril, então a placa do
      2-simplexo fica de pé, como um pequeno quadro, com o vértice para cima (△, o glifo do estrato).
    - **Ilusões.** Paralaxe de rolagem: enquanto a faixa sai da tela, a sala sobe a 0,3 da velocidade da página
      (`scrollDrift`, `SCROLL_PARALLAX`); o olho desce, então o que está perto (a mesa, a vela nas calhas) sobe
      mais que a parede, e os livros da faixa afundam atrás da borda da folha. É a pista de profundidade do
      movimento relativo (o que está mais longe se move menos), sem nenhuma geometria a mais. A sombra da
      folha passou a contornar também a borda de cima (distância ao retângulo da folha, aberto para baixo), e
      uma vinheta escurece os cantos da janela em até 30 %: a luz de uma vela não chega aos cantos de um
      quarto. Ao acender, a cena surge sobre a madeira, não sobre o papel.
    - **Custo.** O desenho é por regiões (decisão 5): no celular, só a faixa, e nenhum quadro depois que ela
      sai da tela. Com movimento reduzido, nada desliza: a paralaxe de rolagem é a mais clássica causa de
      desconforto vestibular (WCAG 2.2, critério 2.3.3), e o quadro único fica parado até a rolagem acabar.

19. **O som da sala.** Pedido do autor em 22/11: um som de ambiente, no espírito do ASMR, com o gerador
    "Medieval Library" do myNoise (S. Pigeon, 2020) como exemplo.

    - **O quê.** Cinco camadas, as da sala deste site: chuva no vidro, fogo, vento, páginas e a pena de um
      copista. Nada é gravado nem baixado: as amostras são calculadas no navegador a partir de uma semente
      (`src/core/chrome/sound-synth.ts`, puro e testado): camas em laço (ruído rosa pelo filtro de Kellet, ruído
      marrom por integração com vazamento, emendadas por _crossfade_ de potência constante) e oito variantes de
      cada evento curto (gota, estalo, traço da pena, página). O motor (`src/islands/scenes/room-sound.ts`)
      monta o grafo Web Audio: filtros por camada (a chuva entre 0,5 e 6,5 kHz, o fogo abaixo de 380 Hz com o
      brilho oscilando, o vento numa banda que vagueia, a pena acima de 2,2 kHz), a posição estéreo pela planta
      da sala (janela e vela à direita, a mesa do copista e a estante à esquerda, as páginas do ensaio em frente)
      e um compressor no fim, para que a mistura cheia não sature.
    - **Do myNoise, e onde difere.** Vêm do myNoise a camada por controle, as predefinições (lá "The Quiet
      Room", "The Fireplace", "Paperwork"…; aqui Sala quieta, Chuva, Fogo e Copista) e a animação lenta dos
      níveis (o modo "Soft"). Difere em que o myNoise usa gravações de campo, de uso pessoal; aqui a síntese
      cabe nos orçamentos, não tem licença a respeitar e varia com a semente. É menos realista que uma gravação.
    - **A sala comanda o som.** As mesmas funções que desenham a sala (`src/core/chrome/room.ts`): a chuva cede
      quando o ensaio acaba (`rainfall` → `rainShare`, até 30 % no fim, nunca o silêncio), o vento cresce com a
      corrente de ar da rolagem (`gust` → `windShare`, e a banda sobe de 300 para 600 Hz), e uma página vira
      quando o leitor entra numa seção (um `h2` do artigo cruza o terço de cima da tela, descendo ou voltando),
      no máximo uma por gesto (`PAGE_GAP_S`, 4 s): uma rolagem rápida por cinco seções vira uma página.
    - **Eventos.** Gotas e estalos são processos de Poisson (intervalos exponenciais; 24 gotas por segundo com
      chuva plena, 2,2 estalos); a pena é uma cadeia de Markov da escrita (traços numa palavra, palavras numa
      linha, pausas mais longas a cada nível); um livro da estante tem a página virada a cada dois minutos, em
      média. Um temporizador de 100 ms agenda no relógio do áudio, com 0,3 s de antecedência (C. Wilson, "A
      Tale of Two Clocks", 2013); se ele atrasar, os eventos perdidos não saem todos de uma vez.
    - **Níveis.** De 0 a 10 por camada, 3 dB por degrau (30 dB de faixa, passos que soam iguais; Stevens,
      1957), vezes uma calibração por camada. Cada nível oscila ±20 % num período próprio, de 29 a 83 s, todos
      primos, para que as camadas nunca se movam juntas e o ouvido não se habitue (Thompson e Spencer, 1966).
      Toda mudança desliza (`setTargetAtTime`), sem estalo. Medido no Chromium, RMS na saída: Sala quieta
      ≈ −29 dBFS, Chuva ≈ −24, Fogo ≈ −23, Copista entre −36 e −27 (a pena é esparsa); tudo no máximo,
      −15 dBFS, com pico de −3,9.
    - **Só com o gesto do leitor.** Preferência `sound`, desligada por padrão. O som começa no primeiro gesto
      do leitor na página (clique, toque ou tecla) e nunca sozinho. As duas condições são exigidas: um evento
      confiável visto nesta página, e a permissão do navegador (`navigator.userActivation`). A permissão do
      navegador sozinha não basta, porque ele pode trazer a ativação da página anterior, e o ensaio soaria ao
      carregar. O navegador dos testes faz exatamente isso, e o teste exige silêncio mesmo assim. Escolher um
      som no painel é um gesto, então o som começa na hora. Com a aba oculta, esmaece e suspende; ao sair da
      página, fecha. WCAG 1.4.2: o painel tem o desligar e o volume de cada camada.
    - **O painel.** O grupo "Som da sala" tem as seis escolhas e, abaixo, "Camadas", que só aparece com um som
      escolhido: um `input type="range"` nativo por camada, em pé (`writing-mode`). O alvo tem 24 px ou mais
      de largura (WCAG 2.5.8), e um clique na trilha muda o nível sem arrastar (2.5.7). Os controles mostram
      o que toca. Mover um torna a mistura do leitor: a escolha passa a `custom`, a mistura é guardada em
      `ft:sound-mix`, e o som acompanha enquanto o controle se move. "Restaurar" esquece a mistura.
    - **Custo.** Sem som escolhido, nenhum `AudioContext` é criado e o motor não é baixado (testado). A ilha
      `ft-room-sound` só observa a preferência, mas carrega em todo ensaio: 1,8 KiB em gzip, mais 1,9 KiB de
      um pedaço que divide com o painel (a mistura e o modelo das preferências). Com som, o motor (2,7 KiB) é
      buscado em ocioso. As amostras (1,7 MiB de `Float32`; camas a 16 kHz, filtradas abaixo de 6,5 kHz;
      eventos a 24 kHz) são calculadas em cinco etapas, uma tarefa cada, depois do quadro seguinte ao clique.
      Calculadas de uma vez, levavam 74 ms a frio num núcleo de desktop (40 ms aquecido) e cairiam inteiras
      na latência do clique (INP); em etapas, nenhuma tarefa longa (> 50 ms) aparece depois do clique no
      Chromium. O painel cresce 0,9 KiB (de 7,0 para 7,9 KiB em gzip).

## Alternativas consideradas

| Alternativa                                           | Por que não                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebGL 2 direto, um _shader_ de tela cheia             | Pesaria entre 5 e 8 KiB em vez de 131,7. Descartada porque o pedido foi three.js. Fica como saída: a cena usa só malhas simples e `ShaderMaterial`, e a troca caberia em `src/islands/scenes/reading-room.ts`.                                       |
| Imagem ou vídeo de fundo                              | Não se adapta ao tema, à largura da calha nem à hora; um vídeo em laço pesa mais que a biblioteca e não tem quadro único para movimento reduzido.                                                                                                    |
| Colocar o artigo dentro da cena (textura ou CSS 3D)   | Tiraria o texto do fluxo do documento: seleção, busca, leitor de tela, zoom e contraste deixariam de ser garantidos pelo navegador. Contraria a regra do pedido.                                                                                     |
| A sala atrás da folha inteira em telas estreitas      | Poria a cena sob o texto, ou o texto sobre a madeira. A faixa acima da folha (decisão 18) dá à sala um lugar próprio em qualquer tela, sem tocar no texto.                                                                                           |
| A folha desenhada pela camada fixa (até a decisão 18) | Era uma cópia da folha da página, só nas calhas: não tinha borda de cima, e acender a sala trocava uma superfície pela outra. A folha da página, em fluxo, serve às duas.                                                                            |
| Materiais e luzes do próprio three.js                 | Compilam _shaders_ maiores e trazem o sistema de luzes para o laço de renderização; a cena precisa de uma luz e de nenhuma sombra projetada.                                                                                                         |
| A mesa em CSS em todas as páginas                     | Índices, página inicial e conceitos usam a largura toda; madeira atrás deles poria texto sobre a madeira. A sala é a dos ensaios.                                                                                                                    |
| Sala desligada por padrão, com interruptor no ensaio  | Foi o padrão da manhã de 16/11. O autor pediu depois que a sala apareça sempre, discretamente, e que o controle fique só no menu: um botão no cabeçalho de cada ensaio competia com o título. O custo de quem não quer a sala é um clique no painel. |
| A estante navegável pelo teclado                      | Seria uma segunda navegação, sobre uma cena que o leitor de tela não vê; as mesmas obras já estão no índice de ensaios e na paleta de comandos, com foco visível.                                                                                    |
| Animação contínua enquanto a sala está acesa          | Gasta bateria e atenção enquanto o leitor lê parado; o repouso (decisão 15) devolve o mesmo quadro sem custo.                                                                                                                                        |
| Som gravado, como no myNoise                          | Dezenas a centenas de KiB por camada, uma licença a respeitar (o myNoise é de uso pessoal) e laços que se repetem iguais. A síntese não baixa nada e varia com a semente; perde em realismo.                                                         |
| Um `<audio>` em laço por camada                       | Sem mistura fina, sem ligação ao estado da sala (a chuva que cede, a página que vira) e com emendas audíveis no laço; o Web Audio dá as duas coisas sem arquivo.                                                                                     |
| Síntese contínua num `AudioWorklet`                   | Gastaria processador o tempo todo para gerar ruído que se repete bem em laço; amostras calculadas uma vez bastam, e o grafo nativo faz os filtros.                                                                                                   |
| Som ligado ao carregar quando o navegador permite     | Daria continuidade entre ensaios (o navegador traz a ativação de um clique na página anterior), mas o ensaio soaria sem um gesto nele. O consentimento previsível venceu; fica como pendência.                                                       |

## Consequências

- Positivas:
  - O texto dos ensaios não muda de superfície, de contraste nem de posição com a sala; sem JavaScript ou sem
    WebGL 2 a página é a mesma, com a mesa em CSS.
  - A sala existe em toda tela, inclusive no celular, num lugar que não é do texto.
  - A decisão de mostrar a sala é uma função pura, testada sem navegador.
  - Todo módulo sob demanda passa a ter teto de peso.
- Negativas:
  - Uma dependência de execução nova, de 137,2 KiB em gzip: onze vezes o orçamento de JavaScript inicial de
    uma página. Automática por padrão, é baixada em todo ensaio aberto num aparelho com placa gráfica e sem
    economia de dados, depois da primeira pintura, e fica em cache.
  - A faixa ocupa de 110 a 152 px da primeira tela de todo ensaio, com ou sem a cena: o título desce esse
    tanto.
  - Na faixa a sala é pequena: a estante tem livros de 2 a 3 cm de altura num celular. É um ambiente, não
    uma navegação; a navegação continua no índice e na paleta.
  - _Shaders_ são código difícil de testar: os testes garantem que compilam, que a cena se move ou fica
    parada e que nenhum texto fica fora da folha, não que a imagem está bonita.
  - O CI desenha WebGL por software, que o modo automático recusa de propósito. Os testes exercitam a cena
    pela preferência `on`; o caminho automático com placa gráfica não é coberto.
  - O tempo de quadro em placa gráfica real não foi medido: o ambiente de desenvolvimento não tem uma. Em
    renderização por software (SwiftShader, quatro núcleos, 1920 × 1080), o navegador entregou de 17 a 21
    quadros por segundo; é o pior caso, e é o que o modo automático recusa.
  - A leitura do progresso para a vela e a chuva é a do artigo inteiro, incluídas as referências.
  - O som para a cada troca de página (o site não é uma aplicação de página única) e só volta no primeiro gesto
    da página seguinte; quem só rola a página com o dedo não faz gesto (rolar não ativa a página), e o som
    espera um toque. A dica do painel diz isso.
  - O som pode atrapalhar leitores de tela; a dica do painel avisa, e ele vem desligado.
  - A calibração dos níveis foi feita por RMS medido, não por loudness ponderada (LUFS, ITU-R BS.1770) nem por
    audição em fones: o ambiente de desenvolvimento não tem saída de áudio.

## Verificação

| O quê                                                                                                                                                                                                                                                                                                                       | Onde                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Modo, qualidade, governador, calma, cintilação, calhas, estante, vela, chuva; ritmo, olho, corrente de ar da mão, embaçado, rótulos da estante; faixa, palco, regiões, deriva da rolagem (50 testes)                                                                                                                        | `tests/unit/chrome/room.test.ts`       |
| Automática por padrão, e recusada no renderizador por software; preferência desligada ou modo de foco nunca pedem o pedaço da cena                                                                                                                                                                                          | `tests/e2e/room.spec.ts`               |
| Acender a sala não move a folha nem o título                                                                                                                                                                                                                                                                                | idem                                   |
| No celular a sala é a faixa: acesa, acima da folha, sem texto nela; um toque nomeia o livro e o segundo abre a obra; sem a faixa na tela, nenhum quadro                                                                                                                                                                     | idem                                   |
| A sala desacelera e para com o leitor parado, e acorda quando ele se mexe                                                                                                                                                                                                                                                   | idem                                   |
| Numa calha, o livro sob o ponteiro tem nome e o clique abre a obra; sobre a folha, nada responde                                                                                                                                                                                                                            | idem                                   |
| Sem a cena, em todo ensaio, nenhum glifo fica sobre a madeira nem na faixa; modo de foco e contraste aumentado tiram a mesa e a faixa                                                                                                                                                                                       | idem, um teste por ensaio              |
| Com a sala ligada, nenhum glifo de nenhum ensaio fica fora da folha nem acima dela                                                                                                                                                                                                                                          | idem, um teste por ensaio              |
| axe com a sala ligada, tema claro e escuro                                                                                                                                                                                                                                                                                  | idem                                   |
| Movimento reduzido: o _canvas_ não muda; sem ele, muda                                                                                                                                                                                                                                                                      | idem                                   |
| A vela é um relógio: no meio do artigo o quadro é outro, e depois não muda mais                                                                                                                                                                                                                                             | idem                                   |
| Desligar a preferência remove a camada e devolve o fundo da página                                                                                                                                                                                                                                                          | idem                                   |
| Tokens da sala dentro do gamut sRGB                                                                                                                                                                                                                                                                                         | `pnpm verify:palette`                  |
| Teto de peso por módulo e da cena                                                                                                                                                                                                                                                                                           | `pnpm check:budgets`; testes de guarda |
| Som: codec da mistura (ida e volta), degraus de 3 dB, chuva e vento seguindo a sala, oscilação limitada e assíncrona, Poisson (média dos intervalos), cadeia da pena, amostras determinísticas, limitadas, que terminam em repouso e emendam sem degrau (21 testes)                                                         | `tests/unit/chrome/sound.test.ts`      |
| Som: silêncio por padrão (nenhum contexto, motor nunca pedido); com som escolhido, nada antes do gesto mesmo com ativação herdada, e som na saída depois dele; painel por teclado (predefinição, controle → `custom`, armazenamento, axe); desligar fecha o contexto; página vira ao entrar numa seção; aba oculta suspende | `tests/e2e/sound.spec.ts`              |

## Pendências para o autor

1. **Comparar a cena com a imagem de referência** e dizer o que mudar: disposição, proporções, cores dos
   tokens `--room-*`.
2. **Altura da faixa** (de 110 a 152 px): mais alta dá mais sala e desce mais o título; e dizer se a faixa
   de mesa deve ficar também para quem desligou a sala (hoje fica, para que acender a sala não mova nada).
3. **Estender a outras páginas** (laboratórios, conceitos): hoje só os ensaios têm a sala.
4. **Rever a interação** numa placa gráfica real: a amplitude da paralaxe (4 cm), o alcance do ar da mão
   (140 px), o tempo para o vidro embaçar de novo (6 s) e os tempos do repouso (3 s, 20 s).
5. **Ouvir o som** em fones e em caixas e dizer o que mudar: os níveis das predefinições, o timbre de cada
   camada (a chuva e o fogo, sobretudo) e se falta alguma (o relógio e o sino do myNoise ficaram de fora).
6. **Continuidade entre ensaios:** deixar o som começar ao carregar quando o navegador já permite (ativação
   trazida de um clique na página anterior), ou manter a regra de hoje, o primeiro gesto em cada página.
