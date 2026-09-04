#!/usr/bin/env node
/**
 * PreToolUse: Bash → destructive command defence and the package gate.
 *
 * Three jobs, one output: the hook protocol expects a single JSON object on
 * stdout, and writing a second one breaks it.
 *
 *   1. Destructive command → deny (in every mode; explore does not relax this)
 *   2. Package install     → deny when the name is missing from the registry or
 *                            cannot be verified
 *   3. Notices             → merged into one systemMessage; never blocking
 *
 * The package gate is fail-closed: neither "missing" nor "unknown" passes. A
 * package that could not be verified has not been verified; the message says
 * which case it was.
 */

import { resolve, relative } from 'node:path';
import { runHook } from '../lib/hook.mjs';
import { scanCommand, actionable, isTestPath, protectedPathReason, activePatterns } from '../lib/scan.mjs';
import { actionFor, isPathIgnored } from '../lib/config.mjs';
import { parseInstall, verifyPackages, isCommitCommand, writeTargets } from '../lib/commands.mjs';
import { verifyBeforeCommit } from '../lib/coach.mjs';
import { deny, notify, formatFindings, BRAND } from '../lib/report.mjs';

runHook('pre-bash', async ({ payload, config, state, repoRoot }) => {
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string' || command.trim() === '') return;

  // Patterns carrying a gate have their own policy and are exempt from this scan.
  const findings = actionable(scanCommand({ command, config })).filter((f) => !f.gate);
  const blocking = findings.filter((f) => actionFor(f, config) === 'block');

  if (blocking.length > 0) {
    deny(formatFindings(blocking, { config, target: command, action: 'block' }));
    return;
  }

  // Writing through Bash: commands such as `cat > .env` and `sed -i` bypass the
  // Edit/Write tools and never reached the pre-edit lock. The same policy applies
  // here — otherwise a single redirection would defeat the lock.
  for (const target of writeTargets(command)) {
    const absolute = resolve(payload.cwd ?? process.cwd(), target);
    if (isPathIgnored(config, absolute, repoRoot)) continue;
    const shown = repoRoot ? relative(repoRoot, absolute) : target;

    const why = protectedPathReason(shown);
    if (why) {
      deny(`${BRAND}: this command writes to ${shown}, which is protected (${why}).\n`
        + `An agent should not write this file. If it genuinely must change, let the user edit it, `
        + `or add the path to .slopignore at the repository root.`);
      return;
    }
    if (isTestPath(shown) && !config.allowTestWrites) {
      deny(`${BRAND}: this command writes to ${shown}, which is a test file (TEST-01).\n`
        + `Writing through the shell does not bypass the lock. Fix the code that makes the test pass; `
        + `if the test really must change, set allowTestWrites: true in config.json.`);
      return;
    }
  }

  // The package install gate.
  const gateOn = activePatterns('command', config).some((p) => p.gate === 'package-verification');
  const install = gateOn ? parseInstall(command) : null;
  if (install && install.registry && install.packages.length > 0) {
    const { ok, missing, unknown } = await verifyPackages(install.packages, install.registry, {
      trusted: config.trustedPackages,
      timeoutMs: config.thresholds.packageCheckTimeoutMs,
    });
    if (!ok) {
      const lines = [`${BRAND}: package install could not be verified (SEC-02 slopsquatting).`, ''];
      if (missing.length > 0) {
        lines.push(`  NOT FOUND in the ${install.registry} registry: ${missing.join(', ')}`);
        lines.push('  A package name that does not exist installs whatever code claimed that name.');
        lines.push('  Check the spelling and confirm the package is real.');
      }
      if (unknown.length > 0) {
        if (missing.length > 0) lines.push('');
        lines.push(`  Could not be verified (no network or timeout): ${unknown.join(', ')}`);
        lines.push('  A package that could not be verified has not been verified; the gate closes on purpose.');
      }
      lines.push('', '  If you are sure the package is correct, add it to trustedPackages in config.json.');
      deny(lines.join('\n'));
      return;
    }
  }

  // Non-blocking notices are collected into one body.
  const notices = findings
    .filter((f) => actionFor(f, config) === 'warn')
    .map((f) => `${f.id} ${f.detects} → ${f.fix}`);

  if (isCommitCommand(command)) {
    const warning = verifyBeforeCommit(state);
    if (warning) notices.push(warning.message);
  }

  if (notices.length > 0) {
    notify(`${BRAND}\n\n${notices.map((n) => `  · ${n}`).join('\n')}`);
  }
});
