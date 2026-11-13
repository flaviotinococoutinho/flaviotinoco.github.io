# Foco em engenharia de software e o ensaio "A segunda flag" — 10/11/2026

- Status: executado no repositório local; aguarda revisão do autor e PR
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [programa editorial](../programa-editorial.md); [guia editorial](../guia-editorial.md);
  [ontologia](../ontologia.md); ADR 0011; issues #13, #14

Documento de projeto desta rodada: o que mudou no foco do site, o que foi feito com o artigo de 23/11/2025 e o
que ficou para depois. É um plano com data, não um contrato permanente.

## 1. Intenção

O site passa a tratar sobretudo de engenharia de software, ciência da computação, sistemas de informação,
método de trabalho e pilhas de tecnologia. A filosofia continua, como filosofia aplicada à teoria da
informação. A ponte de quatro estratos não muda: é ela que diferencia um texto do site de um tutorial.

A rodada tem três frentes:

1. **Atualizar a `main` local** (5 commits: build sem Rust, ADR 0012, dependências).
2. **Publicar o primeiro texto do novo foco**, a partir do artigo "Booleanos vs. máquinas de estado" e da
   palestra "Superando o Boolean Hell com State Machines", apresentados em 23/11/2025.
3. **Declarar o foco** onde o leitor o vê (início, sobre) e onde o projeto se orienta (programa editorial).

## 2. O material de origem e o que se decidiu fazer com ele

| Material                                   | O que traz                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Artigo (`.docx`/`.pdf`, 12 seções)         | problema dos booleanos, definição formal, Spring Statemachine, caso pagamento |
| Slides (27)                                | o mesmo percurso, mais Mealy e Moore, statecharts, sagas, persistência        |
| Código de demonstração (Java 21, 8 testes) | reprodutor de vídeo em três versões: flags, padrão State, tabela declarativa  |

Decisões editoriais, com a razão de cada uma:

- **Um ensaio, não uma transcrição.** O contrato do site limita o corpo de um ensaio a 2 200 palavras e pede
  uma tese com objeções. O ensaio cobre a primeira metade do material (contagem, definição, tabela, três
  implementações, objeções); a segunda metade (ações, persistência, concorrência, sagas, testes) fica para o
  ensaio "Estado em produção" (programa editorial §5).
- **O exemplo é o do código, não o do artigo.** As afirmações sobre o reprodutor de vídeo foram conferidas no
  código de demonstração e reproduzidas com o Java 21 (dez transições, seis células vazias; `play()` seguido
  de `pause()` deixa as duas flags ligadas; um `switch` exaustivo deixa de compilar com um estado a mais). O
  pagamento de onze situações entra só como linha da tabela de contagem.
- **A leitura pela teoria da informação é a contribuição do site.** Com `n` flags e `k` situações, a
  redundância de Shannon é pelo menos `1 − log₂ k / n`; as flags têm a redundância de um código sem o
  verificador. Essa leitura não está no material de origem.
- **Só fontes conferidas.** Saíram as estimativas sem fonte da tabela do artigo ("estados inválidos
  estimados"), a menção a "22 flags" atribuída a "discussões práticas" e o Ariane 5, que não trata de estado.
  O Therac-25 ficou, com a passagem exata (uma variável de um byte usada como indicador) e com a ressalva dos
  próprios autores de que a lição não é um defeito de código em particular.
- **O estado da biblioteca é parte do conteúdo.** O Spring Statemachine deixou de ser mantido como código
  aberto (anúncio de 21/04/2025; repositório arquivado em 05/07/2026). O ensaio registra o fato e trata a
  biblioteca como ilustração da tabela declarativa, não como recomendação.
- **Proveniência.** O texto é `generated`, `reviewed: false`, com nota própria. Só a revisão do autor muda
  esse rótulo.

## 3. O que entrou

| Peça                          | Arquivos                                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Ensaio (pt e en)              | `src/content/essays/pt/a-segunda-flag.md`, `src/content/essays/en/the-second-flag.md`                                                        |
| Conceitos                     | `state`, `finite-state-machine`, `statechart` (Wikidata conferido para os dois primeiros)                                                    |
| Fórmulas                      | `finite-automaton`, `extended-transition-function`; rótulos novos em `redundancy`                                                            |
| Bibliografia (9 entradas)     | Rabin e Scott (1959); Hopcroft, Motwani e Ullman (2007); Harel (1987); Gamma et al. (1995); McCabe (1976); Leveson e Turner (1993); 3 online |
| Léxico                        | `flag`, `statechart`                                                                                                                         |
| Identidade                    | `site.tagline` e `site.description` (pt e en); páginas "Sobre" (seção "Do que trata")                                                        |
| Documentação                  | programa editorial (foco, disciplinas, cobertura, próximos passos); estado em `arquitetura.md`; registro de mudanças                         |
| Contrato editorial dos testes | `tests/unit/content/syntax.test.ts`, `tests/unit/content/checkers.ts`                                                                        |
| Blocos de código (§3.2)       | `src/adapters/astro/code.ts`, `astro.config.ts`, `tests/unit/guardrails/code-contrast.test.ts`                                               |

Conferência das fontes em 10/11/2026: artigos com DOI contra o Crossref; livros contra a Open Library e a
Biblioteca do Congresso; páginas online lidas no original; as duas passagens do Therac-25 localizadas no texto
do artigo (p. 29 e 34).

### 3.1 A mudança no contrato editorial dos testes

O teste do corpus exigia de todo ensaio e laboratório a data `2026-10-11` e a nota de proveniência dos
textos-semente. Um texto publicado depois não pode cumprir isso sem declarar uma data e uma origem falsas. A
regra foi delimitada, não afrouxada:

- os nove textos-semente (lista fechada, conferida nas duas línguas) continuam presos à data, ao rótulo e à
  nota combinados;
- toda obra segue o contrato geral: resumo de 150 a 250 palavras num parágrafo, 3 a 5 palavras-chave, conceitos
  conhecidos, `draft: false`;
- o contrato geral ficou mais forte em três pontos: a primeira revisão é a do dia da própria publicação, as
  revisões estão em ordem de data e a nota de proveniência é obrigatória quando há assistência ou falta revisão.

A regra 11 do `CLAUDE.md` pede que uma mudança de regra tenha commit próprio com a razão: no PR, este arquivo
de teste vai num commit separado do conteúdo.

### 3.2 Um defeito da plataforma que o ensaio expôs

O ensaio é o primeiro texto do site com blocos de código. A auditoria de acessibilidade (axe, tema escuro)
reprovou as duas páginas: os comentários do tema `github-dark` do Shiki têm contraste 3,05:1 sobre o fundo do
tema. Medindo os temas inteiros, o `github-light` também reprova (variáveis a 3,49:1 sobre branco), o que só
apareceria num trecho de TypeScript ou Python. A correção foi na causa, não no texto: os temas passaram a ser
`github-light-default` e `github-dark-default`, em que todo token de texto fica em 4,55:1 ou mais, e um teste
de guarda desenha amostras em dez linguagens com a configuração do build e mede cada cor emitida. O teste
reprova os temas antigos (13 falhas) e aprova os novos.

## 4. Verificação

`pnpm check`, `pnpm build:site` (com `build-wasm --prebuilt --check`), `pnpm search:index`, `pnpm check:links`,
`pnpm check:budgets`, `pnpm check:robots` e `pnpm test:e2e` sobre o `dist/` desta árvore. O resultado de cada
comando fica na descrição do PR.

## 5. Pendências do autor

1. **Revisar o ensaio** nas duas línguas e, se for o caso, mudar `provenance` e `revisions`.
2. **Preencher os TODO da página "Sobre"** (apresentação, motivação, contato, licença): dependem de
   informação que só o autor tem.
3. **Decidir se o código de demonstração será publicado.** Hoje o ensaio o descreve sem link, porque a pasta
   local não é um repositório público.
4. **Conferir o exemplar** de Hopcroft, Motwani e Ullman (2007) e de Gamma et al. (1995): os capítulos e as
   páginas citados foram conferidos no sumário dos catálogos, não no livro em mãos.

## 6. Próximos passos sugeridos

| Frente                                                                                      | Estrato(s)     |
| ------------------------------------------------------------------------------------------- | -------------- |
| Ensaio "Estado em produção": Mealy e Moore, persistência, concorrência, idempotência, sagas | formal → valor |
| Laboratório "flags e estados": contar configurações e percorrer a tabela de transições      | formal         |
| Conceitos de sistemas de informação, metodologia e tecnologia (hoje sem conceito próprio)   | teoria, valor  |
| Issue #13 (engenharia de software: leis, mitos e práticas) e #14 (camada de acidentes)      | valor          |
