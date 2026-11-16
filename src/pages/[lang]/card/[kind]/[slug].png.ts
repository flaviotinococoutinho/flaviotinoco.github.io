/**
 * /<lang>/card/<kind>/<slug>.png — the share card of a work, or of the site (kind "site", slug "index"):
 * the image a link shows when it is pasted into a chat or a social network (Open Graph `og:image`).
 * The card is described by src/core/chrome/card.ts and rendered at build time by src/adapters/astro/card.ts.
 */
import type { APIContext } from 'astro';
import type { CardInput, CardKind } from '../../../../core/chrome/card.ts';
import { localeCodec, LOCALES } from '../../../../core/domain/locale.ts';
import { STRATA } from '../../../../core/domain/strata.ts';
import chrome from '../../../../core/i18n/catalogs/chrome.ts';
import common from '../../../../core/i18n/catalogs/common.ts';
import reading from '../../../../core/i18n/catalogs/reading.ts';
import { translator } from '../../../../core/i18n/messages.ts';
import { thumbnail } from '../../../../core/labs/thumbnails.ts';
import { essays, labs } from '../../../../adapters/astro/content.ts';
import { renderCard } from '../../../../adapters/astro/card.ts';

interface Props {
  readonly input: CardInput;
}

export async function getStaticPaths(): Promise<
  { params: { lang: string; kind: CardKind; slug: string }; props: Props }[]
> {
  const paths: { params: { lang: string; kind: CardKind; slug: string }; props: Props }[] = [];
  for (const locale of LOCALES) {
    const lang = localeCodec.encode(locale);
    const tc = translator(common, locale);
    const tr = translator(reading, locale);
    const th = translator(chrome, locale);
    const stratumOf = (stratum: CardInput['stratum'], bridgesTo: CardInput['stratum'] | undefined) => ({
      stratumLabel: stratum === null ? null : tc(`strata.${stratum}`),
      passage:
        stratum === null || bridgesTo === undefined || bridgesTo === null
          ? null
          : tr('essay.bridge', { from: tc(`strata.${stratum}`), to: tc(`strata.${bridgesTo}`) }),
    });
    const domains = (ds: readonly string[]): readonly string[] =>
      ds.slice(0, 3).map((d) => tr(`domain.${d}` as Parameters<typeof tr>[0]));
    paths.push({
      params: { lang, kind: 'site', slug: 'index' },
      props: {
        input: {
          kind: 'site',
          title: th('home.hero.claim'),
          description: tc('site.description'),
          siteName: tc('site.name'),
          form: null,
          stratum: null,
          stratumLabel: null,
          passage: null,
          disciplines: [],
          thumbnail: null,
          bridge: STRATA.map((stratum) => ({ stratum, label: tc(`strata.${stratum}`) })),
        },
      },
    });
    for (const e of await essays(locale)) {
      paths.push({
        params: { lang, kind: 'essay', slug: e.data.slug },
        props: {
          input: {
            kind: 'essay',
            title: e.data.title,
            description: e.data.description,
            siteName: tc('site.name'),
            form: tc('form.essay'),
            stratum: e.data.stratum,
            ...stratumOf(e.data.stratum, e.data.bridgesTo),
            disciplines: domains(e.data.domains),
            thumbnail: null,
            bridge: [],
          },
        },
      });
    }
    for (const l of await labs(locale)) {
      paths.push({
        params: { lang, kind: 'lab', slug: l.data.slug },
        props: {
          input: {
            kind: 'lab',
            title: l.data.title,
            description: l.data.description,
            siteName: tc('site.name'),
            form: tc('form.lab'),
            stratum: l.data.stratum,
            ...stratumOf(l.data.stratum, undefined),
            disciplines: domains(l.data.domains),
            thumbnail: thumbnail(l.data.widget),
            bridge: [],
          },
        },
      });
    }
  }
  return paths;
}

export async function GET(context: APIContext): Promise<Response> {
  const { input } = context.props as Props;
  const png = await renderCard(input);
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
}
