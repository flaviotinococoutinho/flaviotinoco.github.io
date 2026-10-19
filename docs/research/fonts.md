# Reading fonts for a pt-BR + English site: sizes, features and legibility evidence

I measured fontsource 5.3.x `latin` woff2 files and upstream google/fonts TTFs with fonttools 4.66.1 and brotli. Sizes are in KB (1024 bytes). Everything is under `/tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/`. The project repo was not touched.

## 1. Subsets and Portuguese coverage

**Does Portuguese need `latin-ext`? No.** The fontsource `latin` unicode-range is `U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD`.
- All Portuguese letters (áàâãéêíóôõúüç, their capitals, and ºª) fall in U+00C0-00FF or Latin-1.
- U+00AD (soft hyphen) falls in U+0000-00FF.
- U+2009, U+2013, U+2014, U+2018-201D, U+2026 and U+202F fall in U+2000-206F.
- `latin-ext` (U+0100-02BA and others) only matters for foreign names with letters like ł, ş, č or ő. It would cost 41.7 KB more for Literata wght.
- **Range gap:** U+2190/U+2192 (← →) are in no fontsource range, so they render in a fallback font.

**Glyphs missing even though the range covers them** (checked in each font's cmap):
- Every candidate lacks U+2011 (non-breaking hyphen).
- Every candidate except Inter lacks U+202F (narrow no-break space). It matters for French text, not Portuguese.
- U+2009 (thin space) is missing in Newsreader, Fraunces, JetBrains Mono and Atkinson Hyperlegible v1.
- U+00AD is missing in Atkinson Next, Atkinson Mono and Inter. This does no harm: the browser draws the hyphen at a line break itself.

**Fontsource and Google Fonts strip OpenType features.** The fontsource latin files keep only kern, liga, pnum, tnum, frac and calt. onum, smcp, c2sc, sups, ordn, case and zero are removed. Google documents this for its API ([Google Fonts Knowledge](https://fonts.google.com/knowledge/using_type/implementing_open_type_features_on_the_web)). The upstream TTFs still contain them, so oldstyle figures and small caps require subsetting the upstream files yourself.

**CSS entry files:**
- `index.css` is byte-identical to `wght.css` in every package.
- `standard.css` and `opsz.css` (or `wdth.css`) load the same woff2.
- Only Fraunces has `full.css`, plus `soft.css` and `wonk.css`.
- Every family has `-italic` versions of each entry.
- Charis SIL has no variable package; only static `@fontsource/charis-sil` exists.

## 2. Sizes and features of the stock fontsource latin files

"Upstream features" is what the google/fonts source TTF contains. "True italic?" is a heuristic: how many of a–z have a different outline construction in the italic file than in the roman.

| Font | Variable entries | Axes | Var latin, normal / italic | Static latin 400 / 400i / 600 | Upstream features (fontsource keeps only kern, liga, pnum, tnum, frac) | True italic? |
|---|---|---|---|---|---|---|
| **Literata** | wght, opsz (= standard) | opsz 7–72, wght 200–900 | wght **51.3 / 52.5**; opsz 107.5 / 110.5 | 19.9 / 20.7 / 21.3 | kern liga **onum** lnum pnum tnum **smcp c2sc** frac sups subs ordn case, in roman and italic | yes (25/26) |
| Source Serif 4 | wght, opsz | wght 200–900, opsz 8–60 | 49.7 / 50.4; 119.5 / 127.1 | 19.6 / 19.6 / 21.0 | onum, tnum, frac, sups; **smcp in roman only** | yes (25/26) |
| Newsreader | wght, opsz | wght 200–800, opsz 6–72 | 56.7 / 63.0; 128.9 / 143.4 | 22.0 / 23.8 / 23.3 | kern liga pnum tnum sups ordn case; **no onum, smcp or frac**; no U+2009 | yes (25/26) |
| Fraunces | wght, opsz, soft, wonk, full | opsz 9–144, wght 100–900, SOFT, WONK | wght 35.8 / 44.6; opsz 65.7 / 79.6; full 118.2 / 146.2 | – | kern liga case ss01 only (no onum, tnum, smcp or frac) | yes (25/26) |
| Charis SIL | static only | – | – | 22.0 / 23.2 / (700) 21.8 | liga smcp c2sc; **no kerning, no onum or tnum** | yes (24/26) |
| **Atkinson Hyperlegible Next** | wght | wght 200–800 | **33.2 / 36.8** | 11.8 / 13.8 / 12.4 | kern pnum tnum frac sups ordn case; no onum or smcp | **oblique** (0/26) |
| Inter | wght, opsz | opsz 14–32, wght 100–900 | 47.1 / 50.6; 71.2 / 77.8 | 23.1 / 24.5 / 23.9 | kern pnum tnum frac sups subs ordn case zero ss01 calt | mostly oblique (4/26) |
| IBM Plex Sans | wght, wdth | wght 100–700, wdth 75–100 | 44.6 / 49.0; 64.0 / 74.0 | 22.1 / 23.8 / 23.7 | kern liga onum lnum frac sups subs ordn zero; no smcp | largely (19/26) |
| **Atkinson Hyperlegible Mono** | wght | wght 200–800 | **17.3 / 18.6** | **9.8** / 10.6 / 9.8 | frac sups ordn case zero | oblique (0/26) |
| JetBrains Mono | wght | wght 100–800 | 39.5 / 42.0 | 20.7 / 21.7 / 21.3 | calt frac sups subs ordn case zero | mostly oblique (3/26) |

Atkinson Hyperlegible v1 static 400 is 16.8 KB. Every fontsource file carries only a `prep` table, with no `fpgm` or `cvt`, so in practice none of them are hinted.

## 3. Subsetting with fonttools (pt + en character set, woff2, no hinting)

fontTools was not installed; `pip install fonttools brotli` worked. The character set has 220 code points:
- ASCII and U+00A0-00FF
- Œœ
- U+2009-200B, U+2010-2011, U+2013-2014, U+2018-201E, U+2020-2022, U+2026, U+202F, U+2032-2033, U+2039-203A
- € ™ ←↑→↓ −

| Literata variant (from upstream TTF) | Roman | Italic | Features kept |
|---|---|---|---|
| Full opsz + wght axes, all features | 150.5 | 148.1 | all; 430 glyphs including small caps and oldstyle figures |
| Full axes, kern + liga only | 99.5 | – | |
| opsz fixed at 12, wght 200–900, all features | 69.1 | 69.4 | |
| **opsz fixed at 12, wght 400–700, all features** | **48.1** | **48.2** | kern liga onum lnum pnum tnum smcp c2sc frac sups subs ordn case |
| opsz 12, wght **350**–700, all features | 63.1 | – | Going below the 400 default keeps both sets of weight variation data |
| opsz 12, wght 400–700, without smcp, c2sc, sups and subs | **37.7** | **39.3** | onum, tnum and frac kept |
| opsz 12, wght 400–700, kern + liga only | 31.8 | 33.4 | |
| Static 400 / static 600, all features | 25.3 / 28.2 | 25.8 / 28.7 | |
| Fontsource wght file re-subset (+ wght 400–700) | 48.7 (33.3) | – | no onum or smcp, since already stripped |

- **Outline accuracy:** the font limited to 400–700, set to 700 and to 550, differs from the original by at most 1.5 units out of 1000. That is visually identical.
- **Other fonts, subset the same way:**
  - Source Serif 4 (opsz 20, wght 400–700): 52.6 KB roman, 42.4 KB italic.
  - Newsreader (opsz 18, wght 400–700): 40.1 / 44.3.
  - Atkinson Next (wght 400–700): **18.5**. Full 200–800: 31.3 roman, 34.6 italic.
  - Atkinson Mono static 400: **8.8**.
  - Inter (opsz 14, full wght): 46.5.
  - JetBrains Mono static 400: 19.5.

Command recipe, tested; it gives 48.1 / 48.2 KB:
```
fonttools varLib.instancer "Literata[opsz,wght].ttf" opsz=12 wght=400:700 -o lit.ttf
pyftsubset lit.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+0152-0153,U+2009-200B,U+2010-2011,U+2013-2014,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+202F,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212" --layout-features="ccmp,locl,mark,mkmk,rvrn,calt,rlig,kern,liga,onum,lnum,pnum,tnum,smcp,c2sc,frac,numr,dnom,sups,subs,ordn,case" --flavor=woff2 --no-hinting --drop-tables+=vhea,vmtx --name-IDs=0,1,2,3,4,5,6 --output-file=literata-ptEN-roman.woff2
```

## 4. Legibility evidence

**Atkinson Hyperlegible**
- Design goals: Braille Institute and Applied Design Works designed it for low-vision readers. Letterforms that are easy to confuse are deliberately made distinct, for example a serifed capital I, a longer crossbar on F than on E, and angled spurs. The original had 27 languages ([Wikipedia](https://en.wikipedia.org/wiki/Atkinson_Hyperlegible)).
- The 2025 releases, announced 10–11 Feb 2025:
  - Next has 7 weights with italics, 150+ languages and a variable version.
  - A monospace version was added for coders.
  - Sources: [Ophthalmology Management](https://ophthalmologymanagement.com/news/2025/applied-design-and-braille-institute-partner-to-launch-typeface-for-making-reading-easier/), [Tietze](https://christiantietze.de/posts/2025/02/atkinson-hyperlegible-font-next-mono/), [Braille Institute](https://www.brailleinstitute.org/freefont/).
- **I found no peer-reviewed study of reading outcomes for it.** A CSUN 2024 session listed a study but published no results ([CSUN](https://www.csun.edu/cod/conference/sessions/2024/index.php/public/presentations/view/3108.html)).
- My measurements show the italics in both Next and Mono are slanted romans (obliques), not true italics.

**Literata**
- Brief: "Google needed a type family that would excel in continuous reading across a wide range of screens and pixel densities."
- To cope with pixelation, the designers chose "a rather dark regular weight and generous letter spacing" and a nearly upright italic. The `post` table's italicAngle is −2°, which matches.
- Version 3 (2020) is a variable font with weight and optical-size axes, aimed at "intensive editorial use, especially on screens". It has small caps and oldstyle figures.
- Sources: [TypeTogether, Literata 3](https://www.typetogether.com/literata-3), [TypeTogether, Literata](https://www.typetogether.com/Literata), [github.com/googlefonts/literata](https://github.com/googlefonts/literata).

**Serif vs sans on screen**
- Wallace et al. 2022, ACM TOCHI ([doi:10.1145/3502222](https://doi.org/10.1145/3502222), [PDF](https://jeffhuang.com/papers/Readability_TOCHI22.pdf)):
  - 352 crowdsourced readers, 16 fonts (3 serif, 13 sans).
  - Each reader's fastest font was 35% faster than their slowest (314 vs 232 WPM), with comprehension unchanged.
  - No single font was best for everyone, and preference did not predict speed.
  - EB Garamond, a serif, was fastest on average at 312 WPM; Open Sans was slowest at 254 WPM.
  - EB Garamond and Montserrat helped readers aged 35 and over.
  - Caveat: the passages were short ("interlude reading"), not long-form.
- Bernard, Chaparro, Mills & Halcomb 2003, IJHCS 59(6):823–835 ([doi:10.1016/S1071-5819(03)00121-6](https://doi.org/10.1016/S1071-5819(03)00121-6)): Times vs Arial at 10 and 12 pt. Only 10-pt anti-aliased Arial was read more slowly. This was on screens of that era.
- Bernard, Mills, Peterson & Storrer 2001, Usability News 3(2): reported no significant legibility difference among 12 online fonts. I only saw this second-hand ([original URL](http://psychology.wichita.edu/surl/usabilitynews/3S/font.htm)).
- Boyarski et al. 1998, CHI: fonts designed for the screen (the Georgia/Verdana era) did well ([link](https://consensus.app/papers/details/78d0308078fe533fb38adac4bff8bf92/?utm_source=claude_desktop)).
- Daxer et al. 2022: Helvetica and Times gave the same reading speed, r = 0.93 ([link](https://consensus.app/papers/details/dbb5f6021c7d571a8b82f42800ad8b8f/?utm_source=claude_desktop)).
- Vecino et al. 2022: serif and sans within one family had no effect on reading speed ([link](https://consensus.app/papers/details/b22081f93dfd5f2fae7c31d1a7186725/?utm_source=claude_desktop)).
- Minakata et al. 2022: stroke contrast interacts with serifs. Sans works best with low contrast; serif works best with high contrast ([link](https://consensus.app/papers/details/6cea31a8ea9a5b4b8eaba5da00b060d6/?utm_source=claude_desktop)). In low-vision readers, serifs with low contrast were best ([link](https://consensus.app/papers/details/24a077e40fe552269c3eb5d720d94983/?utm_source=claude_desktop)).
- Russell-Minda et al. 2007, a review of low-vision research: findings are inconsistent ([link](https://consensus.app/papers/details/f6fa4be0f3db5027b65aabdfbccdbaaa/?utm_source=claude_desktop)).
- **Overall:** the evidence does not support serif or sans as a category. Size, x-height, weight and fit to the individual reader matter more. Choosing a font for screen-optimised design and features is defensible.

## 5. Recommendation

1. **Body text: Literata, subset yourself from upstream.** Fix opsz at 12 and limit wght to 400–700.
   - With all features: **48.1 KB roman** (preload this one) and **48.2 KB italic** (it only downloads when italics are used). Headings at 600–700 come from the same file at no extra cost.
   - Leaner version without small caps: 37.7 + 39.3 KB.
   - Stock fontsource Literata Variable is 51.3 + 52.5 = 103.8 KB with no onum or smcp; the opsz files are 218 KB.
   - It is the only candidate with onum, tnum, smcp and frac in both roman and italic, plus a true italic.
   - Alternatives fall short:
     - Source Serif 4 is about the same size but its italic has no small caps.
     - Newsreader lacks onum, smcp, frac and the thin space.
     - Fraunces is a display face without onum or tnum.
     - Charis SIL has no kerning and no onum.
2. **UI text: Atkinson Hyperlegible Next, wght 400–700, subset: 18.5 KB.** Fontsource variable is 33.2 KB; static 400 + 600 is 24.2 KB. Inter costs 46.5–47.1 KB. Avoid italic UI text, because Atkinson's italic is just slanted. Alternatively, `system-ui` costs 0 KB.
3. **Code: Atkinson Hyperlegible Mono static 400: 8.8 KB** subset, 9.8 KB from fontsource. Load it only on pages with code. JetBrains Mono is 20.7 KB.
4. **Typical page cost:**

   | Page | Full features | Without small caps |
   |---|---|---|
   | Text + italics + UI | ≈115 KB | ≈95.5 KB |
   | + code | ≈124 KB | ≈104 KB |

   Smallest option: static Literata 400 + 400i at 51.1 KB, with a system UI font.
5. **Use only the `latin` subset; it covers pt-BR and English.** Add a fallback for →, U+2011 and U+202F, or avoid them; use U+00A0 instead of U+202F.

## Files
- **Scripts:** `.../scratchpad/fontprobe-scripts/` (`measure.py`, `upfeats.py`, `subset.py`, `subset2.py`, `italic.py`)
- **Raw measurements:** `.../scratchpad/fontprobe-scripts/out.json`
- **Packages:** `.../scratchpad/fontprobe/node_modules/@fontsource{,-variable}/`
- **Upstream TTFs:** `.../scratchpad/fontprobe-upstream/`
- **Subset outputs:** `.../scratchpad/fontprobe/subset-out/` (44 woff2 files)
- **CLI recipe output:** `.../scratchpad/fontprobe/cli/literata-ptEN-{roman,italic}.woff2`

Upgrade to Consensus Pro to return 20 results per search instead of 10, and include more data like study design and key takeaways for every result.: https://consensus.app/pricing/?utm_source=claude_desktop
