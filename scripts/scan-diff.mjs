#!/usr/bin/env node
/**
 * CI: scans the files changed against a reference.
 *
 * Usage: node scripts/scan-diff.mjs --base <sha|ref>
 * With no --base, or an invalid one, every tracked file is scanned. Silently
 * scanning nothing would mean appearing to check while leaving things unchecked.
 */
import { repoRoot, gitFiles, runScan } from './scan-cli.mjs';

const argv = process.argv.slice(2);
const baseIndex = argv.indexOf('--base');
const base = baseIndex !== -1 ? argv[baseIndex + 1] : null;

const root = repoRoot();
if (!root) process.exit(1);

let files = null;
let label = 'all tracked files';

if (base && /^[0-9a-zA-Z._\/-]+$/.test(base)) {
  files = gitFiles(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`], root);
  label = `${base}...HEAD`;
  if (files === null) {
    process.stderr.write('LenaRise.SlopGuard: the base reference could not be resolved, scanning every file\n');
  }
}

if (files === null) {
  files = gitFiles(['ls-files'], root);
  label = 'all tracked files';
}
if (!files) process.exit(1);

process.exit(runScan(files, root, label));
