/**
 * /ontology.graph.json — the concept graph as plain node-link JSON (nodes with
 * stratum, category, IC, centrality and community; typed edges), for
 * researchers and as the single payload of the client-side explorer
 * (decoded by decodeGraphJson in src/core/ontology/graphjson.ts).
 */
import type { APIRoute } from 'astro';
import { encodeGraphJson, serializeGraphJson } from '../core/ontology/index.ts';
import { siteOntology } from '../components/ontology/data.ts';

export const GET: APIRoute = async () => {
  const data = await siteOntology();
  const payload = encodeGraphJson(data.ontology, (id, locale) => data.conceptHref(id, locale));
  return new Response(serializeGraphJson(payload), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
