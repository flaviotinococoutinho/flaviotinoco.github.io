/**
 * /<lang>/preferences.json — the reader preferences form as data (ADR 0009:
 * chrome on demand). Fetched by <ft-preferences> the first time the panel
 * opens; built and decoded by src/core/chrome/preferences-form.ts.
 */
import type { APIContext } from 'astro';
import { encodePreferencesForm, preferencesForm } from '../../core/chrome/preferences-form.ts';
import type { Locale } from '../../core/domain/locale.ts';
import { localeStaticPaths } from '../../adapters/astro/i18n.ts';

export const getStaticPaths = localeStaticPaths;

export function GET(context: APIContext): Response {
  const { locale } = context.props as { readonly locale: Locale };
  return new Response(encodePreferencesForm(preferencesForm(locale)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
