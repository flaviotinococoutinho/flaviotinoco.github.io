# Arte e experiência: figuras no grid, laboratórios que se mostram — 28/11/2026

- Status: executado na branch `flavio/vibrant-hamilton-wowk2z`; aguarda revisão do autor
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [plano de 26/11/2026 (experiência de leitura)](2026-11-26-experiencia-de-leitura.md); [plano de
  16/11/2026 (revisão de design)](2026-11-16-revisao-de-design.md)

Documento de projeto desta rodada: o que foi pedido, o que a auditoria mostrou, o que mudou e como fica guardado. É
um plano com data, não um contrato permanente.

## 1. Pedido

"Resolva todos demais PRs. Melhore a arte e experiência do site."

A primeira parte (os PRs do Dependabot) não muda o site e fica registrada nos próprios PRs. Este plano trata da
segunda. A rodada de 26/11 cuidou dos ensaios; esta olha as outras páginas: a inicial, as dos estratos, a ontologia e
os conceitos.

## 2. Método

As páginas principais foram compiladas e capturadas no Chromium, em tema claro e escuro, a 1 440 × 900 e a 390 × 844:
início, ensaios, laboratório, ontologia, reticulado, fórmulas, um conceito, um estrato, sobre e escopo. A pergunta
de cada página foi a mesma: o que a página desenha está no grid e na proporção do texto que acompanha? E o que ela
nomeia, ela mostra?

## 3. O que a auditoria mostrou

| Página                | Achado                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ontologia, reticulado | O mapa e o reticulado ocupavam a largura `.full`, do primeiro ao último pixel da janela. O mapa começava na borda esquerda da tela (x = 0), e o título e o texto, a 82 px. Era o único bloco fora da coluna. |
| Conceito              | Em "Obras que discutem este conceito", o glifo ¶ de cada obra era desenhado na largura da sua caixa, cerca de 40 px, e o rótulo "Ensaio" quebrava para a linha de baixo.                                     |
| Conceito              | As subseções ("Na análise formal das obras", "Correspondências externas") começavam coladas ao bloco anterior, sem o espaço que separa um título do texto que o precede.                                     |
| Estrato               | Os conceitos de um estrato (de 12 a 27) vinham em uma coluna de nomes curtos, um por linha. Na página "Formal", eram 27 linhas.                                                                              |
| Estrato, início       | Os laboratórios eram só nomes. A página do laboratório já desenha uma miniatura de cada um na compilação (`src/core/labs/thumbnails.ts`), mas a página inicial e as dos estratos não a usavam.               |

## 4. Decisões

| Recurso                               | Decisão                      | Por quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mapa da ontologia e reticulado        | **`.wide`**                  | Passam a ocupar a coluna do texto mais a margem: começam na mesma borda do título. É a classe que o grid já tinha para isso (`layout.css`). Abaixo de 72 rem, a classe recolhe à coluna principal. O cabeçalho de cada figura fica alinhado à esquerda, na medida do texto. O explorador passa a medir a própria largura (`container-type`) para decidir se o painel do conceito fica ao lado do mapa. A consulta media a página, o que só dava certo enquanto o explorador tinha a largura dela. Com `.wide`, num tablet (1 024 px), o painel ficaria ao lado de um mapa espremido em 348 dos 718 px da coluna. Agora o painel vai para baixo, e o mapa ocupa a coluna inteira. Um eixo comum à esquerda é o que dá unidade à página (Müller-Brockmann). |
| Glifo da forma de uma obra (¶ Ensaio) | **No tamanho do rótulo**     | O glifo passa a ter 1,15 em, na cor `--ink-muted`, na mesma linha do rótulo. É um sinal que acompanha uma palavra e não uma ilustração.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Ritmo da página de conceito           | **Espaço antes dos títulos** | Cada seção começa a `--space-2` da anterior e cada subseção a `--space-1`. O espaço acima de um título é maior que o de baixo, para que o título pertença ao que vem depois (lei da proximidade, Gestalt).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Conceitos de um estrato               | **Em colunas**               | Colunas de 14 rem (`columns`), sem quebrar um nome entre colunas. A ordem alfabética segue de cima para baixo. A página "Formal" passou de 3 716 para 3 228 px (−13 %).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Laboratórios no início e nos estratos | **Miniaturas**               | Cada laboratório vira um ladrilho (`LabTile.astro`): a miniatura da compilação sobre o título, e o ladrilho inteiro é um só link. A miniatura é decorativa (`aria-hidden`), e o nome do link é o título. A página inicial mostra 4 (antes eram 3 nomes), número par para preencher o grid de dois. A miniatura toma a cor do estrato, e um estrato nunca é indicado só por cor (regra 6, WCAG 1.4.1). Na página inicial, cada ladrilho leva sob o link o glifo e o rótulo do estrato, como a lista de ensaios recentes. Na página de um estrato, o título da página já o nomeia, e a marca se repetiria em todo ladrilho.                                                                                                                                 |

O que se considerou e ficou de fora:

- **Um sinal de fim de ensaio** (como o ∎ das revistas). O ∎ já pertence aos signos do argumento ("conclusão"). Um
  simplexo exigiria o rótulo de texto (WCAG 1.4.1, regra 6). Nos dois casos, o sinal diria menos do que o "Próximo
  na ponte" que já fecha o ensaio.
- **Animar os ladrilhos ao passar o ponteiro.** O passar do ponteiro só escurece a borda e o sublinhado, com a duração
  de `--duration-2` escalada por `--motion`. Movimento sem informação já saiu na rodada de 26/11.

## 5. O que mudou, medido

| Medida                                         | Antes                    | Depois                                      |
| ---------------------------------------------- | ------------------------ | ------------------------------------------- |
| Borda esquerda do mapa da ontologia (1 440 px) | 0 px (borda da janela)   | 82 px (a do título)                         |
| Glifo ¶ em "Obras que discutem"                | ≈ 40 px, rótulo quebrado | 1,15 em, na linha do rótulo                 |
| Altura da página do estrato "Formal"           | 3 716 px                 | 3 228 px                                    |
| HTML da página inicial (pt)                    | ≈ 47,7 kB                | 52,5 kB (teto: 160 KiB), com 4 miniaturas   |
| JavaScript novo                                | —                        | nenhum: as miniaturas são SVG da compilação |

## 6. Como fica guardado

`tests/e2e/composition.spec.ts`, a 1 440 px, verifica:

- o mapa da ontologia e o reticulado começam na borda esquerda do título (± 1 px) e não passam da margem direita
  simétrica;
- a 820, 1 024 e 1 440 px, o mapa ocupa ao menos dois terços da largura do explorador (o teste falhou a 1 024 px antes
  da correção: 350 de 718 px);
- o glifo da forma de cada obra não é mais alto que 1,5 vez o corpo do seu rótulo e fica na mesma linha;
- na página inicial e na de um estrato, nas duas línguas, cada ladrilho de laboratório é um link cujo nome acessível é o
  título, com a miniatura `aria-hidden`; na página inicial, o ladrilho leva também o glifo e o rótulo do estrato, fora
  do nome do link.

O contraste dos ladrilhos nos dois temas fica com a auditoria de acessibilidade (`a11y.spec.ts`, axe em claro e
escuro), que já percorre todas as páginas.

## Referências

- MÜLLER-BROCKMANN, J. _Grid systems in graphic design_. Sulgen: Niggli, 1981.
- WERTHEIMER, M. Untersuchungen zur Lehre von der Gestalt II. _Psychologische Forschung_, v. 4, p. 301–350, 1923.
- W3C. _Web Content Accessibility Guidelines (WCAG) 2.2_. 2023. Critério 1.4.1 (uso da cor).
