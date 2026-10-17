/**
 * ESLint flat config — the architecture, enforced.
 *
 * Layers (docs/arquitetura.md §2–3, ADR 0001):
 *   src/core/**     functional core: pure, deterministic, total. No I/O, no DOM,
 *                   no Astro, no clock or randomness, no throw, no imports from
 *                   outside src/core. Enforced below by "purity" and "boundaries".
 *   src/islands/**  browser shell: must not reach into the build-time Markdown
 *                   pipeline (src/adapters/unified/**) nor Node built-ins — also not
 *                   through import() or a computed relative path.
 *   everything else imperative shell (adapters, views, pages, scripts, tests).
 *
 * Rule sets: typescript-eslint `recommendedTypeChecked` (project service) for
 * .ts, eslint-plugin-astro `recommended` for .astro, ESLint's own recommended
 * rules for every file. Never relax a rule here to make CI green: fix the code
 * or record the exception (with its reason) next to the rule.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, globalIgnores } from 'eslint/config';
import * as unsupported from 'eslint/use-at-your-own-risk';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import functional from 'eslint-plugin-functional';
import globals from 'globals';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * ESLint's "recommended" set, derived from rule metadata (`meta.docs.recommended`).
 * This is exactly how @eslint/js builds its recommended config; deriving it
 * avoids a dependency that the frozen lockfile does not provide.
 *
 * `builtinRules` is ESLint's "use at your own risk" (unsupported, JSDoc-deprecated)
 * export; it is read reflectively so the deprecation hint does not surface in
 * `astro check`. If it ever disappears, this throws and lint fails loudly —
 * the recommended set is never silently empty.
 *
 * @type {ReadonlyMap<string, import('eslint').Rule.RuleModule>}
 */
const builtinRules = Reflect.get(unsupported, 'builtinRules');
if (!(builtinRules instanceof Map) || builtinRules.size === 0) {
  throw new Error('eslint.config.js: eslint/use-at-your-own-risk no longer exposes builtinRules; add @eslint/js.');
}
const eslintRecommended = Object.fromEntries(
  [...builtinRules].filter(([, rule]) => rule.meta?.docs?.recommended === true).map(([name]) => [name, 'error']),
);

/** Rules of typescript-eslint's non-type-checked `recommended` set (used inside .astro frontmatter). */
const tsRecommendedRules = Object.assign({}, ...tseslint.configs.recommended.map((c) => c.rules ?? {}));

/* ------------------------------------------------------------------------- */
/* Local plugin: import boundaries resolved on the file system.               */
/* ------------------------------------------------------------------------- */

/**
 * `local/import-boundaries` — layering by resolved path, not by spelling.
 *
 * A relative specifier is resolved against the importing file and compared
 * with project-relative prefixes, so "../../adapters/x.ts" is caught at any
 * depth (no-restricted-imports only sees the string). Every form of import is
 * checked: declarations, re-exports, dynamic import() and `import('…').T` types.
 * Options:
 *   allow:  if non-empty, every relative import must resolve inside one of these prefixes;
 *   forbid: relative imports must not resolve inside any of these prefixes;
 *   bare:   [{ regex, message }] for bare specifiers (packages, node:, astro:) in the two
 *           forms ESLint's no-restricted-imports does not inspect — import() expressions and
 *           TypeScript import types; static imports and re-exports stay with no-restricted-imports.
 * An import() whose specifier is computed is checked through its static prefix: a bare
 * prefix ("node:" + x) against `bare`; a relative prefix ("../" + x) cannot be resolved,
 * so it is reported — the layers would otherwise be one template literal away.
 */
const importBoundaries = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce architectural layers by the resolved path of relative imports.' },
    schema: [
      {
        type: 'object',
        properties: {
          allow: { type: 'array', items: { type: 'string' } },
          forbid: { type: 'array', items: { type: 'string' } },
          layer: { type: 'string' },
          bare: {
            type: 'array',
            items: {
              type: 'object',
              properties: { regex: { type: 'string' }, message: { type: 'string' } },
              required: ['regex', 'message'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      outside: '{{layer}} must only import from {{allowed}}; "{{source}}" resolves to "{{target}}".',
      forbidden: '{{layer}} must not import from {{prefix}}; "{{source}}" resolves to "{{target}}".',
      bare: '{{message}} ("{{source}}")',
      computed:
        '{{layer}}: an import() with a computed relative path ("{{source}}…") cannot be checked against the layers; use a literal specifier or import.meta.glob.',
    },
  },
  create(context) {
    const [{ allow = [], forbid = [], layer = 'This layer', bare = [] } = {}] = context.options;
    const barePatterns = bare.map(({ regex, message }) => ({ pattern: new RegExp(regex), message }));
    const dir = path.dirname(context.physicalFilename);
    const check = (node, source) => {
      if (typeof source !== 'string' || !source.startsWith('.')) return;
      const target = path.relative(ROOT, path.resolve(dir, source)).split(path.sep).join('/');
      if (allow.length > 0 && !allow.some((prefix) => target.startsWith(prefix))) {
        context.report({ node, messageId: 'outside', data: { layer, allowed: allow.join(', '), source, target } });
      }
      const hit = forbid.find((prefix) => target.startsWith(prefix));
      if (hit !== undefined)
        context.report({ node, messageId: 'forbidden', data: { layer, prefix: hit, source, target } });
    };
    const checkBare = (node, source) => {
      if (typeof source !== 'string' || source === '' || source.startsWith('.') || source.startsWith('/')) return;
      const hit = barePatterns.find(({ pattern }) => pattern.test(source));
      if (hit !== undefined) context.report({ node, messageId: 'bare', data: { message: hit.message, source } });
    };
    const literal = (node) => (node?.type === 'Literal' ? node.value : undefined);
    return {
      ImportDeclaration: (node) => check(node.source, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node.source, node.source.value),
      ExportAllDeclaration: (node) => check(node.source, node.source.value),
      ImportExpression: (node) => {
        const source = node.source;
        if (source.type !== 'TemplateLiteral') {
          check(source, literal(source));
          checkBare(source, literal(source));
          return;
        }
        const head = source.quasis[0]?.value.cooked ?? '';
        if (source.expressions.length === 0) {
          check(source, head);
          checkBare(source, head);
        } else if (head.startsWith('.')) {
          context.report({ node: source, messageId: 'computed', data: { layer, source: head } });
        } else checkBare(source, head);
      },
      // `import('../x.ts').T` in type positions is still a dependency edge.
      TSImportType: (node) => {
        // typescript-eslint 8 names the specifier `source` (a string Literal) and deprecates
        // `argument` (a TSLiteralType), which older parsers still produce.
        const source =
          'source' in node ? literal(node.source) : (literal(node.argument?.literal) ?? literal(node.argument));
        check(node, source);
        checkBare(node, source);
      },
    };
  },
};

const local = { rules: { 'import-boundaries': importBoundaries } };

/* ------------------------------------------------------------------------- */
/* Purity of the functional core.                                             */
/* ------------------------------------------------------------------------- */

const IMPURE_GLOBAL = 'is ambient state or I/O; the functional core receives it as an argument from the shell.';
const restrictedCoreGlobals = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'queueMicrotask',
  'performance',
  'process',
  'console',
  'crypto',
  'globalThis',
  'self',
  'Buffer',
  'require',
  '__dirname',
  '__filename',
].map((name) => ({ name, message: `\`${name}\` ${IMPURE_GLOBAL}` }));

/** Modules the core must never load, in any form of import (bare specifiers). */
const CORE_FORBIDDEN_MODULES = [
  {
    regex:
      '^(astro($|[:/])|@astrojs/|node:|vite($|/)|fs($|/)|path($|/)|url$|os$|child_process$|crypto$|http2?$|https$|process$|module$|worker_threads$)',
    message: 'The functional core is pure: no Astro, Vite or Node I/O modules (docs/arquitetura.md §2.1).',
  },
];

/** Node built-ins do not exist in the browser, where islands run. */
const ISLAND_FORBIDDEN_MODULES = [
  { regex: '^(node:|fs$|path$)', message: 'Islands run in the browser: Node built-ins are unavailable.' },
];

const corePurity = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        ...CORE_FORBIDDEN_MODULES,
        {
          regex: '(^|/)(adapters|islands)(/|$)',
          message: 'The core must not depend on the shell (src/adapters, src/islands).',
        },
      ],
    },
  ],
  'no-restricted-globals': ['error', ...restrictedCoreGlobals],
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Non-deterministic: inject a seeded generator.' },
    { object: 'Date', property: 'now', message: 'Reads the clock: inject a clock (a function returning the time).' },
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector: 'NewExpression[callee.name="Date"][arguments.length=0]',
      message: '`new Date()` reads the clock: inject the current time from the shell.',
    },
    {
      selector: 'CallExpression[callee.name="Date"]',
      message: '`Date()` returns the current time as a string: inject the clock.',
    },
    {
      selector: 'MetaProperty[meta.name="import"][property.name="meta"]',
      message: '`import.meta` exposes the build environment; the core receives configuration as arguments.',
    },
    {
      selector: 'ImportExpression',
      message: 'Dynamic import() loads code at run time (asynchronous I/O); the functional core imports statically.',
    },
  ],
  'functional/no-throw-statements': 'error',
  'no-param-reassign': ['error', { props: true }],
};

/** Every script extension: a .js or .mjs file in src/core is still core code. */
const CORE_SCRIPTS = 'src/core/**/*.{ts,mts,cts,js,mjs,cjs}';

/* ------------------------------------------------------------------------- */
/* Config.                                                                     */
/* ------------------------------------------------------------------------- */

export default defineConfig([
  globalIgnores([
    'dist/',
    '.astro/',
    'wasm/target/',
    'node_modules/',
    'coverage/',
    'playwright-report/',
    'test-results/',
    'src/styles/tokens.css',
    'src/wasm/',
    // Parallel agent worktrees live inside the main checkout; each lints itself.
    '.claude/worktrees/',
  ]),

  // Every JS/TS/Astro file: ESLint's recommended rules.
  {
    name: 'project/eslint-recommended',
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,astro}'],
    rules: eslintRecommended,
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },

  // TypeScript (type-aware, through the TS project service).
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['**/*.{ts,mts,cts}'],
    ignores: ['**/*.astro/*.ts'],
  })),
  {
    name: 'project/typescript',
    files: ['**/*.{ts,mts,cts}'],
    ignores: ['**/*.astro/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: ROOT },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Astro components (frontmatter + client <script>s through the plugin's processor).
  ...astro.configs.recommended,
  {
    name: 'project/astro',
    files: ['**/*.astro'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      ...tsRecommendedRules,
      // TypeScript resolves identifiers in .astro files (astro check); core no-undef cannot see Astro globals.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    name: 'project/astro-client-scripts',
    files: ['**/*.astro/*.ts', '**/*.astro/*.js'],
    languageOptions: { globals: globals.browser },
    rules: { 'no-undef': 'off' },
  },

  // Plain JavaScript (configs, wasm build script): ES modules on Node.
  {
    name: 'project/javascript',
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  },

  // Globals per folder (they matter for .js and for the no-undef-free TS rules).
  {
    name: 'project/globals/node',
    files: ['scripts/**', 'cli/**', 'tests/**', 'src/adapters/**', '*.config.{ts,js}', '.claude/hooks/**'],
    languageOptions: { globals: globals.node },
  },
  {
    name: 'project/globals/browser',
    files: ['src/islands/**', 'src/adapters/wasm/**', 'tests/e2e/**'],
    languageOptions: { globals: { ...globals.browser } },
  },

  // FUNCTIONAL CORE — purity and layering, whatever the file extension.
  {
    name: 'project/core-purity',
    files: [CORE_SCRIPTS],
    plugins: { functional, local },
    rules: {
      ...corePurity,
      'local/import-boundaries': ['error', { layer: 'src/core', allow: ['src/core/'], bare: CORE_FORBIDDEN_MODULES }],
    },
  },
  {
    // Unions are closed sets: every case is listed and the default is `absurd(x)` (needs types).
    name: 'project/core-exhaustiveness',
    files: ['src/core/**/*.{ts,mts,cts}'],
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true },
      ],
    },
  },

  // ISLANDS — browser shell: no build-time pipeline, no Node built-ins.
  {
    name: 'project/islands-layering',
    files: ['src/islands/**/*.{ts,mts,cts,js,mjs,cjs}'],
    plugins: { local },
    rules: {
      'local/import-boundaries': [
        'error',
        { layer: 'src/islands', forbid: ['src/adapters/unified/'], bare: ISLAND_FORBIDDEN_MODULES },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)adapters/unified(/|$)',
              message: 'Islands run in the browser: the Markdown pipeline is build-time only.',
            },
            ...ISLAND_FORBIDDEN_MODULES,
          ],
        },
      ],
    },
  },
]);
