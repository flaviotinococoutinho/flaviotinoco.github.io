/**
 * A minimal JSON-LD 1.1 expansion checker for the subset our encoder emits
 * (no network, no remote contexts): a flat @context of prefix → IRI, an @graph
 * of node objects whose keys are compact or absolute IRIs, and values that are
 * strings, node references {"@id"}, or value objects {"@value", "@language" |
 * "@type"}. It expands every IRI as the JSON-LD expansion algorithm would
 * (JSON-LD 1.1 §4.1.2 compact IRIs; §5.2 IRI expansion) and reports anything
 * that would make a real processor fail or drop data: unknown prefixes,
 * relative IRIs, prefixes not ending in a gen-delim, malformed language tags,
 * unexpected keywords. Returns the number of triples the graph denotes.
 */
type Json = unknown;

const KEYWORDS = new Set(['@id', '@type']);
const ABSOLUTE = /^(https?|urn|mailto):/u;
/** BCP 47 language tag, simplified (RFC 5646 well-formedness, without the registry). */
const LANG = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/u;
/** gen-delims of RFC 3986 that a prefix IRI may end with (JSON-LD 1.1 §4.2.2). */
const GEN_DELIM = /[:/?#[\]@]$/u;

const isObject = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface Expansion {
  readonly errors: readonly string[];
  readonly triples: number;
}

export const expandDocument = (doc: Json): Expansion => {
  const errors: string[] = [];
  let triples = 0;
  if (!isObject(doc)) return { errors: ['document is not an object'], triples };
  const context = doc['@context'];
  if (!isObject(context)) return { errors: ['@context must be an object'], triples };
  const prefixes = new Map<string, string>();
  for (const [term, iri] of Object.entries(context)) {
    if (typeof iri !== 'string') errors.push(`context term ${term} is not a simple IRI`);
    else if (!ABSOLUTE.test(iri)) errors.push(`context term ${term} → ${iri} is not absolute`);
    else if (!GEN_DELIM.test(iri)) errors.push(`context term ${term} → ${iri} cannot be used as a prefix`);
    else prefixes.set(term, iri);
  }
  const expand = (value: string, where: string): string | null => {
    if (ABSOLUTE.test(value)) return value;
    const colon = value.indexOf(':');
    if (colon > 0) {
      const prefix = value.slice(0, colon);
      const iri = prefixes.get(prefix);
      if (iri !== undefined && !value.slice(colon + 1).startsWith('//')) return iri + value.slice(colon + 1);
    }
    errors.push(`${where}: "${value}" does not expand to an absolute IRI`);
    return null;
  };
  const graph = doc['@graph'];
  if (!Array.isArray(graph)) return { errors: [...errors, '@graph must be an array'], triples };
  const seen = new Set<string>();
  graph.forEach((node, i) => {
    if (!isObject(node)) {
      errors.push(`@graph[${String(i)}] is not a node object`);
      return;
    }
    const idRaw = node['@id'];
    const id = typeof idRaw === 'string' ? expand(idRaw, `@graph[${String(i)}].@id`) : null;
    if (id === null) return;
    if (seen.has(id)) errors.push(`duplicate node ${id}`);
    seen.add(id);
    const types = node['@type'] === undefined ? [] : Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    for (const t of types) {
      if (typeof t !== 'string' || expand(t, `${id} @type`) === null)
        errors.push(`${id}: bad @type ${JSON.stringify(t)}`);
      else triples += 1;
    }
    for (const [key, raw] of Object.entries(node)) {
      if (KEYWORDS.has(key)) continue;
      if (key.startsWith('@')) {
        errors.push(`${id}: unexpected keyword ${key}`);
        continue;
      }
      if (expand(key, `${id} property`) === null) continue;
      const values = Array.isArray(raw) ? raw : [raw];
      for (const v of values) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          triples += 1;
        } else if (isObject(v) && typeof v['@id'] === 'string' && Object.keys(v).length === 1) {
          if (expand(v['@id'], `${id} ${key}`) !== null) triples += 1;
        } else if (isObject(v) && '@value' in v) {
          const extra = Object.keys(v).filter((k) => k !== '@value' && k !== '@language' && k !== '@type');
          if (extra.length > 0) errors.push(`${id} ${key}: unexpected keys ${extra.join(', ')}`);
          if (typeof v['@value'] !== 'string') errors.push(`${id} ${key}: @value must be a string`);
          if ('@language' in v && (typeof v['@language'] !== 'string' || !LANG.test(v['@language']))) {
            errors.push(`${id} ${key}: malformed language tag ${JSON.stringify(v['@language'])}`);
          }
          if ('@language' in v && '@type' in v)
            errors.push(`${id} ${key}: a value cannot have both @language and @type`);
          if (typeof v['@type'] === 'string' && expand(v['@type'], `${id} ${key} @type`) === null) continue;
          triples += 1;
        } else {
          errors.push(`${id} ${key}: unsupported value ${JSON.stringify(v)}`);
        }
      }
    }
  });
  return { errors, triples };
};
