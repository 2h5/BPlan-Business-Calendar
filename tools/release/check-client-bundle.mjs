#!/usr/bin/env node
// Fail if a built client bundle contains server-only secrets or their names.
// Usage: node tools/release/check-client-bundle.mjs [dir ...]  (default: apps/web/dist)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import process from 'node:process';

import { scanClientBundle } from './client-bundle-scan.mjs';

const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map', '.txt']);

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const dirs = process.argv.slice(2);
const roots = dirs.length > 0 ? dirs : ['apps/web/dist'];
let scanned = 0;
const findings = [];

for (const root of roots) {
  let files;
  try {
    files = listFiles(root).filter((path) => TEXT_EXTENSIONS.has(extname(path)));
  } catch {
    process.stderr.write(`No build output at ${root}. Run the build first.\n`);
    process.exit(1);
  }
  scanned += files.length;
  findings.push(
    ...scanClientBundle(
      files.map((path) => ({
        path: relative(process.cwd(), path),
        content: readFileSync(path, 'utf8'),
      })),
    ),
  );
}

if (findings.length > 0) {
  process.stderr.write('Server-only material found in the client bundle:\n');
  for (const finding of findings) {
    process.stderr.write(`  ${finding.path}: ${finding.kind} (${finding.detail})\n`);
  }
  process.exit(1);
}

process.stdout.write(`Client bundle clean: ${scanned} files scanned in ${roots.join(', ')}.\n`);
