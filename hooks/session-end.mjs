#!/usr/bin/env node
/**
 * SessionEnd → session summary.
 *
 * The METR finding: experienced developers misjudged their own AI-assisted speed
 * by 39 points. Putting a measurement where the self-report would go is
 * therefore not cosmetic — the gap between "we got a lot done" and "N lines, M
 * slop blocked, K waivers" is exactly where the productivity illusion lives
 * (HUMAN-02).
 *
 * It also prunes old session files: every session leaves one behind, and if
 * nobody removes them that is its own kind of dead accumulation (CODE-03).
 */

import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { runHook } from '../lib/hook.mjs';
import { sessionSummary } from '../lib/session.mjs';
import { paths } from '../lib/config.mjs';
import { notify, fail, BRAND } from '../lib/report.mjs';

const KEEP_DAYS = 7;

function pruneOldSessions(currentId) {
  const cutoff = Date.now() - KEEP_DAYS * 86400 * 1000;
  let removed = 0;
  let entries;
  try {
    entries = readdirSync(paths.dir);
  } catch (error) {
    fail('session-end', `session directory could not be read — ${error.message}`);
    return 0;
  }
  for (const name of entries) {
    if (!name.startsWith('session-') || !name.endsWith('.json')) continue;
    if (name === `session-${currentId}.json`) continue;
    const file = join(paths.dir, name);
    try {
      if (statSync(file).mtimeMs < cutoff) { unlinkSync(file); removed++; }
    } catch (error) {
      fail('session-end', `old session could not be removed (${name}) — ${error.message}`);
    }
  }
  return removed;
}

runHook('session-end', ({ state, sessionId }) => {
  pruneOldSessions(String(sessionId).replace(/[^\w-]/g, '_'));

  // In a session where nothing happened, a summary is noise.
  if (state.turns === 0 && state.linesWritten === 0) return;

  notify(`${BRAND} — session summary\n\n  ${sessionSummary(state)}`);
});
