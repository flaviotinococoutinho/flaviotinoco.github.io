# O som da sala: o que o myNoise ensina, e o que entrou — 22/11/2026

- Status: executado na branch `flavio/vibrant-hamilton-wowk2z`; aguarda o autor ouvir
- Autor: Flávio Tinoco (execução assistida por IA, Claude)
- Relacionados: [ADR 0014](../adr/0014-sala-de-leitura.md), decisão 19;
  [plano de 22/11/2026 (hierarquia de leitura)](2026-11-22-hierarquia-de-leitura.md)

Documento de projeto desta rodada: o que foi pedido, como foi lido, o que se aprendeu com as referências, o que
entrou e o que ficou para o autor decidir. É um plano com data, não um contrato permanente.

## 1. Pedido

Três endereços, depois da revisão de hierarquia da mesma data: o hub do GOTO na InfoQ
(`infoq.com/gotocon/`), a revista _Works in Progress_ (`worksinprogress.co`) e, "de ASMR pode usar de exemplo",
o gerador "Medieval Library" do myNoise.

Foi lido em duas partes. As duas primeiras são mais referências para a revisão de hierarquia. A terceira pede um
som de ambiente para a sala de leitura, no espírito do ASMR (sons baixos, próximos e repetitivos que acompanham a
atenção sem disputá-la), com o myNoise como modelo.

## 2. Método

As três páginas foram lidas no HTML (sem a folha de estilo): a página do gerador do myNoise; a página inicial da
_Works in Progress_ e um artigo ("The edge of biotech hedge funds", de 19/11/2026); o hub do GOTO e uma
apresentação ("Concurrent Programming Using The Disruptor", GOTO Copenhague, 2012). Por isso nada aqui diz
respeito a tipografia ou cor dessas páginas, só à estrutura. A apresentação da InfoQ é de 2012; as recentes podem
ter outro formato.

O som foi medido no Chromium, por um analisador na saída do grafo (o mesmo do teste e2e): RMS de 32 768 amostras
em seis momentos, quatro segundos depois do clique; e as tarefas longas (> 50 ms) a partir do clique, pela API
`PerformanceObserver`.

## 3. O que as referências fazem

**myNoise, "Medieval Library"** (S. Pigeon, 12/06/2020). Um "gerador de som composto" que recria a biblioteca de
um mosteiro: a lareira, os monges copistas, um sino de igreja de vez em quando, cantos gregorianos distantes, o
tique-taque de um relógio mecânico. Tem predefinições ("The Quiet Room", "The Fireplace", "The Chapel",
"Paperwork", "Empty Room", "Surprise!") e parâmetros de animação: o modo ("Soft", "Hard"; "Solo", "Duo",
"Trio", "Quad"), a velocidade (de ÷8 a ×8) e a faixa. Há calibração pela audição do ouvinte (iEQ), largura
estéreo e velocidade da fita. Os sons da natureza do site são gravados em campo, e o uso é pessoal. O que
ensina: um controle por camada, um banco de predefinições para começar, e uma mistura que nunca fica parada.

**Works in Progress.** Na página inicial, os artigos se agrupam por edição ("Spotlight / Issue 26"); cada cartão
traz o tema acima do título, o título, "Words by" com os autores e uma frase de apresentação; nem data nem tempo
de leitura. No artigo: ilustração, autor, título, data, compartilhamento, tempo de leitura e uma frase de
abertura (_standfirst_), depois uma coluna só, sem intertítulos, sem sumário e sem notas (as fontes são links no
texto), com o convite à newsletter no meio do texto e a biografia do autor no fim.

**InfoQ, GOTO.** O hub separa por tipo de conteúdo (notícias, artigos, apresentações), cada lista com "mais" e
RSS; os cartões das apresentações têm a duração sobre a miniatura e não têm resumo. A página da apresentação tem
trilha de navegação, o vídeo com velocidade de 1× a 2×, MP3 e slides para baixar, a duração, "Summary", "Bio",
"About the conference" e os tópicos relacionados.

## 4. Diagnóstico deste site

As duas referências novas confirmam o que a revisão de hierarquia já fez, mais do que pedem coisa nova: a frase
de abertura da _Works in Progress_ é a descrição e o resumo dos ensaios; a duração da InfoQ é o tempo de leitura,
que aqui existe por ensaio e por seção; o agrupamento por tipo é o dos índices. Os ensaios daqui têm mais
estrutura do que os da _Works in Progress_ (intertítulos, sumário que é o roteiro do argumento, notas laterais).
O que a InfoQ tem e este site não tem é uma segunda forma de consumir a obra (o áudio da palestra). Fica para o
autor (seção 6).

O que faltava era o som. A sala de leitura tinha chuva na janela, vela e estante, e era muda.

## 5. O que entrou

O som da sala, descrito em detalhe na decisão 19 do ADR 0014. Em resumo:

| Mudança                                                                                                                                                                                                  | Onde                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Cinco camadas, as da sala:** chuva no vidro, fogo, vento, páginas e pena. Amostras calculadas de uma semente: nenhum arquivo de áudio                                                                  | `src/core/chrome/sound-synth.ts`                                                |
| **O modelo:** níveis de 0 a 10 (3 dB por degrau), predefinições, a mistura do leitor e seu codec, a oscilação lenta (períodos primos de 29 a 83 s), Poisson para gotas e estalos, Markov para a pena     | `src/core/chrome/sound.ts`                                                      |
| **A sala comanda:** a chuva cede no fim do ensaio, o vento cresce com a rolagem, uma página vira a cada seção (no máximo uma por gesto)                                                                  | `src/core/chrome/sound.ts`; `src/islands/elements/ft-room-sound.ts`             |
| **O motor:** grafo Web Audio (filtros, posição estéreo pela planta da sala, compressor), eventos agendados no relógio do áudio, amostras calculadas em etapas depois do quadro do clique                 | `src/islands/scenes/room-sound.ts`                                              |
| **O consentimento:** desligado por padrão; começa no primeiro gesto do leitor na página, nunca ao carregar, nem quando o navegador traz a ativação da página anterior; pausa com a aba oculta            | `src/islands/elements/ft-room-sound.ts`                                         |
| **O painel:** o grupo "Som da sala" e, com um som escolhido, "Camadas", um controle deslizante nativo por camada; mover um torna a mistura do leitor (`custom`, guardada no navegador) e o som acompanha | `src/islands/elements/ft-preferences.ts`; `src/core/chrome/preferences-form.ts` |

As predefinições, com o RMS medido na saída (a oscilação varia cada valor em cerca de 1,6 dB):

| Predefinição | Chuva | Fogo | Vento | Páginas | Pena | RMS medido            |
| ------------ | ----: | ---: | ----: | ------: | ---: | --------------------- |
| Sala quieta  |     5 |    4 |     2 |       3 |    3 | ≈ −29 dBFS            |
| Chuva        |     8 |    1 |     5 |       2 |    0 | ≈ −24 dBFS            |
| Fogo         |     2 |    8 |     1 |       3 |    0 | ≈ −23 dBFS            |
| Copista      |     2 |    3 |     0 |       5 |    7 | de −36 a −27 dBFS     |
| Tudo em 10   |    10 |   10 |    10 |      10 |   10 | ≈ −15 dBFS, pico −3,9 |

Duas correções saíram da verificação, não do projeto:

- **O gesto tem de ser nesta página.** A primeira versão confiava em `navigator.userActivation.isActive`. O teste
  e2e, repetido, mostrou que o navegador traz a ativação da navegação: a página carregava já "ativada" e, às
  vezes, o som começava sem gesto nenhum. Agora as duas condições são exigidas: um evento confiável do leitor
  nesta página (clique, toque, tecla; não Escape) e a permissão do navegador.
- **A síntese saiu do clique.** Calculadas de uma vez, as amostras levavam 74 ms a frio (40 ms aquecido) num
  núcleo de desktop, dentro da tarefa do clique: tudo isso entraria na latência da interação (INP), e num celular
  modesto passaria de 200 ms. Agora o grafo é criado na hora, em silêncio, e as amostras vêm em cinco etapas,
  uma tarefa cada, depois do quadro seguinte; as camas, filtradas abaixo de 6,5 kHz, são calculadas a 16 kHz. Não
  sobrou tarefa longa depois do clique.

Uma terceira saiu da medida: a primeira calibração punha a "Sala quieta" a −38,6 dBFS, baixa demais para o
volume em que se ouve um vídeo; o ganho geral subiu cerca de 5 dB e a predefinição, um degrau.

## 6. O que ficou para o autor

1. **Ouvir.** Em fones e em caixas: os níveis das predefinições, o timbre de cada camada (a chuva e o fogo,
   sobretudo) e se falta alguma camada (o relógio e o sino do myNoise ficaram de fora). A calibração foi por RMS,
   não por loudness ponderada (ITU-R BS.1770), e o ambiente de desenvolvimento não tem saída de áudio.
2. **Continuidade entre ensaios.** Hoje o som para a cada página e volta no primeiro gesto da seguinte. O
   navegador permitiria começar ao carregar quando o leitor chega por um clique (a ativação vem junto), o que
   daria continuidade; a regra atual prefere o consentimento previsível.
3. **Uma versão em áudio dos ensaios,** como o MP3 das palestras da InfoQ: narração gravada ou sintetizada. Seria
   outra forma de acesso à obra, não um som de ambiente, e pede uma decisão própria (custo, voz, sincronia com o
   texto).

## Referências

- GEE, T. Concurrent programming using the Disruptor. In: GOTO COPENHAGEN, 2012, Copenhague. _InfoQ_,
  17 out. 2012. Disponível em: https://www.infoq.com/presentations/Disruptor/. Acesso em: 22 nov. 2026.
- INFOQ. _GOTO Conference_. Disponível em: https://www.infoq.com/gotocon/. Acesso em: 22 nov. 2026.
- INTERNATIONAL TELECOMMUNICATION UNION. _ITU-R BS.1770-5_: algorithms to measure audio programme loudness and
  true-peak audio level. Genebra: ITU, 2023.
- KELLET, P. Filter to make pink noise from white. _music-dsp mailing list_, [1999?].
- MAHAJAN, A. The edge of biotech hedge funds. _Works in Progress_, 19 nov. 2026. Disponível em:
  https://worksinprogress.co/issue/how-do-biotech-hedge-funds-make-money/. Acesso em: 22 nov. 2026.
- PIGEON, S. _Medieval Library_. myNoise, 12 jun. 2020. Disponível em:
  https://mynoise.net/NoiseMachines/customMedievalLibrary.php. Acesso em: 22 nov. 2026.
- STEVENS, S. S. On the psychophysical law. _Psychological Review_, v. 64, n. 3, p. 153–181, 1957.
- THOMPSON, R. F.; SPENCER, W. A. Habituation: a model phenomenon for the study of neuronal substrates of
  behavior. _Psychological Review_, v. 73, n. 1, p. 16–43, 1966.
- W3C. _Web Audio API 1.0_. W3C Recommendation, 17 jun. 2021. Disponível em: https://www.w3.org/TR/webaudio/.
- W3C. _Web Content Accessibility Guidelines (WCAG) 2.2_. W3C Recommendation, 5 out. 2023. Critérios 1.4.2,
  2.5.7 e 2.5.8.
- WHATWG. _HTML Living Standard_, seção "Tracking user activation". Disponível em:
  https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation.
- WILSON, C. A tale of two clocks: scheduling web audio with precision. _HTML5 Rocks_, 2013.
- WORKS IN PROGRESS. Disponível em: https://worksinprogress.co/. Acesso em: 22 nov. 2026.
