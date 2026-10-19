# ADR 0007 — Resenhas: registro imparcial separado da leitura

- Status: aceito; implementação em andamento (motor e conteúdo em integração)
- Data: 2026-10-19
- Relacionados: ADR 0006; `docs/resenhas.md` (a escrever pelo motor das resenhas); `src/core/domain/epistemic.ts`;
  `src/core/domain/link-terms.ts`

## Contexto

O autor pediu, em 19/10/2026, uma seção de resenhas aprofundadas sobre cinco grupos:

- mídia: filmes e música;
- referências: livros, sites, canais, fóruns e documentações;
- pessoas influentes em filosofia, teoria da informação, matemática, engenharia e ciências;
- organizações;
- meios: ferramentas, metodologias, regras e leis.

Cada resenha deve ter uma parte inicial abstrata e imparcial, seguida da parte sobre influências, meios e sentidos
mais profundos. O objetivo é formar uma base de referência das fontes da verdade.

O autor pediu também:

- semelhantes na mesma camada e relacionados com etiquetas (qualidades, conceitos de outros meios, "sabores");
- o aparato dialético: contraexemplo, redução ao absurdo, ônus da prova, invalida, derruba, desmente, irrefutável;
- critérios de escolha das pessoas baseados em distinções reconhecidas: prêmios, academias e conselhos.

Uma resenha mistura, por natureza, fato e juízo. Sem separação estrutural, o juízo contamina o registro. O leitor
deixa de saber o que é verificável e o que é interpretação do site.

## Decisão

1. Duas partes separadas por estrutura, não por boa vontade.
   - O registro tem resumo, contêiner `:::record` e distinções. Só contém fatos, cada item com fonte; um item sem
     citação nem link é erro de compilação. Um lint de termos avaliativos e de primeira pessoa dá avisos. É
     heurístico: pega só casos óbvios.
   - A leitura vem depois, sob o estatuto epistêmico do site, com quatro seções obrigatórias e de ids fixos:
     influências, meios, sentidos e objeções.
2. O objeto é identificado por identificadores de autoridade, com verificação de dígito quando houver: Wikidata,
   VIAF, ORCID, ISNI, ISBN, DOI, MusicBrainz, IMDb, número de RFC ou URL oficial. O controle de autoridade das
   bibliotecas e o modelo IFLA LRM (2017) orientam o que é obra, agente e _res_.
3. A defensabilidade fica explícita.
   - As afirmações do objeto, ou atribuídas a ele, entram em `:::claims` com a escala de Kent e o tipo de evidência.
   - As objeções usam os termos dialéticos da taxonomia de ligações (ADR 0006).
   - O estado de cada afirmação, sustentada, derrotada ou em aberto, é calculado pela semântica fundamentada de Dung
     (1995), com rotulação de Caminada (2006).
   - "Irrefutável" sempre vem qualificado. Por prova, vale relativo a axiomas declarados. Por imunidade a
     observação, é um defeito em afirmações empíricas (Popper, 1963).
4. Não há nota nem estrelas (`reviewRating` ausente no JSON-LD), deliberadamente. A avaliação está na tabela de
   afirmações, item a item, com fonte.
5. Semelhantes, relacionados e partes seguem a taxonomia de ligações:
   - semelhante é coordenação no mesmo nível e grupo;
   - "sabor" é variedade: mesma essência, acidentes diferentes;
   - relacionados levam etiquetas de qualidade, de conceito ou de sabor.
6. Pessoas e organizações declaram o critério de seleção: uma distinção do registro curado de distinções, uma
   contribuição fundadora para um conceito da ontologia, ou escolha editorial declarada.
   - Categorias da Wikipédia servem para descobrir candidatos, nunca como fonte do registro.
   - Cada distinção é conferida na lista da própria instituição que a concede.
   - Um script de autoria consulta a Wikidata (CC0) e grava uma lista datada de candidatos. Nunca roda durante a
     compilação.

## Consequências

- Positivas:
  - O leitor distingue fato, avaliação e interpretação na própria estrutura da página.
  - Afirmações fracas ficam visíveis como tais.
  - A escolha de quem é resenhado tem critério público.
- Negativas:
  - Escrever uma resenha exige mais trabalho: fontes por item, rótulos de afirmações, objeções com tipo.
  - O lint de imparcialidade é heurístico e pode deixar passar juízos sutis.
  - Pessoas vivas exigem cuidado redobrado: só fatos públicos e profissionais, com fonte.
- Fora do escopo: comentários de leitores e notas agregadas. O site não coleta dados de quem lê.
