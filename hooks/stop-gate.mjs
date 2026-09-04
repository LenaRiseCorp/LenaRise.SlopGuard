#!/usr/bin/env node
/**
 * Stop → the verification gate.
 *
 * The second and decisive leg of the hard guarantee. Measurement showed that a
 * PreToolUse deny stops the tool and a Stop block prevents the turn from ending,
 * while a PostToolUse block only reaches the model and can be ignored. That is
 * why post-edit records what it finds in the ledger and the lock is built here.
 *
 * Three reasons to block:
 *   1. Unfixed violations sit in the ledger
 *   2. Code changed but no verification ran this turn (TEST-05)
 *   3. The diff accumulated since the last commit is too large to review (PROC-02)
 *
 * Loop guard: blocking forever on the same reason would break our own AGENT-08
 * rule. A fingerprint is tracked; if the violation set is changing there is
 * progress and the counter resets, and if it is not, the gate opens at the
 * ceiling — but not silently. Hiding that the gate was passed would be worse
 * than having no gate (HUMAN-04).
 */

import { createHash } from 'node:crypto';
import { runHook } from '../lib/hook.mjs';
import { openViolations, countStopBlock } from '../lib/session.mjs';
import { block, notify, BRAND } from '../lib/report.mjs';

function fingerprint(reasons) {
  return createHash('sha256').update(reasons.join('|')).digest('hex').slice(0, 12);
}

runHook('stop-gate', ({ payload, config, state }) => {
  const reasons = [];
  const detail = [];

  const open = openViolations(state);
  if (open.length > 0) {
    reasons.push(`violations:${open.map((v) => `${v.file}:${v.id}:${v.line}`).sort().join(',')}`);
    detail.push(`  ${open.length} unfixed violation(s):`);
    for (const v of open.slice(0, 10)) detail.push(`    ${v.id}  ${v.file}:${v.line}  ${v.title}`);
    if (open.length > 10) detail.push(`    … and ${open.length - 10} more`);
  }

  if (state.codeWritesSinceVerify > 0 && !state.testRunAt) {
    reasons.push(`verification:${state.codeWritesSinceVerify}`);
    detail.push(`  ${state.codeWritesSinceVerify} code write(s) happened and no test ran this turn (TEST-05).`);
    detail.push('    Run it before saying it works.');
  }

  const limit = config.thresholds.maxDiffLines;
  if (state.linesSinceCommit > limit) {
    reasons.push(`diff:${Math.floor(state.linesSinceCommit / 100)}`);
    detail.push(`  ${state.linesSinceCommit} lines changed since the last commit, threshold ${limit} (PROC-02).`);
    detail.push('    Split it into reviewable pieces and commit.');
  }

  if (reasons.length === 0) return;

  if (config.mode === 'explore') {
    notify(`${BRAND} — explore mode, the gate is not blocking\n\n${detail.join('\n')}`);
    return;
  }

  const print = fingerprint(reasons);
  const attempts = countStopBlock(state, print);
  const max = config.thresholds.maxStopBlocks;

  if (attempts > max) {
    notify(`${BRAND} — gate BYPASSED\n\n`
      + `  Blocked ${attempts - 1} time(s) for the same reason with no progress; letting it through\n`
      + `  to avoid a loop (AGENT-08). The following are still open:\n\n${detail.join('\n')}\n\n`
      + `  This is not approval. Look at it before continuing.`);
    return;
  }

  block(`${BRAND} — cannot end turn (${attempts}/${max})\n\n${detail.join('\n')}\n\n`
    + `  Resolve these, then finish. To relax it temporarily: /slop-mode explore`);
});
