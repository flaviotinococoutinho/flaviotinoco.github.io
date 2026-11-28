# Experiência de leitura: o texto primeiro, e o que não agregava saiu — 26/11/2026

- Status: executado na branch `flavio/vibrant-hamilton-wowk2z`; aguarda revisão do autor
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [leitura não linear](../leitura-nao-linear.md); [plano de 22/11/2026 (hierarquia de
  leitura)](2026-11-22-hierarquia-de-leitura.md); [ADR 0004](../adr/0004-sistema-de-cor-verificavel.md);
  [ADR 0014](../adr/0014-sala-de-leitura.md)

Documento de projeto desta rodada: o que foi pedido, como foi medido, o que se decidiu manter, simplificar ou
tirar, e por quê. É um plano com data, não um contrato permanente.

## 1. Pedido

"Atualize os últimos ajustes, melhore ao máximo a experiência do site de artigos. Use os melhores conceitos de
experiência de leitura e qualificação narrativa e visual e revise todos conceitos atuais que não agregam valor
ao site."

O pedido tem três partes:

- **Atualizar.** O ramo partiu do `main` atual (o som da sala, PR #59, e a atualização das _actions_, PR #60).
- **Melhorar a leitura dos ensaios.** O critério é o que a pesquisa de leitura e a tradição editorial dizem sobre
  a entrada no texto, a orientação e o fim.
- **Revisar cada recurso.** Cada um precisa responder "o que o leitor ganha com isto?". O que não responde sai.

## 2. Método

As páginas foram compiladas e abertas no Chromium (1 440 × 900 e 390 × 844). A medida principal é a distância do
topo da página até o primeiro parágrafo do ensaio: quanto o leitor precisa rolar antes de ler. Ela foi tomada nos
oito ensaios em português, antes (o `main`) e depois.

Cada recurso visível ou executado no ensaio, no índice e na página inicial foi listado. Para cada um, a pergunta
foi o que ele dá ao leitor que outro recurso ainda não dê.

## 3. O que a medida mostrou

No `main`, o primeiro parágrafo de um ensaio começava em média a **1 831 px no desktop (2,03 telas)** e a
**2 369 px no celular (2,81 telas)**. Antes dele vinham, nesta ordem:

1. a faixa da mesa;
2. três linhas de contexto (estrato, "Passagem de Formal para Valor", disciplinas);
3. o título e o subtítulo;
4. uma linha de fatos com o número de palavras;
5. a caixa do estado epistêmico, entre dois filetes;
6. o resumo inteiro, de 198 a 237 palavras em corpo menor;
7. as palavras-chave;
8. o sumário.

O leitor via o aparato e não via o texto.

A tradição jornalística e a ensaística concordam que a entrada do texto é o parágrafo de abertura: o gancho e a
tese (o _lede_). No meio digital, o que fica abaixo da primeira tela recebe muito menos atenção (Nielsen, 2010),
e quem chega decide em segundos se fica (Liu, White e Dumais, 2010). O resumo repetia o próprio parágrafo de
abertura: nos oito ensaios, ele termina com "Este ensaio examina…" ou equivalente.

## 4. Decisões, recurso por recurso

| Recurso                                                                    | Decisão        | Por quê                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resumo (ABNT NBR 6028) em cheio antes do texto                             | **Recolhido**  | Continua no documento (busca, leitor de tela, impressão), sob uma linha "▸ Resumo e palavras-chave". Revelação progressiva: o título, o subtítulo e o sumário já dizem do que o ensaio trata.                                                                                                                       |
| Sumário antes da introdução                                                | **Movido**     | Passa a vir depois da introdução e antes da primeira seção, a ordem da Wikipédia (introdução, sumário, corpo). O parágrafo de abertura, com a capitular, é o primeiro texto que o leitor encontra, e o sumário vem em seguida como a rota. O contrato editorial passou a exigir essa ordem nos 16 ensaios.          |
| Estado epistêmico numa caixa com título                                    | **Uma linha**  | "Confiança ◆ Provável (63%–87%) · Base: Argumentação", sob as datas. O título fica para o leitor de tela, e "probabilidade estimada de" também (no celular a linha cabia em três).                                                                                                                                  |
| "Passagem de Formal para Valor" no cabeçalho                               | **Tirado**     | É o vocabulário interno do site; a mesma informação está no fim, em "Próximo na ponte: Valor", onde ela orienta o próximo passo.                                                                                                                                                                                    |
| Número de palavras e "mais N min em expansões"                             | **Tirados**    | O tempo de leitura já diz o custo. As palavras são uma medida de quem escreve.                                                                                                                                                                                                                                      |
| Dois filetes entre o cabeçalho e o texto                                   | **Um**         | Um filete separa o espaço da cabeça do texto (Samara); dois eram ruído.                                                                                                                                                                                                                                             |
| Mapa do argumento (grafo na margem)                                        | **Removido**   | Repetia o sumário (os mesmos nós e tipos) e as linhas "Apoia-se em" (as mesmas arestas). Em sete dos oito ensaios a margem é das notas laterais, e o mapa aparecia ali recolhido: um título solto sobre uma caixa vazia. Saíram o componente, a ilha, o desenho (Sugiyama) e o seu teste.                           |
| Fim do ensaio                                                              | **Reordenado** | Primeiro "Próximo na ponte" (o que ler a seguir), depois os conceitos, por último o histórico de revisões. O fim conduz a leitura adiante, e os metadados ficam por último.                                                                                                                                         |
| Passagem horizontal "fixada"                                               | **Removida**   | Em telas largas, a rolagem vertical deslizava os painéis de lado (_scrolljacking_). A roda fazia outra coisa que rolar, contra a expectativa do leitor (Nielsen Norman Group, 2013). Fica a região rolável nativa, que já era o comportamento sem JavaScript, no celular e com movimento reduzido.                  |
| Revelação na rolagem (página inicial)                                      | **Removida**   | Seções inteiras ("Do que este site trata", "Ensaios recentes") ficavam transparentes até entrar na tela. Quem rola rápido, quem procura com Ctrl+F e quem captura a página via vazio. Movimento sem informação.                                                                                                     |
| Campo de partículas atrás da abertura (início)                             | **Removido**   | Traços animados atrás do texto de abertura. O início de um movimento na periferia captura a atenção (Abrams e Christ, 2003), e esse movimento não dizia nada. Saiu a ilha; o núcleo WebAssembly `dynamics` continua (os laboratórios usam), com as funções do campo ainda nele até a próxima recompilação com Rust. |
| Simular visão de cores (painel)                                            | **Removida**   | É uma ferramenta de auditoria de quem projeta, não de quem lê, e pesava cerca de 1 KB de filtros SVG em toda página. A verificação de discromatopsia continua em `pnpm verify:palette`. Uma escolha antiga guardada no navegador é ignorada (testado).                                                              |
| Sala de leitura, som, mesa                                                 | **Mantidos**   | Foram pedidos e revistos pelo autor até 22/11. A abertura ficou 26 px mais baixa dentro da folha (de `--space-3` para `--space-2`), e a faixa não mudou. Ficam para o autor decidir (seção 7).                                                                                                                      |
| Notas laterais, _stretchtext_, _scrollytelling_, régua, memória, progresso | **Mantidos**   | Cada um responde a uma necessidade distinta: comentar sem desviar, aprofundar sob pedido, mostrar uma figura que muda, acompanhar a linha, voltar ao ponto, saber quanto falta.                                                                                                                                     |

## 5. O que mudou, medido

| Medida (8 ensaios, média)                    | Antes                               | Depois                                                 |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| Primeiro parágrafo, desktop (1 440 × 900)    | 1 831 px (2,03 telas)               | 868 px (0,96 tela)                                     |
| Primeiro parágrafo, celular (390 × 844)      | 2 369 px (2,81 telas)               | 1 025 px (1,21 tela)                                   |
| HTML de "A segunda flag"                     | 126,7 kB                            | 116,9 kB                                               |
| HTML de "Amostrar é decidir" (o mais pesado) | 162,9 kB (perto do teto de 160 KiB) | 155,0 kB                                               |
| Página inicial                               | 49,2 kB                             | 47,7 kB                                                |
| Ilhas a menos                                | —                                   | `ft-argument-map`, `ft-ambient-field`, `ft-horizontal` |
| Grupos no painel de preferências             | 14                                  | 13                                                     |

Em cinco dos oito ensaios, no desktop, o parágrafo de abertura com a capitular aparece na primeira tela. Nos
outros três, uma epígrafe ou um título de três linhas vem antes dele.

A melhoria tem dois guardas:

- **O contrato editorial** (`tests/unit/content/syntax.test.ts`) exige que nenhum ensaio abra com o sumário.
- **`tests/e2e/opening.spec.ts`**, nos 16 ensaios e nas duas telas, exige o resumo recolhido, o sumário logo antes
  da primeira seção e o primeiro parágrafo a até 1,4 tela no desktop e 2 no celular. Voltar com o resumo inteiro
  antes do texto quebra o teste.

## 6. Princípios usados

- **O texto primeiro.** O parágrafo de abertura é o gancho e a tese. O aparato serve ao texto e não o precede em
  bloco.
- **Revelação progressiva** (Nielsen, 2006). O que poucos querem fica a um clique: o resumo, as expansões, o
  histórico de revisões.
- **Um só lugar para cada informação.** Duas representações da mesma estrutura dividem a atenção e não somam.
- **Movimento só quando informa.** Animação que não diz nada compete com a leitura. A sala de leitura é a exceção
  pedida pelo autor, e ela para quando o leitor para (ADR 0014, decisão 15).
- **Ninguém toma a rolagem do leitor.** A rolagem rola; a página não a sequestra.

## 7. O que ficou para o autor

1. **A faixa da mesa** (110 a 152 px no topo de todo ensaio, ADR 0014, decisão 18). Sem a cena (sem placa
   gráfica, movimento reduzido, economia de dados), é só madeira. Reduzi-la, ou mostrá-la só quando a cena acende,
   aproximaria o texto em mais uma linha de tela, mas mudaria a decisão 18 (acender a sala não move nada).
2. **Títulos longos.** O título de "A segunda flag" ocupa três linhas no desktop e cinco no celular. Um título mais
   curto, com o resto no subtítulo, é decisão de texto.
3. **As funções do campo de partículas no núcleo `dynamics`** (`flow_*`, ADR 0003). Saem na próxima recompilação
   dos núcleos (`node scripts/build-wasm.mjs --rebuild`, exige Rust), com a atualização do ADR 0003.

## Referências

- ABRAMS, R. A.; CHRIST, S. E. Motion onset captures attention. _Psychological Science_, v. 14, n. 5,
  p. 427–432, 2003.
- LIU, C.; WHITE, R. W.; DUMAIS, S. Understanding web browsing behaviors through Weibull analysis of dwell time.
  In: SIGIR, 33., 2010, Genebra. _Proceedings_ […]. Nova York: ACM, 2010. p. 379–386.
- NIELSEN, J. Progressive disclosure. _Nielsen Norman Group_, dez. 2006.
- NIELSEN, J. Scrolling and attention. _Nielsen Norman Group_, mar. 2010.
- NIELSEN NORMAN GROUP. Scrolljacking 101. _Nielsen Norman Group_, [2013?].
- SAMARA, T. _Making and breaking the grid_. 3. ed. Beverly: Rockport, 2023.
