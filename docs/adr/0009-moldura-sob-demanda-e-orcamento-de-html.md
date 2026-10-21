# ADR 0009 — Moldura sob demanda e o orçamento de HTML

- Status: aceito
- Data: 2026-10-21
- Relacionados: `scripts/lib/budgets.ts`; `src/core/chrome/palette-entries.ts`,
  `src/core/chrome/preferences-form.ts`; `src/pages/[lang]/palette.json.ts`,
  `src/pages/[lang]/preferences.json.ts`; `src/views/OntologyView.astro`, `src/views/OntologyPageView.astro`;
  `src/core/i18n/routes.ts`; `docs/requisitos-nao-funcionais.md`; ADR 0002, ADR 0005; issue #26

## Contexto

O orçamento de HTML é 150 KiB brutos por página (`scripts/lib/budgets.ts`): "ensaios longos com SVG e MathML
inline cabem; inchaço não". Em 19/10/2026 seis páginas passavam dele: quatro ensaios, por 0,5 a 5,9 KiB, e as
duas páginas da ontologia, por 38 a 41 KiB. O CI ficou vermelho e a publicação, bloqueada.

Medições sobre o `dist/` daquele dia:

| Parte                                                   |   Bytes | Onde                            |
| ------------------------------------------------------- | ------: | ------------------------------- |
| paleta de comandos (`<dialog id="ft-palette">`)         |   6 737 | toda página                     |
| painel de preferências (`#ft-prefs`)                    |   7 629 | toda página                     |
| sprite de glifos                                        |   6 612 | toda página                     |
| `@font-face` inline e `<head>`                          |   8 851 | toda página                     |
| artigo de um ensaio longo (62 fórmulas MathML)          | 102 220 | `pt/ensaios/amostrar-e-decidir` |
| explorador da ontologia (mapa SVG + painel)             |  53 128 | `pt/ontologia`                  |
| reticulado das obras                                    |  25 303 | `pt/ontologia`                  |
| comunidades, comparação, nível superior, árvore, pontes |  71 407 | `pt/ontologia`                  |

Dois fatos decidem o desenho. A paleta e o painel são um **custo fixo pago em cada uma das 140 páginas** e só
funcionam com JavaScript: sem script, os botões que os abrem nem aparecem. E a página da ontologia tem **custo
marginal por conceito** (≈ 1,1 KiB no mapa e ≈ 0,27 KiB na árvore): cresce a cada conceito novo, como a issue
#26 previu.

## Decisão

1. **A moldura carrega sob demanda.** A paleta e o painel ficam na página como cascas (campo, título, botões,
   estado); seu conteúdo é um documento JSON por idioma, gerado na compilação pelos mesmos catálogos de
   mensagens — `/<lang>/palette.json` (entradas de navegação rápida) e `/<lang>/preferences.json` (grupos de
   preferências com rótulos e anúncios) — e buscado pela ilha correspondente, que o registro de ilhas já só
   carrega quando o leitor abre o diálogo ou o popover. O contrato de cada documento é um codec puro do
   núcleo (`unknown → Result`, com a lei `decode ∘ encode = id` verificada por teste de propriedade); a ilha
   constrói o DOM com `createElement`, como a paleta já fazia para os resultados da busca. A única entrada
   que varia por página (esta página no outro idioma) continua no HTML.

   Por que JSON e não um fragmento HTML: todo `.html` em `dist/` é tratado como página pelos testes e2e, pelo
   verificador de links e pelo de `robots`, e um fragmento exigiria exceções nos três; JSON é dado, não
   página. Por que não `<template>`: o orçamento mede bytes brutos, e um `template` continua na página.

2. **A ontologia tem quatro páginas.** A visão geral (`/ontologia/`) mantém o explorador — mapa e árvore
   sincronizados —, os números e as exportações; a estrutura (`/ontologia/estrutura/`) recebe o nível
   superior e o vocabulário de relações; a comparação (`/ontologia/comparacao/`) recebe a ferramenta de
   comparar, os conceitos-ponte e as comunidades; o reticulado (`/ontologia/reticulado/`) recebe a análise
   formal de conceitos das obras. O codec de rotas ganha a variante `ontology-page`, com segmentos
   localizados e a mesma lei `decode ∘ encode = id`; as quatro páginas compartilham uma navegação local com
   `aria-current`.

3. **O orçamento não muda.** 150 KiB continua o limite (alterado para 160 KiB pelo ADR 0011, com a medição que o justifica); a margem de cada página e a taxa de crescimento por
   conceito são registradas em `docs/requisitos-nao-funcionais.md` e remedidas a cada rodada.

## Consequências

- Positivas: −14,4 KiB em toda página; os ensaios voltam ao orçamento com 5 a 10 KiB de margem (o maior, 145,2 KiB); a visão
  geral da ontologia fica em 95,0 KiB (estrutura 42,7; comparação 67,1; reticulado 48,9) e comporta cerca de 85 conceitos antes de tocar o limite; as páginas da
  ontologia têm uma função cada, com título e descrição próprios; o conteúdo da moldura passa a ser cacheável
  entre páginas (um arquivo por idioma).
- Negativas: o conteúdo da paleta e do painel chega uma rede depois de aberto (mitigado: o campo de busca
  funciona de imediato e o formulário fica invisível até existir, como já ficava até a ilha definir-se);
  mais dois pontos de falha de rede, registrados no console e sem efeito sobre o resto da página; a árvore e o
  nível superior deixam de estar na mesma página (o mapa e a árvore continuam juntos).
- Próximo passo quando a visão geral se aproximar do limite: mover a árvore para a estrutura (−12 KiB) ou
  carregar os rótulos do mapa a partir de `ontology.graph.json`, que já existe.
