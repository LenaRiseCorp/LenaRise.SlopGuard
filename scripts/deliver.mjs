#!/usr/bin/env node
/**
 * The delivery gate — evidence for interface work.
 *
 * The distinction this file exists for: a model writing "PASS" is a claim, and
 * this script running is an event. The same reasoning is already recorded in
 * docs/verification-log.md for tests — "the tests passed" is known from the hook
 * firing, not from the sentence — and the gate is built the same way here.
 *
 * stop-gate blocks while interface files have been written and no report has
 * been recorded. Only a clean run records one: a run that finds something leaves
 * the gate closed, so the report cannot be produced by running this and ignoring
 * the output.
 *
 * It is not a second scanner. It re-reads the interface files written in this
 * session through the same engine the hooks use (CODE-01), and writes down that
 * it did.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, isPathIgnored } from '../lib/config.mjs';
import { scanFiles } from '../lib/scan.mjs';
import { isInterfaceFile } from '../lib/patterns.mjs';
import { isWebProject } from '../lib/project.mjs';
import { updateSession, loadSession, recordDeliveryReport } from '../lib/session.mjs';
import { currentSessionId } from './current-session.mjs';
import { repoRoot } from './scan-cli.mjs';
import { BRAND, exitWhenFlushed } from '../lib/report.mjs';

/**
 * Wrapped in a function on purpose: exitWhenFlushed schedules the exit and
 * returns, so an early exit written at the top level would fall through into the
 * rest of the file. Every exit here is a return value instead.
 */
function main() {
  const root = repoRoot({ quiet: true }) ?? process.cwd();

  if (!isWebProject(root)) {
    process.stdout.write(`${BRAND}: no interface in this project — the delivery gate does not apply here.\n`);
    return 0;
  }

  const session = currentSessionId();
  if (!session.confident) {
    process.stderr.write(`${BRAND}: the current session could not be identified from the heartbeat; using ${session.id ?? 'none'}.\n`);
  }
  if (!session.id) {
    process.stderr.write(`${BRAND}: no session to record a delivery report against.\n`);
    return 2;
  }

  const state = loadSession(session.id);
  const written = Object.keys(state.filesWritten ?? {}).filter(isInterfaceFile);

  if (written.length === 0) {
    process.stdout.write(`${BRAND}: no interface file was written in this session — nothing to deliver.\n`);
    return 0;
  }

  const { config, problems } = loadConfig({ repoRoot: root });
  for (const problem of problems) process.stderr.write(`${BRAND}: ${problem}\n`);

  const exempt = new Set(written.filter((rel) => isPathIgnored(config, join(root, rel), root)));

  const { results, scanned, suppressed } = scanFiles({
    files: written,
    config,
    skip: (rel) => exempt.has(rel),
    read: (rel) => {
      const full = join(root, rel);
      if (!existsSync(full)) return null;   // a file deleted since it was written
      try {
        return readFileSync(full, 'utf8');
      } catch (error) {
        process.stderr.write(`${BRAND}: could not read ${rel} — ${error.message}\n`);
        return null;
      }
    },
  });

  process.stdout.write(`${BRAND} delivery gate — ${scanned} interface file(s)\n\n`);

  // scanFiles reports only the files that have findings, and has already dropped
  // the waived ones. Everything else scanned is a pass.
  const byFile = new Map(results);
  let failed = 0;
  for (const rel of written) {
    if (exempt.has(rel)) {
      process.stdout.write(`  ----  ${rel}  (exempt via .slopignore — not checked)\n`);
      continue;
    }
    const findings = byFile.get(rel) ?? [];
    if (findings.length === 0) {
      process.stdout.write(`  PASS  ${rel}\n`);
      continue;
    }
    failed += 1;
    process.stdout.write(`  FAIL  ${rel}\n`);
    for (const f of findings) {
      process.stdout.write(`          ${f.id}  line ${f.line}  ${f.detects}\n`);
      process.stdout.write(`          fix: ${f.fix}\n`);
    }
  }

  if (suppressed > 0) process.stdout.write(`\n  ${suppressed} reasoned waiver(s) in these files.\n`);

  /**
   * What the scan cannot see. Printed on a pass rather than hidden, because a
   * green report that implies more than it measured is the failure this whole
   * project is against: the gate proves the mechanical half and says so.
   */
  const BY_HAND = [
    'every interactive element was run once, and what it did is written down',
    'empty, loading and error states exist',
    'the narrow width was opened, not assumed',
    'contrast ratios were computed where a pair was uncertain',
    'numbers, testimonials and logos are real, or the gap is labelled',
  ];

  if (failed > 0) {
    process.stdout.write(`\n${BRAND}: ${failed} file(s) failed. Fix them and run this again — the gate stays closed until it is clean.\n`);
    return 1;
  }

  updateSession(session.id, (s) => { recordDeliveryReport(s); });

  process.stdout.write(`\n${BRAND}: mechanical checks pass on ${scanned} file(s), recorded.\n`);
  process.stdout.write('\nStill yours to confirm, and to state in your own report:\n');
  for (const item of BY_HAND) process.stdout.write(`  - ${item}\n`);
  return 0;
}

exitWhenFlushed(main());
