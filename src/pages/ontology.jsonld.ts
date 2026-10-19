/**
 * /ontology.jsonld — the concept scheme as JSON-LD (SKOS + OWL + schema.org),
 * with absolute IRIs built from the configured site and base path, and the
 * works (application layer) as schema:CreativeWork nodes about the concepts.
 * Served as application/ld+json (GitHub Pages maps .jsonld to it, too).
 */
import type { APIRoute } from 'astro';
import { LOCALES, type Locale } from '../core/domain/locale.ts';
import { STRATA, type Stratum } from '../core/domain/strata.ts';
import ontologyCatalog from '../core/i18n/catalogs/ontology.ts';
import { translator } from '../core/i18n/messages.ts';
import {
  CATEGORIES,
  categoryLabel,
  jsonForScript,
  stratumLabel,
  toJsonLd,
  type Category,
} from '../core/ontology/index.ts';
import { siteOntology } from '../components/ontology/data.ts';
import { relationNames } from '../components/ontology/text.ts';

const per = <T>(f: (l: Locale) => T): Record<Locale, T> =>
  Object.fromEntries(LOCALES.map((l) => [l, f(l)])) as Record<Locale, T>;

export const GET: APIRoute = async ({ site }) => {
  if (site === undefined) throw new Error('ontology.jsonld: `site` must be configured to build absolute IRIs');
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const absolute = (path: string): string => new URL(path, site).href;
  const documentIri = absolute(`${base}ontology.jsonld`);
  const data = await siteOntology();
  const doc = toJsonLd(data.ontology.graph, {
    documentIri,
    pageIri: (id, locale) => absolute(data.conceptHref(id, locale)),
    schemeTitle: per((l) => translator(ontologyCatalog, l)('jsonld.schemeTitle')),
    schemeDescription: per((l) => translator(ontologyCatalog, l)('jsonld.schemeDescription')),
    strataLabels: per((l) => Object.fromEntries(STRATA.map((s) => [s, stratumLabel(l, s)])) as Record<Stratum, string>),
    categoryLabels: per(
      (l) => Object.fromEntries(CATEGORIES.map((c) => [c, categoryLabel(l, c)])) as Record<Category, string>,
    ),
    relationLabels: per(relationNames),
    stratumPropertyLabel: per((l) => translator(ontologyCatalog, l)('jsonld.stratum')),
    works: LOCALES.flatMap((l) => data.works[l].map((w) => ({ ...w, href: absolute(w.href) }))),
  });
  return new Response(jsonForScript(doc), { headers: { 'Content-Type': 'application/ld+json; charset=utf-8' } });
};
