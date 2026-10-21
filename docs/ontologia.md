# Ontologia de conceitos

> O que é a ontologia do site, como cada conceito é classificado e ligado, o que a compilação garante, que
> medidas são calculadas e como acrescentar um conceito. Decisões: [ADR 0006](adr/0006-niveis-ontologicos-e-taxonomia-de-ligacoes.md)
> (níveis e taxonomia de ligações) e [ADR 0009](adr/0009-moldura-sob-demanda-e-orcamento-de-html.md) (as
> páginas da seção). Código: `src/core/ontology/` (núcleo puro), `src/content/concepts/*.json` (dados),
> `src/components/ontology/` e `src/views/Ontology*.astro` (apresentação). Testes: `tests/unit/ontology/`.

## 1. Três camadas

A ontologia segue a arquitetura em camadas de Guarino (1998): um **nível superior** pequeno e fechado, os
**conceitos do domínio** classificados sob ele e a **camada de aplicação**, as obras do site, que discutem
esses conceitos.

| Camada         | O que contém                                                   | Onde                                                           |
| -------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| nível superior | dois eixos ortogonais: estrato e categoria (§2)                | `src/core/domain/strata.ts`, `src/core/ontology/vocabulary.ts` |
| domínio        | um conceito por arquivo JSON, com rótulos, definição, relações | `src/content/concepts/`                                        |
| aplicação      | ensaios e laboratórios, pelo campo `concepts` do frontmatter   | `src/content/{essays,labs}/`                                   |

Um conceito é um `skos:Concept` (SKOS, W3C 2009) e, para os buscadores, um `schema:DefinedTerm`. As obras
nunca são conceitos: são `schema:ScholarlyArticle` e `schema:LearningResource` com `schema:about` apontando
para os conceitos que discutem.

## 2. O nível superior: estrato × categoria

Todo conceito ocupa exatamente uma célula do produto dos dois eixos.

**Estrato** é o modo epistêmico, na ordem da ponte: filosofia ≺ teoria ≺ formal ≺ valor. A ordem é total e
é usada pelas restrições das relações (§4).

**Categoria** é o tipo ontológico, de um conjunto fechado inspirado na DOLCE (Masolo et al., 2003) e na BFO
(ISO/IEC 21838-2:2021). As categorias são sortais rígidos no sentido da OntoClean (Guarino e Welty, 2002): o
que é uma medida é necessariamente uma medida; por isso a subsunção (`broader`) preserva a categoria e cada
árvore da taxonomia pende de uma única categoria.

### 2.1 Procedimento de decisão da categoria

As perguntas são feitas nesta ordem; a primeira resposta "sim" dá a categoria. As mesmas perguntas aparecem na
tabela do nível superior da página de estrutura da ontologia.

| Ordem | Categoria     | Pergunta                                                                                 | Exemplos no site                           |
| ----- | ------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1     | `proposition` | É um enunciado verdadeiro ou falso, estabelecido por prova ou evidência (teorema, lei)?  | teorema da amostragem, lei de Hick–Hyman   |
| 2     | `method`      | É um procedimento que se executa passo a passo para atingir um fim (algoritmo, técnica)? | codificação de Huffman, FFT                |
| 3     | `operation`   | É uma aplicação matemática que leva entradas a saídas (função, transformada, código)?    | transformada de Fourier, código de prefixo |
| 4     | `measure`     | É uma grandeza definida por uma fórmula sobre outra coisa, com unidade?                  | entropia, capacidade de canal              |
| 5     | `process`     | É algo que acontece no tempo (evento, mudança, atividade)?                               | amostragem, decisão, comunicação           |
| 6     | `relation`    | Só existe entre dois ou mais termos, sem pertencer a um só?                              | conhecimento, sentido e referência         |
| 7     | `quality`     | É uma propriedade que depende de um portador?                                            | incerteza, ruído, frequência               |
| 8     | `artifact`    | É algo feito por pessoas para um propósito?                                              | interface, produto                         |
| 9     | `entity`      | Caso contrário: uma coisa ou um objeto abstrato que existe por si.                       | signo, modelo, canal                       |

Uma proposição exige pelo menos uma fonte na bibliografia (`sources`); a compilação reprova uma sem fonte.

## 3. O registro de um conceito

Um arquivo `src/content/concepts/<id>.json`; o `id` (nome do arquivo) é neutro de língua e estável: é parte
do IRI do conceito nas exportações.

```json
{
  "slug": { "pt-BR": "entropia", "en": "entropy" },
  "prefLabel": { "pt-BR": "Entropia", "en": "Entropy" },
  "altLabel": { "pt-BR": ["entropia de Shannon"], "en": ["Shannon entropy"] },
  "definition": { "pt-BR": "Incerteza média de uma variável aleatória…", "en": "The average uncertainty…" },
  "notation": "H(X) = -\\sum_{x} p(x)\\,\\log_2 p(x)",
  "stratum": "theory",
  "category": "measure",
  "domains": ["information-theory", "probability"],
  "broader": ["information"],
  "relations": [{ "type": "formalizes", "target": "uncertainty" }],
  "exactMatch": ["http://www.wikidata.org/entity/Q204570"],
  "sources": ["shannon1948", "cover2006"]
}
```

| Campo        | Regra                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `slug`       | um por língua, minúsculas, sem acentos, hífens; único na língua; coerente com o `prefLabel` (a compilação confere) |
| `prefLabel`  | rótulo preferido por língua, único na língua; um `altLabel` igual a um `prefLabel` é erro                          |
| `altLabel`   | sinônimos: entradas "USE" do glossário e termos de busca do mapa                                                   |
| `definition` | uma frase por língua, sem citação (as fontes vão em `sources`)                                                     |
| `notation`   | TeX opcional, desenhado pelo KaTeX na página do conceito e no mapa local                                           |
| `domains`    | facetas de Ranganathan (`src/core/domain/facets.ts`); a primeira é a principal, usada pelas comunidades            |
| `broader`    | `skos:broader`, guardado como redução transitiva: um pai já implicado por outro é aviso                            |
| `relations`  | relações associativas tipadas, guardadas numa só direção; as inversas são derivadas, nunca escritas                |
| `exactMatch` | IRIs do Wikidata ou de outro vocabulário, conferidos; `skos:exactMatch` na exportação                              |
| `sources`    | chaves de `bibliography/*.bib`; chave inexistente falha a compilação                                               |

## 4. O vocabulário de relações

Cada tipo declara, como dado (`RELATIONS` em `vocabulary.ts`), suas propriedades algébricas, a inversa
derivada, a restrição de estrato e as de categoria, a superpropriedade SKOS, o peso nos caminhos tipados e se
entra na ordem de pré-requisitos.

| Tipo            | Inversa derivada | Propriedades         | Restrição                                                        | Peso | Pré-requisito |
| --------------- | ---------------- | -------------------- | ---------------------------------------------------------------- | ---- | ------------- |
| `broader`       | `narrower`       | transitiva, acíclica | mesma categoria                                                  | 1    | sim           |
| `partOf`        | `hasPart`        | transitiva, acíclica | —                                                                | 1    | não           |
| `dependsOn`     | `prerequisiteOf` | acíclica             | —                                                                | 1,5  | sim           |
| `formalizes`    | `formalizedBy`   | acíclica             | descendente: o estrato da origem vem **depois** do alvo na ponte | 1,25 | não           |
| `appliesTo`     | `appliedFrom`    | acíclica             | ascendente: o estrato da origem vem **antes** do alvo            | 1,5  | não           |
| `measures`      | `measuredBy`     | acíclica             | origem `measure`; alvo `quality` ou `entity`                     | 1,25 | não           |
| `contrastsWith` | — (simétrica)    | simétrica            | —                                                                | 2    | não           |
| `related`       | — (simétrica)    | simétrica            | —                                                                | 3    | não           |

A ponte é uma **filtração**: nenhuma aresta `formalizes` desce os estratos e nenhuma `appliesTo` sobe. A
entropia (teoria) formaliza a incerteza (filosofia); a codificação de Huffman (formal) aplica-se à interface
(valor). Um `related` é a ligação mais fraca e a mais cara nos caminhos: prefira um tipo preciso.

A taxonomia de termos de ligação do ADR 0006 (predicação, oposição, parte e todo, dependência, causalidade,
significação, instanciação, analogia, valor, dialética) é o vocabulário geral entre níveis ontológicos
diferentes (conceito, obra, agente, ferramenta, afirmação); os oito tipos acima são a parte desse vocabulário
que vale entre conceitos, e as exportações os declaram como `rdfs:subPropertyOf` dos termos gerais.

## 5. O que a compilação garante

`buildOntology` (`ontology.ts`) analisa todos os arquivos de uma vez e relata **todas** as violações, com o
identificador de cada uma (`model.ts`, `describeError`):

- identidade: `id`, `slug` e `prefLabel` únicos por língua; `slug` coerente com o rótulo; `altLabel` não
  repete `prefLabel`;
- referências: todo alvo existe; nenhuma relação consigo mesmo; nenhuma relação repetida; um par de conceitos
  não tem dois tipos de relação;
- restrições de estrato e de categoria de cada tipo (§4);
- relações simétricas guardadas uma só vez;
- aciclicidade por tipo (`broader`, `partOf`, `dependsOn`, `formalizes`, `appliesTo`, `measures`) e da ordem
  de pré-requisitos (`broader` ∪ `dependsOn`), com o ciclo relatado;
- `broader` como redução transitiva (aviso para um pai redundante; aviso para mais de dois pais);
- uma relação associativa não duplica uma hierárquica (`partOf` entre ancestral e descendente é erro);
- conectividade: nenhum conceito isolado e um único componente;
- proposição com pelo menos uma fonte.

As mesmas funções rodam nos testes (`tests/unit/ontology/`), sobre os conceitos reais e sobre grafos gerados
(fast-check), e no navegador: a ferramenta de comparação e as páginas de conceito recalculam a taxonomia e o
conteúdo informacional a partir de `ontology.graph.json` com o mesmo código, para nunca discordarem.

## 6. Medidas

| Medida                                          | Definição                                                                                             | Onde aparece                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------- |
| conteúdo informacional intrínseco               | IC(c) = 1 − ln(hipônimos(c) + 1) / ln N (Seco, Veale e Hayes, 2004)                                   | página do conceito, comparação        |
| semelhança de Resnik e de Lin                   | IC do subsuntor comum mais informativo; 2·IC(lcs) / (IC(a) + IC(b)) (Resnik, 1995; Lin, 1998)         | comparação, "conceitos mais próximos" |
| entropias de estrato, categoria, domínio e grau | H = −Σ p log₂ p sobre as distribuições do grafo                                                       | "em números"                          |
| centralidade de intermediação                   | Brandes (2001), restrita a pares de estratos diferentes: define os conceitos-ponte                    | comparação                            |
| comunidades                                     | modularidade pelo método de Louvain; NMI contra a faceta de domínio principal                         | comparação                            |
| reticulado das obras                            | análise formal de conceitos do contexto obras × conceitos (NextClosure), diagrama de Hasse em camadas | reticulado                            |
| trilha de aprendizagem                          | ordem topológica de Kahn (1962) sobre a ordem de pré-requisitos                                       | página do conceito                    |
| caminho tipado mínimo                           | Dijkstra sobre os pesos da tabela de §4                                                               | comparação                            |

As fórmulas estão em `formulas.ts` e são desenhadas pelo KaTeX nas notas "como se mede" de cada seção.

## 7. As páginas e as exportações

| Rota (pt / en)                                     | Conteúdo                                                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/ontologia/` · `/ontology/`                       | em números; explorador (mapa de forças ou grade, filtros por estrato, busca, painel de detalhe) e taxonomia em árvore, sincronizados; exportações |
| `/ontologia/estrutura/` · `/ontology/structure/`   | tabela do nível superior (âncoras `#category-…`); vocabulário de relações                                                                         |
| `/ontologia/comparacao/` · `/ontology/comparison/` | comparar dois conceitos; conceitos-ponte; comunidades                                                                                             |
| `/ontologia/reticulado/` · `/ontology/lattice/`    | reticulado das obras, desenhado e em texto                                                                                                        |
| `/glossario/` · `/glossary/`                       | todos os rótulos, A–Z, com entradas "USE" para sinônimos                                                                                          |
| `/conceitos/<slug>/` · `/concepts/<slug>/`         | definição, notação, relações por tipo, trilha, medidas, mapa local, obras que o discutem, JSON-LD                                                 |
| `/ontology.jsonld`                                 | SKOS + OWL + schema.org: esquema, classes, propriedades, conceitos e obras                                                                        |
| `/ontology.graph.json`                             | nós e arestas tipadas com medidas; o único dado que o explorador e a comparação carregam                                                          |

Tudo funciona sem JavaScript: o mapa é SVG estático com nós que são links e as relações listadas em texto; a
árvore é uma lista aninhada; a comparação explica que precisa de script e remete às tabelas de cada conceito.

## 8. Como acrescentar um conceito

1. Escolha o `id` (inglês, minúsculas, hífens) e escreva o JSON com os campos de §3, nas duas línguas.
2. Decida o estrato e a categoria pelo procedimento de §2.1.
3. Declare `broader` (mesma categoria) e as relações pelo tipo mais preciso de §4; cada conceito precisa de
   pelo menos uma ligação com o grafo existente.
4. Cadastre as fontes em `bibliography/main.bib` ([guia de citações](guia-citacoes.md) §3) e confira o IRI do
   Wikidata.
5. Rode `pnpm test` (os testes de ontologia carregam os conceitos reais) e `pnpm build:site`; a compilação
   relata todas as violações de uma vez.
6. Cite o conceito nos textos com `:concept[rótulo]{ref=<id>}` e liste-o em `concepts` do frontmatter das obras
   que o discutem: é isso que o põe no reticulado e nas obras relacionadas.
