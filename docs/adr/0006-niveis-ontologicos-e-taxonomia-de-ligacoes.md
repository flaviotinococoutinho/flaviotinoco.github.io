# ADR 0006 — Níveis ontológicos e taxonomia de ligações

- Status: aceito; implementação em andamento (vocabulário no núcleo; uso pela ontologia e pelas resenhas em integração)
- Data: 2026-10-19
- Relacionados: `src/core/domain/link-terms.ts`, `src/core/domain/qualities.ts`,
  `src/core/i18n/catalogs/links.ts`, `src/core/i18n/catalogs/qualities.ts`; `docs/ontologia.md`; `docs/resenhas.md`;
  ADR 0002

## Contexto

O site liga ideias sobre coisas de naturezas diferentes. Um conceito se relaciona com outro conceito; uma
ferramenta realiza um conceito; uma pessoa influenciou uma obra; um filme serve de analogia para um teorema; uma
afirmação é refutada por um contraexemplo. Uma ligação sem tipo (`related`, "veja também") não informa como as duas
coisas se relacionam. Também não permite comparar duas ligações nem consultar todas as relações de um mesmo modo, por
exemplo todas as relações causais.

Há ainda um erro de categoria a evitar. Medidas de semelhança (Lin, Jaccard, obras relacionadas) só fazem sentido
entre coisas do mesmo nível. Um escore de semelhança entre uma pessoa e um conceito não mede nada.

O autor pediu, em 19/10/2026, ligações abstratas entre ideias sobre coisas diferentes, com termos filosóficos,
organizadas por taxonomia com profundidade e com o nível ontológico bem separado, para que as coisas sejam
comparáveis. Pediu também os termos que definem o conceito de valor.

## Decisão

1. Cinco níveis ontológicos: `concept`, `work`, `agent`, `tool` e `claim`. Cada coisa ligada pertence a
   exatamente um nível.
   - O nível de uma resenha decorre do tipo do seu objeto: mídia e referências são `work`; pessoas e organizações são
     `agent`; ferramentas são `tool`; metodologias, regras e leis empíricas são `concept`; uma lei em sentido jurídico é
     `work`.
2. Um único vocabulário de ligações, organizado como floresta: um termo é uma espécie do termo pai. São dez modos,
   com nomes e fontes da tradição filosófica:
   - predicação: gênero, espécie, variedade ("sabor"), coordenação ("semelhante na mesma camada") e acidente;
     Aristóteles, _Tópicos_ I; Porfírio, _Isagoge_;
   - oposição: contrários, contraditórios, correlativos, privação e posse; _Categorias_ 10;
   - parte e todo; Simons, 1987;
   - dependência: nocional e existencial; Husserl; Correia, 2008;
   - causalidade: as quatro causas, _Física_ II 3, com influência e autoria como causas eficientes;
   - significação: ícone, índice e símbolo, segundo Peirce; referência e medida são índices;
   - instanciação e realização: tipo e ocorrência; Putnam, 1967;
   - analogia: proporção A : B :: C : D; _Poética_ 21; Gentner, 1983;
   - valor: meio e fim, benefício e dano, compromisso entre valores; Korsgaard, 1983; Chang, 1997;
   - dialética: sustentação e ataque, com contraexemplo, redução ao absurdo, invalidação da inferência, refutação
     da conclusão, evidência contrária e ônus da prova; Toulmin, 1958; Pollock, 1987; Dung, 1995; Walton, 1988.
3. Cada termo declara suas propriedades. Inverso, simetria, transitividade e aciclicidade valem para o grafo
   inteiro.
4. Cada termo declara uma assinatura de níveis: os pares (origem, destino) que admite. `checkLink` rejeita uma
   ligação fora da assinatura.
5. Dois casos exigem justificativa escrita. A analogia pode unir quaisquer níveis e exige a proporção (`ratio`). Os
   termos de valor exigem uma nota que diga que bem ou dano está em jogo, e para quem.
6. Semelhança só se calcula entre coisas comparáveis (`comparable`): mesmo nível e, para conceitos, mesma categoria.
   Entre níveis diferentes há apenas ligações tipadas, nunca escores.
7. Qualidades são etiquetas de um vocabulário fechado, não conceitos da ontologia. Exemplos: padrão aberto, código
   aberto, empírico, normativo, descontinuado. Pares contrários (código aberto e proprietário) são rejeitados juntos.
8. As relações já existentes entre conceitos (`broader`, `partOf`, `dependsOn`, `formalizes`, `appliesTo`,
   `measures`, `contrastsWith`, `related`) são mapeadas para termos da taxonomia. As exportações JSON-LD declaram
   essa hierarquia como cadeias de `rdfs:subPropertyOf`.

## Consequências

- Positivas:
  - Uma consulta por um modo, como causalidade ou valor, encontra todas as ligações desse modo.
  - Ligações inválidas falham na compilação.
  - O leitor vê como duas coisas se relacionam, não só que se relacionam.
  - Escores de semelhança deixam de comparar coisas incomparáveis.
- Negativas:
  - Autores precisam escolher um termo preciso.
  - Algumas ligações antigas do tipo `related` exigem revisão para ganhar tipo.
  - O vocabulário só cresce por mudança revisada no núcleo.
- Fora do escopo: inferência automática de ligações. A taxonomia classifica as ligações que os autores declaram;
  não as descobre.
