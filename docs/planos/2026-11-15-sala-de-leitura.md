# Sala de leitura — 15/11/2026

- Status: executado na branch `flavio/vibrant-hamilton-wowk2z`; aguarda revisão do autor
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [ADR 0014](../adr/0014-sala-de-leitura.md); [requisitos não funcionais](../requisitos-nao-funcionais.md) §1

Documento de projeto desta rodada: o que foi pedido, o que se decidiu, o que entrou e o que ficou para depois.
É um plano com data, não um contrato permanente.

## 1. Pedido

Em 14/11/2026 o autor descreveu um conceito visual: uma sala de leitura com madeira envelhecida, livros, chuva
na janela e uma vela iluminando a mesa; o artigo no centro, como papel apoiado em um suporte de madeira. Deu
a regra do projeto — o ambiente cria a atmosfera, e a leitura recebe a prioridade — e pediu three.js,
otimizado para o site.

A imagem que acompanhava o pedido não chegou a quem implementou. A cena foi feita a partir do texto.

## 2. Leitura do pedido

A regra tem duas metades, e cada uma virou um critério que se pode conferir:

| Metade                        | Critério                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| A leitura recebe a prioridade | nenhum glifo do artigo fica sobre a cena; o contraste do texto é o mesmo com e sem a sala             |
|                               | a sala não custa nada a quem não a vê: sem calha, sem download                                        |
|                               | o movimento diminui quando o leitor entra no texto, para com movimento reduzido, e pode ser desligado |
| O ambiente cria a atmosfera   | mesa, estante, janela com chuva e vela nas calhas, nos dois temas, mudando com a hora do dia          |

## 3. Decisões

Estão no ADR 0014. Em resumo: a sala é uma camada atrás da página, com uma folha opaca sob o texto; decide-se
se ela existe antes de baixar o three.js; a cena é procedural, com oito objetos e sem arquivos; só as calhas são
desenhadas; as cores vêm de seis tokens novos; a qualidade desce sozinha quando os quadros atrasam.

## 4. O que entrou

| Peça                    | Arquivos                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Modelo puro             | `src/core/chrome/room.ts`; testes em `tests/unit/chrome/room.test.ts`                           |
| Cena                    | `src/islands/scenes/reading-room.ts` (three.js 0.187.0)                                         |
| Ilha                    | `src/islands/elements/ft-reading-room.ts`; `src/views/EssayView.astro`                          |
| Estilos                 | `src/styles/components/room.css`; tokens `room-*` em `src/core/design/tokens.json`              |
| Preferência             | `room` em `src/core/chrome/preferences.ts`; rótulos em `src/core/i18n/catalogs/chrome.ts`       |
| Orçamentos              | teto por módulo e teto da cena em `scripts/lib/budgets.ts` e `scripts/check-budgets.ts`         |
| Testes de ponta a ponta | `tests/e2e/room.spec.ts`                                                                        |
| Documentação            | ADR 0014; este plano; arquitetura; requisitos não funcionais; registro de mudanças; `CLAUDE.md` |

Um defeito apareceu no caminho e foi corrigido antes de entrar: a cintilação da vela devolvia `NaN` para
tempos muito grandes (o argumento do seno estourava). O teste de propriedade o encontrou; a função agora reduz
o tempo ao período comum das três senoides, 100 s.

## 5. Medidas

| Medida                                       | Valor                               |
| -------------------------------------------- | ----------------------------------- |
| Pedaço da cena (three.js incluído), gzip     | 131,6 KiB                           |
| Elemento `ft-reading-room`, gzip             | 3,2 KiB                             |
| JavaScript inicial das páginas               | inalterado                          |
| Objetos desenhados por quadro                | 8, em duas passagens                |
| Área sombreada a 1920 × 1080                 | 30 % da tela (as duas calhas)       |
| Largura mínima da janela para a sala existir | cerca de 1 540 px (calha de 96 px)  |
| Tempo de quadro em placa gráfica real        | não medido (o ambiente não tem uma) |

## 6. Pendências do autor

1. Comparar a cena com a imagem de referência: disposição, proporções e os valores dos tokens `--room-*`.
2. Confirmar o padrão da preferência (automático) ou trocar para desligado.
3. Decidir o limiar da calha e se a sala vale para outras páginas além dos ensaios.

## 7. Próximos passos sugeridos

| Frente                                                                           | Observação                                                |
| -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Medir o tempo de quadro em aparelhos reais (um notebook com gráficos integrados) | calibra os degraus de qualidade e o limiar do governador  |
| Trocar o three.js por WebGL 2 direto, se o peso incomodar                        | de 131,6 KiB para menos de 10 KiB; ADR 0014, alternativas |
| Laboratório do pipeline para o ensaio de ETL                                     | plano de 14/11/2026, §7                                   |
