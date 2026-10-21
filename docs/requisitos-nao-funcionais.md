# Requisitos não funcionais

> O que o site exige de si mesmo além do conteúdo, e como cada exigência é formalizada, medida e verificada.
> Cada requisito tem uma definição, o formalismo ou a heurística que o torna decidível, o limiar, a verificação
> que o comprova (comando e job do CI) e a evidência mais recente. "Verificado" significa que o comando passou no
> código versionado na data indicada; nada aqui vale por declaração.
>
> Decisões: ADRs 0001–0010. Arquitetura: [arquitetura.md](arquitetura.md). Última medição: 21/10/2026.

## 0. Método

Os requisitos seguem quatro regras, derivadas da teoria que o site expõe:

- **Uma página é uma mensagem num canal com capacidade.** O orçamento de bytes é uma restrição de
  capacidade; o conteúdo é o que se quer transmitir; a moldura é redundância. O projeto decide, como um código
  de fonte, o que vai em cada página e o que fica para depois (revelação progressiva, ilhas sob demanda, JSON
  por idioma).
- **Custo fixo × N e custo marginal.** Todo byte da moldura é pago em cada página (140 hoje); todo conceito novo
  custa ≈ 1,4 KiB na visão geral da ontologia. Otimizar a moldura paga N vezes; o custo marginal define o
  horizonte de cada página (ADR 0009).
- **Restrições como gramática, não como revisão.** O que pode ser decidido por uma máquina é decidido por ela:
  pureza do núcleo (lint), paridade de línguas (script), contraste (cálculo), orçamentos (medição), topologia
  da ontologia (validação), injetividade (testes de propriedade). A revisão humana fica para o que exige juízo.
- **Reprodutibilidade como pré-requisito de qualquer medida.** Versões fixas, sementes impressas,
  `SOURCE_DATE_EPOCH`, ações fixadas por SHA: a mesma entrada produz o mesmo site, então uma medida de hoje é
  comparável com a de amanhã.

## 1. Desempenho

| Requisito                     | Formalismo / heurística                                                                                     | Limiar                  | Verificação                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------- |
| HTML por página               | bytes brutos; a moldura é custo fixo × N, o conteúdo é custo marginal (ADR 0009)                            | ≤ 150 KiB               | `pnpm check:budgets` · job `Site`             |
| CSS bloqueante por página     | gzip nível 6 das folhas ligadas e dos `<style>` (o que atrasa a primeira pintura)                           | ≤ 30 KiB                | idem                                          |
| JavaScript inicial por página | gzip do fecho transitivo das importações estáticas (`import.meta.glob` das ilhas é sob demanda e não conta) | ≤ 12 KiB                | idem                                          |
| Núcleo WebAssembly            | bytes brutos de cada módulo, sem `wasm-bindgen` nem importações (ADR 0003)                                  | ≤ 48 KiB cada           | `scripts/build-wasm.mjs` · job `wasm`         |
| Fontes pré-carregadas         | bytes brutos; aviso, não erro (woff2 já é comprimido; o preload disputa banda com o HTML)                   | ≤ 100 KiB (aviso)       | `pnpm check:budgets`                          |
| Comportamento sob demanda     | um `<script>` global (`registry.ts`); cada `ft-*` é importado ao aproximar-se da viewport                   | 0 frameworks no cliente | lint de camadas; `check:budgets` (JS inicial) |
| Busca sem servidor            | índice estático Pagefind, carregado só quando a paleta abre                                                 | —                       | `pnpm search:index`; e2e da paleta            |

Medições de 21/10/2026 (`dist/` da branch `fix/html-budgets`): a página mais pesada é
`pt/ensaios/amostrar-e-decidir`, 145,2 KiB de HTML (62 fórmulas com MathML); a visão geral da ontologia,
95,0 KiB; CSS bloqueante máximo 20,7 KiB (com o KaTeX); JavaScript inicial 2,5 KiB em toda página; núcleos
16,0 + 10,2 + 10,2 KiB. Custo marginal da ontologia: ≈ 1,1 KiB por conceito no mapa e ≈ 0,27 KiB na árvore.

## 2. Acessibilidade

| Requisito             | Formalismo / heurística                                                                           | Limiar                                                                              | Verificação                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Conformidade          | WCAG 2.2 nível AA, com contraste de texto AAA                                                     | 0 violações axe (2.0/2.1 A+AA, 2.2 AA)                                              | `pnpm test:e2e` nas 140 páginas, temas claro e escuro · job `e2e` |
| Contraste de texto    | WCAG 1.4.6 (razão de luminância) e APCA (Lc)                                                      | ≥ 7:1 principal, ≥ 4,5:1 sutil; APCA ≥ 75; ≤ 16:1 (sem preto puro)                  | `pnpm verify:palette` (158 verificações) · job `quality`          |
| Não texto             | WCAG 1.4.11                                                                                       | ≥ 3:1 bordas e foco                                                                 | idem                                                              |
| Cor nunca sozinha     | WCAG 1.4.1; estratos codificados por forma (k-simplexo), posição e rótulo                         | —                                                                                   | revisão; e2e (rótulos presentes)                                  |
| Discromatopsia        | simulação de Machado, Oliveira e Fernandes (2009), severidade 1; distância CIEDE2000              | ΔE₀₀ ≥ 8 entre estratos (≥ 15 visão típica); luminosidade monótona sob acromatopsia | `pnpm verify:palette`                                             |
| Teclado               | WCAG 2.1.1, 2.4.1, 2.4.3, 2.4.7; APG para combobox, árvore, diálogo                               | primeiro Tab = link de pular; foco visível ≥ 2 px em cores forçadas                 | e2e `keyboard.spec`, `chrome.spec`                                |
| Movimento             | WCAG 2.3.3; `prefers-reduced-motion` e preferência do leitor (`--motion`)                         | nenhuma animação com movimento reduzido                                             | e2e `motion.spec`                                                 |
| Atalho de tecla única | WCAG 2.1.4: "/" pode ser desligado                                                                | —                                                                                   | e2e `chrome.spec`                                                 |
| Idioma dos trechos    | WCAG 3.1.2: `lang` em estrangeirismos, citações e títulos de obra (léxico + diretivas)            | —                                                                                   | estágio `abnt` (avisos); testes do léxico                         |
| Sem JavaScript        | todo `ft-*` tem conteúdo útil estático; mapa, árvore, formulários e laboratórios degradam a texto | —                                                                                   | revisão; e2e (conteúdo antes da ilha)                             |
| Fórmulas              | KaTeX com MathML (`htmlAndMathml`); equações focalizáveis com nome                                | —                                                                                   | testes de `latex`; axe                                            |

## 3. Segurança e cadeia de suprimentos

| Requisito                        | Formalismo / heurística                                                                                                    | Verificação                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Política de conteúdo             | CSP por `<meta>`: `script-src 'self' 'wasm-unsafe-eval'` + hashes dos scripts inline; `style-src 'self'` + atributos       | Astro `security.csp`; e2e registra toda violação        |
| Nenhum HTML injetado             | ilhas constroem DOM com `createElement`; JSON para `<script>` com `<` escapado                                             | revisão; CodeQL                                         |
| Ações fixadas por SHA            | todo `uses:` com SHA completo e versão em comentário; `persist-credentials: false`; permissões mínimas por job (ADR 0005)  | revisão; Dependabot; teste `workflows.test.ts`          |
| Privilégio mínimo na implantação | `contents: read` no workflow; `pages: write` e `id-token: write` só no job `deploy`; `contents: write` só no job `release` | `tests/unit/guardrails/workflows.test.ts`               |
| Dependências                     | lockfiles fixos; Dependabot semanal com `cooldown` de 14 dias; `engine-strict`                                             | `pnpm install --frozen-lockfile`; `cargo --locked`      |
| Análise estática                 | CodeQL (JavaScript/TypeScript e workflows) em PR, `main` e semanal                                                         | job `CodeQL`                                            |
| Sem segredos                     | nenhum segredo de longa duração; OIDC para o Pages                                                                         | revisão                                                 |
| Privacidade                      | nenhum rastreador, cookie ou chamada externa; preferências só em `localStorage`; busca local                               | revisão; `check:links` (0 recursos externos carregados) |
| `main` protegida                 | merge só por PR; seis verificações obrigatórias; sem _force-push_ nem exclusão (emenda ao ADR 0005)                        | conjunto de regras `main` (21/10/2026)                  |

## 4. Reprodutibilidade e determinismo

| Requisito                           | Formalismo / heurística                                                                             | Verificação                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Mesma entrada, mesmo site           | `SOURCE_DATE_EPOCH` honrado; nenhum relógio ou aleatoriedade no núcleo; semente fixa do mapa (1948) | lint de pureza; `scene.test.ts`                               |
| Testes de propriedade reproduzíveis | uma semente por execução, impressa e repassada (`FC_SEED`)                                          | `vitest.config.ts`; CI imprime a semente                      |
| Toolchains fixas                    | Node ≥ 22.18 (24 no CI), pnpm 10.28.0, Rust 1.97.0, KaTeX 0.19.0 por `overrides`                    | `engine-strict`; `rust-toolchain.toml`; `pnpm-workspace.yaml` |
| Núcleos determinísticos             | PCG32 com semente; nenhuma chamada ao sistema; validação de ponteiros                               | `tests/unit/wasm/` (fuzz e referências bit a bit)             |
| Tokens gerados, nunca editados      | `tokens.json` → `tokens.css` por compilador puro                                                    | `pnpm check:tokens`; hook de edição                           |

## 5. Preservação de informação

| Requisito                   | Formalismo / heurística                                                                               | Verificação                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Transformações injetivas    | para toda transformação `T` existe `R` com `R(T(x)) = x`: texto plano intacto ou original em `data-*` | testes de propriedade em `reading`, `latex`, `abnt`, `citations` |
| Codecs de ida e volta       | `decode ∘ encode = id` para rotas, preferências, grafo, entradas da paleta, formulário, BibTeX        | testes de propriedade (fast-check)                               |
| Formatador fora do conteúdo | `src/content/**`, `*.tsv`, `*.bib`, `docs/research/` ignorados pelo Prettier                          | `.prettierignore`                                                |
| Sem perda silenciosa        | `compressHTML: true`; `$` simples é texto; TSV com esquema; NFC na fronteira bibliográfica            | ADR 0002; testes do léxico e da bibliografia                     |
| Compilação estrita          | um `[ERROR]` de renderização de conteúdo falha a compilação                                           | `scripts/astro-build-strict.mjs`                                 |

## 6. Internacionalização

| Requisito             | Formalismo / heurística                                                                                   | Verificação                           |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Paridade de conteúdo  | toda obra publicada existe nas duas línguas com o mesmo `translationKey`; quatro estratos em cada         | `pnpm check:i18n` · job `quality`     |
| Paridade de interface | catálogos com as mesmas chaves e os mesmos `{marcadores}`, verificados pelo compilador (`defineMessages`) | `pnpm check:types`, `pnpm check:i18n` |
| Rotas bijetivas       | `decode ∘ encode = id`; segmentos localizados; `hreflang` e `x-default`                                   | `routes.test.ts`; `check:links`       |
| Normas por língua     | ABNT (pt-BR) e APA 7 (en) nas citações; vírgula/ponto decimal; datas por `Intl`                           | testes de `bibliography`              |

## 7. Portabilidade do conteúdo

| Requisito                | Formalismo / heurística                                                                           | Verificação                         |
| ------------------------ | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Markdown puro            | CommonMark + GFM + diretivas fechadas; nenhum JSX (ADR 0002)                                      | lint de conteúdo; testes de sintaxe |
| Exportação para LaTeX    | `exportLatex` puro; `.tex` completo com `amsthm`, `biblatex-abnt`/`apa`                           | instantâneos e verificador estático |
| Dados abertos            | `ontology.jsonld` (SKOS/OWL/schema.org), `ontology.graph.json`, `.bib` por página, RSS por língua | testes de codecs; `check:links`     |
| Independência do gerador | regras em `src/core/**`, sem Astro; adaptadores substituíveis                                     | lint de camadas                     |

## 8. Manutenibilidade

| Requisito            | Formalismo / heurística                                                                 | Limiar                                                                            | Verificação                            |
| -------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| Núcleo puro          | sem E/S, DOM, Astro, relógio, aleatoriedade, `throw`; `Result`; `absurd` (ADR 0001)     | 0 exceções à regra                                                                | `pnpm check:lint`                      |
| Cobertura do núcleo  | v8 sobre `src/core/**` e `scripts/lib/**`                                               | 85 % linhas/instruções/funções, 75 % ramos; 60 % por arquivo; `scripts/lib` 90/80 | `pnpm test --coverage` · job `quality` |
| Tipos estritos       | `astro/tsconfigs/strictest`, `erasableSyntaxOnly`, `noPropertyAccessFromIndexSignature` | 0 erros                                                                           | `pnpm check:types`                     |
| Formatação           | Prettier (120 colunas), EditorConfig                                                    | 0 diferenças                                                                      | `pnpm check:format`                    |
| Versionamento        | SemVer; registro de mudanças; `release.yml` (ADR 0010)                                  | versões iguais em `package.json` e `Cargo.toml`                                   | `changelog.test.ts`                    |
| Decisões registradas | um ADR por decisão não óbvia, com status e data                                         | —                                                                                 | revisão de PR                          |

## 9. O processo

| Requisito                             | Formalismo / heurística                                                                                                  | Verificação                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| Caminho crítico do CI                 | `quality ∥ wasm → build → e2e` (DAG); `wasm` e `quality` em paralelo; cache do Rust gravado só na `main`                 | `ci.yml`                   |
| Mesmo artefato verificado e publicado | `deploy.yml` reconstrói com a origem e o _base path_ reais, confere links, orçamentos e `robots`, e publica esse `dist/` | `deploy.yml`; job `Deploy` |
| Lançamento controlado                 | `SITE_INDEXING` desligado até o lançamento; `pnpm check:robots` confere todo HTML (ADR 0008)                             | job `Site`; job `Deploy`   |
| Uma PR por assunto                    | Conventional Commits; template com "como verificar"; auto-merge só com as seis verificações                              | conjunto de regras `main`  |

Tempos de referência (21/10/2026, máquina do autor): `pnpm check` ≈ 2 min; `pnpm build:site` ≈ 2 min;
`pnpm test:e2e` 6,9 min (607 testes).
