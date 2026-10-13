# ADR 0001 — Núcleo funcional e casca imperativa

- **Status:** aceito
- **Data:** 2026-10-13
- **Relacionados:** `docs/arquitetura.md` §2–3; ADR 0002; `eslint.config.js`; `vitest.config.ts`

## Contexto

O site combina várias regras não triviais: um pipeline de Markdown com uma linguagem de diretivas própria,
normas tipográficas e bibliográficas (ABNT NBR 6023, 10520, 14724; APA 7), um codec de rotas bilíngue, uma
ontologia SKOS, um sistema de cor verificado e núcleos numéricos em WebAssembly. Essas regras precisam ser
testáveis exaustivamente (inclusive com testes de propriedade), reproduzíveis byte a byte entre máquinas e
independentes do Astro, que muda de versão principal com frequência (o Astro 7 trocou o processador de
Markdown, o compilador e o padrão de `compressHTML`).

Código que mistura regra e efeito colateral (ler arquivos, consultar o relógio, tocar o DOM, chamar o Astro) só
pode ser testado com _mocks_, falha de modos difíceis de reproduzir e prende a regra à ferramenta.

## Decisão

Adotamos o padrão **núcleo funcional, casca imperativa** (G. Bernhardt, _Boundaries_, 2012):

1. **Núcleo (`src/core/**`)** — funções puras, determinísticas e totais.
   - Sem E/S, sem `node:*`, sem DOM, sem `astro:*`, sem `import.meta`, sem `console`, sem
     `Date.now()`/`new Date()`/`Math.random()` (relógios e sementes são injetados), sem `throw` (erros são
     valores `Result`, de `src/core/algebra/result.ts`).
   - Dados `readonly`; identificadores com marca (`src/core/domain/identifiers.ts`); uniões discriminadas com
     `switch` exaustivo terminado em `absurd()`. Mutação local é permitida; mutar argumentos, não.
   - O núcleo só importa do próprio núcleo.
2. **Casca** — `src/adapters/**` (unified, Astro, wasm), `src/islands/**` (DOM), `src/views`, `src/components`,
   `src/pages`, `scripts/`, `cli/`. Lê, escreve, desenha e pode falhar ruidosamente (`file.fail` nos estágios
   unified, `throw` em adaptadores de tempo de compilação). As ilhas (navegador) não importam o pipeline de
   Markdown (`src/adapters/unified/**`), que só existe em tempo de compilação.
3. **Padrões por pasta** — o nome diz o que a função é, e cada padrão tem leis verificadas por testes:

   | Padrão            | Assinatura                               | Lei verificada                                           |
   | ----------------- | ---------------------------------------- | -------------------------------------------------------- |
   | parser (`parse*`) | `unknown → Result<T, E>`                 | aceita exatamente a linguagem especificada               |
   | codec             | `encode: A → B`, `decode: B → Result<A>` | `decode ∘ encode = id`                                   |
   | transform         | `Tree → Tree`                            | preservação do texto (ou recuperação), idempotência      |
   | fold              | `Tree → Summary`                         | determinismo; invariância a reordenação quando aplicável |
   | compiler          | `Spec → Artefact`                        | equivalência com a especificação ingênua                 |
   | formatter         | `Model × Style → string`                 | exemplos trabalhados da norma                            |

4. **Imposição automática** (e não por revisão humana):
   - `eslint.config.js`: `no-restricted-imports`, `no-restricted-globals`, `no-restricted-properties`,
     `no-restricted-syntax` (`new Date()` sem argumentos, `Date()`, `import.meta`),
     `functional/no-throw-statements`, `no-param-reassign` com `props`, `switch-exhaustiveness-check` e a regra
     local `local/import-boundaries`, que resolve o caminho real de cada importação relativa (pega
     `../../adapters/x.ts` em qualquer profundidade). `tests/unit/guardrails/architecture.test.ts` garante que
     essas regras continuam ativas.
   - `vitest.config.ts`: cobertura do núcleo ≥ 85 % de linhas, instruções e funções e ≥ 75 % de ramos no
     agregado, com piso de 60 % de linhas **por arquivo** (um módulo novo sem testes reprova mesmo que a média
     esteja alta). O núcleo é puro, portanto tudo nele é alcançável por testes sem _mocks_; a folga cobre
     ramos defensivos (`absurd`) e mensagens de erro, não módulos sem teste. Os ramos têm limite menor porque
     cada analisador tem um ramo de erro por forma malformada e enumerar todas tem pouco valor.
   - Testes de propriedade com fast-check usam uma semente por execução, impressa e repassada aos _workers_
     (`FC_SEED`), para que qualquer falha seja reproduzível.

## Consequências

- **Positivas:** as regras são testáveis com dados puros, inclusive por propriedades; trocar o Astro, o
  processador de Markdown ou o ambiente (CLI, navegador, Node) não toca o núcleo; o mesmo código roda na
  compilação e no cliente; erros de conteúdo são acumulados e mostrados de uma vez.
- **Negativas:** há uma camada a mais de adaptação (a casca converte E/S em dados e `Result` em falhas);
  algumas APIs convenientes (relógio, aleatoriedade, `console`) exigem injeção explícita.
- **Riscos e mitigação:** uma regra de lint errada poderia empurrar código para a casca sem necessidade — a
  correção é discutir a regra (com justificativa registrada no próprio `eslint.config.js` ou em um ADR),
  nunca desligá-la para o CI passar.
