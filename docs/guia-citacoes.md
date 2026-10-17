# Guia de citações e referências

> Como citar nos textos do site, como cadastrar uma obra na bibliografia e como as normas são aplicadas —
> com os desvios deliberados e suas justificativas. Contrato normativo: `docs/arquitetura.md` §5.4.
> Evidências e fontes das regras: `docs/research/abnt.md` (NBR 10520:2023, NBR 6023:2025) e
> `docs/research/unified-latex.md` §6–7.

## 1. Visão geral

| Peça         | Onde                                        | O que faz                                                                                                               |
| ------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Bibliografia | `bibliography/*.bib`                        | Fonte única (BibTeX/biblatex), lida na compilação                                                                       |
| Analisador   | `src/core/bibliography/bibtex/`             | Tokenizador → árvore sintática concreta (com posições) → banco de entradas; LaTeX → Unicode em NFC                      |
| Modelo       | `src/core/bibliography/model/`              | Tipo algébrico `Reference` (livro, capítulo, artigo, trabalho em evento, tese, relatório, documento _online_, software) |
| Estilos      | `src/core/bibliography/style/`              | ABNT (NBR 6023:2025 + NBR 10520:2023) e APA 7, como objetos de dados (padrão _Strategy_)                                |
| Motor        | `src/core/bibliography/cite/`               | Sintaxe Pandoc, localizadores, ordenação, letras de ano, agrupamento das chamadas                                       |
| Estágio      | `src/adapters/unified/remark-citations.ts`  | Reconhece as citações no Markdown e gera chamadas + lista de referências                                                |
| Carregador   | `src/adapters/unified/load-bibliography.ts` | Lê todos os `.bib`, falha a compilação listando **todos** os erros                                                      |

O idioma do documento (`lang` no _frontmatter_) escolhe o estilo: **pt-BR → ABNT**, **en → APA 7**.

## 2. Como citar no texto

A sintaxe é a do Pandoc. Exemplos com a bibliografia real (`bibliography/main.bib`):

| Markdown                                       | pt-BR (NBR 10520:2023)                           | en (APA 7)                                         |
| ---------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- |
| `[@shannon1948]`                               | (Shannon, 1948)                                  | (Shannon, 1948)                                    |
| `[@shannon1948, p. 379]`                       | (Shannon, 1948, p. 379)                          | (Shannon, 1948, p. 379)                            |
| `[@shannon1948, 379-380]` (número nu = página) | (Shannon, 1948, p. 379-380)                      | (Shannon, 1948, pp. 379–380)                       |
| `[@cover2006, cap. 5]`                         | (Cover; Thomas, 2006, cap. 5)                    | (Cover & Thomas, 2006, Chapter 5)                  |
| `[@machado2009]` (três autores)                | (Machado; Oliveira; Fernandes, 2009)             | (Machado et al., 2009)                             |
| `[@peirce1931; @saussure1916]`                 | (Peirce, 1931-1958; Saussure, 1916)              | (de Saussure, 1916; Peirce, 1931–1958)             |
| `[@shannon1948; @shannon1949]`                 | (Shannon, 1948, 1949)                            | (Shannon, 1948, 1949)                              |
| `[ver @shannon1948, p. 3; @nyquist1928]`       | (Nyquist, 1928; ver Shannon, 1948, p. 3)         | idem                                               |
| `[-@shannon1948]` (autor omitido)              | (1948)                                           | (1948)                                             |
| `@shannon1948` (narrativa)                     | Shannon (1948)                                   | Shannon (1948)                                     |
| `@shannon1948 [p. 379]`                        | Shannon (1948, p. 379)                           | Shannon (1948, p. 379)                             |
| `[@peirce1931, v. 2, § 228, tradução nossa]`   | (Peirce, 1931-1958, v. 2, § 228, tradução nossa) | (Peirce, 1931–1958, Vol. 2, § 228, tradução nossa) |
| `[@w3c2023]` (entidade)                        | (World Wide Web Consortium, 2023)                | idem                                               |
| `[@kotelnikov1933]` (data inferida)            | (Kotelnikov, [1933])                             | (Kotelnikov, 1933)                                 |

Regras:

- **Localizadores** (depois da chave, com ou sem vírgula): `p.`/`pp.`, `f.`, `cap.`/`ch.`, `seção`/`sec.`, `§`,
  `¶`/`par.`, `v.`/`vol.`, `pt.`, `n.`, `l.`, `art.`, `local.`, `fig.`, `slide`, em português ou inglês,
  com intervalos (`12-15`, `12--15`, `12–15`) e listas (`3, 7`). O rótulo sai na forma do estilo do documento.
  O que não é localizador fica **literal**, depois dele: `tradução nossa`, `grifo nosso` (NBR 10520 §7.1.5–7.1.6,
  nessa ordem: localizador, tradução, grifo).
- **Prefixo**: texto antes da chave, terminado por espaço (`[ver @k]`). `ver@k` não é citação.
- **Narrativa** só para chaves **existentes**: `@flavio` ou `fulano@exemplo.com` continuam texto.
- **Escapes**: `\[@k]` e `\@k` ficam literais. Também não há citação dentro de código, matemática, HTML,
  links, referências de links e definições.
- **Chave inexistente entre colchetes** = erro de compilação, com a posição de cada ocorrência.
- **Epígrafes**: `:::epigraph{source="@shannon1948 [p. 379]"}` — a chamada vai para a legenda da epígrafe
  (estágio `reading`).
- **Lista de referências**: sai onde estiver `::bibliography` (no máximo uma por documento) ou, sem a diretiva,
  ao final. Contém **apenas as obras citadas**. `::bibliography` sem nenhuma citação gera aviso e é removida.
- Várias obras numa chamada são ordenadas alfabeticamente (NBR 10520 §6.1.8, APA §8.12); obras do mesmo autor
  são agrupadas com os anos em ordem: (Dreyfuss, 1989, 1991) (§6.1.7).
- O **ponto final** vai depois da chamada, não antes (NBR 10520 §5.2 e §7.1.2): “[...] morta” (Clarac; Bonnin,
  1985, p. 72). Isso é responsabilidade de quem escreve; o estágio não move pontuação.

### HTML gerado

```text
<span class="cite" data-cite="[@shannon1948, p. 12]">(<a href="#ref-shannon1948" id="cite-shannon1948">Shannon</a>, 1948, p. 12)</span>

<section class="references" data-style="abnt" aria-labelledby="references-title">
  <h2 id="references-title">Referências</h2>
  <ul role="list" class="references__list">
    <li id="ref-shannon1948" class="references__item">SHANNON, Claude Elwood. …
      <a class="references__backlink" href="#cite-shannon1948"
         aria-label="Voltar à primeira citação de Shannon, 1948 no texto">↩︎</a></li>
  </ul>
</section>
```

- `data-cite` guarda a sintaxe original: trocar cada `span.cite` pelo seu `data-cite` recupera o texto de entrada
  (injetividade, verificada por teste de propriedade).
- A primeira chamada de cada obra recebe `id="cite-<chave>"`, alvo do link de volta na lista.
- O estágio exporta no _frontmatter_ `citations` (chaves na ordem da primeira citação) e `citationJsonLd`
  (as mesmas obras como objetos schema.org, para o JSON-LD `citation` da página).

## 3. Como cadastrar uma obra

Chaves: sobrenome do primeiro autor em minúsculas, sem acentos, + ano (+ letra se preciso): `shannon1948`,
`godel1931`. Toda entrada tem `langid` (nome do babel, como `english`, `brazil`, `german`, ou etiqueta BCP 47).

| Tipo (`@…`)                                       | Campos obrigatórios                              | Outros campos aceitos                                                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `book`, `mvbook`                                  | `title`, `year`/`date`                           | `author` ou `editor` (+ `editortype`), `subtitle`, `edition`, `volume`, `volumes`, `series` + `number`, `address`/`location`, `publisher`, `translator` |
| `incollection`, `inbook` (capítulo)               | `title`, `booktitle`, `year`/`date`              | `bookauthor` ou `editor`, `booksubtitle`, `chapter`, `pages`, `edition`, `volume`, `series`, `address`, `publisher`                                     |
| `article`                                         | `title`, `journal`/`journaltitle`, `year`/`date` | `journalsubtitle`, `volume`, `number`/`issue`, `pages` **ou** `eid`, `address`, `month`                                                                 |
| `inproceedings`, `conference`                     | `title`, `booktitle`, `year`/`date`              | `eventtitle`, `eventnumber`, `eventyear`, `venue`, `editor`, `volume`, `series`, `pages`/`eid`, `address`, `publisher`                                  |
| `phdthesis`, `mastersthesis`, `thesis` (+ `type`) | `title`, `school`/`institution`, `year`          | `address`, `pagetotal` (folhas), `type` (texto da natureza)                                                                                             |
| `report`, `techreport`                            | `title`, `institution`, `year`                   | `type`, `number`, `address`                                                                                                                             |
| `online` (ou `misc` com `url`)                    | `title`, `url`, `urldate`, `year`/`date`         | `organization` (nome do site), `publisher`, `editor`, `version`                                                                                         |
| `software`                                        | `title`, `year`/`date`                           | `version`, `publisher`, `address`                                                                                                                       |

Comuns a todos: `author`, `translator`, `doi` (sem prefixo `https://doi.org/`), `url` + `urldate` (ISO
`AAAA-MM-DD`), `note`, `langid`/`language`; e os metadados ignorados `abstract`, `keywords`, `isbn`, `issn`,
`file`, `timestamp`, `owner`, `annote`, `comment`.

Combinações sem sentido são **erros explícitos**, nunca palpites: campo desconhecido (`pubisher`), `year` e
`date` juntos, `month` com `date`, `pages` e `eid` juntos, `url` sem `urldate` (NBR 6023 §6.6: “Acesso em”),
`urldate` sem `url`, `editortype` sem `editor`, `number` sem `series` num livro, `@misc` sem `url`, datas
inexistentes (`2023-02-30`), intervalos decrescentes. Todos os erros de todos os arquivos são listados de uma vez,
no formato `bibliography/main.bib:12:5: error: … [model:missing-field]`.

Datas: `year = 1948`, `year = {[1933]}` (inferida, sai entre colchetes na ABNT), `year = {1931--1958}` ou
`date = {1931/1958}` (obra em vários volumes), `date = {1948-07/1948-10}` (intervalo de meses: jul./out. 1948),
`date = {1976-06-10}` (dia, para semanários e páginas web).

Nomes:

- `Sobrenome, Prenome` ou `Prenome Sobrenome`; vários unidos por `and`; `and others` = _et al._
- Partículas minúsculas são registradas à parte (`de Saussure, Ferdinand` → família _Saussure_, partícula _de_);
  na ABNT vão depois do prenome: SAUSSURE, Ferdinand de (NBR 6023 §8.1.1, como SILVA, João da).
- Sobrenome composto: na forma `Prenome Sobrenome`, entre chaves (`Gabriel {García Márquez}`). Na forma com
  vírgula não precisa (`García Márquez, Gabriel`, `López de Mántaras, Ramón`), salvo quando o sobrenome começa
  por minúscula e não é partícula (`{da Silva}, Maria` impede que “da” seja lido como partícula).
- Entidade: o nome inteiro entre chaves duplas (`{{World Wide Web Consortium}}`).
- Prenomes por extenso quando conhecidos (NBR 6023 §8.1.1 pede padronização; o site padroniza por extenso).

Títulos: em caixa de sentença, como na catalogação; nomes próprios, siglas e títulos citados entre chaves
(`complex {Fourier} series`) — os formatadores **nunca** mudam a caixa do que está entre chaves. Subtítulo no
campo `subtitle`; na falta dele, o título é dividido no primeiro `: ` fora de chaves (heurística de recurso).

LaTeX aceito: acentos com e sem chaves (`\'e`, `{\'e}`, `{\'\i}`, `\c{c}`, `\v{s}`, `\H{o}`, `\k{a}`…), letras
especiais (`\ss`, `\o`, `\ae`, `\l`, `\aa`…), `--` e `---`, `~` (espaço inseparável), `\& \% \$ \_ \#`,
`\emph{}`/`\textit{}` (itálico preservado), `\textbf{}` etc. (conteúdo mantido). Comando desconhecido e
matemática ficam **literais** com aviso. A saída é sempre Unicode NFC (corrige `ı` + acento combinante).

## 4. Como as normas são aplicadas

### 4.1 ABNT — referências (NBR 6023:2025 = 2018 + Emenda 1)

- Entrada: SOBRENOME, Prenome; até 3 autores separados por `; `; 4 ou mais: todos (padrão, “convém”) ou o
  primeiro + _et al._ (`abntStyle({ etAl: 'first' })`) — **uma política para o site inteiro** (§8.1.1.2).
- Entidade: primeiro segmento hierárquico em maiúsculas (ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS; BRASIL.
  Ministério…). Organizadores: LEVI, G.; SCHMIDT, J. (org.).
- Sem autor: primeira palavra do título em maiúsculas (mais a seguinte se a primeira for artigo ou monossílabo):
  PEQUENA biblioteca do vinho; A FLOR e a náusea — sem destaque.
- Destaque no título da unidade bibliográfica (livro, tese; periódico; livro no `In:`; anais; nome do site);
  subtítulo nunca destacado: **Globalização**: as conseqüências humanas.
- `2. ed.`; `[S. l.]`, `[s. n.]`, `[S. l.: s. n.]`; meses do Anexo A (jan. fev. mar. abr. maio jun. jul. ago.
  set. out. nov. dez.); `p. 379-423` (hífen); `v. 27, n. 3`; localizador eletrônico no lugar das páginas
  (`e03304`; número puro como `art. 104047`); `DOI: https://doi.org/…`; por último “Disponível em: URL. Acesso
  em: 3 maio 2024.”, sem os sinais de menor e maior em volta da URL.
- Evento: _In_: NOME DO EVENTO, 16., 2004, Valencia. **Proceedings** [...] (ou **Anais** [...]).
- Tese: `2009. 82 f. Dissertação (Mestrado em …) – Unidade, Instituição, Local, 2009.`
- Ordem alfabética com `Intl.Collator('pt-BR', { numeric: true })` sobre o texto da entrada (§9.1): Ávila antes
  de Azevedo, Eça junto de Edson. Mesmo autor e ano → 1927a, 1927b atribuídos na lista ordenada e usados também nas
  chamadas (NBR 10520 §6.1.6).

### 4.2 ABNT — citações (NBR 10520:2023)

- Sobrenome em maiúsculas e minúsculas, dentro e fora dos parênteses (§6.1.1.1): (Shannon, 1948).
- 2–3 autores: (Clarac; Bonnin, 1985) / Clarac e Bonnin (1985); 4+: Maciel _et al._ (2019).
- Entidade pelo nome (ou jurisdição do órgão: Brasil, 1995); sem autor: (Anteprojeto [...], 1987, p. 55).

### 4.3 APA 7 (textos em inglês)

- Shannon, C. E. (1948). Título do artigo. _Periódico_, _27_(3–4), 379–423. https://doi.org/…
- Iniciais dos prenomes; `&` antes do último autor (até 20; 21+ = 19, reticências e o último); 3+ autores na
  chamada = _et al._ (sem itálico, §8.17); `&` entre parênteses e `and` na narrativa; títulos de obras
  independentes em itálico; primeira palavra do subtítulo em maiúscula (§6.17); sem local de publicação; editora
  ou nome do site omitido quando repete o autor (§9.24, §10.16); sem ponto depois de DOI ou URL.

## 5. Desvios e decisões (com justificativa)

1. **Destaque = negrito via `<cite>`.** A NBR 6023 §6.4 aceita negrito, itálico ou sublinhado, desde que uniforme;
   os exemplos da própria norma usam negrito, e o negrito deixa o itálico livre para latim e estrangeirismos.
   `<cite>` é o elemento HTML do título de uma obra (HTML §4.5.6) e carrega o significado para tecnologias
   assistivas; o CSS o põe em negrito na lista ABNT. Sem CSS (leitores de feed), o `<cite>` aparece em itálico —
   ainda um destaque uniforme admitido. `<strong>` (importância) e `<b>` (sem semântica) foram rejeitados.
2. **Locuções latinas em itálico com `lang="la"`** (_et al._, _In_, _[S. l.]_, _[s. n.]_): nenhuma cláusula das
   normas exige o itálico, mas é como as próprias normas são compostas; `lang` atende a WCAG 2.2, critério 3.1.2.
3. **Maiúsculas como texto, não como CSS** (`text-transform`): copiar e buscar devolvem o que se vê; o nome
   original continua nos dados estruturados (a caixa alta perde informação: McDonald → MCDONALD).
4. **Chaves em campos de nome não bloqueiam as maiúsculas da entrada** (LÓPEZ DE MÁNTARAS): nesses campos, as
   chaves agrupam palavras; a caixa original é usada nas chamadas.
5. **Partículas**: “de Saussure” → SAUSSURE, Ferdinand de e (Saussure, 1916) na ABNT; o APA mantém a partícula
   com o sobrenome, como em inglês se escreve (de Saussure, 1916).
6. **4 ou mais autores**: a lista traz todos (recomendação “convém” da §8.1.1.2), e a chamada usa _et al._ (opção
   da NBR 10520 §6.1.2), uniformemente.
7. **Localizador eletrônico numérico** recebe `art.` (104047 sozinho seria lido como página); alfanumérico sai nu
   como na norma (e03304).
8. **DOI**: a norma mostra três formas diferentes; adotamos `DOI: https://doi.org/<doi>` antes de “Disponível em”.
   No atributo `href`, caracteres que não são de URL são codificados (`<` → `%3C`, Manual do DOI §2.5.2.4); o
   texto exibido mantém o DOI como registrado.
9. **Data de acesso só com URL**, e sempre com ela (§6.6); um DOI não a substitui nem a dispensa.
10. **Informações acrescentadas no idioma do documento** (§6.5): “Disponível em”, “Acesso em”, “Tradução:”; os
    elementos essenciais ficam como no documento, e o título em outra língua leva `lang`.
11. **Textos em inglês seguem o APA 7**, não a ABNT com rótulos traduzidos (decisão de projeto: cada versão segue a
    convenção de seu público).
12. **Responsabilidades secundárias** por extenso e em ordem direta: `Tradução: Marcus Penchel.`,
    `Edição: Charles Bally e Albert Sechehaye.` (§8.1.1.6).
13. **Natureza da tese** padrão: `Tese (Doutorado)` / `Dissertação (Mestrado)` quando o `.bib` não traz `type`.
14. **Não implementados** (fora do escopo do site): sistema numérico e notas de referência (com as formas
    abreviadas em MAIÚSCULAS e _Id._, _Ibid._, _op. cit._), _apud_ automático, orientador e número de folhas como
    elementos complementares além de `pagetotal`, ISBN/ISSN (aceitos no `.bib`, não impressos — §7.7.1 os torna
    complementares), títulos traduzidos entre colchetes do APA para obras em outras línguas.

## 6. “Como citar” os textos do site e exportações

`citeSelf(obra, estilo, { siteName, url, accessed })` (`src/core/bibliography/self.ts`) formata um ensaio ou
laboratório do site como documento _online_, com o **mesmo** formatador da lista de referências. A data de
acesso é um argumento (o núcleo não tem relógio). Para um ensaio publicado em 3 de maio de 2026 e consultado
em 17 de outubro de 2026:

> TINOCO, Flavio. Amostrar é decidir: o teorema de Nyquist–Shannon. **Flavio Tinoco**, 2026. Disponível em:
> https://…/pt/ensaios/amostrar-e-decidir/. Acesso em: 17 out. 2026.

> Tinoco, F. (2026, May 3). _To sample is to decide: The Nyquist–Shannon theorem_. https://…/en/essays/to-sample-is-to-decide/

- ABNT segue o modelo “SOBRENOME, Prenome. Título: subtítulo. Nome do site, ano. Disponível em: URL. Acesso em:
  d mmm. aaaa.”, com destaque no nome do site; com `date: 'full'`, a data completa (3 maio 2026), como no
  Exemplo 10 da NBR 6023 §7.20.
- APA omite o nome do site quando ele repete o autor (§10.16), como acontece aqui.
- Chamadas (NBR 10520 e APA): (Tinoco, 2026) / Tinoco (2026).
- BibTeX (biblatex `@online`): `author`, `title`, `subtitle`, `organization`, `date`, `url`, `urldate`, `langid`.
  Palavras com maiúsculas além da inicial (siglas, nomes próprios) ficam entre chaves — no modelo e na
  exportação —, e o analisador do próprio site lê a entrada de volta e produz a mesma referência (teste de
  propriedade). O apóstrofo reto `'` é exportado como está: em BibTeX ele significa ’.

Outras exportações do núcleo (`src/core/bibliography/index.ts`):

- `toBibtex(referência)` e `toBibtexFile(referências)` (`bibtex/encode.ts`): qualquer referência do modelo como
  entrada biblatex — por exemplo, “baixar as referências desta página (.bib)” a partir de
  `frontmatter.citations`. É o inverso exato do analisador: reler a saída devolve a mesma referência, campo a
  campo, com as caixas protegidas e os itálicos (verificado em toda a bibliografia semente e nas fixtures).
- `toSchemaOrg(referência)` e `schemaCitations(referências)` (`schema-org.ts`): objetos schema.org
  (ScholarlyArticle dentro de PublicationIssue → PublicationVolume → Periodical; Book, Chapter, Thesis, Report,
  WebPage, SoftwareApplication), com `author`, `datePublished`, `identifier` (DOI) e `url`. O estágio já os
  exporta em `frontmatter.citationJsonLd`, prontos para a propriedade `citation` do JSON-LD da página.

## 7. A bibliografia semente (`bibliography/main.bib`)

Somente referências reais; cada entrada traz, em comentário, a fonte da verificação. Artigos com DOI foram
conferidos contra o registro Crossref (`api.crossref.org/works/<doi>`), campo a campo (título, periódico, volume,
número, páginas, data, autores), em 2026-10-17. Decisões registradas:

- **Shannon (1948)** saiu em duas partes (BSTJ 27(3):379–423, julho; 27(4):623–656, outubro) com um só título: é
  uma obra, logo **uma** entrada, com os dois números, os dois intervalos de páginas, o intervalo de meses
  jul./out. e o DOI da parte I.
- **Turing (1936)**: o Crossref data o volume de 1937, mas as partes 3 e 4 do volume s2-42 circularam em
  novembro e dezembro de 1936, o ano pelo qual o artigo é citado.
- **Whittaker (1915)**: o Crossref inclui o número do artigo (“XVIII.—”) no título; omitido.
- **Bridson, Hourihan e Nordenstam (2007)**: o Crossref grafa “Houriham”; o artigo e a ACM grafam Hourihan.
- **Weaver (1949)**: páginas 95–117 da 1.ª edição (1949); reimpressões posteriores põem o ensaio no início.
- **Cover e Thomas (2006)**: o registro Crossref do DOI tem data de 2005 (publicação _online_); o livro traz
  c2006, como nos catálogos.
- **Kotelnikov (1933)**: local, editora e data entre colchetes, como no catálogo da Biblioteca Estatal Russa,
  porque o folheto não os imprime (NBR 6023 §8.4.3, §8.6.1.2).
- Prenomes por extenso conforme fontes de autoridade (Crossref traz muitas vezes só iniciais).

## 8. Verificação

- `./node_modules/.bin/vitest run tests/unit/bibliography` — analisador (posições, erros acumulados, macros,
  decodificação, NFC, nomes), testes diferenciais contra `@retorquere/bibtex-parser`, exemplos da norma (ABNT e
  APA), estágio (escapes, links, chaves desconhecidas, modos, localizadores, letras de ano, dois idiomas),
  injetividade, ordenação com acentos, “como citar” e schema.org.
- A bibliografia semente é compilada a cada teste (`seed.test.ts`): nenhuma entrada pode ter erro nem aviso.
