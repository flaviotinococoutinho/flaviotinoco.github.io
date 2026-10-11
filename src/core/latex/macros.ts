/**
 * Shared TeX macros — one notation for the whole site, as a LaTeX preamble
 * would provide. Changing a macro here changes every formula consistently.
 *
 * Notation follows Cover & Thomas, "Elements of Information Theory" (2nd ed.,
 * 2006) for information measures and ISO 80000-2:2019 for mathematical signs.
 */
export const MACROS: Readonly<Record<string, string>> = {
  // number sets (ISO 80000-2)
  '\\N': '\\mathbb{N}',
  '\\Z': '\\mathbb{Z}',
  '\\Q': '\\mathbb{Q}',
  '\\R': '\\mathbb{R}',
  '\\C': '\\mathbb{C}',
  // probability and information (Cover & Thomas)
  '\\E': '\\operatorname{\\mathbb{E}}',
  '\\Var': '\\operatorname{Var}',
  '\\Prob': '\\operatorname{P}',
  '\\H': '\\operatorname{H}',
  '\\I': '\\operatorname{I}',
  '\\KL': 'D_{\\mathrm{KL}}\\infdivx',
  '\\infdivx': '\\left(#1\\,\\middle\\|\\,#2\\right)',
  // calculus and analysis
  '\\d': '\\mathop{}\\!\\mathrm{d}',
  '\\e': '\\mathrm{e}',
  '\\i': '\\mathrm{i}',
  '\\sinc': '\\operatorname{sinc}',
  '\\abs': '\\left\\lvert #1 \\right\\rvert',
  '\\norm': '\\left\\lVert #1 \\right\\rVert',
  '\\set': '\\left\\{ #1 \\right\\}',
  '\\F': '\\mathcal{F}',
  // logic and semantics
  '\\defeq': '\\coloneqq',
  '\\entails': '\\vDash',
  '\\proves': '\\vdash',
};

/** Options for rehype-katex (KaTeX ≥ 0.16 option names). */
export const KATEX_OPTIONS = {
  macros: { ...MACROS },
  /** HTML for sighted readers + MathML for assistive technology and copy/paste of the TeX source. */
  output: 'htmlAndMathml',
  /**
   * Strictness: every LaTeX-compatibility issue is an error (unicode letters must
   * go inside \text{…}), except the HTML extensions we explicitly trust below.
   * KaTeX ≥ 0.19 requires the callback to return a value, never undefined.
   */
  strict: (code: string): 'ignore' | 'error' => (code === 'htmlExtension' ? 'ignore' : 'error'),
  /** Allow only the HTML-extension commands used by annotated formulas, never \url/\href. */
  trust: (context: { readonly command: string }): boolean => ['\\htmlClass', '\\htmlData'].includes(context.command),
} as const;
