/**
 * The style of each document language (docs/arquitetura.md §5.4): pt-BR
 * documents follow ABNT (NBR 10520:2023 calls, NBR 6023:2025 references), English
 * documents APA 7. One table, so the Markdown stage and every other consumer
 * (the "how to cite" box, feeds) can never disagree.
 */
import type { Locale } from '../../domain/locale.ts';
import { abnt } from './abnt.ts';
import { apa } from './apa.ts';
import type { CitationStyle } from './style.ts';

export const STYLES: Readonly<Record<Locale, CitationStyle>> = { 'pt-BR': abnt, en: apa };

export const styleFor = (locale: Locale): CitationStyle => STYLES[locale];
