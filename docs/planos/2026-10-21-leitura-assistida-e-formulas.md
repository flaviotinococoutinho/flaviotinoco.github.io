# Leitura assistida, fórmulas em palavras e estética — 21/10/2026

- Status: em execução
- Autor: Flávio Tinoco
- Relacionados: `docs/planos/2026-10-21-revisao-da-entrega.md` (rodada anterior); ADR 0002, ADR 0004, ADR 0009;
  `docs/guia-latex.md`; `docs/requisitos-nao-funcionais.md` §2; issue #22

## 1. Intenção

Três pedidos do autor, nesta ordem de valor:

1. **Toda fórmula tem uma versão descritiva**, e as fórmulas do site formam um acervo de referência com
   nome, notação, leitura em voz alta, significado, símbolos, onde aparece, conceitos e fontes.
2. **Recursos para leitores com dislexia**: além do que já existe (fontes Atkinson Hyperlegible, opção sem
   serifa, hifenização desligável, tamanho do texto, movimento reduzido, texto nunca justificado, medida de
   66 caracteres), controles de espaçamento, uma régua de leitura e um modo de foco, com uma verificação
   automática de que o site suporta o espaçamento de texto do critério 1.4.12 da WCAG 2.2.
3. **Estética**: refinamentos fundamentados nas referências que o site já adota (Bringhurst, Tufte, WCAG,
   COGA/W3C, guia de estilo da British Dyslexia Association), sem trocar a identidade.

## 2. Estado encontrado

- 20 equações numeradas distintas (cada uma em pt-BR e en; 40 blocos `\label{eq:…}`) em 3 ensaios e 6
  laboratórios; 2 blocos sem rótulo; 27 conceitos com `notation` (TeX). Interseção grande: entropia,
  autoinformação, Kraft, Hick–Hyman, Lyapunov, razão de Feigenbaum, transformada de Fourier, aliasing,
  limites de Huffman, padronização do limite central. ≈ 37 fórmulas distintas.
- Fórmulas são desenhadas pelo KaTeX com MathML (`htmlAndMathml`); o `data-tex` guarda o original; nenhuma
  tem descrição em prosa. O número da equação é o único rótulo.
- Preferências hoje: tema, contraste, movimento, tamanho, fonte, hifenização, textura, atalho, simulação de
  discromatopsia. Nada de espaçamento, régua ou foco.
- Capturas do site publicado (21/10/2026, claro e escuro, 1280 e 390 px): tipografia e cartões consistentes;
  equação numerada sem legenda; as seções "A ponte" e "Ensaios recentes" da página inicial aparecem vazias
  em captura de página inteira porque `[data-reveal]` começa invisível e só a rolagem revela
  (`motion.css`): num navegador real o conteúdo aparece; em leitores que não disparam a linha do tempo de
  rolagem (impressão, captura, alguns leitores de tela com `view()` sem suporte) o estado de repouso deveria
  ser visível.

## 3. Objetivos, não objetivos, anti-objetivos

Objetivos:

- Registro de fórmulas como dados (`src/content/formulas/*.json`), validado na compilação; uma equação
  numerada sem registro **falha a compilação** (a garantia "toda fórmula tem versão descritiva" é um gate).
- "Em palavras" sob cada equação numerada e sob a notação de cada conceito: significado, leitura em voz alta,
  símbolos, link para a ficha no acervo.
- Página do acervo (`/formulas/`, nas duas línguas) e exportação `formulas.json`.
- Preferências novas: espaçamento (normal, amplo = valores do critério 1.4.12), régua de leitura (desligada,
  ligada), foco (desligado, ligado). Teste e2e de espaçamento 1.4.12 em toda página.
- Estética: estado de repouso visível para `[data-reveal]`; legenda e disclosure das equações; ficha do
  acervo; refinamentos de detalhe listados em §5.4, todos só com tokens.

Não objetivos:

- Descrições geradas automaticamente a partir do TeX: a leitura em voz alta é escrita pelo autor, em cada
  língua, e revisável como qualquer conteúdo.
- Fontes "para dislexia" (OpenDyslexic etc.): a evidência não sustenta benefício; a Atkinson Hyperlegible
  já atende ao que a BDA recomenda (sem serifa, formas distintas, espaçamento).
- Reescrever os textos-semente.

Anti-objetivos: afrouxar orçamentos ou verificações; cor como único portador de significado; JavaScript
obrigatório para ler uma descrição (as descrições são HTML estático; só a régua precisa de script).

## 4. Restrições

- Regras de `CLAUDE.md` e ADRs 0001–0010. Orçamento de HTML: as descrições entram em cada ensaio com equações
  (até 5 por ensaio, ≈ 0,6 KiB cada): os ensaios mais pesados estão a 145 KiB; cabe, e a medida é refeita.
- Catálogos com paridade; preferências derivadas do modelo puro (pré-pintura, formulário, codec).
- Nenhuma dependência nova.

## 5. Decisões

### 5.1 Registro de fórmulas

Um arquivo `src/content/formulas/<id>.json` por fórmula (id em inglês, estável; esquema completo em
`docs/guia-latex.md` §1.2): `slug`, `name`, `tex` canônico, `labels` por língua, `concept` (opcional), `stratum`
e `domains` (só sem `concept`), `meaning`, `spoken`, `symbols`, `concepts`, `sources`.

- O vínculo entre equação e fórmula é o rótulo, por língua; o `tex` do registro é a forma canônica da ficha.
  Onde a escolha era livre, as notações dos conceitos foram alinhadas (Kraft em base k, Huffman com `L*`,
  Fourier com `X(f)`); onde a diferença é de letra (`T`, `TR`, `RT`), a leitura por língua resolve.
- Uma fórmula por enunciado, não por grafia: 36 fórmulas (11 de teoria, 23 formais, 2 de valor). Quando conceito
  e documento enunciam coisas diferentes (convergência do limite central e soma padronizada; excesso de Gibbs e
  seu limite; definição de capacidade, Shannon–Hartley e canal binário simétrico), são fichas distintas ligadas
  por `concepts`.
- O núcleo `src/core/formulas/` (parser, registro, formatador das palavras, codificador JSON) acumula erros:
  ids, rótulos e slugs repetidos por língua, conceito com duas notações, conceitos e fontes inexistentes,
  `stratum`/`domains` redundantes com `concept` ou ausentes sem ele.
- O estágio `latex` vincula só arquivos de `src/content/` (documentos de cadeia, como nos testes, não são
  vinculados): equação numerada sem fórmula é erro `latex:missing-formula`. O teste de guarda
  `tests/unit/guardrails/formulas.test.ts` fecha a garantia: todo `$$` do conteúdo tem rótulo, todo rótulo do
  registro é usado, toda notação de conceito tem ficha. Os dois blocos sem rótulo (teorema da codificação de
  fonte em base k) ganharam rótulo e ficha.
- Sob a equação: `<details class="formula__words">` fechado, resumo "Em palavras · Nome" (o nome fica visível
  sem interação), significado, "Como se lê" e link para a ficha; `aria-describedby` da equação aponta para o
  significado; as palavras não contam no tempo de leitura. Os símbolos ficam na ficha e na página do conceito
  (`FormulaWords.astro`, mesmo contrato de classes): cinco listas de símbolos custariam ≈ 14 KiB num ensaio.
- Acervo: índice `/<lang>/formulas/` (ordem da ponte, ordinal F1…F36, nome e significado, sem KaTeX) e uma
  página por fórmula (`/<lang>/formulas/<slug>/`: notação, significado, leitura, símbolos, onde aparece com
  link para a âncora da equação, conceito, conceitos relacionados, fontes); `/formulas.json` exporta tudo.
  Entrada no cabeçalho, na paleta (seção e cada fórmula), no rodapé e no 404.
- Orçamento de HTML: 150 → 160 KiB (ADR 0011 altera a decisão 3 do ADR 0009). Medido: o ensaio mais pesado
  foi de 145,2 para 151,0 KiB com cinco blocos (≈ 1,2 KiB cada). Uma redução para outra rodada: sprite SVG de
  glifos externo (≈ 7,5 KiB por página).
- Impressão: `[data-reveal]` sem animação; `details::details-content { content-visibility: visible }`.

### 5.2 Leitura assistida

Três preferências novas no modelo (`src/core/chrome/preferences.ts`), com rótulos e dicas nos catálogos:

| Chave     | Valores          | Efeito                                                                                                                                                                                                |
| --------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spacing` | `normal`, `wide` | amplo: entrelinha 1,8; entre letras 0,12 em; entre palavras 0,16 em; parágrafos separados por espaço (sem recuo) — os valores do critério 1.4.12; fórmulas e SVG não recebem espaçamento entre letras |
| `ruler`   | `off`, `on`      | régua de leitura: uma faixa de duas linhas segue o ponteiro e o foco; sem transição com movimento reduzido; nunca em cores forçadas nem na impressão                                                  |
| `focus`   | `off`, `on`      | foco: sem textura de papel nem campo ambiente; notas laterais e mapa do argumento discretos (opacidade reduzida) até receberem ponteiro ou foco                                                       |

- Ordem no painel: tema, contraste, movimento, tamanho, fonte, **espaçamento**, hifenização, **régua**,
  **foco**, textura, atalho, simulação de cores. Dica do grupo de espaçamento cita a BDA e a WCAG.
- `ft-reading-ruler`: um elemento no `BaseLayout`, módulo carregado só quando `data-ruler="on"`; geometria pura
  em `src/core/chrome/ruler.ts`, com testes.
- Teste e2e `spacing.spec.ts`: em cada página, com `data-spacing="wide"` e com os valores do critério 1.4.12
  injetados por CSS, nenhum rolamento horizontal e nenhuma caixa de rolagem inacessível.
- `docs/requisitos-nao-funcionais.md` §2 ganha as linhas 1.4.12 e "leitura assistida".

### 5.3 Estética

- `[data-reveal]`: estado de repouso visível na impressão (feito na branch 1).
- Equações: a disclosure "Em palavras" em fonte de interface, corpo −1, cor `--ink-muted`, filete fino à
  esquerda (a mesma voz das notas laterais); nome da fórmula em itálico na fonte de texto (feito na branch 1).
- Ficha do acervo: cabeçalho com ordinal e estrato (glifo + rótulo), notação centrada um corpo acima, seções
  "O que diz", "Como se lê", "Símbolos" (lista de definição em duas colunas), "Onde aparece" (feito na branch 1).
- Detalhes nas páginas já capturadas, registrados commit a commit, só com tokens (branch 3).

### 5.4 Sequência

| #   | Branch                | Conteúdo                                                                                           |
| --- | --------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `feat/formulas`       | núcleo do registro, 36 registros, estágio, conceito, acervo, exportação, navegação, docs, ADR 0011 |
| 2   | `feat/reading-aids`   | preferências, CSS, régua, e2e 1.4.12, documentação                                                 |
| 3   | `style/refinements`   | detalhes de estética                                                                               |
| 4   | `chore/release-0.3.0` | registro de mudanças e versão                                                                      |

## 6. Premissas

- As descrições são escritas por mim nesta rodada, em pt-BR e en, e ficam sujeitas à revisão do autor como
  qualquer conteúdo; o registro não leva nota de proveniência própria (os dados do site, como os conceitos,
  não a levam).
- `v0.2.0` (PR #35) é publicada antes desta rodada; esta rodada fecha em `v0.3.0`.

## 7. Verificação do construtor (21/10/2026)

Um revisor independente leu o documento antes da execução e levantou quatro pontos; as respostas estão em §5:

1. O ensaio mais pesado não comportava cinco blocos completos (medido: 3,9 KiB por bloco com símbolos) →
   símbolos só na ficha e na página do conceito; orçamento 150 → 160 KiB com a medição registrada no ADR 0011.
2. Uma página única do acervo passaria de 150 KiB → índice leve e uma página por fórmula.
3. Sete casos em que a notação do conceito e a equação do documento diferem → vínculo por rótulo, `tex`
   canônico, notações alinhadas onde a escolha era livre, fichas distintas para enunciados distintos.
4. Nome visível sem interação e impressão → o resumo do `details` mostra o nome; `::details-content` na
   impressão.

## 8. Registro de execução

- 21/10/2026 10:16 — `v0.2.0` publicada (PR #35, tag, release.yml).
- 21/10/2026 10:50 — branch 1 (`feat/formulas`): núcleo, 36 fichas, estágio, páginas, exportação, testes
  (registro, estágio, rotas, guarda de conteúdo), docs e ADR 0011; `check:links`, `check:robots` e
  `check:budgets` passam (ensaio mais pesado: 151,0 KiB).
