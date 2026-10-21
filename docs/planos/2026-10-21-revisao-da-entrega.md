# Revisão da entrega — 21/10/2026

- Status: em execução (atualizado às 06:50 de 21/10/2026; ver §9)
- Autor: Flávio Tinoco
- Relacionados: issues #7, #8, #22, #23, #26; ADR 0005, ADR 0008; `docs/arquitetura.md`;
  `scripts/lib/budgets.ts`

Documento de projeto desta rodada de revisão: o que foi encontrado, o que se decidiu e em que ordem
as mudanças entram na `main`. Ele é um plano com data, não um contrato permanente; as decisões que
sobrevivem à rodada viram ADR ou documentação normativa.

## 1. Intenção

A `main` compila, mas o CI está vermelho desde 19/10 porque seis páginas passam do orçamento de HTML
(issue #26). Sem CI verde não há publicação (o `Deploy` está desligado e o Pages não existe, issue #7),
não há proteção da `main` (issue #8) e nenhuma documentação de estado é confiável
(`docs/arquitetura.md` descreve a árvore de 15/10, quando metade dela "ainda não existia").

A rodada tem quatro frentes, nesta ordem de prioridade:

1. **Orçamento**: trazer todas as páginas para dentro de 150 KiB de HTML sem afrouxar o orçamento.
2. **Publicação e processo**: Pages, `Deploy`, regras da `main`, versionamento e registro de mudanças.
3. **Documentação**: estado real, requisitos não funcionais com seus formalismos, ontologia, programa
   editorial.
4. **Conteúdo**: os conceitos que faltam para a ponte entre filosofia, teoria da informação, computação,
   engenharia de software e otimização combinatória.

## 2. Estado encontrado

Medições sobre o `dist/` compilado da `main` (19/10, antes do `noindex`), bytes brutos de HTML.

### 2.1 A moldura de cada página

| Parte                                              |   Bytes | Em toda página? |
| -------------------------------------------------- | ------: | --------------- |
| `<head>` (3 `@font-face` inline ≈ 5,2 KiB + links) |   8 851 | sim             |
| sprite de glifos (`<svg class="glyph-sprite">`)    |   6 612 | sim             |
| cabeçalho sem painéis                              |   2 220 | sim             |
| paleta de comandos (`<dialog id="ft-palette">`)    |   6 737 | sim             |
| painel de preferências (`#ft-prefs`)               |   7 629 | sim             |
| rodapé do site                                     | ≈ 2 500 | sim             |

A paleta e o painel somam 14,4 KiB em cada uma das 140 páginas e só funcionam com JavaScript: sem
script, os botões que os abrem não aparecem. Eles são o custo fixo que se paga N vezes.

### 2.2 As páginas fora do orçamento

| Página                             | Bytes     | Excesso  | Maior parte                         |
| ---------------------------------- | --------- | -------- | ----------------------------------- |
| `pt/ensaios/amostrar-e-decidir`    | 159 584   | 5,9 KiB  | artigo 102 KiB (62 fórmulas MathML) |
| `en/essays/to-sample-is-to-decide` | ≈ 157 700 | 4,0 KiB  | idem                                |
| `pt/ensaios/escolher-custa-bits`   | ≈ 156 400 | 2,8 KiB  | artigo                              |
| `en/essays/choosing-costs-bits`    | ≈ 154 100 | 0,5 KiB  | artigo                              |
| `pt/ontologia`                     | 195 387   | 40,9 KiB | ver abaixo                          |
| `en/ontology`                      | ≈ 192 000 | 37,6 KiB | idem                                |

Composição da página da ontologia (pt), por seção:

| Seção                          |  Bytes |
| ------------------------------ | -----: |
| explorador (mapa SVG + painel) | 53 128 |
| reticulado das obras (FCA)     | 25 303 |
| comunidades                    | 17 783 |
| comparação                     | 15 564 |
| nível superior (tabela)        | 15 336 |
| taxonomia (árvore)             | 12 458 |
| conceitos-ponte                | 10 266 |
| em números                     |  5 263 |
| vocabulário de relações        |  3 415 |
| exportações e cabeçalho        |  1 307 |

O mapa custa ≈ 1,1 KiB por conceito (46 conceitos) e a árvore ≈ 0,27 KiB; a página cresce com cada
conceito novo, como a issue #26 previu.

### 2.3 Processo

- `pnpm check` passa localmente (93 arquivos, 1 348 testes; paleta: 158 verificações).
- CI: `quality`, `wasm` e CodeQL verdes; `build` falha nos orçamentos; `e2e` não roda.
- Pages não configurado (API responde 404); workflow `Deploy` desativado manualmente.
- Nenhuma regra de proteção da `main`; auto-merge permitido no repositório; merge por commit de merge
  ou _squash_; branches apagadas ao mesclar.
- `package.json` em `0.1.0`, sem _tags_, sem `CHANGELOG`.
- O pnpm 10.28 avisa que o campo `pnpm` do `package.json` não é mais lido: o `overrides` do KaTeX
  está sendo ignorado (o _lockfile_ ainda o registra).
- Branches locais já mescladas (`feat/*`, `flavio/vibrant-hamilton-wowk2z`), dois _worktrees_ limpos
  de branches mescladas ou obsoletas, e `handoff/specs` (especificações da sessão de 19/10) existe só
  localmente: a branch remota foi apagada.
- `docs/arquitetura.md` referencia `docs/ontologia.md` (também citado em `src/content.config.ts` e
  `src/core/ontology/vocabulary.ts`), que não existe. O README aponta para a âncora
  `#estado-da-implementação`, que não existe.

## 3. Objetivos, não objetivos, anti-objetivos

Objetivos:

- CI verde na `main`; site publicado no Pages com `noindex`; `main` protegida; auto-merge só com CI
  verde.
- Toda documentação de estado datada e com o comando que a comprova.
- Um esquema de versionamento declarado e aplicado (SemVer, `CHANGELOG`, _tag_ de versão, _release_).
- Requisitos não funcionais catalogados com formalismo, limiar, verificação e evidência.
- A ontologia documentada (`docs/ontologia.md`) e estendida com os conceitos-ponte.

Não objetivos (ficam nas issues já abertas):

- Concluir as frentes `ws/addons`, `ws/cli`, `ws/reviews`, `ws/bib-accidents` (#15, #17–#20).
- Ensaios novos (#16) e os conceitos "em crise" (#11–#13).
- Imagens Open Graph e os complementos de leitura (#19).
- Revisar a prosa dos textos-semente: é decisão editorial do autor.

Anti-objetivos (fracasso mesmo que "funcione"):

- Afrouxar qualquer limiar (orçamento, cobertura, lint, teste) para o CI passar.
- Introduzir dependências novas ou ações de terceiros não fixadas por SHA.
- Perder informação: branches com trabalho não mesclado apagadas sem cópia; prosa reescrita por
  ferramenta.

## 4. Restrições

- As regras de `CLAUDE.md` e os ADRs 0001–0008 continuam valendo integralmente.
- Nada de HTML parcial em `dist/` fora das páginas: os testes e2e e o verificador de links tratam todo
  `.html` como página (`tests/e2e/support/site.ts`).
- Um ensaio ou laboratório de 100 KiB de artigo precisa caber com a moldura e ainda deixar margem.
- A `main` continua recebendo merges por PR, com o template do repositório.

## 5. Decisões

### 5.1 Orçamento de HTML (issue #26) — PR `fix(budgets)`

**Moldura sob demanda.** A paleta e o painel passam a ser cascas: o diálogo mantém título, campo,
botão de fechar, estado e dica; o popover mantém título, botão de fechar, introdução, formulário
vazio, botão de restaurar e estado. O conteúdo que hoje é HTML estático vira um documento JSON por
idioma, gerado na compilação pelos mesmos catálogos:

- `src/pages/[lang]/palette.json.ts` → `/pt/palette.json`, `/en/palette.json`: as entradas de navegação
  rápida (`label`, `href`, `kind`, `keywords`, `glyph`, `stratum?`, `hreflang?`).
- `src/pages/[lang]/preferences.json.ts` → `/pt/preferences.json`, `/en/preferences.json`: os grupos do
  painel (`key`, `legend`, `hint?`, `options: [{ value, label, announce, checked }]`) e o botão de
  restaurar (`label`, `announce`).

Cada ilha busca o JSON ao ser carregada (ela já só carrega quando o leitor abre o diálogo ou o
popover), decodifica com um analisador puro do núcleo (`src/core/chrome/palette-entries.ts`,
`src/core/chrome/preferences-form.ts`: `unknown → Result`, com teste de propriedade
`decode ∘ encode = id`) e constrói o DOM com `createElement`, como a paleta já faz para os resultados.
Enquanto o JSON não chega, a paleta aceita texto (a busca Pagefind independe das entradas) e o
formulário fica oculto, como hoje fica até a ilha definir-se.

Por que JSON e não um fragmento HTML: um `.html` em `dist/` seria auditado como página (axe, links,
robots) e exigiria exceções; JSON não é página, é dado, e o contrato tipado vive no núcleo. Por que não
`<template>`: o orçamento mede bytes brutos, e um `template` continua na página.

Ganho medido: −14,4 KiB em toda página. Os quatro ensaios ficam com 7 a 13 KiB de margem.

**Ontologia em quatro páginas.** O explorador (mapa + árvore sincronizada + painel de detalhe) fica na
visão geral; o restante se divide por função:

| Rota (pt / en)                                     | Conteúdo                                                                                            | Estimativa |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------: |
| `/ontologia/` · `/ontology/`                       | lede, navegação local, em números, explorador, exportações                                          |  ≈ 110 KiB |
| `/ontologia/estrutura/` · `/ontology/structure/`   | nível superior (tabela), vocabulário de relações, link para o glossário (que mantém a própria rota) |   ≈ 45 KiB |
| `/ontologia/comparacao/` · `/ontology/comparison/` | comparar dois conceitos, conceitos-ponte, comunidades, notas de medida                              |   ≈ 80 KiB |
| `/ontologia/reticulado/` · `/ontology/lattice/`    | reticulado das obras (FCA)                                                                          |   ≈ 62 KiB |

O codec de rotas ganha a variante `{ kind: 'ontology-page'; page: 'structure' | 'comparison' | 'lattice' }`
com segmentos localizados; `decodeRoute` aceita `ontologia/<página>`; o teste de propriedade cobre a
variante nova. As quatro páginas compartilham um componente de navegação local (`OntologyNav.astro`,
lista `ui` com `aria-current="page"`). A árvore permanece com o mapa para preservar a sincronização
documentada em `ft-concept-tree`.

Horizonte: com ≈ 1,4 KiB por conceito (mapa + árvore), a visão geral chega a 150 KiB perto de 75
conceitos. Quando isso se aproximar, a árvore migra para `estrutura/` (−12 KiB) ou o mapa passa a
carregar os rótulos pelo `ontology.graph.json`, que já existe.

### 5.2 Documentação — PR `docs`

- `docs/arquitetura.md`: seção "Estado da implementação" (âncora que o README já usa) com a tabela
  área → estado → comando que comprova → data (21/10/2026); árvore de §3 corrigida; §8 descreve as
  verificações que existem e os jobs do CI.
- `docs/ontologia.md` (novo): os dois eixos do nível superior, o procedimento de decisão das categorias
  (§3, referido pelo código), o vocabulário de relações com propriedades e restrições, as garantias
  topológicas, as medidas, as exportações e o roteiro para acrescentar um conceito.
- `docs/requisitos-nao-funcionais.md` (novo): catálogo dos requisitos não funcionais, cada um com
  definição, formalismo ou heurística, limiar, verificação (comando e job), evidência datada e fontes.
  Inclui o modelo de custo das páginas (custo fixo da moldura × N páginas; custo marginal por conceito;
  orçamento como restrição de capacidade) e o caminho crítico do CI.
- `docs/programa-editorial.md` (novo): a ponte e as disciplinas que ela atravessa; cobertura atual por
  domínio; os conceitos-ponte desta rodada; o que as issues abertas prometem; e o princípio reflexivo:
  o site aplica a si mesmo a teoria que expõe.
- `docs/versionamento.md` (novo) e `CHANGELOG.md` (novo, _Keep a Changelog_).
- ADR 0009 (moldura sob demanda e orçamento de HTML) e ADR 0010 (versionamento semântico).
- `README.md` reorganizado: o que é, estado, como executar, verificações, publicação, documentação,
  versionamento, contribuição. `CLAUDE.md`: ponteiros para os documentos novos e o comando
  `check:robots`.

### 5.3 Versionamento — ADR 0010

- SemVer para a plataforma (código, pipeline, linguagem de autoria, ABI dos núcleos). A versão vive em
  `package.json` e em `wasm/Cargo.toml` (`workspace.package.version`), sempre iguais; a _tag_ `vX.Y.Z`
  aponta para o commit `chore(release): vX.Y.Z` na `main`.
- MAJOR: mudança incompatível no contrato de autoria (§5 da arquitetura), nas rotas ou na ABI; MINOR:
  diretiva, núcleo, página ou verificação nova; PATCH: correção sem contrato novo.
- O conteúdo não segue SemVer: cada texto tem `published` e `revisions` no frontmatter.
- `CHANGELOG.md` segue _Keep a Changelog_; cada PR acrescenta sua linha em "Não lançado"; a _release_
  move o bloco para a versão. Histórico reconstruído sem _tags_ retroativas: 0.1.0 é o merge do PR #1
  (11/10); os PRs #3, #24, #25 e #27 ficam em "Não lançado" até a _release_ desta rodada.
- `release.yml`: em _push_ de _tag_ `v*`, confere que a _tag_, o `package.json` e o `Cargo.toml`
  concordam, extrai a seção do `CHANGELOG` e publica a _release_ com `gh release create`
  (`GITHUB_TOKEN`, `contents: write` só nesse job; nenhuma ação de terceiros).
- Esta rodada fecha em `v0.2.0`: tudo o que entrou desde o merge do PR #1 está em "Não lançado".

### 5.4 CI, proteção e publicação — PR `ci` + configuração pelo API

- `pnpm-workspace.yaml` com `overrides: { katex: 0.19.0 }`; o campo `pnpm` sai do `package.json`.
  Verificação: `pnpm install --frozen-lockfile` sem mudança no _lockfile_.
- Conjunto de regras `main` (API de rulesets): _pull request_ obrigatório (0 aprovações, pois há um
  único colaborador; revisão de CODEOWNERS desligada pelo mesmo motivo — o ADR 0005, decisão 4, pedia essa
  revisão e recebe uma emenda datada na PR de documentação), verificações obrigatórias
  com os nomes exatos dos jobs (`Quality (…)`, `WebAssembly kernels (…)`, `Site (…)`,
  `End-to-end (…)`, `Analyze (javascript-typescript)`, `Analyze (actions)`), sem exigir branch
  atualizada (`strict: false`), bloqueio de exclusão e de _force-push_; administradores podem
  contornar.
- Pages criado pelo API com `build_type: workflow`; `Deploy` reativado depois de a `main` ficar verde;
  primeira publicação pelo _push_ do merge (ou `workflow_dispatch`). `https_enforced` ligado.
- Issue #23: o Dependabot não rodou em 20/10 (segunda-feira); as últimas execuções são de 19/10, com a de
  npm falhando. Registrar o estado na issue e pedir uma execução manual pela interface (não há API).

### 5.5 Higiene do repositório — sem PR

- `main` local alinhada com `origin/main`; branches locais mescladas apagadas com `git branch -d`.
- `handoff/specs` preservada como _tag_ `wip/handoff-specs` (mesma prática das _tags_
  `wip/ontology-history` e `wip/labs-history`) e a branch local apagada.
- _Worktrees_ `…/.worktrees/noindex` (mesclado) e `.claude/worktrees/agent-…` (obsoleto, limpo)
  removidos com `git worktree remove`.
- Branches remotas `ws/*` ficam: as issues #15 e #17–#20 as referenciam. `ws/ontology` e `ws/labs`
  estão superadas por #24 e #25 (todos os seus arquivos existem na `main`) e são candidatas a
  exclusão pelo autor.

### 5.6 Conteúdo: conceitos-ponte — PR `feat(concepts)`

Sete conceitos, em JSON, nas duas línguas, cada um com fontes verificadas no Crossref ou em catálogo e
IRI do Wikidata conferido:

| id                           | estrato    | categoria | papel na ponte                                                                   |
| ---------------------------- | ---------- | --------- | -------------------------------------------------------------------------------- |
| `abstraction`                | philosophy | operation | o ato de omitir o irrelevante; de onde partem modelo e módulo                    |
| `heuristic`                  | theory     | method    | regra que guia a busca sem garantia (Pólya; Simon)                               |
| `optimization`               | theory     | process   | escolher o melhor sob restrições; formaliza a decisão                            |
| `combinatorial-optimization` | formal     | process   | otimização sobre conjuntos finitos; Huffman é um caso ótimo guloso               |
| `computational-complexity`   | formal     | measure   | custo de um problema em função do tamanho; NP-completude (Cook; Garey e Johnson) |
| `information-hiding`         | value      | method    | critério de Parnas para dividir módulos: esconder decisões que mudam             |
| `satisficing`                | value      | process   | parar no suficientemente bom (Simon): decisão sob racionalidade limitada         |

Relações previstas (sujeitas às restrições do vocabulário: `formalizes` desce o estrato,
`appliesTo` sobe): `optimization formalizes decision`; `combinatorial-optimization broader
optimization`; `huffman-code dependsOn combinatorial-optimization`? — não: a relação é declarada no
conceito novo (`combinatorial-optimization related huffman-code` ou `appliesTo`), para não editar os
conceitos existentes além do necessário; `computational-complexity measures combinatorial-optimization`
(medida → processo não é permitido: `measures` exige alvo `quality` ou `entity`; usar `dependsOn`);
`heuristic contrastsWith optimization`; `information-hiding appliesTo product`? (sobe do valor —
inválido; usar `dependsOn abstraction` e `related interface`); `satisficing dependsOn decision`,
`satisficing contrastsWith optimization`; `abstraction related model`. O construtor ajusta para passar
na topologia (aciclicidade, conectividade, categorias).

Fontes a cadastrar em `bibliography/main.bib`: Parnas (1972, CACM, DOI), Simon (1956, Psychological
Review, DOI), Cook (1971, STOC, DOI), Garey e Johnson (1979, livro), Papadimitriou e Steiglitz (1982,
livro), Pólya (1945, livro), Dijkstra (1972, CACM, DOI). Cada entrada com comentário de verificação e
data.

### 5.7 Assets — na PR `docs` ou própria

- `public/apple-touch-icon.png` (180 × 180) gerado a partir de `public/favicon.svg` sobre o papel claro
  (`#f9f6f2`, o mesmo `theme-color`), por `scripts/icons.ts` (resvg, já dependência), com a função
  pura em `scripts/lib/icons.ts` e teste; `<link rel="apple-touch-icon">` no `BaseLayout` e no 404.
- `robots.txt`, fontes e licenças OFL: conferidos, sem mudança.

## 6. Sequência de PRs

| #   | Branch                 | Título                                                                                             | Fecha        |
| --- | ---------------------- | -------------------------------------------------------------------------------------------------- | ------------ |
| 1   | `fix/html-budgets`     | fix(budgets): chrome on demand and the ontology in four pages                                      | #26          |
| 2   | `chore/pnpm-settings`  | chore(pnpm): settings in pnpm-workspace.yaml; release workflow                                     | parte de #22 |
| 3   | `docs/state-and-nfr`   | docs: implementation state, ontology, non-functional requirements, editorial programme, versioning | parte de #22 |
| 4   | `feat/bridge-concepts` | feat(concepts): seven bridge concepts between optimisation, complexity and software engineering    | —            |
| 5   | `chore/release-0.2.0`  | chore(release): v0.2.0                                                                             | —            |

Configuração fora de PR, nesta ordem: regras da `main` (antes de qualquer PR com auto-merge); Pages e
`Deploy` (depois da PR 1 mesclada); _tag_ `v0.2.0` (depois da PR 5). A PR 2 foi aberta antes da PR 1 porque
não depende dela; a ordem da tabela é a ordem lógica, não a cronológica.

## 7. Premissas

- O autor delegou a rodada inteira; as decisões acima são chamadas de projeto, registradas aqui para
  que ele as reverta se discordar. As únicas ações de efeito externo são: regras da `main`, criação
  do Pages, reativação do `Deploy`, _tags_ e _releases_, PRs com auto-merge.
- Os textos-semente e as páginas Sobre e Colofão não são reescritos; os `TODO (autor)` permanecem.
- Nenhuma menção a ferramentas de autoria assistida entra em commits, PRs ou documentação desta rodada.

## 8. O que fica para o construtor

- Nomes exatos das chaves de catálogo novas e dos componentes.
- A forma final das relações dos conceitos-ponte, dentro das restrições do vocabulário.
- O desenho da navegação local da ontologia (reusa `.ontology__links`).
- Onde ancorar o modelo de custo: ADR 0009 traz o modelo; o documento de requisitos traz a tabela.

## 9. Registro da execução

| Item                                       | Estado em 21/10/2026                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Higiene local (§5.5)                       | feito: branches mescladas apagadas, _worktrees_ removidos, `wip/handoff-specs` criada |
| Regras da `main` (§5.4)                    | feito pelo API: PR obrigatório, seis verificações, sem exclusão nem _force-push_      |
| PR #28 — pnpm e versionamento (§5.3, §5.4) | aberta com auto-merge; espera a `main` verde                                          |
| PR #30 — orçamentos (§5.1)                 | aberta com auto-merge; inclui dois achados fora do plano (abaixo)                     |
| PR #31 — conceitos-ponte (§5.6)            | aberta com auto-merge; depende de #30                                                 |
| PR de documentação (§5.2, §5.7)            | em preparação nesta branch                                                            |
| Pages e `Deploy` (§5.4)                    | depois do merge de #30                                                                |
| `v0.2.0`                                   | depois das PRs acima                                                                  |

Achados fora do plano, tratados na PR #30:

- O job de qualidade já falhava na `main` antes desta rodada: os 15 módulos de `src/core/labs/` não tinham
  testes unitários e a barreira de 60 % de linhas por arquivo os reprovava. Escritos em `tests/unit/labs/`
  (108 testes; 98 % das linhas do diretório).
- Esses testes encontraram uma função não total: `looseTicks`/`ticksWithin` entravam em laço infinito para
  um intervalo abaixo da resolução imprimível (passo com _underflow_ a zero). Corrigido na origem.
- O gerador do teste de propriedade dos nomes BibTeX produzia o separador `and`; a propriedade falhava
  por sorteio (uma vez em cada quatro execuções do CI nesta rodada). Corrigido no gerador.
