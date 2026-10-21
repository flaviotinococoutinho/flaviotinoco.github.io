# ADR 0011 — Acervo de fórmulas: toda fórmula tem versão em palavras

- Status: aceito
- Data: 2026-10-21
- Relacionados: `src/core/formulas/`, `src/content/formulas/*.json`, `src/core/latex/formula-block.ts`,
  `src/adapters/unified/load-formulas.ts`, `tests/unit/guardrails/formulas.test.ts`, `docs/guia-latex.md` §1.2;
  ADR 0002, ADR 0004, ADR 0009 (decisão 3 alterada por este ADR)

## Contexto

O site tinha 40 equações numeradas (20 por língua) e 27 notações de conceito, todas desenhadas pelo KaTeX com
MathML e nenhuma com descrição em prosa. Para quem lê com dislexia, com leitor de tela ou sem treino na
notação, a fórmula era uma imagem: o número era o único rótulo. O autor pediu que toda fórmula tivesse versão
descritiva e que as fórmulas formassem um acervo de referência.

Três pontos fixaram a forma da solução:

1. A mesma fórmula aparece em vários documentos e nas duas línguas (a interpolação de Whittaker–Shannon está
   num ensaio e num laboratório; a entropia é notação de conceito e equação de ensaio). A descrição precisa
   viver num só lugar.
2. A garantia "toda fórmula tem versão em palavras" tem de ser verificável na compilação, não uma convenção.
3. Fórmulas desenhadas pesam: uma equação em modo de destaque custa 3–6 KiB de HTML e um símbolo em linha,
   cerca de 0,7 KiB. O ensaio mais pesado estava a 145 KiB de um orçamento de 150 KiB (ADR 0009).

## Decisão

1. **Fórmulas são dados.** Cada fórmula é um arquivo `src/content/formulas/<id>.json` com nome, TeX canônico,
   rótulos por língua (`labels`), conceito cuja notação ela é (`concept`, opcional), estrato e domínios (só sem
   conceito: com conceito, são os dele), significado (`meaning`), leitura em voz alta (`spoken`), símbolos
   (`symbols`), conceitos relacionados e fontes — tudo nas duas línguas. O núcleo (`src/core/formulas/`) analisa
   os arquivos ("parse, don't validate"), confere referências a conceitos e fontes, rejeita rótulo ou slug usado
   duas vezes na mesma língua e um conceito com duas notações, e indexa por rótulo, slug e conceito.
2. **O vínculo é por rótulo, não por igualdade de TeX.** Uma equação `\label{eq:x}` de um documento em
   `src/content/` está vinculada à fórmula cujos `labels` da língua contêm `eq:x`. O TeX do registro é a forma
   canônica da ficha; o documento pode escrever uma variante (`TR` em vez de `T`, um termo intermediário) e a
   leitura em voz alta descreve a forma canônica. Onde a escolha era livre, as notações dos conceitos foram
   alinhadas à forma canônica (Kraft em base k, limites de Huffman com `L*`, transformada de Fourier com `X(f)`).
3. **A garantia é total e falha a compilação.** O estágio `latex` recebe o registro para os arquivos de
   `src/content/` e reprova (`latex:missing-formula`) qualquer equação numerada sem fórmula. O teste de guarda
   `tests/unit/guardrails/formulas.test.ts` fecha o resto: todo bloco `$$` do conteúdo tem `\label`, todo
   rótulo do registro é usado na sua língua e toda notação de conceito tem fórmula. Documentos compilados a
   partir de cadeias (testes, ferramentas) não são vinculados.
4. **A versão em palavras acompanha a equação.** Sob cada equação vinculada o estágio gera um
   `<details class="formula__words">` fechado cujo resumo mostra "Em palavras" e o nome da fórmula (visível sem
   interação), com o significado, a leitura em voz alta e o link para a ficha; a equação recebe
   `aria-describedby` apontando para o significado (WCAG 2.2 SC 1.3.1). A lista de símbolos fica na ficha e na
   página do conceito (`FormulaWords.astro`, o mesmo contrato de classes), não no documento: cinco listas
   custariam ≈ 14 KiB num ensaio. As palavras não entram na contagem de palavras nem no tempo de leitura
   (`readingGenerated`). Na impressão, o conteúdo do `details` é exposto onde o navegador permite
   (`::details-content`).
5. **O acervo é um índice leve e uma página por fórmula.** `/<lang>/formulas/` lista as fórmulas na ordem da
   ponte (estrato, depois id), com ordinal (F1, F2…), nome e significado, sem KaTeX: 36 fórmulas desenhadas
   passariam de 150 KiB numa página só. Cada fórmula tem a própria página com notação, significado, leitura,
   símbolos, onde aparece (as equações numeradas das obras da língua, com link para a âncora), conceito e
   conceitos relacionados e fontes. `/formulas.json` exporta o registro inteiro nas duas línguas.
6. **O orçamento de HTML passa de 150 para 160 KiB por página** (altera a decisão 3 do ADR 0009). Medido com
   a compilação de 21/10/2026: o ensaio mais pesado foi de 145,2 KiB para 151,0 KiB com cinco blocos de
   palavras (≈ 1,2 KiB cada); sem o aumento, a versão em palavras teria de sair do documento ou ficar reduzida
   ao link. O limite continua medido por `pnpm check:budgets` no job `Site`; a margem (9 KiB) é a mesma ordem
   de grandeza da anterior (4,8 KiB).

## Consequências

- Escrever uma equação numerada nova exige registrar a fórmula; a mensagem de erro diz o arquivo e o campo.
  Uma equação de passagem que não mereça ficha deve ficar sem rótulo e sem número — e o teste de guarda
  reprova blocos `$$` sem rótulo, logo toda fórmula em destaque passa pelo acervo.
- O registro e os conceitos são lidos duas vezes (pipeline com `node:fs`, páginas com a coleção do Astro),
  pelo mesmo analisador; os dois sempre concordam (o mesmo arranjo dos conceitos, ADR 0004).
- Uma medida de redução fica anotada para outra rodada: o sprite SVG de glifos e filtros é repetido em cada
  página (≈ 7,5 KiB); um sprite externo devolveria esse espaço a todas as páginas.
