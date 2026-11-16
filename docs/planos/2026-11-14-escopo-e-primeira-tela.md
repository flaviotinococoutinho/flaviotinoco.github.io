# Escopo verificável e primeira tela — 14/11/2026

- Status: executado na branch `flavio/vibrant-hamilton-wowk2z`; aguarda revisão do autor e PR
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [ADR 0013](../adr/0013-escopo-do-site.md); [programa editorial](../programa-editorial.md);
  [plano de 10/11/2026](2026-11-10-foco-em-engenharia-de-software.md); issues #13, #14, #17, #18

Documento de projeto desta rodada: o que foi pedido, o que se decidiu, o que entrou e o que ficou para depois.
É um plano com data, não um contrato permanente.

## 1. Pedido

Em 14/11/2026 o autor pediu três coisas:

1. melhorar a experiência e a integridade conceitual de um site sobre engenharia de software, ciência da
   computação, sistemas de informação, tecnologia da informação, arquitetura de software, design de sistemas,
   otimização de sistemas, teoria da informação, filosofia aplicada, processamento de sinais e ETL;
2. fazer o projeto do site restringir o escopo;
3. fazer o site chamar a atenção de quem o visita.

## 2. Diagnóstico

| Ponto                   | Estado em 13/11/2026                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Escopo                  | declarado em prosa (programa editorial), em quatro frentes escritas à mão na página inicial e numa lista plana |
| Restrição               | nenhuma: um ensaio só sobre matemática compilaria                                                              |
| Cobertura               | tabela escrita à mão no programa editorial; sem medida do acervo                                               |
| Primeira tela           | nome, lema e os quatro simplexos; sem dizer o que o site cobre, sem chamada e sem nada para experimentar       |
| Disciplinas do pedido   | arquitetura, design de sistemas, otimização de sistemas, TI e ETL não existiam como domínio                    |
| Dados da página inicial | as frentes e seus ensaios de exemplo estavam fixos no arquivo da página, fora do núcleo                        |

## 3. Decisões

- **O escopo é a faceta de domínio.** Em vez de uma segunda lista de "disciplinas", a lista de domínios foi
  dividida em disciplinas do núcleo e fundamentos, e cada fundamento declara de que é fundamento (ADR 0013).
  Uma lista só, lida pela compilação, pelos testes e pelas páginas.
- **Restringir é barrar, não recomendar.** Um ensaio sem disciplina do núcleo não compila; um acervo em que
  os fundamentos passem de 25 % das obras reprova no teste.
- **A cobertura é medida.** A matriz disciplina × estrato é calculada do acervo; lacuna aparece como lacuna.
- **A primeira tela afirma e mostra.** O título passa a ser a proposição do site; ao lado dela fica um
  laboratório em uso. O exemplo escolhido é o do ensaio "A segunda flag", porque é o primeiro texto do foco em
  engenharia de software e porque o defeito aparece em dois cliques: `play()` e `pause()` deixam as três flags
  em "tocando e pausado", enquanto a máquina de estados está em "pausado".
- **O laboratório de flags e estados** estava previsto no programa editorial (§5). O estado dele é o próprio
  histórico de eventos, que é a tese do ensaio sobre a função de transição estendida.
- **Sem JavaScript, a mesma figura.** A página inicial desenha, na compilação e com o mesmo modelo puro, o
  estado depois de `play()` e `pause()`.

## 4. O que entrou

| Peça                         | Arquivos                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Modelo de escopo             | `src/core/domain/facets.ts`, `src/core/domain/scope.ts`; testes em `tests/unit/core/scope.test.ts`                   |
| Regra no esquema de conteúdo | `src/content.config.ts` (ensaio sem disciplina do núcleo não compila); `tests/unit/content/scope.test.ts`            |
| Rotas                        | `scope` e `discipline` em `src/core/i18n/routes.ts`, com slugs por língua e teste de ida e volta                     |
| Páginas                      | `src/views/ScopeView.astro`, `src/views/DisciplineView.astro`, `src/components/scope/`, `scope.css`                  |
| Navegação                    | cabeçalho, rodapé e paleta de comandos; glifo da frente "informação e sinais"                                        |
| Reclassificação              | quatro ensaios e treze conceitos; `technology` passa a `information-technology`                                      |
| Laboratório                  | `src/core/labs/flags.ts`, `src/islands/elements/ft-lab-flags.ts`, `src/content/labs/{pt,en}/`, testes de propriedade |
| Página inicial               | `src/pages/[lang]/index.astro`, `src/components/labs/FlagsSnapshot.astro`, estilos em `chrome.css`                   |
| Documentação                 | ADR 0013; este plano; programa editorial; arquitetura; requisitos não funcionais; registro de mudanças; `CLAUDE.md`  |

## 5. Verificação

`pnpm check`, `pnpm build:site`, `pnpm search:index`, `pnpm check:links`, `pnpm check:budgets`,
`pnpm check:robots` e `pnpm test:e2e` sobre o `dist/` desta árvore. O resultado de cada comando fica na
descrição do PR.

## 6. Pendências do autor

1. **Rever o texto do escopo**: a proposição da página inicial, a lista do que fica de fora e as frases de cada
   disciplina. São propostas, redigidas com assistência de IA.
2. **Rever o laboratório** nas duas línguas e, se for o caso, mudar `provenance`.
3. **Decidir sobre as resenhas** (issues #17 e #18) à luz do ADR 0013, §Pendências.
4. **Tecnologia da informação** não tem obra publicada. A camada de acidentes (issue #14) é a candidata natural.

## 7. Próximos passos sugeridos

O ensaio sobre ETL e a desigualdade do processamento de dados ("O pipeline não cria informação") entrou no
mesmo dia, em PR próprio, com cinco conceitos, duas fórmulas e três fontes novas; o laboratório "O pipeline"
entrou em 15/11/2026.

| Frente                                                                        | Disciplina               |
| ----------------------------------------------------------------------------- | ------------------------ |
| Camada de acidentes: ferramentas que realizam conceitos (issue #14)           | tecnologia da informação |
| Ensaio "Estado em produção" (programa editorial §5)                           | design de sistemas       |
| Cartões de compartilhamento (imagem por página) e dados estruturados por obra | —                        |
