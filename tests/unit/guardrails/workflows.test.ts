/**
 * Repository settings that documents promise: least-privilege permissions of
 * the deployment and release workflows (ADR 0005 §1, ADR 0010) and one minimum
 * Node version across package.json, README and the tokens hook (the TypeScript
 * scripts need type stripping, on by default from Node 22.18).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const read = (file: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), 'utf8');

interface Workflow {
  readonly permissions?: Readonly<Record<string, string>>;
  readonly jobs: Readonly<Record<string, { readonly permissions?: Readonly<Record<string, string>> }>>;
}

describe('deploy.yml permissions (ADR 0005: least privilege)', () => {
  const workflow = parse(read('.github/workflows/deploy.yml')) as Workflow;

  it('grants the workflow only read access to the code', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  // Regression (review guardrails#7): pages: write and id-token: write sat at workflow level,
  // so every job — and any job added later — inherited them.
  it('gives Pages write access and the OIDC token to the deploy job alone', () => {
    const writers = Object.entries(workflow.jobs)
      .filter(([, job]) => job.permissions?.['pages'] === 'write' || job.permissions?.['id-token'] === 'write')
      .map(([name]) => name);
    expect(writers).toEqual(['deploy']);
    expect(workflow.jobs['deploy']?.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
    expect(workflow.jobs['build']?.permissions).toEqual({ contents: 'read', pages: 'read' });
  });

  it('states the permissions of every job', () => {
    for (const [name, job] of Object.entries(workflow.jobs)) expect(job.permissions, name).toBeDefined();
  });
});

describe('release.yml permissions (ADR 0010: the release job alone writes)', () => {
  const workflow = parse(read('.github/workflows/release.yml')) as Workflow;

  it('grants the workflow only read access to the code', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
  });

  it('gives write access to the release job alone, and states the permissions of every job', () => {
    const writers = Object.entries(workflow.jobs)
      .filter(([, job]) => Object.values(job.permissions ?? {}).includes('write'))
      .map(([name]) => name);
    expect(writers).toEqual(['release']);
    expect(workflow.jobs['release']?.permissions).toEqual({ contents: 'write' });
    for (const [name, job] of Object.entries(workflow.jobs)) expect(job.permissions, name).toBeDefined();
  });

  it('runs only for version tags', () => {
    const on = (workflow as unknown as { readonly on: { readonly push?: { readonly tags?: readonly string[] } } }).on;
    expect(on.push?.tags).toEqual(['v[0-9]+.[0-9]+.[0-9]+']);
  });
});

describe('minimum Node version', () => {
  const engines = (JSON.parse(read('package.json')) as { readonly engines: { readonly node: string } }).engines.node;
  const minimum = /^>=(\d+\.\d+)\.\d+$/.exec(engines)?.[1];

  it('is the type-stripping release line in package.json', () => {
    expect(minimum).toBe('22.18');
  });

  it('is the one README and the tokens hook state', () => {
    expect(read('README.md')).toContain(`${minimum ?? '?'}.0`);
    const hook = read('.claude/hooks/tokens-on-edit.mjs');
    expect(hook).toContain(`Node ${minimum ?? '?'}`);
    expect(hook).not.toMatch(/22\.1[0-7]\b/);
  });
});
