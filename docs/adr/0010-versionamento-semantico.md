# ADR 0010 — Versionamento semântico e registro de mudanças

- Status: aceito
- Data: 2026-10-21
- Relacionados: `CHANGELOG.md`, `docs/versionamento.md`, `.github/workflows/release.yml`,
  `scripts/release-notes.ts`, `tests/unit/guardrails/changelog.test.ts`; ADR 0002, ADR 0005

## Contexto

O repositório tinha `package.json` em `0.1.0` desde o primeiro merge, nenhuma _tag_ e nenhum registro de
mudanças, embora quatro integrações grandes tivessem entrado depois (bibliografia, ontologia, laboratórios,
`noindex`). Sem versão não há como referir um estado do site em uma citação, em um relato de defeito ou em
uma comparação de orçamentos; sem registro, a história fica só nos títulos dos PRs.

Duas coisas mudam em ritmos diferentes: a **plataforma** (código, pipeline, linguagem de autoria, ABI dos
núcleos, verificações, implantação) e o **conteúdo** (ensaios, laboratórios, conceitos, páginas). O conteúdo já
tem o próprio controle: `published` e `revisions` no frontmatter de cada texto (ADR 0002).

## Decisão

1. **A plataforma segue o Versionamento Semântico 2.0.0.** A versão vive em `package.json` e em
   `wasm/Cargo.toml` (`[workspace.package] version`), sempre iguais; um teste de guarda reprova a divergência.
   - MAJOR: mudança incompatível no contrato de autoria (`docs/arquitetura.md` §5), nas rotas publicadas, na
     ABI dos núcleos (ADR 0003 §3) ou nos formatos exportados (`ontology.jsonld`, `ontology.graph.json`).
   - MINOR: diretiva, estágio, núcleo, página, verificação ou exportação nova; mudança compatível de
     comportamento.
   - PATCH: correção sem contrato novo.
   - Antes de `1.0.0` a MINOR pode trazer incompatibilidades, desde que o registro as declare.
2. **O conteúdo não é versionado pela plataforma.** Cada texto declara `published` e `revisions`; o
   registro de mudanças não lista textos.
3. **`CHANGELOG.md` no formato Keep a Changelog 1.1.0**, em português: seção `[Não lançado]` sempre
   presente e em primeiro lugar; uma seção `[X.Y.Z] - AAAA-MM-DD` por versão, da mais recente para a mais
   antiga; subtítulos Adicionado, Alterado, Descontinuado, Removido, Corrigido e Segurança; referências de
   link ao fim. Cada PR que mude a plataforma acrescenta sua linha em `[Não lançado]`, com o número do PR.
4. **Uma _release_ é um commit `chore(release): vX.Y.Z` na `main`** que eleva a versão nos dois arquivos e
   converte `[Não lançado]` na seção da versão, seguido de uma _tag_ anotada `vX.Y.Z` nesse commit. O
   workflow `release.yml` confere que _tag_, `package.json` e `Cargo.toml` concordam, extrai a seção do
   registro com `scripts/release-notes.ts` e publica a _release_ no GitHub com o próprio token do workflow
   (`contents: write` só nesse job; nenhuma ação de terceiros). Uma seção ausente, sem data ou vazia falha
   a publicação.
5. **Histórico reconstruído sem _tags_ retroativas.** `0.1.0` é o merge do PR #1 (11/10/2026), quando o
   `package.json` passou a declarar essa versão; tudo o que entrou depois fica em `[Não lançado]` até a
   próxima _release_. Não se criam _tags_ para commits antigos: uma _tag_ `v0.1.0` dispararia o workflow
   sobre um commit sem registro de mudanças.

## Consequências

- Positivas: um estado do site tem nome (`v0.2.0`) citável e comparável; o registro é escrito a cada PR, quando
  o contexto está fresco; a publicação da _release_ é reprodutível e auditável; a cadeia de suprimentos não
  cresce.
- Negativas: duas fontes para a mesma versão (`package.json` e `Cargo.toml`), mantidas iguais pelo teste de
  guarda; a disciplina de atualizar o registro a cada PR depende da revisão (o template de PR lembra).
- Fora do escopo: _releases_ de pré-lançamento (`-rc.1`) e _changelog_ gerado a partir de commits. O
  registro é escrito por pessoas, para pessoas.
