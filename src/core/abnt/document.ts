/**
 * Document view for the lint rules — a tree-agnostic projection of the Markdown
 * document built by the adapter: the plain text of every block (paragraph,
 * heading, table cell), in document order, plus the occurrences the marking
 * pass observed. Lint rules are pure functions of this view; positions are
 * opaque `anchor` numbers that only the adapter can turn into source positions.
 */
import type { Locale } from '../domain/locale.ts';
import type { Params } from '../i18n/messages.ts';
import type { AcronymEntry, ForeignEntry, HomographEntry, LatinEntry } from '../lexicon/types.ts';
import type abntMessages from '../i18n/catalogs/abnt.ts';

export type BlockKind = 'paragraph' | 'heading' | 'cell' | 'other';

export type Occurrence =
  | {
      readonly kind: 'acronym';
      readonly anchor: number;
      readonly start: number;
      readonly end: number;
      /** Canonical term (dictionary term, or the explicit :abbr text in NFC). */
      readonly term: string;
      readonly entry: AcronymEntry | undefined;
      /** Title written by the author in an explicit :abbr[…]{title}. */
      readonly title: string | undefined;
    }
  | {
      readonly kind: 'homograph';
      readonly anchor: number;
      readonly start: number;
      readonly end: number;
      readonly surface: string;
      readonly entry: HomographEntry;
    }
  | {
      readonly kind: 'hand-italic';
      readonly anchor: number;
      readonly start: number;
      readonly end: number;
      readonly surface: string;
      readonly entry: ForeignEntry | LatinEntry;
    };

export interface DocBlock {
  readonly kind: BlockKind;
  readonly anchor: number;
  /** Plain text of the block (mdast-util-to-string semantics), NFC. */
  readonly text: string;
  readonly occurrences: readonly Occurrence[];
}

export interface DocView {
  readonly locale: Locale;
  readonly blocks: readonly DocBlock[];
}

export type MessageKey = keyof (typeof abntMessages)['pt-BR'];

export interface Finding {
  readonly ruleId: string;
  readonly anchor: number;
  readonly message: MessageKey;
  readonly params: Params;
}
