# ADR 0002 — Conteúdo como dados

- **Status:** aceito
- **Data:** 2026-10-13
- **Relacionados:** `docs/arquitetura.md` §2 (princípios 4 e 5), §4–5; ADR 0001; `src/adapters/unified/pipeline.ts`

## Contexto

Ensaios e laboratórios devem durar mais que a ferramenta que os publica. Precisam poder ser convertidos para
Pandoc/LaTeX, revisados por quem não programa, verificados mecanicamente (referências cruzadas, citações,
paridade de traduções) e publicados sem executar código arbitrário.

O caminho “natural” no Astro é MDX: componentes JSX dentro do texto. Isso torna cada texto um programa — que
depende de importações, quebra quando um componente muda e não pode ser lido por outra ferramenta. Além disso,
vários pontos do ecossistema perdem informação em silêncio:

- `remark-directive` interpreta “às 10:30” como diretiva de texto `:30` e apaga parte da frase;
- `remark-math` com `$` simples transforma “R$ 5,00 e R$ 10,00” em fórmula;
- YAML 1.1 lê `no`, `yes`, `on` como booleanos (_Norway problem_);
- o Astro 7 remove o espaço entre elementos inline com `compressHTML: 'jsx'`;
- BibTeX decodificado nem sempre sai em NFC (`é` como `e` + U+0301).

## Decisão

1. **Markdown puro (`.md`), nunca MDX.** O conteúdo é dado: frontmatter validado na fronteira
   (`src/content.config.ts`, com os construtores do núcleo) e corpo em CommonMark + GFM.
2. **Linguagem de diretivas fechada** (`docs/arquitetura.md` §5): ambientes `amsthm`, ilustrações ABNT,
   citações, leitura não linear, marcação normativa. Cada estágio do pipeline reivindica as diretivas que trata
   (`node.data.hName`). Diretivas de bloco desconhecidas **falham a compilação**; diretivas de texto
   desconhecidas voltam a ser texto literal, com aviso.
3. **Matemática só com `$$…$$`** (inline dentro do parágrafo; bloco em linhas próprias). O `$` simples é texto
   — em português é moeda. Rótulos `\label{…}`, referências `:eqref[…]`/`\eqref{…}`, macros do site em
   `src/core/latex/macros.ts`.
4. **Preservação de informação.** Toda transformação de texto `T` admite recuperação `R` com `R(T(x)) = x`: ou
   o texto plano não muda (a marcação só acrescenta estrutura), ou o original fica num atributo `data-*`. Cada
   estágio prova isso com um teste de propriedade (fast-check). Contramedidas já adotadas: estágio `integrity`
   restaura trechos que o `remark-directive` consumiria; `compressHTML: true`; léxicos em TSV com esquema
   explícito (não YAML); normalização NFC na fronteira bibliográfica.
5. **O formatador não toca no conteúdo.** `src/content/**`, `*.tsv`, `*.bib`, `docs/research/` e os
   _fixtures_ de teste estão em `.prettierignore`: espaços finais (quebra de linha forçada), aspas e quebras
   de linha podem carregar significado.
6. **Paridade bilíngue verificada.** `scripts/check-i18n.ts` exige que todo ensaio, laboratório e página
   publicado exista nas duas línguas com o mesmo `translationKey`, que a pasta (`pt/`, `en/`) concorde com
   `lang`, que não haja colisão de rotas e que os quatro estratos existam nas duas línguas; catálogos de
   mensagens precisam de chaves e marcadores `{x}` idênticos.

## Consequências

- **Positivas:** textos portáveis e legíveis sem o site; nenhum código executa a partir do conteúdo; erros de
  autoria aparecem na compilação, todos de uma vez; o site pode trocar de gerador sem reescrever textos.
- **Negativas:** recursos novos de apresentação exigem um estágio (ou uma diretiva nova, com teste e
  documentação) em vez de um componente ad hoc; autores precisam aprender a linguagem de diretivas.
- **Regra de evolução:** acrescentar uma diretiva é mudar o contrato — atualizar `docs/arquitetura.md` §5, o
  estágio responsável, os testes de propriedade e, se a decisão não for óbvia, um ADR.
