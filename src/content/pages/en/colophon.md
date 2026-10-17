---
title: Colophon
description: 'How this site is made: typography, proportion, verified colour, accessibility, technology, editorial standards and privacy.'
lang: en
translationKey: colophon
slug: colophon
revisions:
  - date: 2026-10-11
    note: First version (seed text).
---

:::aside
**About this text.** This page was drafted with the assistance of an artificial intelligence (AI) system, Claude, as a demonstration of the site's template and is awaiting review by the author. It describes how the site is designed; where a feature is still planned rather than finished, the text says so.
:::

## Typography

Running text is set in Literata, a serif that TypeTogether designed, on commission from Google, for sustained reading in Google Play Books, and redrew in 2020 as a variable font with weight and optical-size axes: at small sizes the design has less contrast between thick and thin strokes; in headings, more. The interface uses Atkinson Hyperlegible Next, and code uses Atkinson Hyperlegible Mono, both released by the Braille Institute in 2025 as extensions of the original Atkinson Hyperlegible, which was designed for readers with low vision. In these faces, characters that are easily confused — capital I, lower-case l and the digit 1, or O and 0 — get clearly distinct shapes, which matters for labels, numbers and code.

The reading column is 66ch wide. Bringhurst regards lines of 45 to 75 characters as satisfactory for a single-column page set in a serif text face, with 66 as the ideal [@bringhurst2004]; the ch unit of Cascading Style Sheets (CSS), however, is the width of the digit zero, so in a proportional face 66ch is not exactly 66 characters — it is an approximation. Text is set flush left and never justified. Hyphenation is done by the browser, according to the declared language of each passage, and can be switched off in the preferences. TeX hyphenates with Liang's pattern algorithm [@liang1983], described in *The TeXbook* [@knuth1984]; here the job is left to the browser.

Foreign words are set in italics and tagged with their language, which also guides screen readers and hyphenation; proper names are not hyphenated; acronyms carry their expansion. This markup is applied automatically from dictionaries and can be corrected by the author in each text.

## Proportion

The measurements derive from a single ratio, φ ≈ 1.618. The type scale is fluid: between screens 360 px and 1440 px wide, body text grows from 17 px to 20 px, and the ratio between successive steps grows from 1.2 to √φ ≈ 1.272, so that on wide screens every second step lands exactly on a power of φ. The line height of running text is φ; spacing comes in powers of φ, from φ⁻⁴ to φ⁵ (in rem); the reading column and the margin column stand in the ratio φ : 1. Animation durations are Fibonacci numbers of milliseconds — 89, 144, 233, 377, 610, 987 and 1597 — whose successive ratios tend to φ, so that time shares the proportion of space.

This is a choice made for internal coherence, not a claim that φ is perceptually superior to other ratios — a thesis this site neither examines nor assumes.

## Colour

Colours are defined as design tokens, in the design-tokens format of the World Wide Web Consortium (W3C), in the OKLCH colour space, and checked automatically on every change. The checker requires:

- every colour to lie within the sRGB gamut;
- contrast under the Web Content Accessibility Guidelines (WCAG) of at least 7:1 (level AAA) for body, secondary and link text on every surface, and of at least 4.5:1 for subtle text;
- contrast under the Accessible Perceptual Contrast Algorithm (APCA) of at least Lc 75 for body text;
- contrast of at least 3:1 for control borders and the focus indicator;
- at most 16:1 between text and background in the usual schemes, to avoid pure black on pure white;
- the four stratum colours to remain mutually distinguishable under simulated protanopia, deuteranopia and tritanopia, using the model of Machado, Oliveira and Fernandes [@machado2009], with a minimum CIEDE2000 difference of 8 (and of 15 for typical vision), and their lightness to increase strictly in the order of the strata under simulated achromatopsia.

These guarantees have limits worth stating. The simulation uses the full severity of each dichromacy and approximates achromatopsia by luminance; it does not cover every anomalous trichromacy, low vision, differences between screens or ambient light. The thresholds are design choices, not perceptual constants: whether a colour difference is noticeable depends, among other things, on the size of the mark, and small marks need larger differences [@szafir2018]. That is why colour is never the only carrier of meaning: strata are always identified by shape and label as well. There are light and dark schemes, and higher-contrast variants of both.

## Accessibility

The target is conformance with WCAG 2.2 at level AA, with text contrast at level AAA. The site is designed with semantic HyperText Markup Language (HTML) and landmarks, a skip link, an always-visible focus indicator, full keyboard operation, declared language on foreign passages, formulas also rendered as MathML for assistive technologies, respect for the system's reduced-motion setting — with its own control in the preferences — switchable hyphenation, no meaning conveyed by colour alone, and useful content without JavaScript in every interactive element. Continuous integration includes automated accessibility checks in both the light and the dark theme.

Known limitations:

- automated checks catch only part of the problems;
- the opening texts have not yet been assessed by people who use screen readers every day;
- the labs rely on graphics whose text equivalents may still be incomplete;
- MathML support varies between screen readers;
- estimated reading time uses the average of 238 words per minute measured for silent reading of non-fiction in English [@brysbaert2019]; it is also applied to the Portuguese texts, and it varies widely from person to person.

**TODO (author):** a channel for reporting accessibility barriers.

## Technology

The site is static, generated with Astro 7 and published on GitHub Pages. Texts are plain Markdown, written in a closed language of directives for mathematical environments, citations, notes and concepts, and processed by a chain of unified stages (remark and rehype), each backed by pure, tested functions. Formulas are written in TeX notation [@knuth1984] and typeset by KaTeX. The labs use small computing kernels written in Rust and compiled to WebAssembly — the fast Fourier transform [@cooley1965], entropy and Huffman codes, the logistic map, random sums — loaded only on the pages that use them. Search uses Pagefind, which builds a static index queried in the browser itself. Interactive behaviour is implemented as custom elements loaded on demand, with no user-interface framework on the client. The dictionaries that mark foreign words, proper names and acronyms are compiled into fast lookup structures; a Bloom filter [@bloom1970] with double hashing [@kirsch2008] is planned for future command-line tools.

The source code is at <https://github.com/flaviotinococoutinho/flaviotinoco.github.io>.

## Editorial ethics

Every essay and lab declares:

- its **provenance**: whether it was written without assistance, with assistance, or generated with AI help, and whether the author has reviewed it;
- its **epistemic status**: confidence on Kent's scale [@kent1964] and the kind of support — proof, empirical evidence, argument or speculation;
- its **revision history**, with the date and a note for each significant change.

| Expression | Approximate probability |
|---|---|
| Certain | 100 % |
| Almost certain | 93 %, give or take about 6 points |
| Probable | 75 %, give or take about 12 points |
| Chances about even | 50 %, give or take about 10 points |
| Probably not | 30 %, give or take about 10 points |
| Almost certainly not | 7 %, give or take about 5 points |

Non-trivial factual claims come with a source. Direct quotations are exact, in quotation marks, with the page number where there is one; the author's own translations are marked as such. In Portuguese, citations follow the author-date system of the Brazilian Association of Technical Standards (ABNT; from the Portuguese :foreign[Associação Brasileira de Normas Técnicas]{lang=pt-BR}), set out in Brazilian Standard (NBR; from the Portuguese :foreign[Norma Brasileira]{lang=pt-BR}) 10520:2023, and reference lists follow ABNT NBR 6023:2025; in English, the style of the American Psychological Association (APA), 7th edition. Numbers and units follow the International System of Units, with a space between the number and the unit symbol, as in 10 kHz. Empirical claims are stated, wherever possible, so that they could be tested and refuted [@popper1959]; when the evidence falls short, the text says so.

## Privacy

The site uses no tracking, no audience analytics and no cookies, and loads no third-party resources: the fonts are served by the site itself. Reading preferences — theme, contrast, motion, hyphenation, texture and text options — are kept only in your browser's local storage (`localStorage`) and are never sent anywhere; clearing them restores the defaults. Search runs in the browser, over a static index. The hosting service, GitHub Pages, may log technical request data such as IP addresses under GitHub's own policies, which this site does not control.

## Licence

**TODO (author):** the licence for the texts and the code has not been chosen yet.

::bibliography
