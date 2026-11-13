---
title: Sobre
description: 'O que é este site de engenharia de software e computação, como lê-lo e por que ele atravessa quatro estratos, da filosofia ao produto.'
lang: pt-BR
translationKey: about
slug: sobre
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
  - date: 2026-11-10
    note: Foco declarado em engenharia de software e computação; quarto ensaio.
  - date: 2026-11-13
    note: Sete ensaios distribuídos pelos quatro estratos; frentes em otimização e sistemas de informação.
---

:::aside
**Sobre este texto.** Esta página foi redigida com assistência de um sistema de inteligência artificial (IA), o Claude, como demonstração do modelo do site e aguarda revisão do autor. Os trechos marcados com **TODO** dependem de informações que só o autor pode fornecer e não foram preenchidos com suposições.
:::

## A ponte

Este site reúne ensaios, laboratórios interativos e um mapa de conceitos sobre engenharia de software, ciência da computação e sistemas de informação. O que os organiza é uma ideia: o conhecimento pode ser percorrido como uma ponte de quatro estratos, atravessada sempre no mesmo sentido — da pergunta ao artefato.

| Estrato | Pergunta-guia | Método |
|---|---|---|
| Filosofia | O que é isto, e como sabemos? | análise conceitual |
| Teoria | Que modelo explica isto? | modelagem e abstração |
| Formal | O que se segue necessariamente? | prova, algoritmo, determinismo |
| Valor | Para que serve, a quem, a que custo? | projeto, produto, ética |

Cada estrato é representado por um símplice de dimensão crescente — ponto, segmento, triângulo, tetraedro —, porque cada passo acrescenta um grau de determinação: da questão sem extensão ao artefato sólido. A ordem dos estratos nunca depende só da cor: forma, posição, rótulo e luminosidade a repetem, para que ela sobreviva a qualquer forma de discromatopsia, à impressão em tons de cinza e à leitura por leitores de tela.

Os três ensaios de partida formam uma travessia completa. [Do signo à informação](../ensaios/do-signo-a-informacao/) vai da filosofia à teoria; [Amostrar é decidir](../ensaios/amostrar-e-decidir/), da teoria ao formal; [Escolher custa bits](../ensaios/escolher-custa-bits/), do formal ao valor. Os [laboratórios](../laboratorio/) tornam tangíveis, um a um, os teoremas que os ensaios mencionam.

## Do que trata

O assunto principal é o trabalho de construir e manter sistemas: engenharia de software, otimização combinatória e sistemas de informação, articulados à ciência da computação, ao método de trabalho e às pilhas de tecnologia (:foreign[stacks]{lang=en}). A ponte dá a ordem das perguntas. Antes de escolher uma ferramenta, convém saber que problema ela resolve; antes do problema, que modelo o descreve; antes do modelo, o que os termos querem dizer.

A filosofia entra, por isso, como filosofia aplicada: serve para dizer com precisão o que são registro, estado, modelo, essência ou abstração antes de medi-los ou de programá-los. A teoria da informação liga as pontas, porque a mesma medida que diz quanto um canal transmite ajuda a dizer quanto custa uma escolha numa interface ou quanta representação um programa desperdiça. Quatro ensaios percorrem diretamente essas frentes: [O registro não é a coisa](../ensaios/o-registro-nao-e-a-coisa/) parte da ontologia dos cadastros e da semiótica do índice para distinguir fatos imutáveis de estados projetados em sistemas de informação; [O ótimo é inimigo do prazo](../ensaios/o-otimo-e-inimigo-do-prazo/) une a lei de Amdahl, os algoritmos de aproximação e o satisficing para decidir o que otimizar e onde parar; [A segunda flag](../ensaios/a-segunda-flag/) parte da teoria dos autômatos para eliminar estados impossíveis em código; e [Mudar sem quebrar](../ensaios/mudar-sem-quebrar/) articula ocultação de informação, camadas de ritmo e registros de decisão arquitetural no estrato do valor.

## Como ler

Não é preciso ler em ordem. Os ensaios são escritos para permitir vários percursos:

- **Argumentos com forma.** Os títulos de seção de um ensaio declaram o papel de cada parte no argumento — pergunta, definição, premissa, afirmação, objeção, réplica, conclusão — e de quais outras partes ela depende, numa adaptação do modelo de Toulmin [@toulmin1958]. Com isso, o argumento pode ser desenhado como um grafo e percorrido fora da ordem do texto.
- **Texto que se expande.** Notas laterais acompanham o texto na margem, e trechos marcados podem ser abertos no próprio fluxo da leitura, como no :foreign[stretchtext]{lang=en} imaginado por Ted Nelson, o mesmo autor que propôs o termo “hipertexto” [@nelson1965].
- **Figuras que acompanham a rolagem.** Algumas sequências avançam conforme a página rola, e outras atravessam a página na horizontal; sem JavaScript, ou com movimento reduzido, continuam legíveis passo a passo, sem animação.
- **Conceitos ligados.** Termos técnicos levam a páginas de conceito, organizadas como uma pequena ontologia — no sentido de Gruber, a especificação de um vocabulário representacional para um domínio de discurso compartilhado [@gruber1993]. Cada item do site é localizado por facetas independentes (estrato, forma, domínio, conceitos), como na classificação facetada de Ranganathan [@ranganathan1933], e a proximidade entre conceitos é estimada com medidas baseadas em conteúdo informacional [@resnik1995; @lin1998; @seco2004].

## Status epistêmico e proveniência

Cada ensaio e laboratório declara quão seguro está o autor e em que tipo de apoio suas afirmações se baseiam. A confiança usa a escala de expressões de probabilidade proposta por Sherman Kent, em que “provável” corresponde a cerca de 75 %, com margem de 12 pontos para mais ou para menos [@kent1964]; o tipo de apoio é prova, evidência empírica, argumento ou especulação. Cada texto também informa sua proveniência: se foi escrito sem assistência, com assistência ou gerado com ajuda de IA, e se o autor já o revisou. Os textos publicados até aqui foram gerados com assistência de IA e estão marcados como não revisados até que o autor os revise.

Os ensaios existem em português e em inglês. As duas versões foram escritas para soar naturais em cada língua, não traduzidas palavra por palavra; por isso podem diferir em detalhes de formulação. As citações seguem, em português, as normas da Associação Brasileira de Normas Técnicas (ABNT) e, em inglês, o estilo da :foreign[American Psychological Association]{lang=en} (APA); detalhes estão no [colofão](../colofao/).

## O autor

Este site é mantido por Flávio Tinoco.

**TODO (autor):** apresentação breve, na primeira pessoa — formação, área de atuação e interesses que motivam o site.

**TODO (autor):** por que este site existe e o que o autor espera dele.

**TODO (autor):** formas de contato que o autor deseja tornar públicas (por exemplo, para correções e sugestões).

## Licença

**TODO (autor):** a licença dos textos e do código ainda não foi definida. Até que seja, nenhuma licença de reutilização está declarada aqui.

::bibliography
