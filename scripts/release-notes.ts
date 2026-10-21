/**
 * Shell: prints the release notes of one version from CHANGELOG.md.
 *   node scripts/release-notes.ts v0.2.0   (or 0.2.0)
 * Used by .github/workflows/release.yml; fails when the section is missing,
 * undated or empty, so a tag can never publish an empty release.
 */
import { readFile } from 'node:fs/promises';
import { releaseNotes, versionOfTag } from './lib/changelog.ts';

const tag = process.argv[2];
if (tag === undefined) {
  console.error('usage: node scripts/release-notes.ts vX.Y.Z');
  process.exit(2);
}
const version = versionOfTag(tag);
if (!version.ok) {
  console.error(`release-notes: ${version.error}`);
  process.exit(2);
}
const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const notes = releaseNotes(changelog, version.value);
if (!notes.ok) {
  console.error(`release-notes: ${notes.error}`);
  process.exit(1);
}
process.stdout.write(`${notes.value}\n`);
