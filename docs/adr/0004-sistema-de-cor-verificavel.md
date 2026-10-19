# ADR 0004 — Sistema de cor verificável

- **Status:** aceito
- **Data:** 2026-10-13
- **Relacionados:** `docs/arquitetura.md` §1, §2 (princípio 6), §6; `src/core/design/`; `scripts/tokens.ts`;
  `scripts/verify-palette.ts`

## Contexto

A cor carrega duas funções no site: legibilidade (texto sobre papel, nos temas claro, escuro e de alto
contraste) e identificação dos quatro estratos. Paletas costumam ser escolhidas “no olho” e conferidas uma
vez; depois, cada ajuste pode quebrar o contraste de algum par, sair da gama sRGB (cada navegador recorta de
um jeito: perda de informação descontrolada) ou tornar dois estratos indistinguíveis para quem tem
discromatopsia — cerca de 8 % dos homens de ascendência europeia têm alguma deficiência congênita na visão de cores.

Valores de cor espalhados pelo CSS também impedem verificar qualquer coisa: não há uma fonte única.

## Decisão

1. **Fonte única em tokens W3C DTCG** (_Design Tokens Format Module_ 2025.10): `src/core/design/tokens.json`,
   cores em OKLCH (espaço perceptualmente uniforme, adequado a escalas de luminosidade). O núcleo analisa o
   documento (`parseTokens`, acumulando todos os erros) e o compila (`compileCss`) em
   `src/styles/tokens.css`, **gerado** — nunca editado à mão. Resolução de tema: `[data-theme]` explícito >
   `prefers-color-scheme` > claro; `[data-contrast="more"]` ou `prefers-contrast: more` aplicam as variantes
   `*-more`.
2. **Só tokens no CSS.** Componentes usam apenas propriedades `--paper*`, `--ink*`, `--rule*`, `--link`,
   `--focus`, `--mark`, `--stratum-*` (e os tokens de tipografia, espaço e tempo). Nada de cores literais nem
   `linear-gradient()` (a textura do fundo é ruído fractal, não gradiente).
3. **Verificação contínua no CI** (`pnpm verify:palette`, com colorjs.io e apca-w3), para cada esquema:
   - **Gama:** todo token dentro de sRGB.
   - **Texto:** WCAG 2.2 — critério 1.4.6 (AAA, ≥ 7:1) para texto principal, secundário e links; 1.4.3
     (≥ 4,5:1) para texto sutil e rótulos de estrato. APCA (APCA-W3 0.1.9): |Lc| ≥ 75 para o texto principal.
   - **Suavidade:** texto principal ≤ 16:1 nos esquemas normais (sem preto puro sobre branco puro); os
     esquemas `*-more` são isentos por definição.
   - **Não texto:** WCAG 1.4.11, ≥ 3:1 para bordas de controles e indicador de foco.
   - **Discromatopsia:** as quatro cores de estrato, simuladas sob protanopia, deuteranopia e tritanopia pelo
     modelo de Machado, Oliveira e Fernandes (2009, _IEEE TVCG_ 15(6):1291–1298; matrizes de severidade 1,0
     sobre RGB linear), mantêm distância mínima CIEDE2000 ΔE₀₀ ≥ 8 entre todos os pares (≥ 15 com visão
     típica); sob acromatopsia (luminância relativa, coeficientes ITU-R BT.709), a luminosidade é
     estritamente monótona na ordem dos estratos — a ordem sobrevive sem matiz.
   - `pnpm check:tokens` reprova se `tokens.css` não corresponder a `tokens.json`; um _hook_ do Claude Code
     (`.claude/hooks/tokens-on-edit.mjs`) regenera o arquivo e reexecuta a verificação a cada edição dos tokens.
4. **Cor nunca é o único portador de significado** (WCAG 1.4.1): estratos são sempre codificados também por
   forma (k-simplexo), posição e rótulo textual. Os limiares acima tornam o canal redundante robusto — não o
   tornam suficiente sozinho.
5. **Prova no navegador:** os testes e2e rodam axe-core (inclui `color-contrast`) em todas as páginas nos
   temas claro e escuro.

## Consequências

- **Positivas:** qualquer ajuste de cor é verificado em segundos, com relatório por par; temas alto contraste
  e escuro são cidadãos de primeira classe; a mesma matriz de Machado alimenta filtros SVG de simulação no
  navegador (`feColorMatrixValues`).
- **Negativas:** a paleta fica restrita a regiões do espaço de cor que satisfazem todos os limiares ao mesmo
  tempo (em especial os quatro estratos sob tritanopia); mudar a identidade visual exige trabalhar com os
  números, não só com o olho.
- **Fora do escopo:** APCA ainda não é norma (WCAG 3 em rascunho); é usado como verificação adicional, e
  a WCAG 2.2 continua sendo o critério de conformidade.
