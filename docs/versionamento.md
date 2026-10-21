# Versionamento

> Como a plataforma do site é versionada, como o registro de mudanças é mantido e como se publica uma
> _release_. Decisão: [ADR 0010](adr/0010-versionamento-semantico.md). Conteúdo (ensaios, laboratórios,
> conceitos) tem o próprio controle de revisões no frontmatter: [guia editorial](guia-editorial.md).

## 1. O que tem versão

| Coisa                                                                        | Controle                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Plataforma (código, pipeline, verificações, implantação)                     | SemVer 2.0.0 em `package.json` e `wasm/Cargo.toml`, iguais                      |
| Linguagem de autoria (`docs/arquitetura.md` §5) e ABI dos núcleos (ADR 0003) | parte da plataforma: mudança incompatível = MAJOR                               |
| Exportações (`ontology.jsonld`, `ontology.graph.json`, `.bib`, `.tex`)       | parte da plataforma; `ontology.graph.json` leva `version` próprio               |
| Conteúdo                                                                     | `published` e `revisions` no frontmatter de cada texto                          |
| Decisões                                                                     | ADRs numerados, com status (proposto, aceito, substituído)                      |
| Pesquisas (`docs/research/`)                                                 | relatórios datados, imutáveis                                                   |
| Dependências                                                                 | `pnpm-lock.yaml`, `wasm/Cargo.lock`, `wasm/rust-toolchain.toml`, SHAs das ações |

## 2. O que eleva cada número

- **MAJOR** — uma página, rota, diretiva, campo de frontmatter, exportação ou função exportada dos núcleos
  deixa de existir ou muda de significado. Exemplos: renomear o segmento `ensaios`; trocar `$$` por `$`;
  mudar o código de erro de um núcleo.
- **MINOR** — algo novo, compatível: uma diretiva, um laboratório, uma página da ontologia, uma verificação,
  um campo opcional.
- **PATCH** — correção que não cria contrato: um orçamento estourado corrigido, um link quebrado, um aviso de
  acessibilidade.

Antes de `1.0.0`, a MINOR pode trazer incompatibilidades, desde que o registro as declare em "Alterado" ou
"Removido".

## 3. O registro de mudanças (`CHANGELOG.md`)

- Formato [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/), em português.
- `## [Não lançado]` sempre existe e vem primeiro. Cada PR que muda a plataforma acrescenta ali uma linha
  curta, com o número do PR, sob Adicionado, Alterado, Descontinuado, Removido, Corrigido ou Segurança.
- Uma linha diz o que mudou para quem usa o site ou o repositório, não como foi feito. Detalhes ficam no PR.
- Textos novos ou revisados **não** entram: têm `published` e `revisions`.
- O teste `tests/unit/guardrails/changelog.test.ts` reprova: versões diferentes em `package.json` e
  `Cargo.toml`; versão atual sem seção datada; seções fora de ordem.

## 4. Como publicar uma _release_

1. Na `main` verde, abra um PR `chore(release): vX.Y.Z` que:
   - eleva `version` em `package.json` e em `wasm/Cargo.toml` (e `wasm/Cargo.lock`, por `cargo update -w`);
   - renomeia `## [Não lançado]` para `## [X.Y.Z] - AAAA-MM-DD` e cria um `## [Não lançado]` vazio acima;
   - acrescenta as referências de link ao fim do arquivo.
2. Depois do merge, crie a _tag_ anotada no commit de _release_ e envie-a:

   ```sh
   git tag -a vX.Y.Z -m "vX.Y.Z" <commit>
   git push origin vX.Y.Z
   ```

3. `.github/workflows/release.yml` confere as três versões, extrai a seção do registro
   (`node scripts/release-notes.ts vX.Y.Z`) e publica a _release_. Se algo divergir, nada é publicado;
   corrija e mova a _tag_ só se a _release_ ainda não existir.

## 5. Commits e PRs

- [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/): `feat`, `fix`, `docs`, `refactor`,
  `test`, `ci`, `chore`, `style`, com escopo entre parênteses (`feat(labs)`, `fix(budgets)`); `!` ou
  `BREAKING CHANGE:` no rodapé para incompatibilidades.
- Um PR por assunto, pequeno o bastante para ser lido inteiro; o template do repositório pede o quê, o porquê e
  como verificar. O auto-merge espera as verificações obrigatórias.
