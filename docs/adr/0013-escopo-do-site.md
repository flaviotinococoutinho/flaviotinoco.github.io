# ADR 0013 — O escopo do site como vocabulário fechado e medido

- **Estado:** Aceito; a lista do que fica de fora e as frases de cada disciplina aguardam revisão do autor
- **Data:** 2026-11-14
- **Escopo:** `src/core/domain/facets.ts`, `src/core/domain/scope.ts`, `src/content.config.ts`,
  `src/core/i18n/routes.ts`, `src/core/i18n/catalogs/scope.ts`, `src/views/ScopeView.astro`,
  `src/views/DisciplineView.astro`, `src/components/scope/`, `tests/unit/core/scope.test.ts`,
  `tests/unit/content/scope.test.ts`
- **Relacionados:** ADR 0002 (conteúdo como dados); [programa editorial](../programa-editorial.md);
  [plano de 14/11/2026](../planos/2026-11-14-escopo-e-primeira-tela.md)

## Contexto

O foco do site foi declarado em 10/11/2026 (engenharia de software, ciência da computação, sistemas de
informação, método de trabalho e pilhas de tecnologia) e ampliado pelo autor em 14/11/2026: engenharia de
software, ciência da computação, sistemas de informação, tecnologia da informação, arquitetura de software,
design de sistemas, otimização de sistemas, teoria da informação, filosofia aplicada, processamento de sinais e
ETL. O pedido foi que o projeto do site restrinja o escopo.

Até aqui o foco existia em três lugares que não se conferiam entre si: a prosa do programa editorial, quatro
"frentes" escritas à mão na página inicial e a faceta de domínio, uma lista plana de dezoito campos em que
"matemática" e "engenharia de software" tinham o mesmo estatuto. Nada impedia um ensaio só sobre um campo de
apoio, e a página não tinha como dizer o que o acervo de fato cobre.

## Decisão

1. **A faceta de domínio é o escopo.** `DOMAINS` passa a ser a união de duas listas fechadas
   (`src/core/domain/facets.ts`):
   - onze **disciplinas do núcleo**: engenharia de software, arquitetura de software, design de sistemas,
     ciência da computação, otimização de sistemas, sistemas de informação, tecnologia da informação,
     engenharia de dados e ETL, teoria da informação, processamento de sinais e filosofia aplicada;
   - onze **fundamentos**: ontologia, epistemologia, semiótica, lógica, matemática, probabilidade, sistemas
     dinâmicos, comportamento, metodologia, design e produto.
2. **Todo fundamento declara de que é fundamento.** `SUPPORTS` (`src/core/domain/scope.ts`) associa cada
   fundamento às disciplinas do núcleo que dependem dele. A pergunta "por que isto está aqui?" tem resposta
   em dado, não em juízo caso a caso.
3. **As disciplinas se agrupam em cinco frentes** (`AXES`): construir software; computação e otimização;
   sistemas de informação e dados; informação e sinais; filosofia aplicada. As frentes são apresentação; a
   unidade do escopo é a disciplina.
4. **Três regras decidíveis** (`scope.ts`):
   - R1: todo domínio é disciplina ou fundamento, e todo fundamento sustenta ao menos uma disciplina.
     Garantida pelos tipos: `SUPPORTS` é um registro total de tuplas não vazias.
   - R2: todo ensaio declara ao menos uma disciplina do núcleo. Conferida pelo esquema de conteúdo: um ensaio
     fora do escopo não compila.
   - R3: pelo menos 75 % das obras (ensaios e laboratórios) declaram uma disciplina do núcleo. Conferida por
     teste sobre o acervo. Um laboratório pode ser só de fundamento; os fundamentos não podem superar aquilo
     de que são fundamento.
5. **O primeiro domínio de uma obra é o principal.** Uma obra só de fundamentos é listada, como apoio, nas
   disciplinas que o seu domínio principal sustenta.
6. **A cobertura é calculada, não declarada.** `coverage` dobra o acervo numa matriz disciplina × estrato. A
   página de escopo (`/pt/escopo/`, `/en/scope/`) e a página de cada disciplina leem essa matriz; uma célula
   vazia aparece como lacuna. As duas línguas de uma obra declaram os mesmos domínios, na mesma ordem.
7. **O que fica de fora está escrito** na página de escopo: tutoriais de ferramenta, notícias e comparações de
   produto, opinião sem fonte, fundamentos sem disciplina que dependa deles, e assuntos fora das onze
   disciplinas.

## Consequências

- Positivas:
  - Um texto fora do escopo é barrado pela compilação ou pelo teste, não pela memória de quem revisa.
  - A página inicial, a página de escopo, a paleta de comandos e os testes leem a mesma lista.
  - As lacunas ficam visíveis. Em 14/11/2026, tecnologia da informação não tem obra publicada.
- Negativas:
  - Acrescentar uma disciplina exige mudar o núcleo, os catálogos nas duas línguas e as rotas.
  - O limiar de 75 % é uma escolha, não um resultado. Em 15/11/2026 o acervo está em 88 % (14 de 16 obras).
  - Um ensaio legítimo sobre um fundamento precisa ser escrito a partir da disciplina que o usa.
- Mudanças no conteúdo existente: `technology` passou a `information-technology`; quatro ensaios e treze
  conceitos ganharam as disciplinas de que já tratavam. Nenhuma prosa mudou, e cada ensaio registra a
  reclassificação nas próprias revisões.

## Pendências para o autor

1. Rever a lista do que fica de fora e as frases "o que entra" e "fica de fora" de cada disciplina
   (`src/core/i18n/catalogs/scope.ts`). São propostas desta rodada.
2. Rever a correspondência entre fundamentos e disciplinas (`SUPPORTS`).
3. Decidir o destino das resenhas (issues #17 e #18) sob este escopo. Pela regra R2, uma resenha entraria
   quando o objeto pertence a uma disciplina do núcleo; resenhas de filmes e de música ficariam de fora, salvo
   decisão em contrário.
