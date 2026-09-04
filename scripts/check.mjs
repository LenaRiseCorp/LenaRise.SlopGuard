#!/usr/bin/env node
/**
 * /slop-check [path...] — scan on demand.
 *
 * In a git repository: changed files, or every tracked file when nothing has
 * changed. In a plain folder: the filesystem is walked. The command does not
 * have to run inside a repository — it is meaningful in a parent directory
 * holding several projects, and refusing to work there would be an artificial limit.
 */

import { statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoRoot, runScan, listFiles, walkFiles } from './scan-cli.mjs';
import { BRAND } from '../lib/report.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const detected = repoRoot({ quiet: true });
const root = detected ?? process.cwd();

function expand(target) {
  const full = join(root, target);
  let info;
  try {
    info = statSync(full);
  } catch (error) {
    process.stderr.write(`${BRAND}: not found ${target} — ${error.message}\n`);
    return [];
  }
  if (info.isFile()) return [relative(root, full)];
  return walkFiles(full).map((rel) => relative(root, join(full, rel)));
}

let files;
let label;
if (args.length > 0) {
  files = args.flatMap(expand);
  label = args.join(' ');
} else {
  ({ files, label } = listFiles(root, { isRepo: Boolean(detected) }));
}

if (files.length === 0) {
  process.stdout.write(`${BRAND}: nothing to scan.\n`);
  process.exit(0);
}

process.exit(runScan([...new Set(files)], root, label));
