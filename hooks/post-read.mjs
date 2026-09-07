#!/usr/bin/env node
/**
 * PostToolUse: Read → the comprehension-debt measurement (HUMAN-01).
 *
 * Why this hook exists at all: recordRead was written, exported and covered by a
 * unit test, but nothing in the shipped plugin ever called it. linesRead stayed
 * 0 in every real session, so the coach's comprehension-debt signal reduced to
 * "500 lines written" and the warning told the user they had read nothing no
 * matter how much they had read. A measurement that is structurally always zero
 * is worse than an absent one: it reports a number people believe.
 *
 * The count comes from tool_input rather than tool_response — see linesRead in
 * lib/hook.mjs for why.
 */

import { relative } from 'node:path';
import { runHook, linesRead } from '../lib/hook.mjs';
import { recordRead } from '../lib/session.mjs';
import { fail } from '../lib/report.mjs';

runHook('post-read', ({ payload, state, repoRoot }) => {
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== 'string' || filePath === '') return;

  const shown = repoRoot ? relative(repoRoot, filePath) : filePath;
  const count = linesRead(payload.tool_input, (error) => {
    fail('post-read', `read file could not be counted (${shown}) — ${error.message}`);
  });
  if (count > 0) recordRead(state, count);
});
