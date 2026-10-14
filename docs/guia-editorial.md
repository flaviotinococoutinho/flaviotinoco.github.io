# Guia editorial

> Como escrever para este site: o que declarar sobre cada texto, como citar, que convenções tipográficas seguir e o
> que o sistema faz sozinho. O contrato técnico da linguagem de autoria está em `docs/arquitetura.md` §5; os
> dicionários e seus critérios, em [`lexicon/README.md`](../lexicon/README.md).

## 1. Princípio: o texto do autor é intocável

O sistema **nunca reescreve** o que o autor escreveu. Ele só acrescenta estrutura (um itálico com idioma, uma sigla
com expansão, um grupo que não deve quebrar de linha) e **avisa** quando uma norma parece não ser cumprida. A
decisão é sempre do autor. Isso vale até para normas claras: mover um ponto final, expandir uma sigla ou trocar
aspas automaticamente pode destruir sentido (um ponto que pertence a uma abreviatura, uma sigla que o autor
explicou no parágrafo anterior). Toda marcação preserva os caracteres exatamente; testes de propriedade
(`tests/unit/abnt/`) verificam que o texto plano de qualquer documento sai idêntico ao que entrou.

## 2. Estatuto epistêmico

Todo ensaio e laboratório declara, no frontmatter, **quão seguro** o autor está e **em que tipo de apoio** as
afirmações se baseiam:

```yaml
epistemic:
  confidence: probable # grau de confiança na tese central
  evidence: argument # proof | empirical | argument | speculation
```

A confiança usa a escala de **Sherman Kent**, _Words of Estimative Probability_ (Studies in Intelligence, 1964):
rótulos verbais calibrados a faixas de probabilidade, para que “provável” signifique a mesma coisa em todo o site.

| Valor                  | Leitura              | Faixa (Kent, 1964) |
| ---------------------- | -------------------- | ------------------ |
| `certain`              | certo                | 100 %              |
| `almost-certain`       | quase certo          | 93 % ± ≈ 6 %       |
| `probable`             | provável             | 75 % ± ≈ 12 %      |
| `chances-even`         | chances equilibradas | 50 % ± ≈ 10 %      |
| `probably-not`         | provavelmente não    | 30 % ± ≈ 10 %      |
| `almost-certainly-not` | quase certamente não | 7 % ± ≈ 5 %        |

O tipo de evidência vai do mais forte ao mais fraco: `proof` (demonstração formal), `empirical` (dados, experimento),
`argument` (argumentação conceitual), `speculation` (hipótese declarada como tal). Uma prova matemática pode ser
`certain`/`proof`; um ensaio interpretativo honesto raramente passa de `probable`/`argument`. Declarar menos
confiança do que se tem é preferível a declarar mais.

## 3. Proveniência e uso de inteligência artificial

O frontmatter declara **quem produziu o texto** — e o leitor vê essa declaração:

```yaml
provenance:
  assistance: assisted # none | assisted | generated
  reviewed: true # o autor revisou e assume o texto?
  note: 'Rascunho das seções 2–3 com assistência de IA; argumentos, fontes e revisão finais do autor.'
```

- `none`: escrito pelo autor, sem ferramentas generativas (corretor ortográfico não conta).
- `assisted`: o autor escreveu com ajuda de IA (sugestões, rascunhos de trechos, tradução) e revisou.
- `generated`: o texto foi gerado por IA a partir de instruções do autor.
- `reviewed: false` significa que o autor ainda não conferiu o texto; texto gerado por IA e não revisado é rotulado
  como tal para o leitor (`src/content.config.ts`, campo `provenance`).

Regras: nunca atribuir a uma fonte algo que a IA “resumiu” sem conferir a fonte; toda citação direta é conferida no
original; tradução feita por IA é tradução do autor para efeito de responsabilidade (“tradução nossa”) e deve ser
revista como tal.

## 4. Ética da citação

As citações seguem a ABNT NBR 10520:2023 nos textos em português e o APA 7 nos textos em inglês; as referências, a
NBR 6023:2025 (ver `docs/arquitetura.md` §5.4 para a sintaxe `[@chave, p. 12]`).

- **Cite o que leu.** Citação de citação (_apud_) só quando o original é inacessível — e então só a fonte consultada
  entra nas referências (NBR 10520:2023, 7.3).
- **Citação direta tem localizador** (página, folha, seção, minuto) sempre que a fonte tiver um (6.1.3).
- **O ponto final encerra a frase, não a citação**: ele vem depois da chamada —
  “Não se mova, faça de conta que está morta” (Clarac; Bonnin, 1985, p. 72). (5.2, 7.1.2)
- **Destaque e tradução próprios são declarados no fim da chamada**, nesta ordem: localizador, “tradução nossa”,
  “grifo nosso” — (Brody; Harnad, 2004, p. 2, tradução nossa, grifo nosso). Destaque que já estava no original não se
  anota (“grifo do autor” não é mais usado); “destaque nosso” não está na norma (7.1.5–7.1.6).
- **Supressões e interpolações** com `[...]` e `[ ]`; nunca altere uma citação sem marcar.
- **Uma só política de autoria** por documento: com quatro ou mais autores, “_et al._” é permitido, mas então em
  todas as chamadas desse tipo (6.1.2).
- Não use uma fonte para sustentar o que ela não diz; se a fonte é fraca ou contestada, diga isso no texto.

## 5. O que o sistema marca sozinho e o que é do autor

O estágio `abnt` do pipeline de Markdown aplica uma tabela de regras (`src/core/abnt/rules.ts`): cada regra é um dado
com identificador, normas de referência, línguas a que se aplica e comportamento.

### 5.1 Marcação automática (só estrutura; o texto não muda)

| Regra             | O que faz                                                                                                                                 | Fonte                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `MARK-FOREIGN`    | estrangeirismo do dicionário → `<i lang="xx" class="foreign">`                                                                            | HTML (_the i element_); WCAG 2.2, 3.1.2; MRPR 3. ed. (2018)                                 |
| `MARK-LATIN`      | locução latina → `<i lang="la" class="locution">`                                                                                         | prática tipográfica da NBR 10520:2023; FUNAG                                                |
| `MARK-NAME`       | nome próprio → `<span class="proper-name" translate="no">`, sem hifenização; obra → `<cite>` (com `lang` se o título for de outra língua) | WCAG 2.2, 3.1.2; HTML (_translate_); Bringhurst, §2.4; Acordo Ortográfico de 1990, Base XIX |
| `MARK-ACRONYM`    | sigla → `<abbr class="acronym" title="forma completa na língua do documento">`                                                            | HTML (_the abbr element_); NBR 14724:2024, 5.6                                              |
| `NOWRAP-LOCATOR`  | “p. 12”, “v. 27”, “n. 3”, “§ 5”, “cap. V” não quebram de linha                                                                            | NBR 10520:2023, 6.2.4 e 7.1.3                                                               |
| `NOWRAP-DATE`     | “3 maio 2024”, “7 abr. 2023”, “3 de maio de 2024” não quebram                                                                             | NBR 5892:2019, 3.1; NBR 6023:2025, 8.6.2–8.6.3 e Anexo A                                    |
| `NOWRAP-UNIT`     | “10 kHz”, “30,2 °C”, “25 %”, “R$ 5,00” não quebram                                                                                        | Brochura do SI, 9. ed., 5.4.3; Inmetro, QGUM 3.4.1                                          |
| `NOWRAP-INITIALS` | “C. E. Shannon”, “J.-P. Sartre” não quebram                                                                                               | NBR 6023:2025, 8.1.1                                                                        |

“Não quebra” é feito envolvendo o grupo num `<span class="nowrap">` — o espaço digitado pelo autor continua lá; só a
quebra de linha muda (CSS `white-space: nowrap`). Nada é trocado por espaço inseparável.

O dicionário é **sensível à língua do documento** (`lang` do frontmatter): num texto em inglês, _software_ não é
estrangeiro e _saudade_ é; _a priori_ fica em redondo em inglês (APA 7: estrangeirismos correntes em inglês não vão em
itálico) e em itálico em português.

### 5.2 Avisos (nunca corrigidos automaticamente)

Aparecem como avisos da compilação, com o identificador `abnt:<regra>` e a posição no arquivo.

| Regra             | Avisa quando…                                                                                         | Fonte                            |
| ----------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------- |
| `CIT-02`          | o ponto final está dentro das aspas, antes da chamada                                                 | NBR 10520:2023, 5.2 e 7.1.2      |
| `CIT-23`          | “grifo nosso”/“tradução nossa” fora do lugar, fora da chamada, ou formas fora da norma                | NBR 10520:2023, 7.1.5–7.1.6      |
| `CIT-11`          | o documento mistura “_et al._” e listas de quatro ou mais autores                                     | NBR 10520:2023, 6.1.2            |
| `ACAD-06`         | a primeira ocorrência de uma sigla não tem a forma completa no mesmo parágrafo                        | NBR 14724:2024, 5.6; APA 7, 6.25 |
| `LEX-HOMOGRAPH`   | há um homógrafo sem marcação explícita (_data_, _time_, _case_…) — um aviso por termo, com a contagem | WCAG 2.2, 3.1.2                  |
| `LEX-HAND-ITALIC` | um termo do dicionário foi italicizado à mão com `*…*` (redundante, e sem declarar a língua)          | WCAG 2.2, 3.1.2                  |

As regras de citação valem para os textos em português (a NBR 10520 não se aplica ao APA). Títulos de seção não
contam como “primeira ocorrência” de sigla: defina a sigla no corpo do texto.

### 5.3 O que é sempre do autor

- **Escrever a forma completa** da sigla na primeira ocorrência: “Associação Brasileira de Normas Técnicas (ABNT)”.
  Para sigla de origem estrangeira, o costume é “transformada rápida de Fourier (FFT, do inglês _fast Fourier
  transform_)”. O sistema não insere a expansão — ela só aparece no `title` do `<abbr>`.
- **Resolver homógrafos**: _data_ (inglês) ou data (português)? Só o autor sabe.
- **Títulos de obras** que não estejam no dicionário de nomes: marque com `:name[Título]{category=work lang=en}`
  (ou use a citação bibliográfica).
- **Aspas, travessões e números** corretos no próprio texto (seções 7–8).
- **Declarar** estatuto epistêmico e proveniência.

## 6. Como sobrepor o sistema

A precedência é **diretiva explícita > frontmatter > dicionário**.

| Sintaxe                                         | Efeito                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `:foreign[Zeitgeist]{lang=de}`                  | `<i lang="de" class="foreign">`; com `lang=la`, classe `locution`. Sem `lang` válido, a compilação **falha** |
| `:name[Ferdinand de Saussure]`                  | nome próprio (sem hifenização, `translate="no"`)                                                             |
| `:name[As We May Think]{category=work lang=en}` | título de obra: `<cite lang="en">`                                                                           |
| `:abbr[FFT]{title="Fast Fourier Transform"}`    | sigla com expansão; sem `title`, usa a do dicionário                                                         |
| `:raw[data]`                                    | suprime toda marcação automática no trecho (o homógrafo “data” em português)                                 |
| `:sc[texto]`                                    | versaletes                                                                                                   |
| `:nowrap[10 x 3]`                               | grupo que não quebra de linha                                                                                |

Nada é marcado automaticamente **dentro** de uma diretiva explícita, de código, de fórmula, de HTML bruto (por
exemplo `<i lang="de">…</i>`) ou de URL de link (o texto do link é marcado).

No frontmatter, para um documento inteiro:

```yaml
lexicon:
  ignore: [design, Gestalt] # nunca marcar estes termos neste documento
  foreign:
    - { term: bricolage, lang: fr } # marcar este termo como estrangeiro neste documento
```

`ignore` também silencia o aviso de um homógrafo. Um termo de `foreign` substitui a entrada do dicionário com a mesma
grafia; a língua declarada precisa ser diferente da do documento.

O estágio exporta, para a ferramenta de terminal e para a revisão, `lexiconStats` no frontmatter processado
(contagens de estrangeirismos, locuções, nomes, siglas, grupos sem quebra, versaletes, trechos `:raw` e homógrafos não
marcados). O campo `lexicon` do autor nunca é sobrescrito.

## 7. Hifenização e alinhamento

- **Hifenização ligada por padrão**, no idioma de cada elemento (o atributo `lang` escolhe o dicionário de
  hifenização do navegador — por isso os estrangeirismos levam `lang`). Ela reduz a irregularidade da margem direita
  em colunas estreitas.
- **Texto sempre alinhado à esquerda, com margem direita irregular; nunca justificado.** O guia de estilo da _British
  Dyslexia Association_ (_Dyslexia Style Guide_) recomenda texto alinhado à esquerda sem justificação, porque a
  justificação estica os espaços entre palavras e dificulta achar o início da linha seguinte; recomenda também linhas
  de cerca de 60 a 70 caracteres (o site usa 66).
- **O leitor pode desligar a hifenização** nas preferências do site. O guia da BDA não trata explicitamente de
  hifenização; o controle existe porque palavras partidas podem atrapalhar parte dos leitores, e a escolha deve ser
  deles.
- Nomes próprios e siglas **nunca** são hifenizados automaticamente (Bringhurst, §2.4: nomes próprios só como último
  recurso).

## 8. Números e unidades (SI / Inmetro)

- **Espaço entre o número e o símbolo da unidade**, inclusive `%` e `°C`: 21 cm, 30,2 °C, 25 % (Brochura do SI, 9. ed., 5.4.3; Inmetro, QGUM). **Sem espaço** para graus, minutos e segundos de ângulo: 22° 7′ 33″.
- Símbolos em redondo, sem ponto e sem plural: 5 kg (não 5 kgs., 5 Kg).
- **Vírgula decimal** em português (3,14), ponto em inglês (3.14); zero antes da vírgula (0,5).
- **Agrupamento de dígitos** em textos técnicos com espaço fino, nunca com ponto (SI 5.4.4): 43 279,168 — o espaço
  fino inseparável (U+202F) é o ideal. Anos não se agrupam: 2024.
- Ordinais com º e ª, não com o símbolo de grau: 1º, 2ª (o grau ° é outro caractere).
- Moeda antes do valor, com espaço: R$ 48,20.
- Datas: dia sem zero à esquerda, mês por extenso ou abreviado conforme a NBR 6023 (Anexo A) — jan. fev. mar. abr.
  **maio** jun. jul. ago. set. out. nov. dez. (“maio” nunca se abrevia): 3 de maio de 2024, 7 abr. 2023. Data numérica
  pela NBR 5892:2019: 04.04.2018.
- O sistema impede a quebra de linha entre número e unidade, mas **o espaço precisa estar no texto**.

## 9. Aspas, travessões e hífens em português

- **Aspas curvas**: “ ” no primeiro nível e ‘ ’ dentro delas — “a ‘arte de conversação’ e o resto”. O Markdown
  converte as aspas retas automaticamente; o apóstrofo é ’.
- **Travessão** (—), com espaços, para intercalações e diálogos: “A restrição — temporária — é tratada…”. Não o
  substitua por hífen ou meia-risca.
- **Meia-risca** (–), sem espaços, para intervalos: 1916–2001, 8–15 animais. Também liga nomes de autores num
  epônimo: Kullback–Leibler, Hick–Hyman.
- **Hífen** (-) para palavras compostas e, por convenção da NBR 6023, para intervalos de páginas nas referências:
  p. 15-24.
- **Reticências** de supressão dentro de citação: `[...]`.
- Pontuação e chamada: o ponto vem **depois** da chamada (seção 4).

## 10. Siglas

- Primeira ocorrência: forma completa seguida da sigla entre parênteses (NBR 14724:2024, 5.6).
- Até três letras, maiúsculas (ONU, USP); quatro ou mais pronunciáveis como palavra, só a inicial maiúscula (Unesco,
  Inmetro); soletradas, todas maiúsculas (BNDES, IBGE); formas consagradas mantidas (CNPq, UnB) — Senado Federal,
  _Manual de Comunicação_, “Siglas”.
- Plural com _s_ minúsculo, sem apóstrofo: as CPUs, as APIs.
- Sem pontos entre as letras: EUA, não E.U.A.

## 11. Como fazer o dicionário crescer

Quando um termo estrangeiro, um nome ou uma sigla aparecer com frequência, acrescente-o a `lexicon/*.tsv` em vez de
marcá-lo à mão em cada texto. O passo a passo, o formato e os critérios (inclusive o que **não** entra, como palavras
aportuguesadas e homógrafos) estão em [`lexicon/README.md`](../lexicon/README.md), seção 6. Depois de editar, rode
`./node_modules/.bin/vitest run tests/unit/lexicon`: a análise acusa, com arquivo, linha e coluna, qualquer coluna
fora do esquema, etiqueta de língua inválida, duplicata ou contradição.
