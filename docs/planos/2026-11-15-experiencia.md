# Experiência de quem chega e de quem volta — 15/11/2026

- Status: executado na branch `flavio/vibrant-hamilton-wowk2z`; aguarda revisão do autor
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [ADR 0014](../adr/0014-sala-de-leitura.md); [plano de 14/11/2026](2026-11-14-escopo-e-primeira-tela.md), §7

Documento de projeto desta rodada: o que foi pedido, o que se decidiu, o que entrou e o que ficou para depois.
É um plano com data, não um contrato permanente.

## 1. Pedido

Em 15/11/2026 o autor pediu: "Evolua a experiência." O pedido não diz qual; esta rodada escolheu pelo alcance.

## 2. Diagnóstico

| Ponto                  | Estado antes desta rodada                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Quem chega por um link | um link do site colado em conversa ou rede social não mostrava imagem: nenhuma página tinha `og:image` |
| Quem volta a um ensaio | começava do topo, sem saber onde tinha parado                                                          |
| Sala de leitura        | só existe com janela de cerca de 1 540 px ou mais; a maioria dos leitores não a vê                     |

As duas primeiras atingem todo leitor, em qualquer tela. A terceira é decisão do autor (ADR 0014, pendências) e
ficou como estava.

## 3. Decisões

- **Um cartão por obra, não um cartão genérico.** O cartão de um ensaio diz o estrato (glifo e nome), a
  passagem, o título, a descrição e as disciplinas; o de um laboratório mostra também a miniatura do próprio
  laboratório; o do site mostra a ponte dos quatro estratos. As demais páginas usam o cartão do site.
- **Gerado na compilação, a partir de um modelo puro.** `src/core/chrome/card.ts` descreve o cartão; satori o
  compõe e resvg o rasteriza. Os dois já estavam nas dependências de desenvolvimento.
- **Fontes próprias para os cartões.** O satori não lê WOFF2. Em vez de converter na compilação, duas
  instâncias TTF estáticas são cortadas das mesmas fontes fixadas do google/fonts, pelo mesmo processo
  reprodutível das fontes do site, com arquivo de proveniência próprio.
- **Memória de leitura só no navegador.** Nada sai do aparelho. O registro é limitado a 40 ensaios e a 180
  dias, e o aviso tem o botão "Esquecer". Uma visita que só espia o topo não apaga o lugar, e a vela da sala
  parte do ponto mais adiantado.

## 4. O que entrou

| Peça                    | Arquivos                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Cartões: modelo         | `src/core/chrome/card.ts`, `src/core/design/oklch.ts`; testes em `tests/unit/chrome/card.test.ts`               |
| Cartões: geração        | `src/adapters/astro/card.ts`, `src/pages/[lang]/card/[kind]/[slug].png.ts`, `scripts/fonts/build_card_fonts.py` |
| Cartões: metadados      | `src/layouts/BaseLayout.astro` (`og:image`, dimensões, texto alternativo, `twitter:card`)                       |
| Memória: modelo         | `src/core/reading/memory.ts`; testes em `tests/unit/reading/memory.test.ts`                                     |
| Memória: ilha           | `src/islands/elements/ft-reading-memory.ts`; `src/views/EssayView.astro`; `reading.css`; catálogo `reading`     |
| Testes de ponta a ponta | `tests/e2e/share.spec.ts`, `tests/e2e/memory.spec.ts`                                                           |

## 5. Medidas

| Medida                           | Valor                     |
| -------------------------------- | ------------------------- |
| Cartões gerados                  | 38 (2,3 MB no `dist/`)    |
| Tempo de compilação acrescentado | cerca de 3 s              |
| Fontes dos cartões               | 43,5 KiB + 30,1 KiB (TTF) |
| JavaScript inicial das páginas   | inalterado                |

## 6. Pendências do autor

1. Ver os cartões como aparecem ao colar um link (por exemplo, no WhatsApp ou no LinkedIn) e dizer se o
   desenho serve. Até o lançamento (ADR 0008) o site não é indexado, mas os cartões já valem para links.
2. Decidir se o aviso de memória de leitura deve existir também nos laboratórios.
