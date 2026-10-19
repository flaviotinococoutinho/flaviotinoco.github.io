/**
 * Public API of the ontology core (typed SKOS concept scheme as pure data + algebra).
 * Shells import from here; the modules behind it are organised by functional
 * pattern: vocabulary (data tables), parser (parse), validator/derivation
 * (graph, hierarchy, taxonomy), folds (measures, centrality, community, fca,
 * ontology stats), paths, compilers (scene, lattice → markup, tree, glossary),
 * codecs (jsonld, graphjson) and pure geometry (layout, spatial).
 */
export type {
  AuthoredLink,
  ConceptEntry,
  CycleScope,
  Localized,
  OntologyError,
  OntologyWarning,
  RawConcept,
} from './model.ts';
export { describeError, describeWarning } from './model.ts';
export {
  CATEGORIES,
  CATEGORY_DISPLAY_ORDER,
  LINK_TYPES,
  PREREQUISITE_TYPES,
  RELATION_TYPES,
  RELATIONS,
  TOP_TAXON,
  categoryOfTaxon,
  categoryTaxon,
  isCategory,
  isLinkType,
  isRelationType,
  parseCategory,
  parseLinkType,
  satisfiesStratum,
  type Category,
  type CategoryTaxon,
  type LinkType,
  type RelationSpec,
  type RelationType,
  type StratumConstraint,
} from './vocabulary.ts';
export { parseConceptEntry } from './parse.ts';
export {
  buildGraph,
  components,
  conceptOf,
  degreeOf,
  distancesFrom,
  edgesOf,
  linked,
  neighbourhood,
  storedTargets,
  type Adjacency,
  type ConceptGraph,
  type Link,
} from './graph.ts';
export {
  deriveHierarchy,
  findCycles,
  maxDepth,
  pathBetween,
  redundantEdges,
  subsumers,
  transitiveReduction,
  type Hierarchy,
  type RedundantEdge,
} from './hierarchy.ts';
export { buildTaxonomy, isConceptTaxon, taxonomyOf, type TaxonId } from './taxonomy.ts';
export {
  closestByLin,
  commonSubsumers,
  compare,
  degreeEntropy,
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
export { betweenness, bridgeConcepts, centralityOf, normalise, type Centrality } from './centrality.ts';
export { louvain, modularity, mutualInformation, normalizedMutualInformation, type Communities } from './community.ts';
export {
  closeIntent,
  conceptLattice,
  contextOf,
  extentOf,
  formalConcepts,
  intentOf,
  type ConceptLattice,
  type FormalConcept,
  type FormalContext,
} from './fca.ts';
export {
  learningPath,
  prerequisiteClosure,
  prerequisitesOf,
  shortestPath,
  type LinkGraph,
  type PathStep,
  type TypedPath,
} from './paths.ts';
export {
  backlinks,
  bestMatchAverage,
  relatedWorks,
  sharedConcepts,
  shortTitleOf,
  type RelatedWork,
  type SharedWork,
  type Work,
  type WorkKind,
} from './works.ts';
export { glossary, initialOf, type GlossaryEntry, type GlossarySection } from './glossary.ts';
export {
  BRIDGE_COUNT,
  buildOntology,
  ontologyOf,
  ontologyStats,
  primaryDomain,
  type EntropyStat,
  type Ontology,
  type OntologyStats,
} from './ontology.ts';
export { buildLabelIndex, labelsOf, lookupLabel, type LabelIndex, type LabelLookup } from './labels.ts';
export { labelKey, searchKey, slugify, stripDiacritics } from './text.ts';
export {
  forceLayout,
  type Layout,
  type LayoutEdge,
  type LayoutNode,
  type LayoutOptions,
  type Point,
} from './layout.ts';
export { mulberry32, seedOf, type Prng, type PrngState } from './prng.ts';
export { nearestInDirection, type Direction } from './spatial.ts';
export {
  MAX_SCALE,
  MIN_SCALE,
  PAN_STEP,
  ZOOM_STEP,
  clampToBase,
  clientToUser,
  ensureVisible,
  panBy,
  parseTranslate,
  parseViewBox,
  pixelsToUser,
  scaleOf,
  viewBoxString,
  zoomAt,
  zoomCentre,
  type ViewBox,
} from './viewport.ts';
export {
  ancestorsOf,
  isParent,
  parentOf,
  siblingsOf,
  treeKey,
  typeahead,
  visibleItems,
  type TreeAction,
  type TreeItem,
  type TreeKey,
} from './treenav.ts';
export { el, renderMarkup, text, textContent, type Markup, type MarkupElement } from './markup.ts';
export {
  conceptMapMarkup,
  edgeEnds,
  FULL_MAP_SEED,
  gridLayout,
  layoutConcepts,
  localMapIds,
  MAP_STYLE,
  MARKER,
  trimSegment,
  typesOf,
  type GridLayout,
  type MapKind,
  type MapText,
  type SceneInput,
} from './scene.ts';
export { categoryLabel, mapIslandMessages, mapTextOf, relationLabel, stratumLabel } from './strings.ts';
export { latticeLayout, latticeMarkup, type LatticeLayout, type LatticeText } from './lattice.ts';
export { flattenTree, taxonomyTree, type TreeNode } from './tree.ts';
export {
  decodeGraphJson,
  encodeGraphJson,
  GRAPH_JSON_VERSION,
  jsonForScript,
  searchConcepts,
  serializeGraphJson,
  type ClientConcept,
  type ClientModel,
  type GraphJson,
} from './graphjson.ts';
export {
  categoryIri,
  conceptIri,
  fromJsonLd,
  relationIri,
  schemeIri,
  stratumIri,
  toJsonLd,
  type JsonLdDocument,
  type JsonLdOptions,
} from './jsonld.ts';
export { BETWEENNESS_TEX, ENTROPY_TEX, IC_TEX, LIN_TEX, NMI_TEX, RESNIK_TEX } from './formulas.ts';
