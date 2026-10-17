/**
 * Codec: cross-reference Label ⇄ HTML id.
 *
 * Labels follow the LaTeX convention `prefix:name` (thm:amostragem). HTML ids
 * may contain ':' but it must be escaped in CSS selectors and in some URL
 * contexts, so the id replaces the colon by a hyphen (thm-amostragem).
 *
 * Law (tested): decode ∘ encode = id. It holds because the prefix grammar
 * `[a-z]+` contains no hyphen, so the FIRST hyphen of an id is always the one
 * that replaced the colon — the mapping is injective and its inverse total on
 * its image.
 *
 * Generated ids that do not come from a label (unlabelled environments, head
 * and caption ids) contain an underscore, which the label grammar forbids, so
 * they can never collide with a label-derived id.
 */
import { err, type Result } from '../algebra/result.ts';
import { parseLabel, type Label } from '../domain/identifiers.ts';

export const labelToId = (label: Label): string => label.replace(':', '-');

export const idToLabel = (id: string): Result<Label, string> => {
  const separator = id.indexOf('-');
  if (separator <= 0) return err(`id "${id}" does not encode a label`);
  return parseLabel(`${id.slice(0, separator)}:${id.slice(separator + 1)}`);
};

export const labelCodec = { encode: labelToId, decode: idToLabel } as const;

/** Id of the heading/caption that names a labelled or anonymous item (aria-labelledby target). */
export const partId = (owner: string, part: 'head' | 'caption'): string => `${owner}__${part}`;

/** Id for an unlabelled item, by kind and document ordinal (e.g. env_3). */
export const anonymousId = (kind: 'env' | 'figure', ordinal: number): string => `${kind}_${String(ordinal)}`;
