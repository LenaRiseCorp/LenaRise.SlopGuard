#!/usr/bin/env node
/**
 * PostToolUse: Edit|Write|MultiEdit → scan across all categories.
 *
 * Measured fact (docs/verification-log.md): a PostToolUse block reaches the model
 * but does not stop it — the file has already been written, and the model can
 * acknowledge the block and finish anyway. So the block here is a *request to
 * fix*, not a lock. The hard guarantee is built like this: findings are written
 * to the session ledger as open violations, and stop-gate refuses to end the turn
 * while the ledger is not empty.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { runHook, editedPath, linesChanged } from '../lib/hook.mjs';
import { scanContent, actionable, classify } from '../lib/scan.mjs';
import { isPathIgnored } from '../lib/config.mjs';
import { recordWrite, recordViolations } from '../lib/session.mjs';
import { block, notify, formatFindings, formatCleanScan, fail } from '../lib/report.mjs';

runHook('post-edit', ({ payload, config, state, repoRoot }) => {
  const filePath = editedPath(payload);
  if (!filePath) return;

  const shown = repoRoot ? relative(repoRoot, filePath) : filePath;

  const { added, removed } = linesChanged(payload.tool_response, payload.tool_input);
  recordWrite(state, filePath, { added, removed, isCode: classify(filePath) === 'code' });

  if (isPathIgnored(config, filePath, repoRoot)) return;
  if (classify(filePath) === 'other') return;

  // Read from disk: after a MultiEdit or a series of edits, the file's real
  // final state cannot be reconstructed from tool_input.
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    const fallback = payload.tool_response?.content ?? payload.tool_input?.content;
    if (typeof fallback !== 'string') {
      fail('post-edit', `file could not be read and no fallback content is available (${filePath}) — ${error.message}`);
      return;
    }
    content = fallback;
  }

  const findings = scanContent({ filePath: shown, content, config });
  const live = actionable(findings);
  recordViolations(state, filePath, findings, shown);

  if (live.length === 0) {
    if (config.ui.cleanScans === 'summary') notify(formatCleanScan(1));
    return;
  }

  const blocking = config.mode === 'strict' && live.some((f) => f.severity === 'block');
  const text = formatFindings(findings, {
    config,
    target: shown,
    action: blocking ? 'block' : 'warn',
  });

  if (blocking) {
    block(`${text}\n\n  Fix this file. The turn cannot end until it is fixed — the stop gate is waiting on the open violation.`);
  } else {
    notify(text);
  }
});
