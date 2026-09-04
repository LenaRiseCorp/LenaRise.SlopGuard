#!/usr/bin/env node
/**
 * Self-scan.
 *
 * A binding commitment: the plugin runs its own source through its own scanner.
 * If it trips on our code then either the pattern is wrong or the code is — one
 * of the two gets fixed, and no waiver is written.
 *
 * The scanned surface matches the runtime: test paths are excluded. This is not
 * an exemption but a matter of fidelity — pre-edit's TEST lock already refuses
 * writes to test files, so post-edit never sees one. Scanning a surface the
 * runtime never scans would be testing behaviour that does not happen. The count
 * of patterns inside test fixtures is still printed; nothing is hidden.
 *
 * Exit code: 1 when there are findings, 0 when clean. CI uses it as a gate.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanContent, actionable, isTestPath, scanFiles } from '../lib/scan.mjs';
import { formatFinding } from '../lib/report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const all = walk(ROOT).map((f) => relative(ROOT, f));
let fixtureFindings = 0;

const read = (rel) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch (error) {
    process.stderr.write(`could not read: ${rel} — ${error.message}\n`);
    return null;
  }
};

// Test paths are never scanned at runtime; the count here is informational only.
for (const rel of all.filter(isTestPath)) {
  const body = read(rel);
  if (body === null) continue;
  fixtureFindings += actionable(scanContent({ filePath: rel.replace(/\.test\./, '.'), content: body })).length;
}

const { results, scanned, suppressed: suppressedCount, total } = scanFiles({
  files: all.filter((rel) => !isTestPath(rel)),
  read,
});

const fixtureNote = fixtureFindings > 0
  ? `\n  (${fixtureFindings} deliberate pattern(s) live in test fixtures; the runtime never scans those paths)`
  : '';

if (total === 0) {
  process.stdout.write(`Self-scan: ${scanned} file(s) · clean`);
  if (suppressedCount > 0) process.stdout.write(` · ${suppressedCount} reasoned waiver(s)`);
  process.stdout.write(`${fixtureNote}\n`);
  process.exit(0);
}

process.stdout.write(`Self-scan: ${scanned} file(s) scanned, ${total} finding(s)\n\n`);
for (const [rel, findings] of results) {
  process.stdout.write(`${rel}\n`);
  for (const f of findings) process.stdout.write(`${formatFinding(f)}\n`);
  process.stdout.write('\n');
}
process.exit(1);
