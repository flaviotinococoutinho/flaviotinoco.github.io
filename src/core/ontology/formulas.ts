/**
 * TeX of the measures, rendered with KaTeX at build time wherever they are
 * explained (concept pages, ontology explorer). Language-neutral; the prose
 * around them lives in the i18n catalog. Uses the site macros (\operatorname).
 */

/** Seco, Veale & Hayes (2004), intrinsic information content. */
export const IC_TEX = String.raw`\operatorname{IC}(c) = 1 - \frac{\ln\bigl(\operatorname{hypo}(c) + 1\bigr)}{\ln N}`;

/** Resnik (1995), with the most informative common subsumer. */
export const RESNIK_TEX = String.raw`\operatorname{sim}_{\mathrm{Res}}(a, b) = \max_{c \,\in\, S(a, b)} \operatorname{IC}(c)`;

/** Lin (1998). */
export const LIN_TEX = String.raw`\operatorname{sim}_{\mathrm{Lin}}(a, b) = \frac{2\,\operatorname{IC}\bigl(\operatorname{lcs}(a, b)\bigr)}{\operatorname{IC}(a) + \operatorname{IC}(b)}`;
