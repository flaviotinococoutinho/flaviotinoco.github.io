# Sala de leitura: só quando pedida, e respondendo à mão — 16/11/2026

- Status: executado na branch `flavio/vibrant-hamilton-wowk2z`; aguarda revisão do autor
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [ADR 0014](../adr/0014-sala-de-leitura.md), decisões 11, 15 e 16;
  [plano de 15/11/2026](2026-11-15-sala-de-leitura.md)

Documento de projeto desta rodada: o que foi pedido, como foi lido, o que entrou e o que ficou para depois.
É um plano com data, não um contrato permanente.

## 1. Pedido

Revisar a configuração do site, que não era para ficar sempre ativa, e o ambiente rústico de leitura em 3D de
fundo, com a melhor interação possível.

## 2. Leitura do pedido

A sala de leitura estava no automático por padrão: em qualquer janela larga com placa gráfica ela aparecia,
baixava 135 KiB e animava sem parar. O pedido tem três consequências verificáveis:

| Parte do pedido             | Critério                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Não ficar sempre ativa      | desligada por padrão: nada da cena é baixado até o leitor pedir                                       |
|                             | quando acesa, para enquanto o leitor está parado, e volta quando ele se mexe                          |
| Pedir sem procurar          | o pedido fica no próprio ensaio, onde a sala apareceria, e só onde ela cabe                           |
| A melhor interação possível | a sala responde à mão, com gestos que têm sentido nela: olhar, soprar, limpar o vidro, pegar um livro |
|                             | nada disso compete com a leitura: só nas calhas, nunca sobre o texto, nunca necessário                |

## 3. Decisões

Estão no ADR 0014 (decisões 11, 15 e 16). Em resumo:

- **Padrão `off`.** A preferência `room` passa a `off` | `auto` | `on`. Quem havia escolhido "ligada" continua
  com ela (o valor guardado não muda); quem nunca escolheu fica sem a sala.
- **O interruptor é uma vela.** `ft-room-switch` é um botão de alternância no cabeçalho do ensaio, com o
  rótulo "Sala de leitura" e uma vela que acende com a sala. Aparece só onde a sala caberia, julgado sem
  criar contexto WebGL. Grava a mesma preferência do painel, num armazenamento compartilhado que relê o
  guardado antes de mudar uma chave.
- **Repouso.** Três ritmos: todos os quadros enquanto o leitor se mexe e por mais 3 s; 15 por segundo até
  20 s; depois, nenhum. A justificativa é de percepção: movimento na periferia captura a atenção (Franconeri e
  Simons, 2003).
- **Interação.** Os gestos valem só sobre o fundo nu fora da folha:

  | Gesto                   | Resposta                                     | Modelo puro          |
  | ----------------------- | -------------------------------------------- | -------------------- |
  | ponteiro numa calha     | o olho se desloca até 4 cm: paralaxe         | `eyeFor`, `approach` |
  | mão perto da chama      | a chama se inclina com o ar                  | `breath`, `gust`     |
  | mão sobre a janela      | o embaçado se limpa e volta em segundos      | `refog`              |
  | ponteiro sobre um livro | o livro sai da estante, com o título ao lado | `decodeShelfLabels`  |
  | clique no livro         | abre a obra                                  | idem                 |

## 4. O que entrou

| Peça                    | Arquivos                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Padrão e decisão        | `src/core/chrome/preferences.ts`; `src/islands/elements/ft-reading-room.ts` (`data-scene-able`)         |
| Interruptor             | `src/islands/elements/ft-room-switch.ts`; `src/views/EssayView.astro`; `src/styles/components/room.css` |
| Armazenamento           | `src/islands/preferences-store.ts`; `src/islands/elements/ft-preferences.ts`                            |
| Ritmo e gestos (puros)  | `src/core/chrome/room.ts`; `tests/unit/chrome/room.test.ts`                                             |
| Cena                    | `src/islands/scenes/reading-room.ts`: olho, máscara do embaçado, livro puxado, escolha por raio         |
| Estante com nomes       | `src/adapters/astro/shelf.ts`; `src/pages/[lang]/shelf.json.ts`                                         |
| Textos                  | `src/core/i18n/catalogs/reading.ts`, `chrome.ts`                                                        |
| Testes de ponta a ponta | `tests/e2e/room.spec.ts`                                                                                |
| Documentação            | ADR 0014; arquitetura §6; requisitos não funcionais; registro de mudanças; este plano                   |

Três defeitos apareceram no caminho e foram corrigidos antes de entrar:

1. O interruptor nascia com `hidden`, e o registro das ilhas só carrega um elemento quando ele entra na tela:
   um elemento escondido nunca entra. Ele passou a carregar com a página (`data-eager`).
2. O painel de preferências guardava uma cópia em memória e a gravava inteira a cada mudança: depois de um
   clique no interruptor, a próxima mudança no painel desfaria a sala. O armazenamento compartilhado relê o
   guardado antes de cada gravação, e o painel espelha as mudanças de outro controle.
3. O embaçado do vidro era fraco demais para que limpá-lo se visse. Ele passou a ser uma névoa que espalha a
   luz que a atinge (o dia, ou a vela à noite), e as gotas ficam mais nítidas onde a mão passou.

## 5. Medidas

| Medida                                       | Valor                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Pedaço da cena, gzip                         | 136,4 KiB de 140 (era 135,3)                                                     |
| Elemento `ft-reading-room`, gzip             | 5,5 KiB de 16 (era 3,9)                                                          |
| Maior página HTML (`amostrar-e-decidir`)     | 159,8 KiB de 160 (o botão é montado pela ilha: 461 bytes a menos no HTML)        |
| Download de quem não pede a sala             | nenhum byte da cena                                                              |
| Vidro limpo, de dia (lado esquerdo de baixo) | brilho de 198 para 195 e contraste local de 2,3 para 5,2 (desvio-padrão, 8 bits) |

## 6. Pendências do autor

1. Experimentar a sala numa placa gráfica real e ajustar a amplitude da paralaxe (4 cm), o alcance do ar da
   mão (140 px), o tempo do embaçado (6 s) e os do repouso (3 s, 20 s).
2. Dizer se o botão no cabeçalho é o lugar certo, ou se prefere a vela só no painel.
3. De dia o efeito de limpar o vidro é discreto, de propósito; à noite é nítido. Dizer se quer mais.

## 7. Segunda rodada do dia: o ambiente rústico para todos; a proveniência retirada

Pedido do autor: continuar, aplicar o ambiente rústico e retirar das obras atuais a menção ao uso de IA.

- **Ambiente rústico.** Com a cena desligada por padrão, o ensaio voltava a ser uma página de papel: o
  ambiente do conceito só existia para quem acendesse a vela, e só em janelas a partir de cerca de 1 540 px. A
  mesa e a folha passam a ser CSS em todo ensaio (ADR 0014, decisão 17): mesa de madeira velha com veio, folha
  de papel no aro de madeira. A cena 3D continua sendo a versão acesa. Um teste por ensaio confere, numa janela
  de 1 440 px, que nenhum glifo fica sobre a madeira.
- **Proveniência.** O campo `provenance` passou a opcional e saiu das 32 obras (oito ensaios e oito
  laboratórios, em duas línguas). Nada de falso foi escrito no lugar: as obras não se declaram "revisadas" nem
  "sem assistência", só deixam de declarar. As frases de "Sobre" e "Colofão" que diziam que cada obra declara a
  proveniência, e que os textos estavam marcados como não revisados, saíram também, com entrada de revisão. Os
  avisos "Sobre este texto" dessas duas páginas, que falam da própria página, ficaram: o pedido foi sobre as
  obras.

Pendências desta rodada: decidir se os avisos "Sobre este texto" de "Sobre" e "Colofão" também saem; a revisão
dos textos continua sendo do autor, e o histórico do repositório guarda as notas retiradas.
