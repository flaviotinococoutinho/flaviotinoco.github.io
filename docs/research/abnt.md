# ABNT rules for an automated bilingual scholarly blog: research report (checked 2026-10-11)

Confidence: **H** means verified in the norm text itself or another primary text read in this session. **M** means a secondary source, an inference, or observed typesetting with no explicit clause behind it. **L** means unverified. Source keys such as [A] and [B] are expanded in §5.

## 0. Current editions as of 2026-10-11

| Norm | Edition in force | Date | Notes |
|---|---|---|---|
| NBR 10520 (citações) | 2nd ed. | 19.07.2023 | Replaces the 2002 edition. Full text read [A]. H |
| NBR 6023 (referências) | **3rd ed.** | **21.05.2025** | Equals NBR 6023:2018 plus Emenda 1 (preface: "equivale ao conjunto ABNT NBR 6023:2018 e Emenda 1"). Full text read [B]. H |
| NBR 14724 (trabalhos acadêmicos) | 4th ed. | 16.12.2024 | Replaces the 2011 edition. Full text read [E]. Blogs claim a "versão corrigida 01/04/2025"; I could not confirm it (L). |
| NBR 6022 (artigo) | 2nd ed. | 2018 | Only a UFMG summary was available [H]. M |
| NBR 6024 (numeração progressiva) | 2nd ed. | 2012 | Confirmed by ABNT 08/2022 (per a vendor page). Full text read [F]. H |
| NBR 6028 (resumo) | 2nd ed. | 18.05.2021 | Full text read [G]. H |
| NBR 5892 (datas e horas) | 2nd ed. | 28.11.2019 | Confirmed 03/2024. Full text read [I]. H |
| SI and units (Brazil) | BIPM SI 9th ed. (pt) + Quadro Geral de Unidades de Medida (QGUM), Portaria Inmetro 615/2023 | — | [J]. H |
| Acordo Ortográfico 1990 | — | mandatory in Brazil since 2016 | Text read [K]. H |

Searches found no 2025–2026 edition or amendment of NBR 10520, 14724, 6022, 6024, 6027 or 6028. I did not query the ABNT catalogue directly, so confidence is M.

The norm texts were read from copies hosted by institutions. The official source is ABNT / Target GEDWeb.

## 1. Key changes a formatter must get right

1. **NBR 10520:2023, §6.1.1.1–6.1.1.2: author names are upper/lowercase inside and outside parentheses.**
   - Persons: (Souza, 2015), not (SOUZA, 2015). The 2002 edition required UPPERCASE inside parentheses.
   - Corporate authors: (Organização Mundial da Saúde, 2010, p. xi).
   - Acronyms are "recomendado" in capitals: (IBGE, 2011, p. 3).
   - Exception: the *notes* system (§8.1.2) still uses UPPERCASE short forms, for example `8 MINAYO, 2021, p. 9.`
2. **Works without author (§6.1.1.4)** use the first word of the title in mixed case followed by `[...]`: (Anteprojeto [...], 1987, p. 55). If the title starts with an article or a monosyllable, keep that word plus the next one: (A flor [...], 1995, p. 4), (Nos canaviais [...], 1995, p. 12). A one-word title is cited whole: (Inglês, 2012, p. 7).
3. **Final period (§5.2, §7.1.2):** "O ponto final deve ser usado para encerrar a frase e não a citação." The period goes after the call: “...” (Clarac; Bonnin, 1985, p. 72). A Zeppelini blog post says the opposite; the norm text wins.
4. **Long quotes (§7.1.1):** "recuo padronizado ... Recomenda-se o recuo de 4 cm." The 4 cm indent is now a recommendation, not mandatory.
5. **Added emphasis and translation (§7.1.5–7.1.6):** only "grifo nosso" / "grifo próprio" and "tradução nossa" / "tradução própria", placed last in the call. "Grifo do autor" is no longer needed. "Destaque nosso" does not appear in the norm.
6. **Latin terms:** et al., apud, Id., Ibid., op. cit., loc. cit., passim, Cf. and et seq. are **typeset in italics in NBR 10520:2023 itself**, and *In:*, *et al.*, *[S. l.]*, *[s. n.]* and *ca.* in NBR 6023:2025. I verified this from the PDF fonts. **No clause in either norm requires italics.**
7. **NBR 6023:2025 changes:**
   - ISSN becomes complementary (§7.7.1, §7.7.3).
   - Supplements and special issues go after the date (§7.7.4).
   - e-location is accepted in place of pages, e.g. `v. 52, e03304, 2018` (§7.7.6).
   - Event city is now "se houver" (§7.8.1, §7.8.4).
   - Jurisprudence adds "julgado em d mmm. aaaa" (§7.11.3).
   - The structure is otherwise unchanged.
   - The repeated-author underscore line (`______.`) was removed in 2018 and does not appear in 2025.

## 2. (a) Rules table

"Auto" is yes / partially / no. Regexes R1–R21 are in §2.1 (JavaScript, `u` flag).

### 2a. NBR 10520:2023 — citations [A]

| ID | Norm § | Rule | Example | Auto | Detection / application | Conf |
|---|---|---|---|---|---|---|
| CIT-01 | 5.1 | Every citation must be traceable to the reference list or to a note. References follow NBR 6023. | “[...]” (Silva, 2019, p. 1) ↔ SILVA, Antônio Augusto Moura da. ... | yes | Key = normalized surname(s) + year + letter. Match parsed calls (R1) against the bibliography index; report orphans in both directions. | H |
| CIT-02 | 5.2, 7.1.2 | The period ends the sentence, not the quotation: it goes after the closing quote **and** after the call. | “Não se mova, faça de conta que está morta” (Clarac; Bonnin, 1985, p. 72). | yes | R3 moves `.”(call)` to `”(call).`. Keep ? and ! that belong to the quoted text. | H |
| CIT-03 | 5.2 a–c | Omission `[...]`; interpolation or comment `[ ]`; emphasis by underline, bold or italic. | “as [verdadeiras] histórias”; “natureza [...]” | partially | R4 normalizes `(...)`, `(…)` and `[…]` to `[...]` inside quotes. | H |
| CIT-04 | 5.3, 7.1.7 | Unpublished data (talks, speeches, communications, interviews) goes in the text or a note and generates no reference. Interviewees may be anonymized. | (Entrevistado A); ¹ Discurso proferido no auditório da ABNT, em 21 de março de 2019. | partially | Source type "personal communication" or unpublished interview: exclude from the list and force a note. | H |
| CIT-05 | 5.4 | Documents in preparation: state the fact and give data in a note. | ¹ Projeto da ABNT NBR 6029, a ser publicada pela ABNT. | no | Manual flag. | H |
| CIT-06 | 6 | One call system only (author-date **or** numeric), used consistently. | — | yes | Error if both R1-style and numeric calls appear in one document. | H |
| CIT-07 | 6.1.1.1 | Person: surname in upper/lowercase. | (Derrida, 1967, p. 293); Authier-Revuz (1982) | yes | R5 flags ALL-CAPS author tokens in calls unless they are in the acronym lexicon. | H |
| CIT-08 | 6.1.1.2 | Corporate author: full name or acronym in upper/lowercase; acronyms recommended in capitals. | (Organização Mundial da Saúde, 2010, p. xi); (IBGE, 2011, p. 3) | partially | Corporate lexicon (full name ↔ acronym). The call must still match the list entry (CIT-01). | H |
| CIT-09 | 6.1.1.3 | Direct-administration government body: cite by jurisdiction. | (Brasil, 1995) ↔ BRASIL. Ministério da Administração Federal ... | yes | If the list entry is `JURISDIÇÃO. Órgão.`, use the jurisdiction. | H |
| CIT-10 | 6.1.1.4 | No author: one-word title = the word; otherwise first word + `[...]`; initial article or monosyllable = it + next word + `[...]`. Mixed case. | (Inglês, 2012, p. 7); (Anteprojeto [...], 1987, p. 55); (A flor [...], 1995, p. 4); (Nos canaviais [...], 1995, p. 12) | yes | Needs an article/monosyllable lexicon per language (L8). | H |
| CIT-11 | 6.1.2 | 4+ authors: the first author + *et al.* is allowed (the reference may still list all). The chosen option must be uniform across the document. | Maciel *et al.* (2019, p. 163) / Maciel, Brum, Del Bianco e Costa (2019, p. 163) | yes | Config `etal_min=4`; lint mixed usage. | H |
| CIT-12 | 6.1.3–6.1.8 (examples) | 1–3 authors: all named. Inside parentheses, separate with "; ". In running text, use ", " and " e ". | (Clarac; Bonnin, 1985, p. 72); (Cruz; Correa; Costa, 1998); Oliveira e Leonardos (1943, p. 146) | yes | Template. | H |
| CIT-13 | 6.1.3 | Parenthetical call: responsibility + date. Direct quotes add page or locator after the date if one exists. | (Lopes, 2000, p. 225); (Santos, 2005) for an unpaginated source | yes | R6 warns on a direct quote whose call has no locator, unless the source is flagged unpaginated. | H |
| CIT-14 | 6.1.4 | Narrative call: date (and locator) in parentheses right after the name. | Bobbio (1995, p. 30) | yes | Template. | H |
| CIT-15 | 6.1.5 | Same surname and year, different people: add initials; if still ambiguous, full forenames. | (Barbosa, C., 1958); (Barbosa, Cássio, 1965); C. Barbosa (1958) | yes | Group the bibliography by (surname, year) with different given names. | H |
| CIT-16 | 6.1.6 | Same author and year: lowercase letter after the year, no space, following reference-list order. | (Reeside, 1927b); (Brasil, 2005a) | yes | Assign letters on the sorted list; apply to the list and to calls. | H |
| CIT-17 | 6.1.7 | Same author, several years in one call: chronological, separated by commas. | (Dreyfuss, 1989, 1991, 1995) | yes | Sort the cluster. | H |
| CIT-18 | 6.1.8 | Several authors in one call: separated by "; ", alphabetical order recommended. | (Cross, 1984; Knox, 1986; Mezirow, 1991) | yes | `Intl.Collator('pt-BR')` | H |
| CIT-19 | 6.2.1–6.2.3 | Numeric system: consecutive arabic numbers, never restarted per page; a repeated source keeps its number; in parentheses or superscript; **cannot be combined with notes**. | (15, p. 34) / “...”¹⁵, p. 34 | yes | — | H |
| CIT-20 | 6.2.4, 7.1.3, 7.1.4 | Locators: lowercase `p.`; `local.` for e-books; volume, tomo or section before the page; **never volume or number for periodicals**; unpaginated sources give the location as in the document. | (Assis, 1994, v. 3, p. 583); (Dongo-Montoya, 2009, local. 264); (Brasil, 1998, cap. V, art. 49, inc. I); (Cidade [...], 2002, 9 min 41 s) | partially | Locator grammar R7. | H |
| CIT-21 | 7.1 | Direct quote up to 3 lines: double quotes; a quote inside a quote uses single quotes. | “[...] da mesma ‘arte de conversação’ [...]” | yes | R8: stack-based normalizer to “ ” / ‘ ’. | H |
| CIT-22 | 7.1.1 | More than 3 lines: standardized left indent (4 cm recommended), smaller font, single spacing, no quotes. Call after the text, period after the call. | ... sinal de áudio pode ser emitido em um salão de qualquer dimensão (Nichols, 1993, p. 181). | partially | "3 lines" depends on layout. Use a character proxy (for example over about 260 characters, configurable), then `<blockquote>`, strip outer quotes, and turn inner “ ” into ‘ ’ (Embrapa practice). | H (rule), M (proxy) |
| CIT-23 | 7.1.5 | Added emphasis: "grifo nosso" or "grifo próprio" as the last element. If the original already had the emphasis, write nothing. | (Souto, 1916, p. 46, grifo nosso) | yes | Quote AST flag `emphasisAdded`; lint "grifo do autor". | H |
| CIT-24 | 7.1.6 | Own translation: "tradução nossa" or "tradução própria" last. Order when combined: locator, then tradução, then grifo. | Brody e Harnad (2004, slide 2, tradução nossa, grifo nosso) | yes | Trigger when `source.lang` ≠ `text.lang` and the quote is translated. | H |
| CIT-25 | 7.2 | Indirect citation: page or location is optional. | (Gonçalves, 2019) | yes | — | H |
| CIT-26 | 7.3, 8.1.3 | Citation of a citation: original author, date, page, then *apud*, then consulted author, date, page. **List only the consulted source.** No comma before *apud*. | (Assis, 1997 *apud* Canuto, 1999, p. 6); Freire (1994, p. 13 *apud* Streck; Redin; Zitkoski, 2017, p. 25) | yes | R9; lint that the original work is absent from the list. | H |
| CIT-27 | 8 | Notes: sequential arabic numbers, never restarted per page. Placed in the footer, margin or end. From the 2nd line, aligned under the first letter; no blank between notes; smaller font. Hyperlinks allowed in digital documents. | — | yes | CSS hanging indent. | H |
| CIT-28 | 8.1.1–8.1.2.1 | Reference notes: full reference at first occurrence. Later notes use a short form in **UPPERCASE**, or `AUTOR, ref. N, p.`. | 8 MINAYO, 2021, p. 9. / 20 FARIA, ref. 8, p. 15. | yes | The notes-mode renderer differs from author-date. | H |
| CIT-29 | 8.1.2.2 | *Id.*, *Ibid.*, *op. cit.*, *loc. cit.*, *passim*, *Cf.*, *et seq.* Id., Ibid., op. cit. and loc. cit. only on the same page or folio as the referenced note. | 9 *Id.*, 2006, p. 12. / 16 *Ibid.*, p. 52. / 27 MINAYO, *op. cit.*, p. 23. | partially | The web has no fixed pages. Treat "page" as the same note block, or disable Latin short forms. | H |
| CIT-30 | 8.2 | Explanatory notes numbered consecutively (restart per chapter recommended). Avoid mixing with reference notes; if mixed, reference-note rules apply. | — | yes | — | H |
| CIT-31 | typesetting (no clause) | Latin set in italics in the norm itself: *et al.*, *apud*, *Id.*, *Ibid.*, *op. cit.*, *loc. cit.*, *passim*, *Cf.*, *et seq.* Example foreign words are also italic (*blended learning*, *caput*, *slide*, *hyperlink*). | Fiorotti *et al.*, 2010 | yes | Closed Latin lexicon (L3) rendered as `<i lang="la">`. | H (observed), M (normative) |

### 2b. NBR 6023:2025 — references [B], [C], [D]

| ID | Norm § | Rule | Example | Auto | Detection / application | Conf |
|---|---|---|---|---|---|---|
| REF-01 | 6.3 | Single spacing, **left-aligned (not justified)**, one blank single-spaced line between references. In footnotes, from the 2nd line aligned under the first letter. | — | yes | CSS `text-align:left`; `margin-block-end:1lh` | H |
| REF-02 | 6.4, 6.7, 6.8 | Uniform punctuation. One single list. The same highlight (bold, italic **or** underline) for every title. Complementary elements, if used, appear in all references of that type. | — | yes | Single style switch `title_emphasis`. | H |
| REF-03 | 6.5 | Essential elements reflect the document: spelling, language and case are kept as they appear. Added information (notes, "Disponível em", "Acesso em", "Tradução:") follows the language of the **text being written**. | Globalização: as conseqüências humanas (pre-1990 trema kept) | partially | **Never auto-correct titles.** Labels are chosen by output language. | H |
| REF-04 | 6.6, 8.13, 6.6 NOTA | Online documents: `Disponível em:` + URL, then `Acesso em:` + date, as the **last** elements. The only exception is messages without an address. A DOI does not replace them. | ... DOI: https://doi.org/... Disponível em: https://... Acesso em: 7 abr. 2023. | yes | Require `accessed` whenever there is a URL. | H |
| REF-05 | 6.7, 8.2.1, 8.1.4 | Entry by title: first word in UPPERCASE, plus the next word if the title starts with an article or monosyllable. **No title highlight.** Never "Anônimo" or "Autor desconhecido". | PEQUENA biblioteca do vinho. / OS GRANDES clássicos ... / A GAME of Thrones ... | yes | Lexicon L8. | H |
| REF-06 | 8.1.1, 8.1.1.1 | Person: last surname in UPPERCASE, comma, forenames full or abbreviated as in the document (standardize per author). Authors separated by "; ". Up to 3 authors: all of them. | SOUZA, J. C.; PEREIRA, A. M. | yes | Name algorithm (§3.2). | H |
| REF-07 | 8.1.1.2 | 4+ authors: listing all is recommended ("convém"); the first + *et al.* is allowed. | URANI, A. *et al.* / TAYLOR, Robert; LEVINE, Denis; MARCELLIN-LITTLE, Denis; MILLIS, Darryl. | yes | Config. | H |
| REF-08 | 8.1.1.3 | Hispanic, kinship, compound and prefixed surnames. | GARCÍA MÁRQUEZ, Gabriel; ASSAF NETO, Alexandre; SAINT-ARNAUD, Yves; ESPÍRITO SANTO, Miguel Frederico de; D’AMBROSIO, Ubiratan; LA TORRE, Massimo; O’CONNOR, Colin; DE LUCCA, Gabriella | partially | Lexicons L6 (particles) and L7 (kinship). Hispanic names need a structured `family` field; never re-split it. | H |
| REF-09 | 8.1.1 (examples); [A] 5.1 | Portuguese particles go **after** the forename. | SILVA, Antônio Augusto Moura da; AGUIAR, André Andrade de; LIMA, I. N. de | yes | Append the dropping particle to the given name. | H |
| REF-10 | 8.1.1.4 | Responsible for a collection: abbreviation in lowercase, singular, in parentheses after the last name. | FERREIRA, Léslie Piccolotto (org.). / MARCONDES, E.; LIMA, I. N. de (coord.). | yes | `editor-role` field: org., ed., coord., comp. | H |
| REF-11 | 8.1.1.6, 8.11.1 | Other contributors after the title, in direct order. Original title in a note. | Tradução: Marcus Penchel. / Orientador: Mario Ferreira Junior. / Título original: Globalization: the human consequences. | yes | — | H |
| REF-12 | 8.1.2–8.1.2.5 | Corporate author as known or as highlighted in the document. Direct administration: `JURISDIÇÃO. Órgão.` Homonyms take a qualifier. | BRASIL. Ministério da Justiça. / SÃO PAULO (Estado). / RIO DE JANEIRO (Município). / VIÇOSA (MG). / BIBLIOTECA NACIONAL (Brasil). | partially | Corporate authority file (L5). Only the first segment is uppercased; the qualifier is not. | H |
| REF-13 | 8.1.3 | Event: name in CAPITALS, number (arabic + period), year, city. Several events joined by "; ". | SIMPÓSIO BRASILEIRO DE BANCO DE DADOS, 9., 1994, São Paulo. | yes | — | H |
| REF-14 | 8.2 | Title and subtitle as in the document, separated by ": ". **The highlight covers only the title proper; the subtitle stays plain** (verified from fonts). | **Globalização**: as conseqüências humanas | yes | Prefer an explicit subtitle field. Splitting at the first ": " is only a fallback heuristic. | H |
| REF-15 | 8.2.2–8.2.7 | Long titles truncated with `[...]`. Multilingual titles joined by " = ". Abbreviated periodical title only if it appears in the publication. Missing title becomes `[título atribuído]`; artworks `[Sem título]`. | ARTE de furtar [...]. / Ci. Inf. | partially | — | H |
| REF-16 | 8.3 | Edition: ordinal abbreviation + "ed." **in the document's language**. Emendations abbreviated. A software version counts as the edition. | 4. ed. / 5th ed. / 3. ed. rev. e aum. / Version 1.0A | yes | Ordinal table by language. | H |
| REF-17 | 8.4 | Place: city as in the document. Homonymous cities add state or country. Several places: the first or most prominent. Inferred place in brackets. Unknown: `[S. l.]`, with capital S when it opens the imprint. | Viçosa, MG / [São Paulo] / [S. l.]: Scritta | yes | Gazetteer L14. | H |
| REF-18 | 8.5 | Publisher as in the document, dropping legal-form words. Two publishers in different places: "; ". Same place: ":". Three or more: the first or prominent one. An author-publisher may be abbreviated. Unknown: `[s. n.]`; both unknown: `[S. l.: s. n.]`. | São Paulo: Editora Atlas / Rio de Janeiro: Elsevier: Campus / Brasília, DF: [s. n.] | yes | Legal-form lexicon (S.A., Ltda., Inc., GmbH ...). | H |
| REF-19 | 8.6.1 | Year in arabic numerals; copyright as `c1993`; estimates in brackets; multi-volume spans; open-ended periodicals. | [1969?] [1973] [ca. 1960] [197-] [197-?] [18--] [entre 1906 e 1912] / 1926-1940 / 1985- . | yes | From CSL `issued.circa` or `literal`. | H |
| REF-20 | 8.6.2, Anexo A | Month abbreviated per Anexo A **in the publication's language**. "maio" is never abbreviated. Ranges use "/". Seasons as in the document. Semesters as "2. sem.". | mar. 2019 / jan./abr. 2014 / Oct. 1982 / Spring/Summer 1985 | yes | Month tables L9. | H |
| REF-21 | 8.6.3 | Day as an arabic number (no leading zero) before the month. Optional time after the date. | 6 abr. 2023 / 19 jun. 2013, 23:09 | yes | — | H |
| REF-22 | 8.7 | Physical description: p., f., v., il., cm. Parts: first and last page joined by a **hyphen**. Electronic: E-book, CD-ROM, `1 vídeo (4 min)`, Podcast. Social media: `Rede: @perfil`. | 182 p. / 82 f. / p. 7-16 / Twitter: @redescielo / X: @valorinveste | yes | — | H |
| REF-23 | 8.10 | Series in parentheses, with the number after a comma. | (Princípios, 243) / (Texto para discussão, n. 31) | yes | — | H |
| REF-24 | 8.11 | Notes at the end, in Portuguese, without highlight. ORCID allowed. | Inclui bibliografia. / ORCID: 0000-... | yes | — | H |
| REF-25 | 9, 9.1, 9.2 | Order: alphabetical by entry element (numerals in ascending order), **or** numeric by first citation. Must match the NBR 10520 system in use. | BRASIL. Lei nº 9.979 ... comes before BRASIL. Lei nº 12.384 ... | yes | `Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'})` over the rendered entry. | H |
| REF-26 | (2018+) | Repeat the author's name every time. The `______.` line is gone. | SANTOS, F. R. A colonização ... In: SANTOS, F. R. História do Amapá ... | yes | Lint `/_{3,}\./u` | H |
| REF-27 | 7.3 | Part of a monograph: part author and title, *In:* (or "Separata de:"), the full host reference, then the part's physical description at the end. | ... In: LEVI, G.; SCHMIDT, J. (org.). **História dos jovens 2**: a época contemporânea. ... 1996. p. 7-16. | yes | — | H |
| REF-28 | 7.7.5–7.7.6 | Article: author, title, **periodical**, place, year/volume, number, pages (or e-location), date. Online articles add DOI (if any) and availability. | ... **Cadernos de Saúde Pública**, Rio de Janeiro, v. 35, n. 3, p. 1-3, mar. 2019. | yes | — | H |
| REF-29 | 7.7.6 (2025) | e-location accepted in the page position, without "p.". | v. 52, e03304, 2018. | yes | CSL `number` / biblatex `eid` | H |
| REF-30 | 7.7.1, 7.7.3 (2025) | ISSN is complementary, not essential. | REVISTA BRASILEIRA DE GEOGRAFIA. Rio de Janeiro: IBGE, 1939- . | yes | — | H |
| REF-31 | 7.7.4 (2025) | Supplements and special issues go after the date (mandatory when indicated). | ... v. 7, 1983. Suplemento: Mão-de-obra e previdência. | yes | — | H |
| REF-32 | 7.8.1, 7.8.4 (2025) | Event city only "se houver". | — | yes | — | H |
| REF-33 | 7.11.3 (2025) | Jurisprudence: ... `Relator: X, julgado em d mmm. aaaa.` + publication data. | Relatora: Min. Ellen Gracie, julgado em 29 nov. 2005. | yes | — | H |
| REF-34 | 7.1.2 | Academic work: author, **title**, deposit year, type (degree + course), unit, institution, place, defense year. Advisor and number of leaves are complementary. | ... 2009. Tese (Doutorado em Cardiologia) – Faculdade de Medicina, Universidade de São Paulo, São Paulo, 2009. | yes | — | H |
| REF-35 | 7.20 | Online-only documents (sites, software, databases, social media, blogs): author, title, version, place, date, physical description, then availability. | APPLE. **OS X El Capitan**. Versão 10.11.6. [Cupertino], c2017. 1 CD-ROM. | yes | — | H |
| REF-36 | typesetting | Italic in the norm's own examples: *In:*, *et al.*, *[S. l.]*, *[s. n.]*, *ca.* and foreign words (*online*, *e-book*, *e-mail*, *pen drive*, *Podcast*, *proceedings*). Titles are bold. | — | yes | — | H (observed) |
| REF-37 | examples | DOI form is **not** standardized: the norm shows `10.1596/...`, `http://dx.doi.org/...` and `https://doi.org/...`. Recommendation: `DOI: https://doi.org/<doi>` placed before "Disponível em". | — | yes | R10 | H (inconsistency), M (recommendation) |

### 2c. NBR 14724:2024 [E], NBR 6024:2012 [F], NBR 6028:2021 [G], NBR 6022:2018 [H]

| ID | Norm § | Rule | Example | Auto | Detection / application | Conf |
|---|---|---|---|---|---|---|
| ACAD-01 | 14724 5.1 | Black text (colour only in illustrations). A4. Front-side margins: left and top 3 cm, right and bottom 2 cm (mirrored on the back). Font size 12 **recommended**. Long quotes, footnotes, page numbers, catalogue data, and sources and legends of figures and tables use a smaller, uniform size. | — | yes (print CSS) | `@page` | H |
| ACAD-02 | 14724 5.2 | 1.5 line spacing. Single spacing for long quotes, footnotes, references, titles, sources and legends of illustrations and tables, and the "natureza" block. References separated by one blank single-spaced line. | — | yes | — | H |
| ACAD-03 | 14724 5.2.1 | Footnotes inside the margins, separated by single spacing and a 5 cm rule; hanging alignment; smaller font. | — | yes | — | H |
| ACAD-04 | 14724 5.2.2–5.2.3 | Section number, one space, title, left-aligned. Primary sections start on a new page (odd page if double-sided). Unnumbered titles are centred. | 1 INTRODUÇÃO | yes | — | H |
| ACAD-05 | 14724 4.2.2 | "O trabalho acadêmico não pode ser dividido em capítulos; deve ser organizado em seções." | — | partially | Lint "Capítulo". | H |
| ACAD-06 | 14724 5.6 | Acronyms: at first mention, full name followed by the acronym in parentheses. | Associação Brasileira de Normas Técnicas (ABNT) | yes | R11 first-occurrence tracker + L4. | H |
| ACAD-07 | 14724 5.7 | Equations displayed; if needed, numbered with arabic numerals in parentheses, aligned right. Later references may use only the number. | x² + y² = z²   (1) | yes | LaTeX `equation` (amsmath numbers on the right by default); MathML + CSS on the web. | H |
| ACAD-08 | 14724 5.8 | Illustration: designative word, number, **travessão**, title, placed above. Immediately below: Fonte (per NBR 10520), legend, notes. Own work: "elaborado pelo próprio autor" or "elaboração própria". Cited in the text and placed near it. | Gráfico 1 – Quantidade de alunos por curso / Fonte: elaborado pela própria autora. | yes | Figure AST (caption on top, source at bottom); R12. | H |
| ACAD-09 | 14724 5.9 | Tables follow the IBGE tabular norms; source per NBR 10520; own work "elaborada pelo próprio autor". | Tabela 1 — Perfil socioeconômico ... | partially | IBGE sinais convencionais ("-", "..", "...", "x", "0,0") come from memory and were not verified in this session. | H (rule), L (IBGE details) |
| ACAD-10 | 14724 4.2.1.9–4.2.1.11 | Lists of illustrations and tables: "Quadro 1 — Título ..... page". List of abbreviations and acronyms in alphabetical order. | ABNT  Associação Brasileira de Normas Técnicas | yes | Generated. | H |
| ACAD-11 | 14724 4.2.3.3–4.2.3.4 | `APÊNDICE A — TÍTULO` / `ANEXO A — TÍTULO`; double letters after Z; same highlight as primary sections. | APÊNDICE A — AVALIAÇÃO NUMÉRICA ... | yes | — | H |
| ACAD-12 | 14724 5.4 | Progressive numbering per NBR 6024. Hierarchical highlight identical in the summary and the text. | — | yes | — | H |
| SEC-01 | 6024 4.1 a,b,f,g | Arabic numerals, at most 5 levels (down to quinária). Primary sections are integers from 1; subsections 1.1, 1.1.1, and so on. | 2.1.1.1.1 | yes | R13 (depth > 5 is an error). | H |
| SEC-02 | 6024 4.1 c,d | Number, one space, title, left-aligned. **No period, hyphen, dash, parenthesis or other sign** between number and title. Text starts on the next line. | "2.1 Método" (not "2.1. Método" or "2.1 – Método") | yes | R13 | H |
| SEC-03 | 6024 4.1 e | Every section must contain text. | — | yes | Empty-section lint. | H |
| SEC-04 | 6024 4.1 h,j | Unnumbered, centred pre- and post-textual titles. Hierarchical typographic highlight from primary to quinary (capitals, bold, italic, underline). | — | yes | — | H |
| SEC-05 | 6024 4.2 | Alíneas: intro text ends with ":"; `a)` lowercase letter + parenthesis, indented; item text starts lowercase and ends with ";", the last ends with "." (or ":" before subalíneas). | a) ...; b) .... | yes | R14 | H |
| SEC-06 | 6024 4.3 | Subalíneas start with **travessão + space**, indented, lowercase, ending ";" with "." on the last. | — texto; | yes | — | H |
| SEC-07 | 6024 4.4 | Cross-references in text. | ... na seção 3 ... / ... ver 3.3 ... / Na alínea a, da seção 3.2 | partially | — | H |
| ABS-01 | 6028 4.1.2–4.1.4 | Single paragraph, concise sentences, no list of topics. Informative abstract recommended. Third-person verb ("convém"). | — | partially | Paragraph count = 1; no list markup. | H |
| ABS-02 | 6028 4.1.7 | "Palavras-chave:" right below the abstract; keywords "separadas entre si por ponto e vírgula e finalizadas por ponto"; lowercase initials except proper nouns and scientific names. The 2003 edition used "." as separator. | Palavras-chave: gestação; cuidado pré-natal; *Aedes aegypti*; IBGE; Brasil. | yes | R15 + proper-noun, acronym and taxon lexicons. | H |
| ABS-03 | 6028 4.1.8 | Length ("convém"): 150–500 words for academic works and technical reports; 100–250 for journal articles; 50–100 for other documents. | — | yes | Word count by document type. | H |
| ABS-04 | 6028 4.1.5–4.1.6 | The reference precedes the abstract when the abstract is published separately; optional when inside the document. | — | yes | — | H |
| ART-01 | 6022:2018 (via UFMG) | Mandatory pre-textual elements: title (and subtitle) in the text's language; author(s) with short bio, affiliation and e-mail; abstract in the text's language; submission and approval dates (day, month, year). Optional: title and abstract in another language; identification and availability (DOI). | — | yes | Front-matter schema. | M |
| ART-02 | 6022:2018 (via UFMG) | Textual: introdução, desenvolvimento, considerações finais. Post-textual: referências (mandatory); glossário, apêndice, anexo, agradecimentos (optional). Font 12 and single spacing recommended. | — | partially | — | M |

### 2d. Dates, orthography and web typography [I], [J], [K], [L], [M], [N], [O]

| ID | Source | Rule | Example | Auto | Detection / application | Conf |
|---|---|---|---|---|---|---|
| DATE-01 | 5892 3.1–3.1.3 | Order day, month, year. Numeric dates are **separated by periods without spaces**. Month written in full, as a number, or as 3 lowercase letters + period ("maio" always in full). 4-digit year. | 4 de abril de 2018 / 04.04.2018 / 4 abr. 2018 | yes | R16 | H |
| DATE-02 | 5892 3.2 | Times: `8 h 21 min 32 s` or digital `08:21:32`. | — | yes | — | H |
| DATE-03 | 5892 3.3.2–3.3.3; AO Base XIX 1.º b | Weekdays, months and seasons in lowercase. Weekday abbreviations dom., seg. or 2ª feira. Centuries in roman numerals after the noun (século XX), but **arabic numerals inside references**. | — | yes | — | H |
| TYP-01 | AO Base XIX 1.º c, 2.º f | Book titles in running text: first word capitalized, the rest optionally lowercase except proper names, "tudo em grifo" (italic). Periodical titles capitalized and "retêm o itálico". | *Menino de engenho*; *O Estado de S. Paulo* | partially | Needs work-title recognition, for example by linking to the bibliography. | H |
| TYP-02 | AO Base XIX | Capitals for personal names, place names, institutions and festivals. Lowercase for months, days, seasons and cardinal points (capitalized when used absolutely: Nordeste). | — | partially | Gazetteer and name lexicons. | H |
| TYP-03 | AO Base I 6.º | Prefer vernacular forms of foreign place names. | Munique (München), Zurique, Genebra, Milão, Antuérpia | partially | Exonym map (L10). | H |
| TYP-04 | AO Base I 2.º–3.º | k, w, y and foreign diacritics are kept in foreign proper names and their derivatives. | darwinismo, mülleriano, shakespeariano | yes | Do not "correct". | H |
| TYP-05 | MRPR 2018 vs Senado, Embrapa, FUNAG | Foreign words. MRPR 3rd ed.: "palavras estrangeiras devem ser grafadas em itálico". Senado and Embrapa: italic only if **not** registered in VOLP or the reference dictionaries (blog, software, e-mail, marketing stay roman). FUNAG italicizes *e-mail*, *site*, *show*. All prefer a Portuguese equivalent when one exists. | *cluster*, *spread* (all sources) | partially | Portuguese lexicon + VOLP foreign list + policy switch. | M (sources conflict) |
| TYP-06 | ABNT typesetting vs Embrapa vs FUNAG/MRPR | Latin. ABNT norms italicize et al., apud, Id., In:, [S. l.]. FUNAG and MRPR italicize (*mutatis mutandis*, *ex officio*). **Embrapa: do not italicize Latin** (in vitro, in situ, a priori). | — | yes | Closed Latin lexicon + policy. | M (sources conflict) |
| TYP-07 | Senado, FUNAG, Embrapa | Names of foreign institutions, companies and brands: not italic, capitalized. | Federal Reserve; Apple; International Center for Tropical Agriculture | yes | Organization lexicon. | H |
| TYP-08 | Senado (siglas); ABNT examples | Acronyms: up to 3 letters all caps (ONU, USP); spelled letter by letter all caps (BNDES, INSS); more than 3 letters and pronounceable, initial capital only (Petrobras, Unesco; ABNT uses "Senac" and "Inmetro"); mixed (ICMBio); established forms (CNPq, UnB). Plural with "s" and no apostrophe (CPIs). No periods (EUA). | — | partially | Acronym lexicon with canonical form (L4). | H |
| TYP-09 | 10520 7.1; Senado; Embrapa | Curly quotes “ ” first level, ‘ ’ nested. Senado: period inside only when the whole sentence is quoted. ABNT: the period goes after the call. | — | yes | R8 | H |
| TYP-10 | Senado; 6024 4.3 | Travessão (—) for interpolated clauses, dialogue and subalíneas. It must not be replaced by a hyphen or meia-risca. Spaced in the Senado examples. | A restrição — temporária — é tratada ... | yes | R17 | H |
| TYP-11 | Embrapa; NBR 6023 examples | Meia-risca (–) for compact ranges, no spaces (Embrapa). ABNT references use a **hyphen** for page ranges (p. 15-24) and an en dash in the thesis line (`) – Faculdade`). | 8–15 animais (tables) / p. 15-24 | yes | Context-dependent. | M |
| TYP-12 | SI 5.4.4; QGUM 3.5 vs Embrapa | Decimal comma; leading zero (0,234). Digit grouping: **technical/scientific texts use small spaces, never points**; fiscal, legal and commercial texts use points. Embrapa and the ABNT examples use points. Years are never grouped. | 43 279,168 29 (SI) / 1.234,56 (Embrapa) | yes | R18 + policy (U+202F for grouping). | H per source; sources conflict |
| TYP-13 | SI vs Embrapa | Percent: SI/Inmetro "deve inserir-se um espaço" (25 %). Embrapa: no space (25%). NBR 10520 example: (66,2%). | — | yes | Policy. | sources conflict |
| TYP-14 | SI 5.4.3; QGUM 3.4.1 | Always a space between value and unit symbol, including °C. No space for angle °, ′, ″. Symbols upright and invariant (no period, no plural "s"). | 21 cm / 30,2 °C / 22° 7′ 33″ / 90 min | yes | R19 with unit lexicon (L11). | H |
| TYP-15 | Embrapa; NBR 5892 example | Ordinals º and ª (U+00BA, U+00AA), no period, no space. First day of a month is ordinal: 1º de maio. **Do not use the degree sign ° as an ordinal.** NBR 6023:2025 ("Súmula n° 333") and NBR 14724:2024 ("2° semestre") themselves misuse it. | 22º / 1ª edição / 2ª feira | yes | R20 | M |
| TYP-16 | Embrapa | Currency symbol before the value, with a space. | R$ 48,20 | yes | — | M |
| TYP-17 | Embrapa (style, not ABNT) | Cardinals 0–10 in words, 11 and up in digits; a sentence never starts with a digit. | — | partially | — | M |
| TYP-18 | Embrapa; NBR 6028 and 6023 examples | Scientific (taxonomic) names in italics; ranks above genus in roman type. | *Aedes aegypti*; *Babesia canis* | partially | Binomial pattern + taxon list (L12). | H |

### 2.1 Regexes

These are candidate extractors only. Structure should be parsed with the grammar in §3.7, not with regex.

```js
// R1 candidate parenthetical author-date call (structure goes to the parser)
/\((?=[^()]*?(?:\b\d{4}[a-z]?\b|\[[^\]]*\d[^\]]*\]))[^()]{2,200}\)/gu
// R3 period inside the quote before a call: rewrite to  ”␠(call).
/([^.!?])\.(”)\s*(\([^()]*?\d{4}[a-z]?[^()]*\))/gu      // -> "$1$2 $3."
// R4 omission normalization inside quotes
/\(\s*(?:\.{3}|…)\s*\)|\[\s*…\s*\]/gu                   // -> "[...]"
// R5 ALL-CAPS author inside a call (then check against the acronym set L4)
/\((\p{Lu}{2}[\p{Lu}\p{M}'’\- ]*?)(?:\s+et al\.)?(?=[;,]\s)/gu
// R6 direct quote whose call has no locator
/”\s*\(([^()]*?\d{4}[a-z]?)\)/gu   // warn if $1 lacks /\b(?:p|f|v|t|local|cap|art|inc)\.\s|\d+\s?min\b/
// R7 locators
/\b(?:p|f)\.\s\d+(?:-\d+)?|\blocal\.\s\d+|\b[vt]\.\s\d+|\bcap\.\s[\dIVXLC]+|\bart\.\s\d+|\binc\.\s[IVXLC]+/gu
// R9 citation of a citation
/(\d{4}[a-z]?(?:,\s(?:p|f)\.\s[\d-]+)?)\s+(?:apud|citado por)\s+/gu
// R10 DOI normalization
/\bDOI:\s*(?:https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[^\s]+?)(?=[.,;]?(?:\s|$))/giu  // -> "DOI: https://doi.org/$1"
// R11 acronym expansion "Nome Completo (SIGLA)"
/(\p{Lu}[\p{L}\p{M}]+(?:\s+(?:d[aeo]s?|de|e|para)?\s*\p{Lu}?[\p{L}\p{M}]+)+)\s\((\p{Lu}[\p{L}\d]{1,})\)/gu
// R12 illustration/table caption
/^(Figura|Gráfico|Quadro|Tabela|Mapa|Fotografia|Desenho|Esquema|Fluxograma|Organograma|Planta|Retrato|Imagem)\s+(\d+)\s*(?:[-–—:.]\s*)?/u // -> "$1 $2 — "
// R13 numbered heading (strip separators, depth <= 5)
/^(\d+(?:\.\d+){0,})\.?\s*[-–—.)]?\s+(?=\S)/mu
// R14 alínea
/^\s*([a-z]{1,2})[).]\s+(.+?)([;.:,]?)\s*$/gmu
// R15 keywords line (split on ; , . then rejoin with "; " and a final ".")
/^(Palavras-chave|Keywords|Palabras clave|Mots-clés)\s*:\s*(.+)$/gmu
// R16 numeric date and ABNT reference date
/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/gu
/\b([1-9]|[12]\d|3[01])\s(jan|fev|mar|abr|maio|jun|jul|ago|set|out|nov|dez)\.?\s(\d{4})\b/gu  // "." required except maio
// R17 hyphen used as a dash between words
/(\p{L})\s+(?:-|--|–)\s+(\p{L})/gu                       // -> "$1 — $2"
// R18 pt-BR grouped number (exclude years 1000–2099 that stand alone)
/(?<![\d.,])(\d{1,3}(?:\.\d{3})+)(,\d+)?(?![\d.])/gu
// R19 value + unit (space policy; no space for angle ° ′ ″)
/(\d)\s?(km|m|cm|mm|kg|g|mg|L|mL|min|h|s|°C|K|Hz|kHz|MHz|GB|MB|kB|%)(?![\p{L}])/gu
// R20 degree sign misused as ordinal
/\b([nN])\s?°\s?(?=\d)|(\d)°(?=\s*(?:semestre|ano|lugar|andar|grau|edição|período|bimestre|trimestre)\b)/gu
// R21 closed Latin list (render <i lang="la">)
/(?<![\p{L}])(?:et al\.|apud|Ibid\.|Id\.|op\. cit\.|loc\. cit\.|passim|Cf\.|et seq\.|sic|in loco|in vitro|in vivo|in situ|a priori|a posteriori|per capita|ad hoc|caput)(?![\p{L}])/gu
```

## 3. (b) Reference and citation formatting spec

### 3.1 Field mapping

`*X*` means the title-highlight span. The norm's own choice is bold; I recommend it (§3.8).

| ABNT element | CSL-JSON | BibTeX / biblatex | Rendering |
|---|---|---|---|
| Personal author | `author[]{family, given, non-dropping-particle, dropping-particle, suffix}` | `author` (family, given, prefix, suffix) | §3.2 |
| Corporate author | `author[]{literal}` | `author={{...}}` | First segment UPPERCASE; later ". " segments and the "(qualifier)" keep their case |
| Responsible for a collection | `editor[]` + custom `editor-role` (`org.`, `ed.`, `coord.`, `comp.`). CSL also has `compiler` and `organizer`. | `editor` + `editortype` | `NAME; NAME (org.).` |
| Translator, advisor | `translator`; advisor is custom (`note` or `x-advisor`) | `translator`; custom `advisor` | `Tradução: Given Family.` / `Orientador: Given Family.` in direct order |
| Title / subtitle | `title` (+ custom `subtitle`, or split at the first ": " as a fallback) | `title`, `subtitle` | Highlight on the title only |
| Container | `container-title` | `journaltitle`, `booktitle` | Highlighted when the entry is a part |
| Edition | `edition` | `edition` | `4. ed.` (pt) / `5th ed.` (en): language of the document |
| Place / publisher | `publisher-place` / `publisher` | `location`, `address` / `publisher`, `institution`, `school` | Missing values become `[S. l.]`, `[s. n.]`, `[S. l.: s. n.]` |
| Date | `issued.date-parts`, `issued.circa`, `issued.literal` | `date` / `year`, `month`, `day` | §3.4 |
| Volume / issue / year of periodical | `volume` / `issue` / custom `x-ano` | `volume` / `number` | `v. 35, n. 3` / `ano 12` |
| Pages / e-location | `page` / `number` (or custom `e-location`) | `pages` / `eid` | `p. 7-16` / `e03304` |
| Number of pages | `number-of-pages`, `medium` | `pagetotal`, `howpublished` | `182 p.`, `82 f.`, `E-book` |
| Series | `collection-title`, `collection-number` | `series`, `number` | `(Série, 12)` |
| Thesis | `genre` = "Tese (Doutorado em X)", `publisher` = "Unidade, Instituição" | `type`, `institution` / `school` | `– Unidade, Instituição, Local, ano` |
| Event | `event-title` (CSL 1.0.2; legacy `event`), `event-place`, `event-date`, custom `x-event-number` | `eventtitle`, `venue`, `eventdate`, custom | `NOME, 9., 1994, Cidade.` |
| DOI / URL / accessed | `DOI` / `URL` / `accessed` | `doi` / `url` / `urldate` | `DOI: https://doi.org/…. Disponível em: URL. Acesso em: 7 abr. 2023.` |
| Document language | `language` | `langid` | Selects the month table and edition ordinal |

### 3.2 Name algorithm (NBR 6023 §8.1.1 for references, NBR 10520 §6.1.1 for citations)

1. Reference surname core:
   - Take `non-dropping-particle` + `family` + kinship suffix (Filho, Neto, Sobrinho, Júnior/Junior).
   - Uppercase it with a locale-aware function (`toLocaleUpperCase('pt-BR')`). Keep diacritics and the typographic apostrophe: `D’AMBROSIO`.
   - Never re-split a `family` that is already structured (GARCÍA MÁRQUEZ, ESPÍRITO SANTO).
2. Reference given part:
   - Full form, or initials: each token becomes its first letter + "."; hyphenated names become `J.-P.`
   - Append any Portuguese dropping particle (de, da, do, das, dos, e) in lowercase at the end: `SILVA, Antônio Augusto Moura da` or `SILVA, A. A. M. da`; `LIMA, I. N. de`.
   - Pick one mode (full or initials) per author across the whole list (§8.1.1 "convém padronizar").
3. Joining:
   - Authors joined with `"; "`.
   - More than 3 authors with `etal=abbr`: first author + ` *et al.*`.
   - Editor role in parentheses after the last name.
4. Corporate authors: uppercase only the first hierarchical segment, without its "(qualifier)": `BRASIL. Ministério da Justiça.`, `INSTITUTO NACIONAL DO CÂNCER (Brasil).`
5. Citation surname: the same core in its original case: Silva, Del Bianco, García Márquez, Ribeiro Junior. Including kinship words in the call is common practice; the norm gives no example (M).
6. Information preservation:
   - Generate uppercase **text**. CSS `text-transform` changes copy/paste and search behaviour across browsers (M).
   - Keep the source names in structured data. Uppercasing loses information (McDonald becomes MCDONALD; ß).

### 3.3 Titles and highlight

- Rule H1: the highlight goes to the **title proper of the bibliographic unit that is not the entry**:
  - books and theses: the title;
  - chapters: the book title;
  - articles: the periodical title;
  - conference papers: the proceedings title (`**Anais** [...]`);
  - news on a site: the site name (`**Poder 360**`);
  - social-media posts or software without a container: the item title.
- Rule H2: the subtitle stays plain. A journal subtitle is plain too (`**Em Pauta**: revista da Faculdade ...`).
- Rule H3: when the entry is the title (no author), uppercase the first word, plus the next word if the first is an article or monosyllable. **No highlight** on that title. A container title, such as the periodical, is still highlighted: `ANTEPROJETO de lei. **Estudos e Debates**, ...`
- Rule H4: do not change case or spelling of titles beyond H3. The norm's examples are already in sentence case because the catalogue data is; periodical names keep their own capitalization. Any automatic sentence-casing **must** protect proper nouns, acronyms and taxa (L4, L12, L14). Otherwise it loses information.
- Rule H5: a title ending in ? or ! gets no added period: `Necrobiopoder: quem pode habitar o Estado-nação? Cadernos Pagu, ...`

### 3.4 Dates and locators

- Publication month: Anexo A table **in the document's language**:
  - pt: jan. fev. mar. abr. maio jun. jul. ago. set. out. nov. dez.
  - en: Jan. Feb. Mar. Apr. May June July Aug. Sept. Oct. Nov. Dec.
  - es, it, fr, de: per Anexo A.
- `Acesso em` date: always in the output language (pt). Day without a leading zero: `7 abr. 2023`.
- Pages: `p. a-b` with a hyphen-minus; leaves: `f. a-b`; e-location instead of pages.

### 3.5 Punctuation engine

- Elements are joined by `". "`.
- Then collapse doubled punctuation: `..` becomes `.`, except inside `[...]`. The norm itself contains "Acesso em: 21 ago. 2011.." in §7.2.2.
- Do not add a period after an element that already ends in `.`, `?` or `!` (for example "ed.", "et al.").
- The period after a URL stays outside the link. Never hyphenate or "smart-quote" inside URLs.
- Use a non-breaking space after `p.`, `v.`, `n.` and inside dates (`7 abr. 2023`).

### 3.6 Sorting and disambiguation

1. Render each entry, then sort with `Intl.Collator('pt-BR', {numeric: true, sensitivity: 'base'})` (§9.1). Word-by-word versus letter-by-letter is not specified by the norm (M).
2. For the same author string, sort by year, then by title. This is common practice; the norm does not specify it (M).
3. For the same author string and year, assign `a, b, …` in list order and print the letter in both the list and the calls (10520 §6.1.6).
4. *Et al.* collisions (different author lists that both render as "Moura *et al.*, 2018") are **not covered by the norm**. Options: add authors until the call is unique, or use year letters. Make this a configurable policy (M).

### 3.7 Citation grammar (parser tree; NBR 10520 §6–7)

```
call        = "(" item { "; " item } ")" ;
item        = resp ", " dates [ ", " loc ] { ", " suffix }
            | resp ", " date [ ", " loc ] " apud " resp ", " date [ ", " loc ] ;
resp        = person { "; " person } [ " et al." ] | corp | titlekey ;
person      = Surname [ ", " Initials | ", " Forename ] ;          (* 6.1.5 *)
titlekey    = Word | Word " [...]" | (Article|Monosyl) " " word " [...]" ;
dates       = date { ", " date } ;  date = YYYY [a-z] | "[" approx "]" ;
loc         = ("p."|"f."|"v."|"t."|"local."|"cap."|"art."|"inc."|"slide") " " range { ", " loc } | time ;
suffix      = "tradução nossa" | "tradução própria" | "grifo nosso" | "grifo próprio" ;
narrative   = Surname | A " e " B | A ", " B " e " C | A " et al." , " (" dates [ ", " loc ] ")" ;
numeric     = "(" N [ ", " loc ] ")" | superscript(N) [ ", " loc ] ;
notes-short = SURNAME_UPPER ", " YYYY [ ", " loc ] "." | SURNAME_UPPER ", ref. " N [", " loc] "." | Latin-short ;
```

### 3.8 Output encoding

**HTML**
- Title highlight: `<cite class="t">` with `font-style:normal; font-weight:bold`. Choosing **bold** for titles, as the norm itself does, keeps italics free for Latin and foreign words, so the two signals do not merge.
- Latin and foreign words: `<i lang="la">et al.</i>`, `<i lang="en">online</i>`.
- Dates: `<time datetime="2023-04-06">6 abr. 2023</time>`.
- Calls: link to the reference id.
- Footnotes: `<ol>` with a hanging indent.

**LaTeX**
- biblatex-abnt: issue #123 was still open in Apr 2026 on adapting to NBR 10520:2023. Commenters (unverified) suggest `\let\UpperOrSCCite\NormalOrSCCite` for mixed-case calls.
- Wrap foreign words as `\foreignlanguage{english}{\textit{...}}` so hyphenation follows the right language.
- Number equations with `equation` (amsmath numbers on the right by default).

### 3.9 Templates (essential elements; `[opt]` marks complementary ones)

```
BOOK      AUTH. *Title*[: subtitle]. [Tradução: N.] [N. ed.] Place: Publisher, Year. [n p.] [(Series, n)] [ISBN x.] [E-book.] [DOI: …] [Disponível em: URL. Acesso em: d mmm. yyyy.]
CHAPTER   AUTH. Chapter title[: sub]. In: HOSTAUTH|EDS (org.). *Book title*[: sub]. [N. ed.] Place: Publisher, Year. [v. n,] [cap. n,] p. a-b. [online]
ARTICLE   AUTH. Article title[: sub]. *Journal*[: jsub], Place, [ano n,] v. n, n. n, p. a-b|eLOC, [mmm.] Year. [Suplemento n.] [DOI: https://doi.org/…] [Disponível em: URL. Acesso em: …]
THESIS    AUTH. *Title*[: sub]. [Orientador: N.] DepositYear. [n f.] Tipo (Grau em Curso) – Unidade, Instituição, Place, DefenseYear. [online]
CONF      AUTH. Paper title. In: EVENT NAME, n., Year, City. *Anais* [...]. Place: Publisher, Year. p. a-b. [DOI] [online]
WEB/NEWS  AUTH. Title. *Site name*, [Place,] d mmm. yyyy. Disponível em: URL. Acesso em: d mmm. yyyy.
ONLINE-ONLY (7.20)  AUTH. *Title*. [Versão x.] [Place], date. Physical description (e.g. "1 CD-ROM", "Twitter: @x", "Podcast"). [Disponível em… Acesso em…]
NO AUTHOR FIRSTWORD [NEXTWORD if article/monosyllable] rest… (no highlight on this title)
```

### 3.10 Worked examples

Examples 1, 2 and 4–8 are taken from NBR 6023:2025 (Ex. 7 also appears in the ECA-USP summary); Example 3 is from NBR 10520:2023; Bonus A comes from NBR 10520 and NBR 6023, and Bonus B is from NBR 10520. Page locators marked † are illustrative.

**1. Book (subtitle, translator)** — 6023 §7.1.1, Ex. 2

Input: `{"type":"book","author":[{"family":"Bauman","given":"Zygmunt"}],"title":"Globalização","subtitle":"as conseqüências humanas","translator":[{"family":"Penchel","given":"Marcus"}],"publisher":"Jorge Zahar","publisher-place":"Rio de Janeiro","issued":{"date-parts":[[1999]]},"language":"pt"}`

- Reference: BAUMAN, Zygmunt. **Globalização**: as conseqüências humanas. Tradução: Marcus Penchel. Rio de Janeiro: Jorge Zahar, 1999.
- Parenthetical: ... (Bauman, 1999, p. 7†).
- Narrative: Bauman (1999, p. 7†) ...

**2. Chapter in an edited book** — 6023 §7.3, Ex. 3

- Reference: ROMANO, Giovanni. Imagens da juventude na era moderna. *In*: LEVI, G.; SCHMIDT, J. (org.). **História dos jovens 2**: a época contemporânea. São Paulo: Companhia das Letras, 1996. p. 7-16.
- Parenthetical: (Romano, 1996, p. 9†)
- Narrative: Romano (1996, p. 9†)
- BibTeX: `@incollection{author={Romano, Giovanni}, editor={Levi, G. and Schmidt, J.}, editortype={organizer}, title=..., booktitle={História dos jovens 2}, booksubtitle={a época contemporânea}, ...}`

**3. Journal article with DOI** — NBR 10520 §5.1, Ex. 1. The norm itself pairs this citation with this reference; the title is reproduced as printed there.

- Reference: SILVA, Antônio Augusto Moura da. Intervenções precoces a redução de vulnerabilidades em melhora do desenvolvimento infantil. **Cadernos de Saúde Pública**, Rio de Janeiro, v. 35, n. 3, p. 1-3, mar. 2019. DOI: https://doi.org/10.1590/0102-311X00030519. Disponível em: https://www.scielosp.org/article/csp/2019.v35n3/e00030519/. Acesso em: 27 jun. 2019.
- Parenthetical (as in the norm): “Poucos estudos têm sido realizados em países de renda baixa e média [...]” (Silva, 2019, p. 1).
- Narrative: Silva (2019, p. 1) observa que “poucos estudos têm sido realizados [...]”.
- HTML: `SILVA, Antônio Augusto Moura da. Intervenções … <cite class="t">Cadernos de Saúde Pública</cite>, Rio de Janeiro, v.&nbsp;35, n.&nbsp;3, p.&nbsp;1-3, <time datetime="2019-03">mar. 2019</time>. DOI: <a href="https://doi.org/10.1590/0102-311X00030519">https://doi.org/10.1590/0102-311X00030519</a>. Disponível em: <a href="…">…</a>. Acesso em: <time datetime="2019-06-27">27 jun. 2019</time>.`

**4. Thesis / dissertation (with complementary elements)** — 6023 §7.1.2, Ex. 3

- Reference: RODRIGUES, Ana Lúcia Aquilas. **Impacto de um programa de exercícios no local de trabalho sobre o nível de atividade física e o estágio de prontidão para a mudança de comportamento**. Orientador: Mario Ferreira Junior. 2009. 82 f. Dissertação (Mestrado em Fisiopatologia Experimental) – Faculdade de Medicina, Universidade de São Paulo, São Paulo, 2009.
- Parenthetical: (Rodrigues, 2009)
- Narrative: Rodrigues (2009)
- BibTeX: `@mastersthesis{type={Dissertação (Mestrado em Fisiopatologia Experimental)}, school={Faculdade de Medicina, Universidade de São Paulo}, address={São Paulo}, year=2009, pagetotal={82}, advisor={Mario Ferreira Junior}}`. Leaves are rendered as "f." because a thesis is printed on one side.

**5. Conference paper** — 6023 §7.8.4.1, Ex. 1

- Reference: BRAYNER, A. R. A.; MEDEIROS, C. B. Incorporação do tempo em SGBD orientado a objetos. *In*: SIMPÓSIO BRASILEIRO DE BANCO DE DADOS, 9., 1994, São Paulo. **Anais** [...]. São Paulo: USP, 1994. p. 16-29.
- Parenthetical: (Brayner; Medeiros, 1994, p. 20†)
- Narrative: Brayner e Medeiros (1994, p. 20†)
- Note: the acronym "SGBD" keeps its capitals inside the sentence-case title.

**6. Website / online news** — 6023 §7.20, Ex. 10; the site name is bold.

- Reference: VELOSO, N.; PIMENTEL, J. Brasil teve 5 ataques com mortes em escolas em 2022 e 2023. **Poder 360**, 6 abr. 2023. Disponível em: https://www.poder360.com.br/brasil/brasil-teve-5-ataques-com-mortes-em-escolas-em-2022-e-2023/. Acesso em: 23 abr. 2024.
- Parenthetical: (Veloso; Pimentel, 2023)
- Narrative: Veloso e Pimentel (2023)
- An unpaginated direct quote takes a locator only if the page shows one, for example a paragraph or timestamp (10520 §7.1.4, "convém").

**7. Four or more authors, DOI, e-location** — 6023 §7.7.6, Ex. 8; also in ECA-USP

- Reference with all authors: MOURA, L. R.; TORRES, L. M.; CADETE, M. M. M.; CUNHA, C. F. Fatores associados aos comportamentos de risco à saúde entre adolescentes brasileiros: uma revisão integrativa. **Revista da Escola de Enfermagem da USP**, São Paulo, v. 52, e03304, 2018. DOI: https://doi.org/10.1590/S1980-220X2017020403304. Disponível em: https://www.scielo.br/j/reeusp/a/JvyjzY4B4b7f9P5TLyLpPFK/abstract/?lang=pt. Acesso em: 7 abr. 2023.
  - The norm prints the URL with a stray space; it is removed here.
- Reference with *et al.*: MOURA, L. R. *et al.* Fatores associados ... (rest identical).
- Citation, et al. option: (Moura *et al.*, 2018) / Moura *et al.* (2018)
- Citation, all-names option: (Moura; Torres; Cadete; Cunha, 2018) / Moura, Torres, Cadete e Cunha (2018)
- Use one option throughout the document (10520 §6.1.2).

**8. Institutional author** — pattern of 6023 §8.1.2, Ex. 1, applied to the current norm. A government variant follows from 10520 §6.1.1.3.

- Reference: ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. **ABNT NBR 6023**: informação e documentação: referências: elaboração. 3. ed. Rio de Janeiro: ABNT, 2025.
- Parenthetical: (Associação Brasileira de Normas Técnicas, 2025)
- Narrative: Associação Brasileira de Normas Técnicas (2025)
- (ABNT, 2025) is allowed by §6.1.1.2 only if the correspondence with the list is kept (for example through a list of acronyms); see C-11.
- Government reference: BRASIL. Ministério da Administração Federal e da Reforma do Estado. **Plano diretor da reforma do aparelho do Estado**. Brasília, DF: Ministério da Administração Federal e da Reforma do Estado, 1995.
  - Citation: (Brasil, 1995) / Brasil (1995)

**Bonus A. No author**

- Article: ANTEPROJETO de lei. **Estudos e Debates**, Brasília, DF, n. 13, p. 51-60, jan. 1987. Citation: (Anteprojeto [...], 1987, p. 55).
- Book: PEQUENA biblioteca do vinho. São Paulo: Lafonte, 2012. No highlight. Citation: (Pequena [...], 2012).

**Bonus B. Citation of a citation**

(Assis, 1997 *apud* Canuto, 1999, p. 6). Only CANUTO 1999 enters the reference list.

### 3.11 Bilingual output (design decision; not in the norms)

- §6.5 says added information follows the language of the text being written. For the English version that means labels such as "Available at:", "Accessed on:" and "Translated by:", and English month abbreviations for the access date (M, inference).
- Essential elements stay as in the document. Latin stays Latin (*et al.*, *apud*, *[S. l.]*).
- In English text, the narrative joiner "e" becomes "and"; "tradução nossa" becomes "our translation"; "grifo nosso" becomes "emphasis added". NBR 10520 has no English forms, so this is an inference (M).
- Alternative: keep the ABNT format with Portuguese labels in both language versions.

## 4. (c) Contradictions and caveats

- **C-1, final period.** Zeppelini says the period goes before the closing parenthesis. NBR 10520:2023 §5.2 and §7.1.2 and all its examples put it after the call. **Follow the norm.** [A] vs [P]
- **C-2, a leftover inside NBR 10520:2023.** §5.1 Ex. 3 prints "(WORLD HEALTH ORGANIZATION, [20--?])" in uppercase, which contradicts §6.1.1.2. It is an editorial leftover; follow §6.1.1.2.
- **C-3, two case conventions inside one norm.** Author-date calls are mixed case. Notes-system short forms (§8.1.2) are UPPERCASE. Formatters often get this wrong.
- **C-4, italics for Latin.** The ABNT norms set Latin in italics but have **no clause** requiring it. FUNAG and MRPR italicize Latin. Embrapa says not to. The biblatex-abnt thread claims the norm "reforçou a exigência" of italics; that is not in the text.
- **C-5, foreign words.**
  - MRPR 2018: all foreign words in italics.
  - Senado and Embrapa: no italics if the word is registered in VOLP or a dictionary (software, e-mail, blog).
  - FUNAG: italicizes e-mail, site, show.
  - NBR 6023:2025 itself italicizes online, e-mail, e-book.
  - Needs a policy switch. The MRPR 2002 edition used quotation marks for foreign terms.
- **C-6, digit grouping.** SI/QGUM for technical and scientific texts: spaces, "nunca separados por pontos". QGUM for fiscal, legal and commercial texts: points. Embrapa and the ABNT examples use points (n. 16.414; R$ 210.000.000,00).
- **C-7, percent.** SI: "25 %". Embrapa: "25%". NBR 10520 example: "66,2%".
- **C-8, numeric dates.** NBR 5892:2019 uses "04.04.2018". Common Brazilian usage is dd/mm/aaaa. Use ISO 8601 in `datetime` attributes.
- **C-9, caption dash.** NBR 14724:2024 says "travessão", but its examples mix the em dash ("Quadro 1 —", "Tabela 1 —") and the en dash ("Gráfico 1 –"). Recommendation: em dash.
- **C-10, DOI form.** NBR 6023:2025 shows three different DOI forms.
  - A blog (fastformat) claims a DOI dispenses with the access date or that access dates are limited to unstable content. §6.6 contradicts this.
- **C-11, acronym in the call vs full name in the list.** NBR 10520 allows (IBGE, 2011) but §5.1 requires correlation with the list. Ensure the list entry uses or maps to the acronym.
- **C-12, the norms misuse the degree sign.** "Súmula n° 333" (6023) and "2° semestre" (14724) use ° instead of º. Normalize.
- **C-13, missing place in periodical articles.** The UFU tutorial says to use [s. l.]. NBR 6023:2025 §7.7.6 Ex. 5 omits the place without [s. l.].
- **C-14, small inconsistencies inside NBR 6023.**
  - "5th ed." vs "2nd. ed."
  - "Tradução:" vs "Tradução de" vs "Tradução" with no colon. Recommendation: "Tradução:".
  - Both "[...]" and "[…]" appear. Canonicalize to "[...]".
- **C-15, 4 cm indent.** It was mandatory in 2002 and is only recommended in 2023. Some guides still say mandatory.
- **C-16, NBR 14724 "versão corrigida 2025".** Claimed by blogs; I could not confirm it.
- **C-17, repeated authors.** The `______.` line was removed in 2018 (IFAL, FSA) and is absent in 2025. Older manuals (Unicamp 2013, Embrapa referencing) still show it.
- **C-18, titles in running text (not regulated by ABNT).** AO 1990 Base XIX: book titles in italic ("tudo em grifo"). Senado: chapter and article titles in quotes. Embrapa: chapter titles roman, with main words capitalized.
- **C-19, Senac vs SENAC.** NBR 10520 writes "Senac" and NBR 14724 writes "Inmetro", which matches the Senado acronym rule. Pure ABNT practice elsewhere is all caps. Use canonical forms from the acronym lexicon.

## 5. Sources

**Primary texts** (copies hosted by institutions; official copies from ABNT / Target GEDWeb)
- [A] ABNT NBR 10520:2023: https://www.eaic.uem.br/eaic2024/portal/media/2023_abnt-10520-citacoes.pdf
- [B] ABNT NBR 6023:2025: https://universidadeniltonlins.com.br/wp-content/uploads/2025/06/NBR6023-2025-Referencias-Elaboracao.pdf
- [E] ABNT NBR 14724:2024: https://tpp-uff.com.br/wp-content/uploads/2025/02/ABNT_NBR_14724_2024-1.pdf
- [F] ABNT NBR 6024:2012: https://mnpef.ect.ufrn.br/wp-content/uploads/2017/03/ABNT_NBR-6024-2012.pdf
- [G] ABNT NBR 6028:2021: https://eje.tre-ba.jus.br/pluginfile.php/38310/mod_resource/content/2/NBR6028%20-%20Resumo%2C%20resenha%20e%20recens%C3%A3o.pdf
- [I] ABNT NBR 5892:2019: https://funesa.se.gov.br/wp-content/uploads/2022/10/ABNT-NBR-5892-Representacao-e-formato-de-tempo-Datas-e-Horas.pdf
- [J] Inmetro, SI (9th ed., pt) + Anexo 1 QGUM (Portaria 615/2023): https://www.gov.br/inmetro/pt-br/assuntos/metrologia-cientifica/documentos-tecnicos-em-metrologia/si_versao_final.pdf
- [K] Acordo Ortográfico 1990 (Bases I and XIX): https://www.ffms.pt/sites/default/files/2022-07/Acordo-ortogr%C3%A1fico-da-L%C3%ADngua-Portuguesa.pdf

**University guides**
- [C] ECA-USP, NBR 6023:2025 changes: https://www.eca.usp.br/sites/default/files/2025-06/NBR%206023_2025.pdf
- [D] UFU notice: https://bibliotecas.ufu.br/acontece/2025/07/atualizacao-da-norma-de-elaboracao-de-referencias-abnt-nbr-6023
- [D] UFU tutorial: https://bibliotecas.ufu.br/sites/bibliotecas.ufu.br/files/media/imagem/referencias_maio_2025_2.pdf
- [H] UFMG, NBR 6022:2018 summary: https://www.ufmg.br/periodicos/sobre-a-norma-para-artigo-de-publicacao-periodica/
- [Q] UFRGS ICBS, NBR 10520:2023 changes: https://www.ufrgs.br/bibicbs/atualizacoes-na-abnt-nbr-10520-2023-citacoes-bibliograficas/
- [S] IFAL, removal of the underscore line: https://www2.ifal.edu.br/campus/palmeira/ensino/biblioteca/arquivos-1/template_nbr6023_2018_oquemudou-1.pdf/@@download/file/TEMPLATE_nbr6023_2018_OQUEMUDOU%20(1).pdf
- [S] FSA: https://www.fsa.br/wp-content/uploads/2023/11/Atualizacoes-ABNT-Documentacao-2023.pdf

**Style manuals**
- [L] Senado, Manual de Comunicação:
  - https://www12.senado.leg.br/manualdecomunicacao/estilos/estrangeirismo
  - https://www12.senado.leg.br/manualdecomunicacao/estilos/siglas
  - https://www12.senado.leg.br/manualdecomunicacao/estilos/travessao
  - https://www12.senado.leg.br/manualdecomunicacao/estilos/aspas
- [M] Embrapa, Manual de Produção Editorial:
  - https://www.embrapa.br/en/manual-de-producao-editorial/numero
  - https://www.embrapa.br/manual-de-producao-editorial/destaque
- [N] FUNAG, Manual de Revisão: https://funag.gov.br/manual/index.php?title=Uso_de_it%C3%A1lico
- [O] MRPR 3rd ed. 2018 (as transcribed in a study guide): https://juspodium.net/manual_redacao_oficial.pdf
- [O] MRPR 2nd ed. 2002: https://legis.sigepe.gov.br/sigepe-bgp-ws-legis/legis-service/download/?id=0000356386-ALPDF%2F2018

**Secondary and contradicting**
- [P] Zeppelini: https://zeppelini.com.br/abnt-nbr-105202023-entenda-as-alteracoes-na-norma-de-citacoes-et-al-286/
- [R] biblatex-abnt issue #123: https://github.com/abntex/biblatex-abnt/issues/123
- [T] fastformat blog: https://blog.fastformat.co/nbr-6023-2025-o-que-mudou/

## 6. Local files (scratchpad, for verification only)

These are extracted texts of copyrighted norms. Do not commit them to the repo.
- /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/dl2/nbr10520b.txt (NBR 10520:2023)
- /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/dl3/n6023.txt (NBR 6023:2025)
- /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/dl2/n14724.clean.txt (NBR 14724:2024)
- /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/dl4/n6024.clean.txt (NBR 6024:2012)
- /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/dl4/n6028.clean.txt (NBR 6028:2021)
- /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/dl5/n5892.clean.txt (NBR 5892:2019)
- /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/dl5/si.txt (SI and QGUM)
- /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/dl5/ao.txt (Acordo Ortográfico)
- /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/italics.py and bold.py (scripts that extract italic and bold runs from a PDF)
