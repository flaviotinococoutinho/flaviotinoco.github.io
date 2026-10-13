/**
 * Public API of the ontology core (SKOS concept scheme as pure data + algebra).
 * Shells import from here; the modules behind it are organised by functional
 * pattern: parser (parse), validator/derivation (graph, hierarchy), folds
 * (measures, ontology stats), compiler (scene → markup, tree), codecs (jsonld,
 * client payload), and pure geometry (layout, spatial).
 */
export type { ConceptEntry, Localized, OntologyError, RawConcept, Relation } from './model.ts';
export { describeError } from './model.ts';
export { parseConceptEntry } from './parse.ts';
export { buildGraph, distancesFrom, edgesOf, neighbourhood, type ConceptGraph, type Edge } from './graph.ts';
export { deriveHierarchy, findCycles, maxDepth, subsumers, type Hierarchy } from './hierarchy.ts';
export {
  closestByLin,
  commonSubsumers,
  compare,
  intrinsicInformationContent,
  lin,
  lowestCommonSubsumers,
  mostInformativeSubsumer,
  resnik,
  shannonEntropy,
  tally,
  type Comparison,
  type InformationContent,
  type Neighbour,
} from './measures.ts';
export { buildOntology, ontologyOf, ontologyStats, type EntropyStat, type Ontology, type OntologyStats } from './ontology.ts';
export { buildLabelIndex, labelsOf, lookupLabel, type LabelIndex, type LabelLookup } from './labels.ts';
export { labelKey, searchKey, slugify, stripDiacritics } from './text.ts';
export { forceLayout, type Layout, type LayoutEdge, type LayoutNode, type LayoutOptions, type Point } from './layout.ts';
export { mulberry32, seedOf, type Prng, type PrngState } from './prng.ts';
export { nearestInDirection, type Direction } from './spatial.ts';
export { el, renderMarkup, text, textContent, type Markup, type MarkupElement } from './markup.ts';
export {
  conceptMapMarkup,
  FULL_MAP_SEED,
  layoutConcepts,
  localMapIds,
  MAP_STYLE,
  type MapKind,
  type MapText,
  type SceneInput,
} from './scene.ts';
export { flattenTree, hierarchyTree, type TreeNode } from './tree.ts';
export {
  decodeClientOntology,
  encodeClientOntology,
  searchConcepts,
  serializeClientOntology,
  type ClientModel,
  type ClientOntology,
} from './client.ts';
export { conceptIri, fromJsonLd, schemeIri, toJsonLd, type JsonLdDocument, type JsonLdOptions } from './jsonld.ts';
export { LIN_TEX, IC_TEX, RESNIK_TEX } from './formulas.ts';
