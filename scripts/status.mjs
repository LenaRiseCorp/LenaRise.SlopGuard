#!/usr/bin/env node
/**
 * /slop-status — this session's measurements.
 *
 * There are two sources, and the difference is not hidden:
 *
 *   Session counters  what the hooks recorded. Empty when no hook fired — and an
 *                     empty counter does not mean "clean", it means "not measured".
 *   Live scan         performed while this command runs. Independent of the
 *                     hooks, so it reports the truth even if no hook ever fired.
 *
 * The command is invoked by hand, so ui.chatStatus does not affect it: the
 * periodic row may be off and this command still always answers.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, isPathIgnored } from '../lib/config.mjs';
import { scanFiles } from '../lib/scan.mjs';
import { repoRoot, listFiles } from './scan-cli.mjs';
import { loadSession, openViolations, sessionSummary } from '../lib/session.mjs';
import { read as readHeartbeat, ageSeconds, formatAge } from '../lib/heartbeat.mjs';
import { PATTERN_COUNT } from '../lib/patterns.mjs';
import { currentSessionId } from './current-session.mjs';
import { BRAND } from '../lib/report.mjs';

const out = [];
const { id, source, confident } = currentSessionId();

if (!id) {
  out.push(`${BRAND}: no record found for this session (${source}).`);
  out.push('No hook may ever have fired — /slop-doctor can diagnose it.');
  process.stdout.write(out.join('\n') + '\n');
  process.exit(0);
}

const { config } = loadConfig({ repoRoot: process.cwd() });
const state = loadSession(id);
const beat = readHeartbeat();

out.push(`${BRAND} — session ${id}`);
if (!confident) out.push(`  (the id came from ${source}; it is not certain)`);
out.push('');
out.push(`  Mode          ${config.mode}${state.modeOverride ? ' (session override)' : ''}${config.enabled ? '' : ' · PLUGIN DISABLED'}`);
out.push(`  Patterns      ${PATTERN_COUNT} built-in + ${config.localPatterns.length} user${config.disabled.length ? ` · disabled: ${config.disabled.join(', ')}` : ''}`);
out.push(`  Heartbeat     ${beat ? formatAge(ageSeconds(beat)) : 'none'}`);
out.push('');
out.push(`  Measured      ${sessionSummary(state)}   (from hook records)`);
out.push(`  Lines read    ${state.linesRead}${state.linesWritten - state.linesRead >= config.thresholds.comprehensionGap ? '  ← comprehension debt above threshold (HUMAN-01)' : ''}`);
out.push(`  Commit debt   ${state.linesSinceCommit} lines${state.linesSinceCommit > config.thresholds.uncommittedLines ? '  ← above threshold (AGENT-06)' : ''}`);
out.push(`  Verification  ${state.testRunAt ? `tests ${formatAge(Math.round((Date.now() - state.testRunAt) / 1000))}` : 'no tests ran this turn (TEST-05)'}`);

const open = openViolations(state);
if (open.length > 0) {
  out.push('');
  out.push('  Open violations (the stop gate is waiting on these):');
  for (const v of open) out.push(`    ${v.id}  ${v.file}:${v.line}  ${v.title}`);
}

// Live scan: measure now instead of trusting what the hooks recorded.
// A git repository is not required — a plain folder is walked.
const detected = repoRoot({ quiet: true });
const root = detected ?? process.cwd();
if (root) {
  const { files: target, label } = listFiles(root, { isRepo: Boolean(detected) });
  const { results, scanned, total, suppressed: sup } = scanFiles({
    files: [...new Set(target)],
    config,
    skip: (rel) => isPathIgnored(config, join(root, rel), root),
    read: (rel) => {
      const full = join(root, rel);
      if (!existsSync(full)) return null;
      try {
        return readFileSync(full, 'utf8');
      } catch (error) {
        process.stderr.write(`${BRAND}: could not read ${rel} — ${error.message}\n`);
        return null;
      }
    },
  });
  out.push('');
  out.push(`  Live scan     ${scanned} file(s) (${label})`
    + ` · ${total === 0 ? 'clean' : `${total} finding(s)`}${sup > 0 ? ` · ${sup} reasoned waiver(s)` : ''}`);
  for (const [rel, findings] of results.slice(0, 10)) {
    out.push(`    ${rel}`);
    for (const f of findings.slice(0, 5)) out.push(`      ${f.id}  line ${f.line}  ${f.title}`);
  }
  if (results.length > 10) out.push(`    … and ${results.length - 10} more file(s)`);
} else {
  out.push('');
  out.push('  Live scan     not a git repository, skipped');
}

// If the counters are empty, say why: an empty counter is not "clean", it is "not measured".
if (state.turns > 0 && Object.keys(state.filesWritten).length === 0) {
  out.push('');
  out.push('  Note: no file writes were recorded in this session.');
  out.push('    Likely cause: files were written through Bash (cat > , python -c , sed -i).');
  out.push('    post-edit only listens to the Edit and Write tools; content written through');
  out.push('    the shell is invisible to it. The live scan above closes that gap.');
}

const cats = Object.entries(state.byCategory ?? {});
if (cats.length > 0) {
  out.push('');
  out.push(`  By category: ${cats.map(([c, n]) => `${c}=${n}`).join(' · ')}`);
}

if (state.warned.length > 0) {
  out.push('');
  out.push(`  Warnings shown: ${state.warned.join(', ')}`);
}

process.stdout.write(out.join('\n') + '\n');
