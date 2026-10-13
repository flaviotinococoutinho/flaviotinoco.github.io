# Static lexicon subsystem: matcher, Bloom filter and word-list research (Node 22)

**Recommendation:** match the dictionary with **Aho–Corasick (c)**. It runs on the case-folded NFC text, filters word boundaries with a Unicode-aware table, and passes candidates to one shared resolver. Its speed barely changes with dictionary size: 9.1 ms at 2k entries and 12.1 ms at 20k for 50,592 words. Large regex alternations hit a V8 performance cliff once a pattern's source passes 20 KB.

For the "is this a known Portuguese word?" check, an exact **minimal DAFSA** (a compressed word automaton) is about the same size as or smaller than a 1% Bloom filter for inflected Portuguese, and has no errors. The Bloom filter is built and tested anyway.

All six matching variants produced identical matches (same hash) at every dictionary size. The 10 unit tests pass, and `tsc` is clean under the project's `astro/tsconfigs/strictest` with `erasableSyntaxOnly`.

Environment: Node v22.22.0, V8 12.4.254.21, 4 vCPUs. Workdir: `/tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/lexiconprobe`.

## 1. Matching strategies

### Test setup
- **Corpus:** 50,592 words (285 KB) of pt-BR text, sampled by frequency (Zipf) from FrequencyWords, with dictionary terms inserted.
- **Dictionaries:** 2k, 5k, 10k and 20k entries: 50% single foreign words, 15% foreign phrases, 25% proper names, 10% acronyms, plus 59 curated real entries.
- **Measurement:** each figure is the median of 5 fresh processes. Configurations slower than 1 s were run once.
- **"Per node":** the same corpus split into 3,028 sentence-sized pieces, which is roughly how the remark plugin sees text nodes.

**Warm match time (ms) for the whole corpus / per node:**

| entries | naive | naive /i | trie | trie /i | **Aho–Corasick** | tokens+hashmap |
|---|---|---|---|---|---|---|
| 2,059 | 19.4 / 21.9 | 46.6 / 47.0 | 12.0 / 13.1 | 11.2 / 12.6 | **9.1 / 8.9** | 13.3 / 9.2 |
| 5,059 | 3,406 / 3,803 | 9,798 / 10,294 | 37.1 / 43.1 | 38.4 / 41.7 | **10.8 / 9.5** | 16.5 / 10.5 |
| 10,059 | 9,929 / 10,639 | 26,906 / 28,207 | 69.6 / 90.2 | 74.9 / 88.9 | **10.1 / 11.7** | 17.8 / 12.8 |
| 20,059 | 26,642 / 29,544 | 60,865 / 71,003 | 78.3 / 94.5 | 80.0 / 98.1 | **12.1 / 13.1** | 18.8 / 17.8 |

**Build time, first (cold) match and memory:**

| at 20k entries | naive | trie | Aho–Corasick | tokens |
|---|---|---|---|---|
| Build time (ms) | 47.8 | 167 | 111 | 64 |
| First match, cold (ms; for regex includes V8's lazy compile) | 27,381 | 253 | 21 | 26 |
| Heap growth, MB (of which compiled code) | 13.8 (11.2) | 7.4 (4.9) | **2.5 (0.04)** | 10.3 |
| Regex source size (KB) | 240 | 151 | – | – |

At 2k entries the build times are 5.8 / 26.9 / 19.2 / 6.5 ms and heap growth is 1.4 / 1.0 / 0.36 / 1.2 MB, in the same column order. Matches found at 2k/5k/10k/20k: 230 / 455 / 649 / 989.

### Correctness on Unicode boundaries, NFC and case (20 cases)

Full matrix: `results-correctness.md`.

| strategy | score |
|---|---|
| naive with JS `\b` | 12/20 |
| naive, lookarounds on letters/digits only (`\p{L}\p{N}`) | 18/20 |
| naive, lookarounds including combining marks (`\p{L}\p{N}\p{M}`) | **19/20** |
| naive with the `/i` flag | 19/20 |
| trie | 19/20 |
| Aho–Corasick | 18/20 |
| tokens+hashmap | 19/20 |

- **The case every strategy fails is a deliberate control:** text that was not normalised to NFC. NFC normalisation is therefore mandatory before matching.
- **Where `\b` fails** (it only knows ASCII letters):
  - "rap" is found inside "rapé", and "link" inside "linká-lo".
  - "Übermensch" and "fiancé" are missed because they start or end with a non-ASCII letter.
  - "et al." is missed because `\b` after the final "." requires a word character next.
  - In decomposed (NFD) text, "cafe" is found inside "café".
- **Lookarounds on `[\p{L}\p{N}]` alone still miss that last case.** The boundary class must also include `\p{M}`. Use:
  `/(?<![\p{L}\p{N}\p{M}])(?:…)(?![\p{L}\p{N}\p{M}])/u`
- **Aho–Corasick's extra failure:** a phrase written with a double space. Line breaks inside phrases and NBSPs do match. The fix is to collapse whitespace runs in the normalised view; the tokens approach handles this already.

### Why large regexes collapse in V8

Time per input character on a 30k-character slice of the corpus:

| terms | naive source KB | naive ns/char | naive without lookarounds | trie source KB | trie ns/char |
|---|---|---|---|---|---|
| 2,000 | 15.0 | 46 | 74 | 12.5 | 31 |
| 2,500 | 18.8 | 45 | 74 | 15.3 | 31 |
| 3,000 | 22.8 | **504** | 1,817 | 18.2 | 32 |
| 5,000 | 39.0 | 680 | 2,243 | 29.6 | **138** |
| 13,000 | 131.6 | **38,027** | 176,222 | 96.2 | 161 |

I confirmed the cause in V8 12.4's source (`src/regexp/regexp.cc`):
- V8's regex engine (irregexp) backtracks: at each start position it tries the alternatives in order.
- `RegExpImpl::Compile` calls `set_optimize(!TooMuchRegExpCode(...))`. That returns true when `pattern->length() > RegExp::kRegExpTooLargeToOptimize` (`= 20 * KB`, in `regexp.h`), or when more than 1 MB of regex code has been generated and executable memory exceeds 16 MB.
- With optimisation off, three things stop: per-alternative quick checks (`EmitQuickCheck`, which compares up to 4 preloaded characters per alternative), Boyer–Moore lookahead, and trace specialisation.
- V8 always sorts and factors consecutive literal alternatives (`SortConsecutiveAtoms` / `RationalizeConsecutiveAtoms`, not gated). That is why naive and trie are close below 20 KB.

Further measurements:
- Running at 2,000 terms with `--no-regexp-optimization` reproduces the slow numbers (naive 441, trie 120 ns/char), which confirms the cause.
- Regex compilation is lazy: the first run is interpreted and the second is compiled to native code (`--regexp-tier-up`, ticks=1).
- At about 130 KB there is a second cliff. There, native code (38 µs/char) is slower than V8's interpreter (`--regexp-interpret-all`, 10.4 µs/char).
- These are plain-literal alternations, so there is no exponential backtracking. The cost is (alternatives tried) × (positions).
- Lowercasing the text once beforehand beats the `i` flag by 2–3× for naive. `toLowerCase` keeps the length except for 'İ'; folding 285 KB takes 1.0 ms natively versus 9.2 ms in a JS loop.
- The lookbehind version is faster than the bare alternation, because it rejects positions in the middle of a word early.

### Recommendation
1. **Use Aho–Corasick** over UTF-16 code units of `foldCase(NFC)` text:
   - Fold case so the length is preserved: native `toLowerCase`, with a table fallback for 'İ'.
   - Fold every whitespace character to `' '`.
   - Compress the alphabet, store transitions as compact typed arrays with a dense root row, and keep the failure and output links in typed arrays.
   - Check boundaries with a 64K lookup table.
   - Run a shared resolver: case policy (exact / fold / fold-initial), then leftmost-longest selection, with exact-case matches winning ties.
2. **Second choice is tokens+hashmap.** It is simpler and handles whitespace runs natively.
3. **Use regex only for small auxiliary patterns under 20 KB**, for example acronym-shape lint.

I fixed one pitfall in my own build: the automaton's construction scaffolding was kept alive by closures. Moving construction into a separate `compileAc` function cut heap use from 17.8 MB to 2.5 MB.

## 2. Bloom filter

Implementation: `src/bloom.ts` (321 lines). Tests: `test/bloom.test.ts`; run with `node --test test/*.test.ts`, 10/10 pass.

**How it works:**
- Kirsch–Mitzenmacher double hashing: position i = (h1 + i·h2) mod m, for i = 0..k−1.
- h1 is FNV-1a 32 and h2 is MurmurHash3 x86_32, both over the UTF-8 bytes of the key, and h2 is forced odd.
- Sizing: m = ⌈−n·ln p/(ln 2)²⌉, rounded up to whole bytes, and k = round((m/n)·ln 2).
- The tests check reference values for FNV-1a, Murmur3 (including 1–3 byte tails) and CRC-32, and m/k values: (300k, 0.01) gives 2,875,520 bits with k=7; (300k, 0.001) gives 4,313,280 bits with k=10.

**Binary format (48-byte header):**
- Fields: `"LXBF"`, version, scheme, h1 id, h2 id, normalisation flags (NFC, lower-case), k (u16), seed (u32), m (u64), n (u64), p (f64), payload length, CRC-32.
- The normalisation used to build the filter is recorded, so a reader cannot accidentally query it with different conventions.
- Base64 uses RFC 4648 without Node's Buffer, so the module stays portable to the browser.
- `deserialize` is a total parser returning `Result`: bad magic, wrong version, truncation, wrong length and CRC mismatch each produce a typed error.

**Bug found by the tests:** `murmur | 1` returns a signed 32-bit integer, so about half the keys produced negative bit indices and therefore false negatives. Fixed with `>>> 0`.

**Empirical results** (keys NFC + lower-case):

| set | n | p | k | bits/key | binary | base64 | FPR, random strings | FPR, real words | query time |
|---|---|---|---|---|---|---|---|---|---|
| synthetic | 300,000 | 0.01 | 7 | 9.59 | 351 KB | 468 KB | 1.026e-2 | – | ~1.1 µs |
| synthetic | 300,000 | 0.001 | 10 | 14.38 | 527 KB | 702 KB | 1.025e-3 | – | ~1.1 µs |
| FrequencyWords top 300k | 300,000 | 0.01 | 7 | 9.59 | 351 KB | 468 KB | 1.009e-2 | 1.018e-2 (548k words) | 0.8–1.1 µs |
| FrequencyWords top 300k | 300,000 | 0.001 | 10 | 14.38 | 527 KB | 702 KB | 9.86e-4 | 9.98e-4 | 0.8–1.3 µs |
| VERO, all forms (no hyphens) | 2,727,284 | 0.01 | 7 | 9.59 | 3.19 MB | 4.25 MB | 1.001e-2 | 9.96e-3 | 1.4–1.7 µs |
| VERO, all forms (no hyphens) | 2,727,284 | 0.001 | 10 | 14.38 | 4.79 MB | 6.38 MB | 9.77e-4 | 1.04e-3 | 1.2–1.6 µs |

- False negatives: 0 in every run. Bits set ≈ 0.50–0.52, as theory predicts.
- Gzip does not shrink the filter at all, as expected for random-looking bits.
- Query time is dominated by `normalize()` and `TextEncoder`.
- For comparison, an exact `Set` of the 2.73M forms uses about 80 MB of heap; the raw list is 34.8 MB, or 6.8 MB gzipped.

**Exact alternative (`bench/dafsa.ts`):** a minimal DAFSA over the same 2.73M forms has 155,239 states and 456,573 transitions. It has 0 errors either way, builds in 4.5 s, and would pack to roughly 1.9–3.4 MB (my size estimate, not a measured file). Unitex's compressed DELAF_PB automaton covers 10.96M forms in 770,867 bytes. For a heavily inflected language, the exact structure wins.

**Asymmetric errors for "is this a known Portuguese word?"** A Bloom "no" is certain, so the word is safe to flag as unknown or foreign. A "yes" may be wrong with probability p, which only means a missed suggestion. A real Portuguese word is never flagged by mistake. So:
- The probabilistic check should only power lint and suggestions, never automatic markup.
- The foreign-word dictionary itself must never be probabilistic: a false positive there would italicise Portuguese words.

## 3. Word-list survey

All URLs below were checked through the proxy (200 OK unless noted). "Pinned" means a fixed git commit.

| source | how to fetch reproducibly | size | license | caveats (measured) |
|---|---|---|---|---|
| LibreOffice VERO pt_BR (Hunspell spell-checker dictionary, v3.3.0) | `raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/pt_BR/pt_BR.{dic,aff}` | .dic 4,477,695 B (312,368 stems); .aff 979,792 B | LGPLv3 and MPL (README); © 2006–2013 Raimundo Moura | Expanded with `hunspell-reader@8.19.4 words -u` (56 s) to 10,505,652 forms, of which 7,774,682 contain hyphens (enclitic forms like "despalhaste-se-lhe"); 2,730,970 without. **Includes many anglicisms:** software, mouse, site, link, show, marketing, design, online, hall, data, come, pane. 13,473 capitalised forms (place names, people, acronyms) are a free source of proper names. |
| npm `dictionary-pt@4.0.0` (wooorm; same VERO data) | pinned in `pnpm-lock`: `https://registry.npmjs.org/dictionary-pt/-/dictionary-pt-4.0.0.tgz`, integrity `sha512-ryJRhAts…uoFuq8Q==` | 5.46 MB unpacked | SPDX `(LGPL-3.0 OR MPL-2.0)` | Easiest reproducible fetch; affixes still need expanding. |
| hermitdave/FrequencyWords | `raw…/hermitdave/FrequencyWords/525f9b560de45753a5ea01069454e72e9aa541c6/content/2018/pt_br/pt_br_{50k,full}.txt` | 650,066 B; full list 9,882,799 B (848,043 lines; 280,147 with count ≥5) | content CC-BY-SA-4.0, code MIT | Built from movie subtitles and lower-cased. **23.9% of the top 50k are not VERO forms** ("ok, the, jack, you…"). A frequency list, not a lexicon: intersect it with VERO. |
| kaikki.org Portuguese (wiktextract, from the English Wiktionary dump of 2026-09-02) | `kaikki.org/dictionary/Portuguese/kaikki.org-dictionary-Portuguese.jsonl` (the file is overwritten): pin a sha256 plus the extraction date, or run wiktextract at commit `32bce658cb4ab7f10c52e94b5191ce0b273d9c0f` on a dated dump | 577,009,001 B | CC-BY-SA + GFDL ("same licenses as Wiktionary") | Etymology templates `ubor`/`bor` carry the source language, so it can **seed the foreign-word dictionary with lang codes**. A 25k-entry sample had 138 unadapted borrowings (80 en, 16 fr, 14 ja, 11 la…) and 1,027 adapted ones, plus plural forms. Needs review: it includes homographs like "case", "add", "in". |
| Portuguese Wiktionary dump | `dumps.wikimedia.org/ptwiktionary/20261001/ptwiktionary-20261001-pages-articles.xml.bz2`, sha1 `b0972df4b1532d7cf9ed27a6387a4bd4eefa528a` | 70,114,946 B | CC BY-SA 4.0 + GFDL | Dated dumps disappear after a few months, so mirror the file; raw wikitext needs parsing. |
| Unitex-PB DELAF_PB 2018 | `UnitexGramLab/unitex-lingua@70d73c571038e1a19ad9d77e77ab6d29e6c8ce82`, `pt-BR/Dela/DELAF_PB_2018.bin` | 770,867 B compressed automaton; 10,957,738 lines with part-of-speech and lemma, including clitic forms | LGPLLR (copyleft for linguistic resources) | Text version on request (infolingu.univ-mlv.fr); derived resources inherit LGPLLR. Abbreviations and acronyms are in a separate dictionary. |
| LR-POR/MorphoBr | `@b49015cd308f128338f1aae4b49f46c887ce9608` | 261 files, ~552 MB | Apache-2.0 (LICENSE file) | Derived from Unitex-PB, FreeLing and LABEL-LEX, so its license provenance is questionable. |
| pythonprobr/palavras | `@775e1c656d5a5654788d096042905e23c527a3f2/palavras.txt` | 3,783,146 B (>320k words) | MPL-2.0 | VERO stems only (no affix expansion); city names removed. |
| fserb/pt-br | `@93ba2a6f3b2f85262fba72df09d448c6bb2fa50a` (lexico 1.54 MB, 145,744 entries; conjugations; icf; lists of countries and municipalities) | 12.6 MB | MIT claimed | Built from "múltiplas fontes dicionárias", so provenance is unclear: risky. |
| VOLP (Academia Brasileira de Letras) | `academia.org.br/nossa-lingua/busca-no-vocabulario` | – | **"Direitos reservados"** (all rights reserved), no download | Includes the *Vocabulário de Estrangeirismos*; use for manual checks only, recorded in the `source:` field. Do not scrape. |
| LanguageTool portuguese-pos-dict | `@aa4805b5aabeed40506735726d873e70621cff00` | – | no LICENSE file at the repository root | Unclear: skip. |
| LexPorBR (Estivalet & Meunier 2017; 215k entries) | – | – | not found | Unresolved. "Lexique-pb" as such does not exist (Lexique is a French resource). |
| Proper names | GeoNames `BR.zip` (7,177,385 B); IBGE municipalities API; IBGE names API (needs GET); Wikidata | – | GeoNames CC BY 4.0; Wikidata CC0 | **The IBGE names API returns upper case without accents ("JOSE", "JOAO"):** do not use it for written forms. The municipalities API keeps accents. |

Cross-language collisions: 490 of the top 4,844 English words (about 10%) are also VERO forms, e.g. come, time, real, date, case, set, show.

**License consequence:** a filter or automaton generated from CC-BY-SA, LGPLLR or MPL data is a derived work. Ship a NOTICE file with the source and license next to the generated file.

## 4. Homographs, schema and order of precedence

- **Schema:** proposed YAML in `design/lexicon.example.yaml` and TypeScript types in `design/lexicon-schema.ts`.
  - Fields: `term`, `lang`, `kind` (foreign | latin | proper | acronym), `case`, `variants`, `vernacular`, `ambiguous`, `contexts` (before / after / notBefore / notAfter), `expansion`, `render`, `source`.
- **Build-time homograph check:** any single-word foreign entry that is also a Portuguese word (checked against the DAFSA) without `ambiguous: true` is a build error.
- **Ambiguous entries:**
  - They are marked only inside multi-word variants ("big data") or when their context rules match.
  - With no rule at all, they can only be marked inline, using `render: none`.
  - `vernacular: true` means an incorporated loanword such as "link": no italics and no `lang` attribute.
- **Order of precedence** (expressed as data, not branching code):
  1. Never touch code, inline code, math, raw HTML or link URLs.
  2. Explicit inline markup, such as a `:lang[…]{en}` directive or `<i lang>`.
  3. Frontmatter overrides: `add`, `ignore`, `vernacular`.
  4. The site dictionary.
  5. Unknown-word lint, which only reports and never marks up.
- **Acronyms, first-use rule:** threaded through the whole document. The first occurrence gets `<abbr title>` plus a `FIRST_USE_NOT_EXPANDED` warning. The author's text is never rewritten, to preserve the pipeline's "source text is recoverable" invariant. The list of acronyms can be generated from the marks.
- **Keeping the original text:** `nfcView` matches on the NFC copy and maps offsets back to the author's original characters (tested). If per-character normalisation disagrees with whole-string NFC, the node is skipped with a `NFC_VIEW_UNAVAILABLE` warning.
- **Prior art:**
  - HTML Living Standard, "the i element": "an idiomatic phrase from another language…", used with a `lang` attribute.
  - WCAG 2 SC 3.1.2, Language of Parts (Level AA), explicitly exempts "proper names, technical terms, words of indeterminate language, and words or phrases that have become part of the vernacular". So proper names and vernacular entries get no `lang`.
  - LaTeX babel `\foreignlanguage{english}{…}`, which also switches hyphenation, like CSS `hyphens: auto` with `lang`; polyglossia `\textlang`; the `glossaries` and `acro` packages for first-use expansion of acronyms.
- **ABNT:** NBR 14724:2011 §5.6 (from memory, not re-verified): the first mention is "Nome completo (SIGLA)". Italicising foreign words is a common institutional convention, not something I could confirm as an ABNT requirement, so treat it as a configurable style rule.

**Proposed layout:**
- `src/core/lexicon/`: `normalize` (NFC view, fold, boundary tables), `schema` (parser returning `Result`, reporting all errors at once), `automaton` (Aho–Corasick compile and scan), `membership` (DAFSA or Bloom behind one `MembershipFilter` interface), `resolve`, `codec` (versioned binary with CRC).
- `src/core/abnt/`: the first-use, italics and acronym-list rules.
- `src/adapters/unified/remark-abnt.ts`: sets `data.hName` / `hProperties` and never changes characters.
- A CLI with `build`, `check`, `suggest` and `add`.

`src/adapters/unified/context.ts` currently says lexicons are `.tsv`. The nested fields here (variants, contexts) favour YAML, so that comment needs a decision.

## Bloom filter code (core of `src/bloom.ts`)

The code below is verbatim. Serialisation, the total parser, CRC-32 and base64 are in the same file.

```ts
export const fnv1a32 = (bytes: Uint8Array, len: number = bytes.length): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < len; i++) { h ^= bytes[i]!; h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};
export const murmur3_32 = (bytes: Uint8Array, seed: number, len: number = bytes.length): number => {
  const c1 = 0xcc9e2d51; const c2 = 0x1b873593; let h = seed >>> 0; const nblocks = len >>> 2;
  for (let b = 0; b < nblocks; b++) {
    const i = b << 2;
    let k = bytes[i]! | (bytes[i + 1]! << 8) | (bytes[i + 2]! << 16) | (bytes[i + 3]! << 24);
    k = Math.imul(k, c1); k = (k << 15) | (k >>> 17); k = Math.imul(k, c2);
    h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  const tail = nblocks << 2; const rem = len & 3;
  if (rem > 0) {
    let k1 = 0;
    if (rem === 3) k1 ^= bytes[tail + 2]! << 16;
    if (rem >= 2) k1 ^= bytes[tail + 1]! << 8;
    k1 ^= bytes[tail]!;
    k1 = Math.imul(k1, c1); k1 = (k1 << 15) | (k1 >>> 17); k1 = Math.imul(k1, c2); h ^= k1;
  }
  h ^= len; h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
};
export const optimalParams = (n: number, p: number): BloomParams => {
  if (!(n > 0) || !(p > 0 && p < 1)) throw new RangeError(`optimalParams: n=${n}, p=${p}`);
  const raw = Math.ceil((-n * Math.log(p)) / (Math.LN2 * Math.LN2));
  const m = Math.ceil(raw / 8) * 8;
  const k = Math.max(1, Math.round((m / n) * Math.LN2));
  return { m, k };
};
export const expectedFpr = (m: number, k: number, n: number): number => (1 - Math.exp((-k * n) / m)) ** k;
const positions = (h: BloomHeader, key: string, visit: (bit: number) => boolean): boolean => {
  const len = utf8(key);                                   // TextEncoder.encodeInto into a reusable buffer
  const a = fnv1a32(scratch, len);
  const b = (murmur3_32(scratch, h.seed, len) | 1) >>> 0;  // odd, unsigned
  let x = a % h.m; const y = b % h.m;
  for (let i = 0; i < h.k; i++) { if (!visit(x)) return false; x += y; if (x >= h.m) x -= h.m; }
  return true;
};
export const buildBloom = (keys: Iterable<string>, n: number, p: number, opts: BuildOptions = {}): BloomFilter => {
  const { m, k } = optimalParams(n, p);
  const norm = opts.norm ?? NORM_NFC;
  const header: BloomHeader = { version: FORMAT_VERSION, scheme: SCHEME_KM, h1: HASH_FNV1A_32, h2: HASH_MURMUR3_32,
    seed: (opts.seed ?? 0x9747b28c) >>> 0, norm, k, m, n: 0, p };
  const bits = new Uint8Array(m / 8);
  let count = 0;
  for (const key of keys) {
    positions(header, normalizeKey(key, norm), (j) => { bits[j >>> 3]! |= 1 << (j & 7); return true; });
    count++;
  }
  return { header: { ...header, n: count }, bits };
};
export const has = (f: BloomFilter, key: string): boolean =>
  positions(f.header, normalizeKey(key, f.header.norm), (j) => (f.bits[j >>> 3]! & (1 << (j & 7))) !== 0);
```

## Files

All under `/tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/lexiconprobe/`:
- **Source:** `src/{text,resolve,bloom,types}.ts`, `src/strategies/{regex,aho,ngram}.ts`
- **Tests:** `test/{bloom,nfc}.test.ts`
- **Benchmarks:** `bench/{gen,run-one,run-all,correctness,v8-cliff,bloom-bench,dafsa,lexical-caveats}.ts`
- **Design:** `design/{lexicon-schema.ts,lexicon.example.yaml}`
- **Results:** `results-match.md`, `results-correctness.md`, `results-bloom.md`, `results-caveats.txt`
- **Data:** `data/` (downloaded lists, including `vero_expanded.txt` and `vero_nohyphen.txt`)
