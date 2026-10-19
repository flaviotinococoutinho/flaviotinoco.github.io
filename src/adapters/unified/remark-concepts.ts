/**
 * Remark stage "concepts" (see pipeline.ts for its place in the pipeline).
 *
 *   :concept[texto]{ref=entropy}   → <ft-concept-preview data-…><a href="…/conceitos/entropia/">texto</a></ft-concept-preview>
 *   :concept[entropia]            → the same, the id found by label/altLabel in the document locale
 *   ::concept-map{focus=entropy depth=2}
 *                                 → <ft-concept-map> with an inline SVG of the neighbourhood, laid out at build
 *
 * Contract:
 *   - the link text is EXACTLY the directive label (its mdast children are moved,
 *     not rewritten), so the plain text of the document is unchanged; the
 *     definition shown in the preview travels in data-* attributes and the
 *     popover is created by <ft-concept-preview> — without JavaScript the
 *     reference is just a link, and no hidden text inflates word counts;
 *   - every concept id used by the document (frontmatter `concepts`,
 *     `:concept`, `::concept-map`) must exist: unknown or ambiguous references
 *     fail the build (file.fail) with suggestions;
 *   - URLs are base-aware: context.base + encodeRoute (the route codec);
 *   - exports file.data.astro.frontmatter.conceptsUsed (sorted ids used in the body).
 */
import type { Element, ElementContent } from 'hast';
import { h, s } from 'hastscript';
import type { Link, Root, RootContent } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { visitParents } from 'unist-util-visit-parents';
import type { VFile } from 'vfile';
import type {} from '@astrojs/markdown-remark';
import { parseConceptId, type ConceptId } from '../../core/domain/identifiers.ts';
import { parseLocale, type Locale } from '../../core/domain/locale.ts';
import common from '../../core/i18n/catalogs/common.ts';
import ontologyCatalog from '../../core/i18n/catalogs/ontology.ts';
import { format, translator } from '../../core/i18n/messages.ts';
import { encodeRoute } from '../../core/i18n/routes.ts';
import { conceptMapMarkup, layoutConcepts, localMapIds, mapTextOf, type Markup } from '../../core/ontology/index.ts';
import { formatCoordinate } from '../../core/ontology/markup.ts';
import type { PipelineContext } from './context.ts';

export interface RemarkConceptsOptions {
  readonly context: PipelineContext;
}

type Directive = Extract<RootContent, { type: 'textDirective' | 'leafDirective' | 'containerDirective' }>;

const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  concept: ['ref'],
  'concept-map': ['focus', 'depth'],
};

/** Converts the renderer-neutral markup of the core into hast (SVG namespace below <svg>). */
export const markupToHast = (m: Markup, inSvg = false): ElementContent => {
  if (m.type === 'text') return { type: 'text', value: m.value };
  const svg = inSvg || m.tag === 'svg';
  const props: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(m.attrs)) {
    if (v === null || v === undefined || v === false) continue;
    props[k] = typeof v === 'number' ? formatCoordinate(v) : v;
  }
  const children = m.children.map((c) => markupToHast(c, svg && m.tag !== 'foreignObject'));
  return svg ? s(m.tag, props, children) : h(m.tag, props, children);
};

const documentLocale = (file: VFile): Locale | null => {
  const lang: unknown = file.data.astro?.frontmatter?.['lang'];
  const r = parseLocale(lang);
  return r.ok ? r.value : null;
};

export function remarkConcepts(options: RemarkConceptsOptions) {
  const { base } = options.context;
  const index = options.context.concepts;
  return (tree: Root, file: VFile): void => {
    const used = new Set<ConceptId>();
    let maps = 0;
    const locale = (node: Directive): Locale => {
      const l = documentLocale(file);
      if (l === null)
        file.fail('concepts: the document has no valid `lang` in its frontmatter', node, 'concepts:no-locale');
      return l;
    };
    const href = (id: ConceptId, l: Locale): string => {
      const entry = index.entries.get(id);
      const slug = entry?.slug[l];
      if (slug === undefined) return `${base}${encodeRoute({ kind: 'ontology' }, l).slice(1)}`;
      return `${base}${encodeRoute({ kind: 'concept', slug }, l).slice(1)}`;
    };
    const resolveId = (raw: string, node: Directive, attribute: string): ConceptId => {
      const parsed = parseConceptId(raw);
      if (!parsed.ok || !index.entries.has(parsed.value)) {
        const suggestions = index.lookup(raw, 'en');
        const hint =
          suggestions.kind === 'unknown' && suggestions.suggestions.length > 0
            ? ` (did you mean ${suggestions.suggestions.join(', ')}?)`
            : '';
        file.fail(`concepts: unknown concept ${attribute} "${raw}"${hint}`, node, 'concepts:unknown-id');
      }
      return parsed.value;
    };
    const checkAttributes = (node: Directive): void => {
      const allowed = ATTRIBUTES[node.name] ?? [];
      for (const key of Object.keys(node.attributes ?? {})) {
        // `id` is the element-id namespace of the reading stage ({#id}); a concept
        // reference is a different thing, so it has its own attribute name.
        if (node.name === 'concept' && key === 'id') {
          file.fail(
            `concepts: :concept takes {ref=…}, not {id=…} (id is an HTML element id): write :concept[${toString(node)}]{ref=${node.attributes?.['id'] ?? '…'}}`,
            node,
            'concepts:id-attribute',
          );
        }
        if (!allowed.includes(key)) {
          file.fail(
            `concepts: :${node.name} does not accept the attribute "${key}" (allowed: ${allowed.join(', ')})`,
            node,
            'concepts:unknown-attribute',
          );
        }
      }
    };

    // Frontmatter `concepts` must name existing concepts (the content layer only checks the syntax).
    const declared: unknown = file.data.astro?.frontmatter?.['concepts'];
    if (Array.isArray(declared)) {
      const unknown = declared.filter((c) => {
        const r = parseConceptId(c);
        return !r.ok || !index.entries.has(r.value);
      });
      if (unknown.length > 0) {
        file.fail(
          `concepts: frontmatter lists unknown concept(s): ${unknown.map(String).join(', ')}`,
          undefined,
          'concepts:unknown-frontmatter',
        );
      }
    }

    visitParents(tree, (node, ancestors) => {
      if (node.type !== 'textDirective' && node.type !== 'leafDirective' && node.type !== 'containerDirective') return;
      if (node.data?.hName !== undefined) return;
      if (node.name === 'concept' && node.type === 'textDirective') {
        checkAttributes(node);
        if (ancestors.some((a) => a.type === 'link' || a.type === 'linkReference')) {
          file.fail('concepts: :concept cannot be placed inside a link', node, 'concepts:nested-link');
        }
        const label = toString(node);
        if (label.trim().length === 0)
          file.fail(
            'concepts: :concept needs a visible label, e.g. :concept[entropia]{ref=entropy}',
            node,
            'concepts:empty-label',
          );
        const l = locale(node);
        const explicit = node.attributes?.['ref'];
        let id: ConceptId;
        if (typeof explicit === 'string' && explicit.length > 0) {
          id = resolveId(explicit, node, 'ref');
        } else {
          const found = index.lookup(label, l);
          if (found.kind === 'ambiguous') {
            file.fail(
              `concepts: "${label}" is ambiguous in ${l} (${found.ids.join(', ')}); add {ref=…}`,
              node,
              'concepts:ambiguous-label',
            );
          }
          if (found.kind === 'unknown') {
            const hint = found.suggestions.length > 0 ? ` (did you mean ${found.suggestions.join(', ')}?)` : '';
            file.fail(
              `concepts: no concept is labelled "${label}" in ${l}${hint}; add {ref=…}`,
              node,
              'concepts:unknown-label',
            );
          }
          id = found.id;
        }
        const entry = index.entries.get(id);
        if (entry === undefined) return;
        used.add(id);
        const t = translator(ontologyCatalog, l);
        const c = translator(common, l);
        const link: Link = {
          type: 'link',
          url: href(id, l),
          title: null,
          children: node.children,
          data: { hProperties: { className: ['concept-link'], dataConcept: id } },
        };
        node.children = [link];
        node.data = {
          ...node.data,
          hName: 'ft-concept-preview',
          hProperties: {
            className: ['concept-ref'],
            dataConcept: id,
            dataLabel: entry.prefLabel[l],
            dataDefinition: entry.definition[l],
            dataStratum: entry.stratum,
            dataStratumLabel: c(`strata.${entry.stratum}`),
            dataCategory: entry.category,
            dataCategoryLabel: t(`category.${entry.category}`),
            dataOpenLabel: t('preview.open'),
          },
        };
        return;
      }
      if (node.name === 'concept-map') {
        if (node.type !== 'leafDirective') {
          file.fail(
            'concepts: concept-map is a leaf directive: write ::concept-map{focus=… depth=…}',
            node,
            'concepts:map-kind',
          );
        }
        checkAttributes(node);
        const l = locale(node);
        const focusRaw = node.attributes?.['focus'];
        if (typeof focusRaw !== 'string' || focusRaw.length === 0) {
          file.fail(
            'concepts: ::concept-map needs a focus, e.g. ::concept-map{focus=entropy depth=2}',
            node,
            'concepts:map-focus',
          );
        }
        const focus = resolveId(focusRaw, node, 'focus');
        const depthRaw = node.attributes?.['depth'] ?? '1';
        if (!/^[1-3]$/u.test(depthRaw))
          file.fail(`concepts: ::concept-map depth must be 1, 2 or 3 (got "${depthRaw}")`, node, 'concepts:map-depth');
        const depth = Number(depthRaw);
        const graph = index.ontology.graph;
        const ids = localMapIds(graph, focus, depth);
        for (const id of ids) used.add(id);
        maps += 1;
        const t = translator(ontologyCatalog, l);
        const entry = index.entries.get(focus);
        const focusLabel = entry?.prefLabel[l] ?? focus;
        const labelText = toString(node).trim();
        const caption = labelText.length > 0 ? labelText : t('map.localCaption', { label: focusLabel, depth });
        const markup = conceptMapMarkup({
          graph,
          locale: l,
          ids,
          layout: layoutConcepts(graph, ids, 'local', focus),
          kind: 'local',
          focus,
          href: (id) => href(id, l),
          idPrefix: `cmap-${focus}-${String(maps)}`,
          text: mapTextOf(l, format(t('map.localLabel'), { label: focusLabel }), { caption }),
        });
        const root = markupToHast(markup) as Element;
        node.data = {
          ...node.data,
          hName: root.tagName,
          hProperties: root.properties,
          hChildren: root.children,
        };
        return;
      }
      return;
    });

    const astro = (file.data.astro ??= {});
    astro.frontmatter = { ...(astro.frontmatter ?? {}), conceptsUsed: [...used].sort() };
  };
}
