/**
 * RSS 2.0 feed per locale (/pt/rss.xml, /en/rss.xml): the essays and labs
 * written in that language, newest first.
 *
 * Every link is absolute and carries the base path (RSS readers resolve
 * nothing). <language> holds the BCP 47 tag of the locale (RSS 2.0 accepts the
 * W3C language codes); <atom:link rel="self"> is the feed's own address, as the
 * RSS Advisory Board recommends. Endpoints with an extension are served
 * without a trailing slash.
 */
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { asset, href, localeStaticPaths, useTranslations } from '../../adapters/astro/i18n.ts';
import { essays, labs, routeOfEssay, routeOfLab } from '../../adapters/astro/content.ts';
import { localeCodec, type Locale } from '../../core/domain/locale.ts';
import common from '../../core/i18n/catalogs/common.ts';
import chrome from '../../core/i18n/catalogs/chrome.ts';

export const getStaticPaths = localeStaticPaths;

const XML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };

/** Escapes text for an XML attribute or element (the feed's own URL in customData). */
const xml = (s: string): string => s.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch] ?? ch);

export async function GET(context: APIContext): Promise<Response> {
  const { locale } = context.props as { readonly locale: Locale };
  const site = context.site;
  if (site === undefined) throw new Error('[rss] `site` must be set in astro.config.ts to build absolute links');
  const t = useTranslations(common, locale);
  const c = useTranslations(chrome, locale);
  const absolute = (path: string): string => new URL(path, site).href;
  const self = absolute(asset(`${localeCodec.encode(locale)}/rss.xml`));

  const [localeEssays, localeLabs] = await Promise.all([essays(locale), labs(locale)]);
  const items = [
    ...localeEssays.map((e) => ({ entry: e, route: routeOfEssay(e), form: t('form.essay') })),
    ...localeLabs.map((e) => ({ entry: e, route: routeOfLab(e), form: t('form.lab') })),
  ]
    .sort((a, b) => b.entry.data.published.valueOf() - a.entry.data.published.valueOf())
    .map(({ entry, route, form }) => ({
      title: entry.data.title,
      link: absolute(href(route, locale)),
      pubDate: entry.data.published,
      description: entry.data.description,
      categories: [form, t(`strata.${entry.data.stratum}`)],
    }));

  return rss({
    title: c('feed.title'),
    description: c('feed.description'),
    site: absolute(href({ kind: 'home' }, locale)),
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>${locale}</language><atom:link href="${xml(self)}" rel="self" type="application/rss+xml"/>`,
    items,
  });
}
