# ADR 0014 — Sala de leitura: uma cena three.js nas calhas dos ensaios

- **Estado:** Aceito; a composição, as cores e o padrão da preferência aguardam revisão do autor
- **Data:** 2026-11-15
- **Escopo:** `src/core/chrome/room.ts`, `src/islands/elements/ft-reading-room.ts`,
  `src/islands/scenes/reading-room.ts`, `src/styles/components/room.css`, `src/views/EssayView.astro`,
  `src/core/chrome/preferences.ts`, `src/core/design/tokens.json`, `scripts/lib/budgets.ts`,
  `tests/unit/chrome/room.test.ts`, `tests/e2e/room.spec.ts`
- **Relacionados:** ADR 0001 (núcleo funcional), ADR 0004 (cor verificável), ADR 0009 (moldura sob demanda);
  [requisitos não funcionais](../requisitos-nao-funcionais.md) §1 e §2;
  [plano de 15/11/2026](../planos/2026-11-15-sala-de-leitura.md)

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
   com `z-index: -1`, que contém o `<canvas>` da cena e, por cima dele, uma **folha**: uma faixa opaca com os
   tokens de papel, da largura exata das colunas de texto do ensaio. Todo o texto do artigo fica sobre a
   mesma superfície de antes, com o mesmo contraste; a cena só aparece nas calhas. O cabeçalho e o rodapé,
   que atravessam as calhas, ficam opacos. O "suporte de madeira" é uma borda da folha (`--room-board`), e a
   cena escurece junto às bordas, como se a folha estivesse acima da mesa. Nenhuma regra de `.essay` mudou.

2. **Decide-se antes de baixar.** `roomMode` (`src/core/chrome/room.ts`, puro) devolve `off`, `still` ou
   `live` a partir do que a casca mede. O three.js só é importado quando o modo não é `off`, e em tempo
   ocioso, depois da primeira pintura.

   | Condição                                                          | `auto`  | `on`    |
   | ----------------------------------------------------------------- | ------- | ------- |
   | preferência `off`; modo de foco; cores forçadas; sem WebGL 2      | `off`   | `off`   |
   | calha menor que 96 px de cada lado                                | `off`   | `off`   |
   | economia de dados; contraste aumentado; renderizador por software | `off`   | —       |
   | movimento reduzido                                                | `still` | `still` |
   | até 2 núcleos ou até 2 GiB de memória                             | `still` | —       |
   | nenhuma das anteriores                                            | `live`  | `live`  |

   Limites duros valem sempre; limites brandos só valem no automático, porque quem ligou a sala conhece o
   próprio aparelho melhor que uma heurística. Lei testada por propriedade: acrescentar uma restrição nunca
   eleva o modo. Com a largura atual das colunas, a calha de 96 px exige uma janela de cerca de 1 540 px.

3. **three.js entra como dependência, isolado num pedaço sob demanda.** `three@0.187.0`, versão fixada (a
   biblioteca não segue versionamento semântico), importado só por `src/islands/scenes/reading-room.ts` com
   importações nomeadas. O pedaço pesa 135,3 KiB em gzip; o elemento que decide carregá-lo, 3,9 KiB.

4. **A cena é procedural: nenhum arquivo além do código.** Veios da madeira, reboco, chuva e chama são
   _shaders_ de fragmento. Não há sistema de luzes, mapas de sombra nem pós-processamento: uma luz pontual
   analítica (a vela, Lambert com decaimento pelo inverso do quadrado) e um termo de área (a janela) são
   avaliados no _shader_ de cada material, com uniformes compartilhados; as sombras são de contato,
   analíticas. São cerca de doze chamadas de desenho por calha: mesa, parede, janela, vela, poça de cera,
   pavio, castiçal, o simplexo, uma `InstancedMesh` com todas as caixas (livros, prateleiras, peitoril,
   aparadores), uma nuvem de pontos (poeira) e dois quadriláteros aditivos (chama e halo). Padrões mais
   finos que um pixel se desfazem pela derivada em espaço de tela, em vez de produzir _moiré_.

5. **Só as calhas são sombreadas.** O quadro é desenhado duas vezes sob um retângulo de tesoura, uma por
   calha; os pixels cobertos pela folha custam uma limpeza do _buffer_. A 1920 × 1080 as calhas somam 30 % da
   tela.

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

11. **O leitor manda.** Preferência `room` (`auto` | `on` | `off`) no painel de preferências, com explicação.
    O modo de foco desliga a sala. Com isso há um mecanismo para parar ou esconder o movimento (WCAG 2.2,
    critério 2.2.2).

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

## Alternativas consideradas

| Alternativa                                         | Por que não                                                                                                                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WebGL 2 direto, um _shader_ de tela cheia           | Pesaria entre 5 e 8 KiB em vez de 131,7. Descartada porque o pedido foi three.js. Fica como saída: a cena usa só malhas simples e `ShaderMaterial`, e a troca caberia em `src/islands/scenes/reading-room.ts`.   |
| Imagem ou vídeo de fundo                            | Não se adapta ao tema, à largura da calha nem à hora; um vídeo em laço pesa mais que a biblioteca e não tem quadro único para movimento reduzido.                                                                |
| Colocar o artigo dentro da cena (textura ou CSS 3D) | Tiraria o texto do fluxo do documento: seleção, busca, leitor de tela, zoom e contraste deixariam de ser garantidos pelo navegador. Contraria a regra do pedido.                                                 |
| Mostrar a sala em qualquer largura                  | Abaixo de 96 px de calha não há onde ela aparecer; o leitor pagaria o download por algo que a folha cobre.                                                                                                       |
| Materiais e luzes do próprio three.js               | Compilam _shaders_ maiores e trazem o sistema de luzes para o laço de renderização; a cena precisa de uma luz e de nenhuma sombra projetada.                                                                     |
| Sala desligada por padrão                           | É a opção mais conservadora e continua a uma linha de distância (`DEFAULT_PREFERENCES.room`). O automático foi escolhido porque o pedido era chamar a atenção de quem visita, e os limites acima contêm o custo. |

## Consequências

- Positivas:
  - O texto dos ensaios não muda de superfície, de contraste nem de posição; sem JavaScript, sem WebGL 2 ou
    em tela estreita a página é exatamente a de antes.
  - A decisão de mostrar a sala é uma função pura, testada sem navegador.
  - Todo módulo sob demanda passa a ter teto de peso.
- Negativas:
  - Uma dependência de execução nova, de 135,3 KiB em gzip: onze vezes o orçamento de JavaScript inicial de
    uma página. Só é baixada em ensaios, por leitores com janela larga e placa gráfica, e fica em cache.
  - A sala só existe a partir de cerca de 1 540 px de largura. Em telas de 1 366, 1 440 ou 1 536 px ela não
    aparece.
  - _Shaders_ são código difícil de testar: os testes garantem que compilam, que a cena se move ou fica
    parada e que nenhum texto fica fora da folha, não que a imagem está bonita.
  - O CI desenha WebGL por software, que o modo automático recusa de propósito. Os testes exercitam a cena
    pela preferência `on`; o caminho automático com placa gráfica não é coberto.
  - O tempo de quadro em placa gráfica real não foi medido: o ambiente de desenvolvimento não tem uma. Em
    renderização por software (SwiftShader, quatro núcleos, 1920 × 1080), o navegador entregou de 17 a 21
    quadros por segundo; é o pior caso, e é o que o modo automático recusa.
  - A leitura do progresso para a vela e a chuva é a do artigo inteiro, incluídas as referências.
  - A textura do papel da folha é fixa na janela, enquanto a do corpo rola com a página. A diferença é de
    um ruído com 4 % de opacidade.

## Verificação

| O quê                                                                                    | Onde                                   |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| Modo, qualidade, governador, calma, cintilação, calhas, estante, vela, chuva (33 testes) | `tests/unit/chrome/room.test.ts`       |
| Tela sem calha ou preferência desligada nunca pedem o pedaço da cena                     | `tests/e2e/room.spec.ts`               |
| Com a sala ligada, nenhum glifo de nenhum ensaio fica fora da folha                      | idem, um teste por ensaio              |
| axe com a sala ligada, tema claro e escuro                                               | idem                                   |
| Movimento reduzido: o _canvas_ não muda; sem ele, muda                                   | idem                                   |
| A vela é um relógio: no meio do artigo o quadro é outro, e depois não muda mais          | idem                                   |
| Desligar a preferência remove a camada e devolve o fundo da página                       | idem                                   |
| Tokens da sala dentro do gamut sRGB                                                      | `pnpm verify:palette`                  |
| Teto de peso por módulo e da cena                                                        | `pnpm check:budgets`; testes de guarda |

## Pendências para o autor

1. **Comparar a cena com a imagem de referência** e dizer o que mudar: disposição, proporções, cores dos
   tokens `--room-*`.
2. **Confirmar o padrão da preferência**: automático (como está) ou desligado.
3. **Limiar da calha** (96 px): mais baixo mostra a sala em notebooks, como uma faixa estreita.
4. **Estender a outras páginas** (laboratórios, conceitos): hoje só os ensaios têm a sala.
