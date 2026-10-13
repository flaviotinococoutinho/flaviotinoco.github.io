/**
 * Heading slugs, compatible with github-slugger 2 (the slugger Astro uses for
 * heading ids), reimplemented as a pure function so the reading stage can
 * assign every heading id at remark time — before Astro's rehypeHeadingIds,
 * which keeps ids that are already present.
 *
 * github-slugger lower-cases the text, deletes every code point that is not
 * Alphabetic, Mark, Decimal_Number, Connector_Punctuation or Join_Control
 * (its generated regex is exactly that set for the Unicode version it was
 * built from; verified exhaustively over U+0000–U+10FFFF: the only differences
 * are code points assigned after that version), keeps spaces and hyphens, and
 * turns each space into "-". Duplicates get "-1", "-2", … in order.
 */

const STRIP = /[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control} -]/gu;

/** Slug of a text (no de-duplication). Never empty: falls back to "section". */
export const slugify = (text: string): string => {
  const s = text.toLowerCase().replace(STRIP, '').replace(/ /g, '-');
  return s.length > 0 ? s : 'section';
};

/**
 * Unique slugs for a sequence of texts, avoiding `reserved` ids, with the
 * de-duplication scheme of github-slugger (BananaSlug#slug).
 */
export const uniqueSlugs = (texts: readonly string[], reserved: Iterable<string>): readonly string[] => {
  const occurrences = new Map<string, number>();
  for (const id of reserved) occurrences.set(id, 0);
  return texts.map((text) => {
    const original = slugify(text);
    let result = original;
    while (occurrences.has(result)) {
      const count = (occurrences.get(original) ?? 0) + 1;
      occurrences.set(original, count);
      result = `${original}-${count}`;
    }
    occurrences.set(result, 0);
    return result;
  });
};
