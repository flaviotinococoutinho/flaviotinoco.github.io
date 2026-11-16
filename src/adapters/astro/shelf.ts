/**
 * The shelf of the reading room (ADR 0014): the corpus of a locale as books, oldest first, essays then labs.
 *
 * One list feeds two outputs, so they line up by construction: the `shelf` attribute of <ft-reading-room>
 * on every essay page (geometry: stratum, form, thickness, which one is being read; encodeShelf) and the
 * endpoint /<lang>/shelf.json (titles and links, fetched only when the reader has lit the room;
 * encodeShelfLabels). The n-th label belongs to the n-th book.
 */
import { bookSize, SHELF_MAX, type ShelfBook, type ShelfLabel } from '../../core/chrome/room.ts';
import type { Locale } from '../../core/domain/locale.ts';
import type { Stratum } from '../../core/domain/strata.ts';
import { essays, labs, routeOfEssay, routeOfLab } from './content.ts';
import { href } from './i18n.ts';

export interface ShelfWork {
  readonly id: string;
  readonly stratum: Stratum;
  readonly form: 'essay' | 'lab';
  readonly size: number;
  readonly title: string;
  readonly href: string;
}

const oldestFirst = <T extends { readonly data: { readonly published: Date } }>(works: readonly T[]): T[] =>
  [...works].sort((a, b) => a.data.published.valueOf() - b.data.published.valueOf());

export const siteShelf = async (locale: Locale): Promise<readonly ShelfWork[]> => {
  const [allEssays, allLabs] = await Promise.all([essays(locale), labs(locale)]);
  return [
    ...oldestFirst(allEssays).map((e): ShelfWork => ({
      id: e.id,
      stratum: e.data.stratum,
      form: 'essay',
      size: bookSize(e.body?.length ?? 0),
      title: e.data.title,
      href: href(routeOfEssay(e), locale),
    })),
    ...oldestFirst(allLabs).map((l): ShelfWork => ({
      id: l.id,
      stratum: l.data.stratum,
      form: 'lab',
      size: bookSize(l.body?.length ?? 0),
      title: l.data.title,
      href: href(routeOfLab(l), locale),
    })),
  ].slice(0, SHELF_MAX);
};

/** The books for the page of the essay `essayId` (it is off the shelf, on the desk). */
export const shelfBooks = (works: readonly ShelfWork[], essayId: string): readonly ShelfBook[] =>
  works.map(({ id, stratum, form, size }) => ({ stratum, form, size, current: form === 'essay' && id === essayId }));

export const shelfLabels = (works: readonly ShelfWork[]): readonly ShelfLabel[] =>
  works.map(({ title, href: link }) => ({ title, href: link }));
