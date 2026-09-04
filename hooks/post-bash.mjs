#!/usr/bin/env node
/**
 * PostToolUse: Bash → verification and commit stamps, plus content scanning for
 * files written through the shell.
 *
 * Why this is a separate hook: PostToolUse does not fire at all when a Bash
 * command fails (measured — docs/verification-log.md). Reaching this point is
 * therefore proof that the command succeeded. Stamping "tests ran" before the
 * command would mean counting a test that never ran, or crashed, as passing —
 * exactly what we are here to prevent (TEST-05).
 *
 * The asymmetry is deliberate: firing proves success, not firing does not prove
 * failure. With no stamp we say "not verified", never "failed".
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { runHook } from '../lib/hook.mjs';
import { isTestCommand, isCommitCommand, writeTargets } from '../lib/commands.mjs';
import { recordTestRun, recordCommit, recordViolations, recordWrite } from '../lib/session.mjs';
import { scanContent, actionable, classify } from '../lib/scan.mjs';
import { isPathIgnored } from '../lib/config.mjs';
import { block, notify, formatFindings, fail, BRAND } from '../lib/report.mjs';

runHook('post-bash', ({ payload, config, state, repoRoot }) => {
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') return;
  if (isTestCommand(command)) recordTestRun(state);
  if (isCommitCommand(command)) recordCommit(state);

  // Content of files written through the shell. post-edit never saw these: the
  // command goes through the Bash matcher, where only the command itself was
  // scanned, not the content written.
  const all = [];
  for (const target of writeTargets(command)) {
    const absolute = resolve(payload.cwd ?? process.cwd(), target);
    if (isPathIgnored(config, absolute, repoRoot)) continue;
    if (classify(absolute) === 'other') continue;
    if (!existsSync(absolute)) continue;

    const shown = repoRoot ? relative(repoRoot, absolute) : target;
    let content;
    try {
      content = readFileSync(absolute, 'utf8');
    } catch (error) {
      fail('post-bash', `written file could not be read (${shown}) — ${error.message}`);
      continue;
    }

    const findings = scanContent({ filePath: shown, content, config });
    recordWrite(state, absolute, { added: content.split('\n').length, isCode: classify(absolute) === 'code' });
    recordViolations(state, absolute, findings, shown);
    all.push([shown, findings]);
  }

  const live = all.flatMap(([, f]) => actionable(f));
  if (live.length === 0) return;

  const blocking = config.mode === 'strict' && live.some((f) => f.severity === 'block');
  const text = all
    .filter(([, f]) => actionable(f).length > 0)
    .map(([shown, f]) => formatFindings(f, { config, target: shown, action: blocking ? 'block' : 'warn' }))
    .join('\n\n');

  if (blocking) {
    block(`${text}\n\n  Written through the shell, but the scan is not skipped. Fix it — `
      + `the stop gate is waiting on the open violation.`);
  } else {
    notify(`${BRAND}\n\n${text}`);
  }
});
