/**
 * Release notes from CHANGELOG.md (pure; the shell reads the file).
 *
 * The changelog follows Keep a Changelog 1.1.0: one `## [X.Y.Z] - YYYY-MM-DD`
 * heading per release, `## [Não lançado]` for the next one, link references at
 * the end. A release's notes are the body of its section, with the link
 * reference lines dropped (they belong to the file, not to a GitHub release).
 */
import { err, ok, type Result } from '../../src/core/algebra/result.ts';

const HEADING = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const LINK_REFERENCE = /^\[[^\]]+\]:\s+\S+/;
export const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export interface ChangelogSection {
  /** "0.2.0" or "Não lançado". */
  readonly name: string;
  readonly date: string | undefined;
  /** Body lines between this heading and the next one, trimmed of blank edges. */
  readonly body: string;
}

const trimBlankEdges = (lines: readonly string[]): readonly string[] => {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? '').trim() === '') start += 1;
  while (end > start && (lines[end - 1] ?? '').trim() === '') end -= 1;
  return lines.slice(start, end);
};

/** Every `## [name] - date` section of a changelog, in file order. */
export const changelogSections = (changelog: string): readonly ChangelogSection[] => {
  const sections: ChangelogSection[] = [];
  let current: { name: string; date: string | undefined; lines: string[] } | null = null;
  const flush = (): void => {
    if (current !== null) {
      sections.push({ name: current.name, date: current.date, body: trimBlankEdges(current.lines).join('\n') });
    }
  };
  for (const line of changelog.split(/\r?\n/)) {
    const m = HEADING.exec(line);
    if (m !== null) {
      flush();
      current = { name: m[1] ?? '', date: m[2], lines: [] };
    } else if (current !== null && !LINK_REFERENCE.test(line)) {
      current.lines.push(line);
    }
  }
  flush();
  return sections;
};

/** Version names of the released sections (every section whose name is a semantic version). */
export const releasedVersions = (changelog: string): readonly string[] =>
  changelogSections(changelog)
    .map((s) => s.name)
    .filter((name) => SEMVER.test(name));

/** "v1.2.3" → "1.2.3"; anything else is an error naming the expected form. */
export const versionOfTag = (tag: string): Result<string, string> => {
  const version = tag.startsWith('v') ? tag.slice(1) : tag;
  return SEMVER.test(version) ? ok(version) : err(`"${tag}" is not a version tag (expected vX.Y.Z)`);
};

/** The notes of one released version: its section body, which must exist, be dated and be non-empty. */
export const releaseNotes = (changelog: string, version: string): Result<string, string> => {
  const section = changelogSections(changelog).find((s) => s.name === version);
  if (section === undefined) return err(`CHANGELOG.md has no section "## [${version}] - YYYY-MM-DD"`);
  if (section.date === undefined) return err(`CHANGELOG.md: section [${version}] has no release date`);
  if (section.body.length === 0) return err(`CHANGELOG.md: section [${version}] is empty`);
  return ok(section.body);
};
