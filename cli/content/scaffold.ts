/**
 * Scaffolds of new content files (pure): complete frontmatter that the
 * current content schema accepts (src/content.config.ts), in the field order
 * and YAML style of the existing entries, and a body that tells the author
 * what is left to write.
 *
 * Whatever `ft new` cannot know (the meta description, the first paragraph)
 * is written as a schema-valid PLACEHOLDER carrying the marker `TODO(ft)`:
 * the build accepts the file (so it can be previewed), and `ft lint` reports
 * every remaining marker as an error (rule ft:placeholder), so a scaffold
 * cannot be published unfinished.
 */
import type { Locale } from '../../src/core/domain/locale.ts';
import type { Stratum } from '../../src/core/domain/strata.ts';
import type { Confidence, Evidence } from '../../src/core/domain/epistemic.ts';
import type { Domain } from '../../src/core/domain/facets.ts';

export const PLACEHOLDER = 'TODO(ft)';

export const KINDS = ['essay', 'lab', 'page'] as const;
export type Kind = (typeof KINDS)[number];

export const COLLECTION_OF: Readonly<Record<Kind, 'essays' | 'labs' | 'pages'>> = {
  essay: 'essays',
  lab: 'labs',
  page: 'pages',
};

/** Widgets of the labs and the WebAssembly kernel each one runs on (src/content.config.ts, src/adapters/wasm). */
export const WIDGET_KERNEL = {
  fourier: 'signal',
  sampling: 'signal',
  entropy: 'information',
  channel: 'information',
  logistic: 'dynamics',
  clt: 'dynamics',
} as const;
export type Widget = keyof typeof WIDGET_KERNEL;
export type Kernel = (typeof WIDGET_KERNEL)[Widget];

export interface ScaffoldSpec {
  readonly kind: Kind;
  readonly locale: Locale;
  readonly slug: string;
  readonly translationKey: string;
  readonly title: string;
  readonly description: string | undefined;
  /** ISO calendar date (YYYY-MM-DD). */
  readonly published: string;
  readonly stratum: Stratum | undefined;
  readonly bridgesTo: Stratum | undefined;
  readonly domains: readonly Domain[];
  readonly concepts: readonly string[];
  readonly epistemic: { readonly confidence: Confidence; readonly evidence: Evidence };
  readonly provenance: { readonly assistance: 'none' | 'assisted' | 'generated'; readonly reviewed: boolean };
  readonly lab: { readonly widget: Widget; readonly kernel: Kernel; readonly theorem: string } | undefined;
  readonly draft: boolean;
}

/** Words of the scaffold in the language of the document. */
const TEXT: Readonly<
  Record<Locale, { readonly description: string; readonly body: string; readonly revision: string; readonly theorem: string }>
> = {
  'pt-BR': {
    description: `${PLACEHOLDER}: escreva uma frase de 40 a 180 caracteres que resuma o texto para buscadores.`,
    body: `${PLACEHOLDER}: comece a escrever aqui. Rode \`pnpm ft lint\` para conferir o texto sem compilar o site.`,
    revision: 'Versão inicial.',
    theorem: `${PLACEHOLDER}: nome do teorema ou da lei`,
  },
  en: {
    description: `${PLACEHOLDER}: write one sentence of 40 to 180 characters that sums up the text for search engines.`,
    body: `${PLACEHOLDER}: start writing here. Run \`pnpm ft lint\` to check the text without building the site.`,
    revision: 'First version.',
    theorem: `${PLACEHOLDER}: name of the theorem or law`,
  },
};

export const placeholderTheorem = (locale: Locale): string => TEXT[locale].theorem;

const YAML_RESERVED = /^(?:true|false|null|~|yes|no|on|off|y|n)$/i;
const NUMBER_LIKE = /^[-+.]?(?:\d|\.inf|\.nan)/i;

/**
 * A YAML 1.2 scalar for a string: plain when it is unambiguous, otherwise single
 * quoted (the only escape is '' for '). Plain scalars must not start with an
 * indicator, contain ": " or " #", end in ":" or look like another type.
 */
export const yamlString = (s: string): string => {
  const plain =
    s !== '' &&
    s.trim() === s &&
    !/^[-?:,[\]{}#&*!|>'"%@`]/u.test(s) &&
    !/: | #|:$|[\n\r\t]/u.test(s) &&
    !YAML_RESERVED.test(s) &&
    !NUMBER_LIKE.test(s);
  return plain ? s : `'${s.replace(/'/g, "''")}'`;
};

const flow = (items: readonly string[]): string => `[${items.map(yamlString).join(', ')}]`;

/** The file text of a scaffold. */
export const scaffold = (spec: ScaffoldSpec): string => {
  const text = TEXT[spec.locale];
  const lines: string[] = ['---'];
  const field = (key: string, value: string): void => void lines.push(`${key}: ${value}`);
  field('title', yamlString(spec.title));
  field('description', yamlString(spec.description ?? text.description));
  field('lang', spec.locale);
  field('translationKey', spec.translationKey);
  field('slug', spec.slug);
  if (spec.kind !== 'page') {
    if (spec.stratum !== undefined) field('stratum', spec.stratum);
    if (spec.bridgesTo !== undefined) field('bridgesTo', spec.bridgesTo);
    field('domains', flow(spec.domains));
    field('concepts', flow(spec.concepts));
    field('published', spec.published);
  }
  lines.push('revisions:', `  - date: ${spec.published}`, `    note: ${yamlString(text.revision)}`);
  if (spec.kind !== 'page') {
    lines.push('epistemic:', `  confidence: ${spec.epistemic.confidence}`, `  evidence: ${spec.epistemic.evidence}`);
    field('keywords', '[]');
    lines.push(
      'provenance:',
      `  assistance: ${spec.provenance.assistance}`,
      `  reviewed: ${String(spec.provenance.reviewed)}`,
    );
    if (spec.lab !== undefined) {
      field('kernel', spec.lab.kernel);
      field('widget', spec.lab.widget);
      field('theorem', yamlString(spec.lab.theorem));
    }
    field('draft', String(spec.draft));
  }
  lines.push('---', '', text.body, '');
  return lines.join('\n');
};
