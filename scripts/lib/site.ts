/**
 * Deployment coordinates shared by the guardrail scripts and the e2e config.
 *
 * Mirrors astro.config.ts: CI passes SITE (origin) and BASE_PATH (base_path)
 * from actions/configure-pages; local runs default to the production values of
 * this *project* site (repository flaviotinococoutinho/flaviotinoco.github.io →
 * https://flaviotinococoutinho.github.io/flaviotinoco.github.io/), so base-path
 * bugs surface locally. Pure: the caller passes the environment in.
 */

export const DEFAULT_SITE = 'https://flaviotinococoutinho.github.io';
export const DEFAULT_BASE_PATH = '/flaviotinoco.github.io';

export interface SiteCoordinates {
  /** Origin of the deployed site, e.g. "https://flaviotinococoutinho.github.io" (no trailing slash). */
  readonly origin: string;
  /** Base path with leading and trailing slash: "/" for a root site, "/repo/" for a project site. */
  readonly base: string;
}

/** Normalises a base path: "" → "/", "x" → "/x/", "/x" → "/x/", "/x/" → "/x/". */
export const normaliseBase = (raw: string): string => {
  const trimmed = raw.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
};

export const siteCoordinates = (env: Readonly<Record<string, string | undefined>>): SiteCoordinates => ({
  origin: new URL(env['SITE'] ?? DEFAULT_SITE).origin,
  base: normaliseBase(env['BASE_PATH'] ?? DEFAULT_BASE_PATH),
});

/**
 * Public URL of a file in dist (path relative to dist, "/"-separated), as the
 * static host serves it: "pt/index.html" → "<origin><base>pt/", "404.html" → "<origin><base>404.html".
 */
export const pageUrlOf = (distPath: string, coords: SiteCoordinates): URL => {
  const directoryIndex = distPath === 'index.html' || distPath.endsWith('/index.html');
  const path = directoryIndex ? distPath.slice(0, -'index.html'.length) : distPath;
  return new URL(`${coords.base}${path}`, coords.origin);
};

/** Outcome of mapping a site pathname to a file in dist. */
export type DistTarget =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'outside-base'; readonly base: string }
  | { readonly kind: 'missing-trailing-slash'; readonly candidate: string };

const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

/**
 * Maps a decoded-or-encoded URL pathname to the dist file a static host would
 * serve for it, following Astro's `build.format: 'directory'` and
 * `trailingSlash: 'always'`: "/base/pt/" → "pt/index.html"; "/base/a.css" → "a.css";
 * "/base/pt" (no slash, no extension) is reported, since it costs a redirect on
 * GitHub Pages and 404s on `astro preview`.
 */
export const distTargetOf = (pathname: string, base: string): DistTarget => {
  const path = pathname.split('/').map(decode).join('/');
  if (`${path}/` === base) return { kind: 'missing-trailing-slash', candidate: 'index.html' };
  if (!path.startsWith(base)) return { kind: 'outside-base', base };
  const rel = path.slice(base.length);
  if (rel === '' || rel.endsWith('/')) return { kind: 'file', path: `${rel}index.html` };
  const last = rel.slice(rel.lastIndexOf('/') + 1);
  if (last.includes('.')) return { kind: 'file', path: rel };
  return { kind: 'missing-trailing-slash', candidate: `${rel}/index.html` };
};
