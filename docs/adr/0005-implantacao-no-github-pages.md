# ADR 0005 — Implantação no GitHub Pages

- **Status:** aceito
- **Data:** 2026-10-13
- **Relacionados:** `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, `.github/dependabot.yml`,
  `astro.config.ts`; `docs/research/github-actions.md`, `docs/research/astro7.md`

## Contexto

O site é estático (HTML, CSS, módulos JS sob demanda, WebAssembly) e público. O repositório é
`flaviotinococoutinho/flaviotinoco.github.io`. Como o dono da conta é `flaviotinococoutinho`, e não
`flaviotinoco`, o GitHub Pages trata o repositório como **site de projeto**: ele é servido em
`https://flaviotinococoutinho.github.io/flaviotinoco.github.io/`, com _base path_ `/flaviotinoco.github.io`.
Um site de usuário (repositório `flaviotinococoutinho.github.io`) ou um domínio próprio é servido na raiz.

Erros de _base path_ são o defeito mais comum desse tipo de publicação: links absolutos `/pt/...` funcionam
em desenvolvimento e quebram em produção. O GitHub Pages também diferencia maiúsculas de minúsculas e faz
redirecionamento quando falta a barra final.

Ações de terceiros executam com o token do repositório; uma _tag_ (`v4`) é mutável e pode passar a apontar
para código malicioso.

## Decisão

1. **Publicação por GitHub Actions**, não pela branch `gh-pages`: em _Settings → Pages_, a fonte é
   “GitHub Actions”. O fluxo `deploy.yml` roda em _push_ para `main` e manualmente (`workflow_dispatch`):
   - `actions/configure-pages` (id `pages`) fornece `origin` e `base_path`, exportados como `SITE` e
     `BASE_PATH` para a compilação; `astro.config.ts` lê essas variáveis (`base_path` vazio ⇒ base `/`).
     Assim, renomear o repositório para `flaviotinococoutinho.github.io` ou adicionar um domínio próprio
     remove o _base path_ automaticamente, sem mudança de código.
   - `pnpm build` (kernels wasm → `astro build` → índice Pagefind), depois `check:links` e `check:budgets`
     contra a origem e o _base path_ reais, `actions/upload-pages-artifact` (`path: dist`) e, em outro job,
     `actions/deploy-pages` no ambiente `github-pages`.
   - Permissões mínimas: `contents: read` no fluxo; o job de compilação só lê a configuração do Pages
     (`pages: read`); só o job de implantação recebe `pages: write` e `id-token: write` (OIDC).
   - Concorrência `pages` **sem** cancelar implantações em andamento (um cancelamento pode deixar o Pages
     publicado pela metade); execuções novas aguardam a vez.
2. **Desenvolvimento local com os valores de produção.** Sem variáveis de ambiente, `astro.config.ts`,
   `scripts/lib/site.ts` e `playwright.config.ts` usam o site de projeto (`/flaviotinoco.github.io/`), para que
   erros de _base path_ apareçam já na máquina do autor. `trailingSlash: 'always'` e `build.format:
'directory'` evitam redirecionamentos; `scripts/check-links.ts` reprova links fora do _base path_, sem barra
   final ou com fragmento inexistente; os testes e2e navegam com `baseURL` que inclui o _base path_.
3. **Cadeia de suprimentos das Actions.**
   - Toda ação é fixada pelo **SHA completo do commit**, com a versão em comentário
     (`uses: actions/checkout@3d3c42e… # v7.0.1`). SHAs conferidos com `git ls-remote` (tags anotadas
     “descascadas” com `^{}`), nunca copiados de memória.
   - Preferimos versões com pelo menos 14 dias de publicação quando existe uma mais antiga equivalente
     (mesma janela de espera configurada no Dependabot). Exceção: `dtolnay/rust-toolchain` é fixado no SHA
     do `master` (o projeto é distribuído por branches — `master`, `stable`, `1.xx.0` —, não por releases; o
     `master` mais recente contém uma correção de segurança), nunca no SHA da branch `stable`, que fica fora do histórico do `master` e pode ser coletado.
   - `actions/checkout` com `persist-credentials: false`; fluxos com `permissions` explícitas.
   - Dependabot semanal para `npm`, `cargo` (`/wasm`) e `github-actions`, com atualizações _minor/patch_
     agrupadas e `cooldown` de 14 dias; ele atualiza o SHA e o comentário juntos.
   - CodeQL (JavaScript/TypeScript e os próprios workflows) em PRs, em `main` e semanalmente.
4. **CI antes do merge.** `ci.yml` (qualidade, wasm, compilação, e2e) roda em todo PR; a proteção da branch
   `main` deve exigir esses jobs e a revisão de `CODEOWNERS`.

## Consequências

- **Positivas:** publicação reprodutível e auditável; o mesmo artefato verificado (links, orçamentos) é o
  publicado; nenhuma credencial de longa duração; troca de domínio sem mudança de código.
- **Negativas:** fixar SHAs exige manutenção (delegada ao Dependabot); a janela de 14 dias atrasa correções
  não relacionadas a segurança; o site depende da disponibilidade do GitHub Pages (é estático e pode ser
  movido para qualquer servidor de arquivos, ajustando `SITE` e `BASE_PATH`).
- **Passos manuais (uma vez):** em _Settings → Pages_, escolher a fonte “GitHub Actions”; em _Settings →
  Branches_, proteger `main` exigindo os checks do CI.
