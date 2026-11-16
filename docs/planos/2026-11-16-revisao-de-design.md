# Revisão de design: os sistemas de signos — 16/11/2026

- Status: executado na branch `flavio/vibrant-hamilton-wowk2z`; aguarda revisão do autor
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [arquitetura](../arquitetura.md) §6, "Signos"; [ADR 0013](../adr/0013-escopo-do-site.md);
  [requisitos não funcionais](../requisitos-nao-funcionais.md) §2

Documento de projeto desta rodada: o que foi pedido, o que se achou, o que se decidiu e o que ficou para o
autor. É um plano com data, não um contrato permanente.

## 1. Pedido

Continuar melhorando o design orgânico do site, com olhar de design de experiência, semiótica e símbolos; ser
criterioso e revisar sem aplicar soluções de contorno.

## 2. Leitura do pedido

"Orgânico", aqui, não quer dizer mais ornamento. Quer dizer que cada signo vem de uma regra do próprio site e
significa uma só coisa em todas as páginas. O critério da rodada sai daí: procurar onde um signo significa duas
coisas, ou onde um texto afirma o que o modelo do site não sustenta, e corrigir a regra que o gera, e não a
ocorrência.

Método: capturas das páginas principais (claro e escuro, computador e celular) e inventário dos repertórios de
signos (simplexos dos estratos, formas de obra, pictogramas das frentes, marcas de interface, papéis do
argumento, realce de código, separadores). De cada repertório se perguntou qual dimensão de significado ele
carrega e se as suas formas colidem com as de outra dimensão.

## 3. Achados e decisões

| Achado                                                                                                                                                                                    | Causa                                                                                         | Correção na origem                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Os papéis do argumento usavam ● ○ △ ▽ ◇ ◆ □ ■ ◎, as primitivas dos simplexos, na mesma tela que o estrato: o ponto da Filosofia lia-se como "tese", o triângulo do Formal como "premissa" | nenhuma regra repartia as formas entre as dimensões de significado                            | a regra ficou escrita (arquitetura §6: um repertório por dimensão); os papéis passaram à notação lógica, em pares: ∵ ∴, ⊢ ⊨, ¬ ¬¬, ? ∎, ≔ ∈                                                    |
| O código vinha nos matizes do GitHub (palavra-chave azul como um link, texto laranja como o estrato de valor) sobre um fundo próprio, branco ou quase preto                               | tema de terceiros                                                                             | tema do site, só com tokens: palavras reservadas em negrito (linguagem de publicação do ALGOL 60; WEB de Knuth), comentários na tinta secundária; o teste de guarda verifica que nada mais sai |
| No laboratório "O pipeline" uma barra de dados vinha na cor dos links (erro desta mesma sessão, no PR anterior)                                                                           | o mesmo da linha acima                                                                        | indicador de contorno e preenchimento; o preenchimento nunca passa do contorno, o que é a própria desigualdade do processamento de dados                                                       |
| Linhas de metadados quebravam com "·" no início, lido como marcador de lista                                                                                                              | o separador pertencia ao item seguinte (`::before`, " · " no texto)                           | o ponto pertence ao item anterior (espaço não separável antes, quebra depois): `src/core/chrome/runin.ts` e `::after` no CSS, com teste de propriedade                                         |
| "Flags e estados" e "O pipeline" apareciam duas vezes cada entre as frentes da página inicial                                                                                             | a obra de cada frente era escolhida frente a frente, e uma obra declara disciplinas de várias | emparelhamento máximo entre frentes e obras (caminhos aumentantes de Kuhn, 1955): nenhuma obra em duas frentes, nenhuma frente vazia se tiver obras                                            |
| Português e inglês mostravam obras diferentes numa frente                                                                                                                                 | obras do mesmo dia eram desempatadas pelo título traduzido                                    | desempate pela chave de tradução, igual nas duas línguas                                                                                                                                       |
| "Seis laboratórios… de sinais, informação, dinâmica e probabilidade", com oito laboratórios publicados                                                                                    | um fato que a página calcula estava repetido na prosa                                         | a abertura deixou de enumerar; cada cartão nomeia o seu resultado. A abertura das frentes ("onze disciplinas em cinco frentes") ganhou teste contra o modelo de escopo                         |

Uma tentativa intermediária foi descartada no caminho, e fica registrada porque mostra o critério: a primeira
correção das frentes atribuía cada obra só à frente da sua primeira disciplina (uma partição). Acabava com a
repetição, mas deixava "Filosofia aplicada" sem obra, embora "O registro não é a coisa" declare a disciplina.
Uma omissão que desmente a cobertura do site é outro defeito; o emparelhamento resolve os dois.

## 4. O que entrou

| Peça                     | Arquivos                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Signos do argumento      | `src/core/reading/argument.ts`, `src/core/reading/nodes.ts`, `src/components/reading/ArgumentGlyphs.astro`       |
| Realce de código         | `src/adapters/astro/code.ts`, `src/styles/components/reading.css`, `tests/unit/guardrails/code-contrast.test.ts` |
| Indicador do laboratório | `src/styles/components/labs.css`, `src/core/i18n/catalogs/labs.ts`, `src/content/labs/{pt,en}/`                  |
| Separadores              | `src/core/chrome/runin.ts` (com teste), CSS de leitura, escopo e ontologia, vistas e ilha do pipeline            |
| Frentes                  | `latestByAxis` em `src/core/domain/scope.ts` (com testes), `src/components/scope/data.ts`, página inicial        |
| Documentação             | arquitetura §6 ("Signos"), requisitos não funcionais, leitura não linear, registro de mudanças, este plano       |

## 5. Medidas

| Medida                                                 | Valor                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Testes unitários                                       | 1704, todos passam (`pnpm check`)                                                  |
| Maior página HTML (`amostrar-e-decidir`)               | 159,3 KiB na `main`, 159,6 KiB agora, teto de 160 KiB                              |
| Contraste das tintas do código sobre o papel rebaixado | ≥ 7:1 nos quatro esquemas (claro, escuro e os de mais contraste)                   |
| Cores que um bloco de código pode emitir               | duas tintas e um fundo, todos tokens; antes, os valores de dois temas de terceiros |

A primeira versão dos novos signos fez a página `amostrar-e-decidir` passar do teto (161,6 KiB). O teto não foi
mexido: os atributos de traço passaram a ser declarados uma vez por glifo, herdados pelos caminhos, e os pontos
de ∵, ∴, ? e ≔ passaram a ser segmentos de comprimento quase nulo com ponta redonda, como nos conjuntos de
ícones.

## 6. Fora desta rodada

| Observação                                                                                            | Por que ficou                                                                                             |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| O estrato "Filosofia" e a frente "Filosofia aplicada" usam a mesma palavra em duas dimensões          | é decisão editorial e toca o ADR 0013                                                                     |
| A fonte de código só tem romano; comentários em itálico pediriam a Atkinson Hyperlegible Mono itálica | acrescentaria um arquivo de fonte; o ganho é pequeno, porque a tinta secundária já distingue o comentário |
| O Astro ainda avisa que o Shiki usa `style` em linha, incompatível com CSP estrita                    | o KaTeX também precisa de `style` em linha; tirar só o do código não retira a permissão                   |
| Migalhas de pão com "›" antes do item                                                                 | é a convenção das migalhas (WAI-ARIA APG), e "›" não se confunde com marcador                             |

## 7. Pendências do autor

1. Rever os signos do argumento. Os menos convencionais são ⊨ para "aplicação" (satisfação num modelo) e ¬¬ para
   "resposta" (a objeção negada).
2. Decidir se as cadeias de texto do código merecem marca própria; hoje só as aspas as delimitam.
3. Decidir sobre "Filosofia" e "Filosofia aplicada".
