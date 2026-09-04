#!/usr/bin/env node
/**
 * PreToolUse: Edit|Write|MultiEdit → test and protected-path defence.
 *
 * This hook really stops things: measurement showed that a PreToolUse deny
 * prevents the tool from running even in bypass permissions mode
 * (docs/verification-log.md). It is one of the two legs of the hard guarantee.
 *
 * The TEST lock is the strongest mechanism here. The ImpossibleBench finding is
 * that cheating drops close to zero when the test file is not visible to the
 * model. An agent that cannot change the test has to fix the code to pass it.
 */

import { relative } from 'node:path';
import { runHook, editedPath } from '../lib/hook.mjs';
import { scanPath, isTestPath, protectedPathReason } from '../lib/scan.mjs';
import { isPathIgnored } from '../lib/config.mjs';
import { deny, formatFindings } from '../lib/report.mjs';

runHook('pre-edit', ({ payload, config, repoRoot }) => {
  const filePath = editedPath(payload);
  if (!filePath) return;

  const shown = repoRoot ? relative(repoRoot, filePath) : filePath;
  if (isPathIgnored(config, filePath, repoRoot)) return;

  // Protected paths ignore the mode: these are not style rules, they are secret
  // and integrity protection. Explore mode exists for prototyping, not for
  // opening .env.
  const why = protectedPathReason(shown);
  if (why) {
    deny(`LenaRise.SlopGuard: ${shown} is protected (${why}).\n`
       + `An agent should not write this file. If it genuinely must change, let the user edit it, `
       + `or add the path to .slopignore at the repository root.`);
    return;
  }

  if (isTestPath(shown) && !config.allowTestWrites) {
    deny(`LenaRise.SlopGuard: ${shown} is a test file (TEST-01).\n`
       + `Fix the code that makes the test pass instead of changing the test. If the test really `
       + `must change, set allowTestWrites: true in config.json — and write down why.`);
    return;
  }

  const findings = scanPath({ filePath: shown, config });
  if (config.mode === 'strict' && findings.some((f) => f.severity === 'block')) {
    deny(formatFindings(findings, { config, target: shown, action: 'block' }));
  }
});
