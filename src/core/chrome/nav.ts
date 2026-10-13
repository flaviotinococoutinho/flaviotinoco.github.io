/**
 * Navigation helpers for the site chrome (pure).
 *
 * aria-current (WAI-ARIA 1.2): "page" marks the link to the page being shown;
 * "true" marks a link to a section that contains it (e.g. "Essays" while
 * reading an essay), so the reader knows where they are without relying on
 * visual styling alone.
 */
import type { Locale } from '../domain/locale.ts';

export type Currentness = 'page' | 'true' | null;

const withSlash = (p: string): string => (p.endsWith('/') ? p : `${p}/`);

/**
 * @param pathname current URL path (as served, base included)
 * @param target   link target path (base included, trailing slash)
 * @param exact    when true, only an exact match counts (home links contain every page)
 */
export const currentness = (pathname: string, target: string, exact = false): Currentness => {
  const here = withSlash(pathname);
  const there = withSlash(target);
  if (here === there) return 'page';
  if (!exact && there.length > 1 && here.startsWith(there)) return 'true';
  return null;
};

export interface LanguageSwitch {
  readonly locale: Locale;
  readonly href: string;
  /** True when href is this very page in the other language; false when it falls back to that language's home. */
  readonly isTranslation: boolean;
}

/**
 * Target of the language switch: the same page in the other language when an
 * alternate exists, otherwise the other language's home (and the chrome says so).
 */
export const languageSwitch = (
  alternates: Readonly<Partial<Record<Locale, string>>>,
  other: Locale,
  otherHome: string,
): LanguageSwitch => {
  const alt = alternates[other];
  return alt !== undefined && alt.length > 0
    ? { locale: other, href: alt, isTranslation: true }
    : { locale: other, href: otherHome, isTranslation: false };
};

/**
 * Copyright year. Honors SOURCE_DATE_EPOCH (reproducible-builds.org spec:
 * seconds since the Unix epoch) so identical sources build identical HTML;
 * falls back to the year supplied by the shell's clock.
 */
export const copyrightYear = (sourceDateEpoch: string | undefined, fallbackYear: number): number => {
  if (sourceDateEpoch === undefined || !/^\d{1,12}$/.test(sourceDateEpoch.trim())) return fallbackYear;
  return utcYearOfEpochSeconds(Number(sourceDateEpoch.trim()));
};

/**
 * Proleptic Gregorian UTC year of a Unix timestamp, by H. Hinnant's
 * days-to-civil algorithm ("chrono-Compatible Low-Level Date Algorithms", 2013) —
 * plain integer arithmetic, no Date object (the core has no clock).
 */
export const utcYearOfEpochSeconds = (seconds: number): number => {
  const days = Math.floor(seconds / 86400);
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const month = mp < 10 ? mp + 3 : mp - 9;
  return yoe + era * 400 + (month <= 2 ? 1 : 0);
};
