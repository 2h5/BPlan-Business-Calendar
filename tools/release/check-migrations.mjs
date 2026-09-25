#!/usr/bin/env node
// Enforce migration immutability and ordering against a base revision.
// Usage: node tools/release/check-migrations.mjs <base-ref>   (e.g. origin/main)
import { execFileSync } from 'node:child_process';
import process from 'node:process';

import { migrationViolations } from './migration-rules.mjs';

const base = process.argv[2];
if (!base) {
  process.stderr.write('Usage: check-migrations.mjs <base-ref>\n');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const namesAt = (ref) =>
  git('ls-tree', '--name-only', `${ref}:supabase/migrations`).split('\n').filter(Boolean);

// Compare against the merge base so commits that landed on the base branch
// after this branch was cut are not mistaken for edits here.
const mergeBase = git('merge-base', base, 'HEAD').trim();
const changes = git(
  'diff',
  '--name-status',
  '--no-renames',
  mergeBase,
  'HEAD',
  '--',
  'supabase/migrations',
)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, path] = line.split('\t');
    return { status, path };
  });

const violations = migrationViolations({
  baseFiles: namesAt(mergeBase),
  headFiles: namesAt('HEAD'),
  changes,
});

if (violations.length > 0) {
  process.stderr.write(`Migration rules violated (against ${base}):\n`);
  for (const violation of violations) process.stderr.write(`  ${violation}\n`);
  process.exit(1);
}

process.stdout.write(`Migrations OK against ${base}: ${changes.length} added, none edited.\n`);
