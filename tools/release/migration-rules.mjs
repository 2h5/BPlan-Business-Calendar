/**
 * Migration rules from AGENTS.md that git history can check:
 *
 * - a merged migration is never edited, renamed, or deleted (hosted projects
 *   have already applied it, so an edit silently diverges fresh and hosted
 *   databases);
 * - names follow `<14-digit timestamp>_<snake_case>.sql` with unique versions;
 * - a new migration sorts after every merged one, or `supabase db push` would
 *   apply it out of order on hosted projects.
 */

const MIGRATION_DIR = 'supabase/migrations/';
const MIGRATION_NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;

/**
 * @param {{ baseFiles: string[]; headFiles: string[]; changes: Array<{ status: string; path: string }> }} input
 *   baseFiles/headFiles: migration file names at the base and head commits.
 *   changes: `git diff --name-status base...head -- supabase/migrations` rows.
 * @returns {string[]} human-readable violations
 */
export function migrationViolations({ baseFiles, headFiles, changes }) {
  const violations = [];

  for (const { status, path } of changes) {
    if (!path.startsWith(MIGRATION_DIR)) continue;
    if (status !== 'A') {
      violations.push(`${path}: merged migrations must not change (git status ${status})`);
    }
  }

  const versions = new Map();
  for (const name of headFiles) {
    const match = MIGRATION_NAME.exec(name);
    if (!match) {
      violations.push(`${name}: expected <14-digit timestamp>_<snake_case>.sql`);
      continue;
    }
    const version = match[1];
    if (versions.has(version)) {
      violations.push(`${name}: version ${version} is also used by ${versions.get(version)}`);
    }
    versions.set(version, name);
  }

  const latestMerged = baseFiles
    .map((name) => MIGRATION_NAME.exec(name)?.[1])
    .filter(Boolean)
    .sort()
    .at(-1);
  const merged = new Set(baseFiles);
  for (const name of headFiles) {
    const version = MIGRATION_NAME.exec(name)?.[1];
    if (!merged.has(name) && version && latestMerged && version <= latestMerged) {
      violations.push(`${name}: must sort after the latest merged migration (${latestMerged})`);
    }
  }

  return violations;
}
