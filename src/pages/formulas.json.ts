/**
 * /formulas.json — the formula registry as open data: every formula with its
 * name, canonical TeX, labels, version in words, symbols, concepts, sources and
 * page URLs, in both locales (src/core/formulas/encode.ts).
 */
import type { APIRoute } from 'astro';
import { encodeFormulasJson } from '../core/formulas/index.ts';
import { siteFormulas } from '../components/formulas/data.ts';

export const GET: APIRoute = async () => {
  const data = await siteFormulas();
  return new Response(encodeFormulasJson(data.registry, data.formulaHref), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
