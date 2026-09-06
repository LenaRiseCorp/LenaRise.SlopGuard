#!/usr/bin/env node
/**
 * Mutation check for the pattern registry.
 *
 * A test that passes is not the same as a test that catches. This was written
 * after a review found a workflow template test that asserted the token
 * expression and stopped, so it stayed green while the repository slug beside it
 * was hard-coded and wrong. The suite was full, and blind in that spot.
 *
 * Every pattern is mutated twice and the suite is run each time:
 *
 *   disabled   the pattern matches nothing. A test must fail, or nothing
 *              asserts the pattern does its job.
 *   widened    the pattern matches everything. A test must fail, or nothing
 *              asserts where it must stay silent — and a pattern with no
 *              false-positive guard is reverted the first time it misfires.
 *
 * A surviving mutant is a hole, not a failure of this script: exit 1 says the
 * registry has a pattern nothing is watching.
 *
 * The work is done on a copy under the system temp directory, so an interrupted
 * run cannot leave a mutated pattern file behind.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND } from '../lib/report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

const work = mkdtempSync(join(tmpdir(), 'slopguard-mutate-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));
// The working tree, not HEAD. `git archive HEAD` was the first attempt and it
// quietly measured the last commit: deleting a test and re-running still said
// the pattern was covered. Anyone running this before committing would be told
// about code they had already changed.
//
// The file list comes from git — tracked plus new, minus what the project
// ignores — so an untracked test counts and node_modules does not.
execFileSync('sh', ['-c',
  'git ls-files -z --cached --others --exclude-standard | tar -c --null -T - | tar -x -C "$1"',
  'sh', work], { cwd: ROOT });

const source = readFileSync(join(work, 'lib/patterns.mjs'), 'utf8');
const { PATTERNS } = await import(join(work, 'lib/patterns.mjs'));
const target = join(work, 'lib/patterns.mjs');

/** Replaces one pattern's `match:` line, leaving every other line untouched. */
function mutate(key, replacement) {
  const at = source.indexOf(`key: '${key}'`);
  if (at === -1) return null;
  const start = source.indexOf('match:', at);
  const end = source.indexOf('\n', start);
  if (start === -1 || end === -1) return null;
  return source.slice(0, start) + replacement + source.slice(end);
}

const MUTANTS = [
  ['disabled', 'match: /\\u0000NEVER\\u0000/,'],
  ['widened', 'match: /./,'],
];

/**
 * Tests that assert what a pattern DOES, as opposed to how the registry is
 * rendered. gen-docs asserts that the README and the semgrep template match the
 * registry, so it fails for any change to a regex — which made every mutant look
 * caught and the whole check meaningless. It was reporting full coverage for a
 * pattern that had no test at all.
 */
const SHAPE_ONLY = new Set(['gen-docs.test.mjs']);
const behaviourTests = readdirSync(join(work, 'test'))
  .filter((f) => f.endsWith('.test.mjs') && !SHAPE_ONLY.has(f))
  .map((f) => join('test', f));
for (const name of SHAPE_ONLY) {
  if (!existsSync(join(work, 'test', name))) {
    process.stderr.write(`${BRAND}: ${name} is excluded from the mutation run but no longer exists — the exclusion list is stale\n`);
    process.exit(2);
  }
}

const survivors = [];
const chosen = PATTERNS.filter((p) => !only || p.key.includes(only));
process.stdout.write(`${BRAND} mutation check — ${chosen.length} pattern(s), ${MUTANTS.length} mutant(s) each\n\n`);

for (const p of chosen) {
  const line = [];
  for (const [name, replacement] of MUTANTS) {
    const mutated = mutate(p.key, replacement);
    if (mutated === null) { line.push(`${name}:unparsed`); continue; }
    writeFileSync(target, mutated);
    // maxBuffer: a widened pattern fires on everything, so a run can produce tens
    // of megabytes of diffs. At the 1 MB default the output was truncated and the
    // "# fail" summary went with it, which the script then read as "could not be
    // measured" for 12 patterns that were in fact perfectly measurable.
    const r = spawnSync('node', ['--test', ...behaviourTests], {
      cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024,
    });
    const failed = Number(/^# fail (\d+)/m.exec(r.stdout ?? '')?.[1] ?? -1);
    if (failed === 0) { survivors.push(`${p.key} (${name})`); line.push(`${name}:SURVIVED`); }
    else if (failed < 0) {
      // The run produced no result at all — it crashed, or never finished.
      // Unmeasured is not covered, and recording it as caught would be the exact
      // dishonesty this script exists to find.
      survivors.push(`${p.key} (${name}, could not be measured)`);
      line.push(`${name}:NO-RESULT`);
    } else line.push(`${name}:caught`);
  }
  writeFileSync(target, source);
  process.stdout.write(`  ${line.join('  ')}  ${p.key}\n`);
}

process.stdout.write('\n');
if (survivors.length === 0) {
  process.stdout.write(`${BRAND}: every pattern is watched in both directions\n`);
  process.exit(0);
}
process.stdout.write(`${BRAND}: ${survivors.length} mutant(s) survived — nothing asserts these\n`);
for (const s of survivors) process.stdout.write(`  ${s}\n`);
process.stdout.write('\nAdd the missing assertion. A pattern nothing watches is a pattern nobody can trust.\n');
process.exit(1);
