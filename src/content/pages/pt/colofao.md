---
title: Colofão
description: 'Como este site é feito: tipografia, proporção, cor verificada, acessibilidade, tecnologia, normas editoriais e privacidade.'
lang: pt-BR
translationKey: colophon
slug: colofao
revisions:
  - date: 2026-10-11
    note: Versão inicial (texto-semente).
---

:::aside
**Sobre este texto.** Esta página foi redigida com assistência de IA (Claude) como demonstração do modelo do site e aguarda revisão do autor. Ela descreve o projeto do site; quando uma característica ainda está prevista, e não pronta, isso é dito.
:::

## Tipografia

O texto corrido usa a Literata, uma serifada criada pela TypeTogether, por encomenda do Google, para leitura prolongada no Google Play Books e redesenhada em 2020 como fonte variável, com eixos de peso e de tamanho óptico: em corpos pequenos, o desenho tem menos contraste entre traços grossos e finos; em títulos, mais. A interface usa a Atkinson Hyperlegible Next, e o código, a Atkinson Hyperlegible Mono, ambas lançadas pelo Braille Institute em 2025 a partir da Atkinson Hyperlegible original, desenhada para leitores com baixa visão. Nessas fontes, letras que costumam ser confundidas — como o I maiúsculo, o l minúsculo e o algarismo 1, ou o O e o 0 — recebem formas bem distintas, o que importa em rótulos, números e código.

A coluna de leitura tem 66ch de largura. Bringhurst considera satisfatórias, num texto serifado de coluna única, linhas de 45 a 75 caracteres, com 66 como ideal [@bringhurst2004]; a unidade ch do CSS, porém, é a largura do algarismo zero, e numa fonte proporcional 66ch não correspondem exatamente a 66 caracteres — é uma aproximação. O texto é alinhado à esquerda e nunca justificado. A hifenização é feita pelo navegador, segundo o idioma declarado de cada trecho, e pode ser desligada nas preferências. O TeX hifeniza com o algoritmo de padrões de Liang [@liang1983], descrito no :foreign[TeXbook]{lang=en} [@knuth1984]; aqui, essa tarefa é delegada ao navegador.

Estrangeirismos aparecem em itálico e marcados com o idioma de origem, o que também orienta leitores de tela e a hifenização; nomes próprios não são hifenizados; siglas trazem sua expansão. Essa marcação é feita automaticamente, a partir de dicionários, e pode ser corrigida pelo autor em cada texto.

## Proporção

As medidas derivam de uma única razão, φ ≈ 1,618. A escala tipográfica é fluida: entre telas de 360 px e de 1440 px de largura, o corpo do texto passa de 17 px a 20 px, e a razão entre degraus sucessivos passa de 1,2 a √φ ≈ 1,272, de modo que, em telas largas, cada dois degraus correspondem exatamente a uma potência de φ. A entrelinha do texto corrido é φ; os espaçamentos são potências de φ, de φ⁻⁴ a φ⁵ (em rem); a coluna de leitura e a coluna de margem estão na razão φ : 1. As durações das animações são números de Fibonacci em milissegundos — 89, 144, 233, 377, 610, 987 e 1597 —, cujas razões sucessivas tendem a φ, de modo que o tempo compartilha a proporção do espaço.

Trata-se de uma escolha de coerência interna, não da afirmação de que φ seja perceptivamente superior a outras razões — tese que este site não examina e não pressupõe.

## Cor

As cores são definidas como fichas de design, no formato do W3C para :foreign[design tokens]{lang=en}, no espaço de cor OKLCH, e verificadas automaticamente a cada alteração. O verificador exige:

- que toda cor esteja dentro da gama sRGB;
- contraste WCAG de pelo menos 7:1 (nível AAA) para o texto principal, o secundário e os links sobre todas as superfícies, e de pelo menos 4,5:1 para o texto discreto;
- contraste APCA de pelo menos Lc 75 para o texto principal;
- contraste de pelo menos 3:1 para bordas de controles e para o indicador de foco;
- no máximo 16:1 entre texto e fundo nos esquemas usuais, para evitar o preto puro sobre o branco puro;
- que as quatro cores dos estratos continuem distinguíveis entre si sob simulação de protanopia, deuteranopia e tritanopia, pelo modelo de Machado, Oliveira e Fernandes [@machado2009], com diferença mínima CIEDE2000 de 8 (e de 15 para a visão típica), e que sua luminosidade cresça estritamente na ordem dos estratos sob simulação de acromatopsia.

Essas garantias têm limites que convém declarar. A simulação usa a severidade máxima de cada dicromacia e aproxima a acromatopsia pela luminância; não cobre todas as tricromacias anômalas, a baixa visão, as diferenças entre telas nem a luz ambiente. Os limiares são escolhas de projeto, não constantes perceptivas: a diferença de cor perceptível depende, entre outros fatores, do tamanho da marca, e marcas pequenas exigem diferenças maiores [@szafir2018]. Por isso a cor nunca é o único portador de significado: os estratos são sempre identificados também por forma e rótulo. Há esquemas claro e escuro, e variantes de contraste aumentado.

## Acessibilidade

A meta é a conformidade com as WCAG 2.2 no nível AA, com contraste de texto no nível AAA. O site foi projetado com HTML semântico e marcos de navegação, link para pular ao conteúdo, foco sempre visível, operação completa por teclado, idioma declarado nos trechos estrangeiros, fórmulas também em MathML, legível por tecnologias assistivas, respeito à preferência do sistema por movimento reduzido — com controle próprio nas preferências —, hifenização desligável, nenhum significado transmitido só pela cor e conteúdo útil sem JavaScript em todos os elementos interativos. A integração contínua inclui verificações automáticas de acessibilidade nos temas claro e escuro.

Limitações conhecidas:

- verificações automáticas detectam apenas parte dos problemas;
- os textos de partida ainda não foram avaliados por pessoas que usam leitores de tela no dia a dia;
- os laboratórios dependem de gráficos cujo equivalente textual ainda pode ser incompleto;
- o suporte a MathML varia entre leitores de tela;
- o tempo de leitura estimado usa a média de 238 palavras por minuto medida para a leitura silenciosa de não ficção em inglês [@brysbaert2019]; ele é aplicado também aos textos em português e varia muito de pessoa para pessoa.

**TODO (autor):** canal para relatar barreiras de acessibilidade.

## Tecnologia

O site é estático, gerado com Astro 7 e publicado no GitHub Pages. Os textos são Markdown puro, escritos numa linguagem fechada de diretivas para ambientes matemáticos, citações, notas e conceitos, e processados por uma cadeia de estágios unified (remark e rehype), cada um apoiado em funções puras e testadas. As fórmulas são escritas na notação do TeX [@knuth1984] e compostas pelo KaTeX. Os laboratórios usam pequenos núcleos de cálculo escritos em Rust e compilados para WebAssembly — transformada rápida de Fourier [@cooley1965], entropia e códigos de Huffman, mapa logístico, somas aleatórias —, carregados apenas nas páginas que os usam. A busca usa o Pagefind, que gera um índice estático consultado no próprio navegador. Os comportamentos interativos são elementos personalizados (:foreign[custom elements]{lang=en}) carregados sob demanda, sem framework de interface no cliente. Os dicionários que marcam estrangeirismos, nomes próprios e siglas são compilados em estruturas de busca rápida; um filtro de Bloom [@bloom1970], com :foreign[hashing]{lang=en} duplo [@kirsch2008], está previsto para as futuras ferramentas de terminal.

O código-fonte está em <https://github.com/flaviotinococoutinho/flaviotinoco.github.io>.

## Ética editorial

Cada ensaio e laboratório declara:

- sua **proveniência**: se foi escrito sem assistência, com assistência ou gerado com ajuda de IA, e se o autor já o revisou;
- seu **status epistêmico**: a confiança, na escala de Kent [@kent1964], e o tipo de apoio — prova, evidência empírica, argumento ou especulação;
- seu **histórico de revisões**, com :raw[data] e nota de cada mudança relevante.

| Expressão | Probabilidade aproximada |
|---|---|
| Certo | 100 % |
| Quase certo | 93 %, com margem de cerca de 6 pontos |
| Provável | 75 %, com margem de cerca de 12 pontos |
| Chances equilibradas | 50 %, com margem de cerca de 10 pontos |
| Provavelmente não | 30 %, com margem de cerca de 10 pontos |
| Quase certamente não | 7 %, com margem de cerca de 5 pontos |

Afirmações factuais não triviais vêm acompanhadas de fonte. Citações diretas são exatas, entre aspas, com a página quando ela existe; traduções próprias são indicadas como “tradução nossa”. Em português, as chamadas seguem o sistema autor-:raw[data] da ABNT NBR 10520:2023, e as referências, a ABNT NBR 6023:2025; em inglês, o estilo APA, 7.ª edição. Números e unidades seguem o Sistema Internacional, com espaço entre o número e o símbolo da unidade, como em 10 kHz. Afirmações empíricas são formuladas, sempre que possível, de modo que possam ser testadas e refutadas [@popper1959]; quando a evidência não basta, o texto diz isso.

## Privacidade

O site não usa rastreamento, análise de audiência nem cookies, e não carrega recursos de terceiros: as fontes são servidas pelo próprio site. As preferências de leitura — tema, contraste, movimento, hifenização, textura e opções de texto — ficam guardadas apenas no armazenamento local do seu navegador (`localStorage`) e nunca são enviadas a lugar algum; apagá-las restaura os padrões. A busca roda no navegador, sobre um índice estático. O serviço de hospedagem, o GitHub Pages, pode registrar dados técnicos das requisições, como endereços IP, segundo as políticas da GitHub, que este site não controla.

## Licença

**TODO (autor):** a licença dos textos e do código ainda não foi definida.

::bibliography
