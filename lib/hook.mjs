/**
 * Shared hook runner.
 *
 * Eight hooks do the same five things: read stdin, load the session, merge the
 * configuration, stamp the heartbeat, make failures visible. Repeating that in
 * every file would break our own CODE-01 rule.
 *
 * Failure policy: a hook NEVER blocks because of its own error. Our bug stopping
 * the user's work is not acceptable. But the error is not invisible either — it
 * goes to stderr, the stamp is not written, and the status line reports "broken".
 * Passing silently would produce the same outcome as having no protection while
 * appearing to have some (HUMAN-04).
 */

import { existsSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { loadConfig } from './config.mjs';
import { loadSession, saveSession } from './session.mjs';
import { stamp } from './heartbeat.mjs';
import { fail, exitWhenFlushed } from './report.mjs';

/** Reads stdin fully. The hook protocol sends a single JSON object. */
export function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', reject);
  });
}

/** Walks up from cwd looking for .git. Null when there is none — we also work outside a repo. */
export function findRepoRoot(startDir) {
  let dir = startDir ? String(startDir) : process.cwd();
  const { root } = parsePath(dir);
  while (dir && dir !== root) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return existsSync(join(dir, '.git')) ? dir : null;
}

/**
 * Lines changed.
 *
 * The tool_response.structuredPatch shape was measured (docs/verification-log.md):
 * empty on create, with the content in `content`; on update the hunks carry
 * "+"/"-" prefixed lines. If the shape arrives unexpected the counters stay at
 * zero rather than producing an invented number.
 */
export function linesChanged(toolResponse, toolInput) {
  const patch = toolResponse?.structuredPatch;
  if (Array.isArray(patch) && patch.length > 0) {
    let added = 0, removed = 0;
    for (const hunk of patch) {
      for (const line of hunk?.lines ?? []) {
        if (line.startsWith('+')) added++;
        else if (line.startsWith('-')) removed++;
      }
    }
    return { added, removed };
  }
  const content = toolResponse?.content ?? toolInput?.content;
  if (typeof content === 'string') return { added: content.split('\n').length, removed: 0 };
  const added = typeof toolInput?.new_string === 'string' ? toolInput.new_string.split('\n').length : 0;
  const removed = typeof toolInput?.old_string === 'string' ? toolInput.old_string.split('\n').length : 0;
  return { added, removed };
}

/** Path of the edited file; the field differs by tool. */
export function editedPath(payload) {
  return payload?.tool_input?.file_path
      ?? payload?.tool_response?.filePath
      ?? payload?.tool_input?.notebook_path
      ?? null;
}

/**
 * Runs a hook body.
 *
 * @param {string} name     hook name, as it appears on stderr
 * @param {(ctx) => void} handler  ctx: { payload, config, state, sessionId, repoRoot, problems }
 */
export async function runHook(name, handler) {
  let payload;
  try {
    const raw = await readStdin();
    payload = raw.trim() === '' ? {} : JSON.parse(raw);
  } catch (error) {
    fail(name, `stdin could not be parsed — ${error.message}`);
    exitWhenFlushed(0);
    return;
  }

  // Probe mode: used by the status line to check that this script still answers
  // correctly. The heartbeat is not stamped and the session is not written —
  // otherwise the probe would manufacture its own registration proof and the bar
  // would be lying to itself. The configuration is pinned too: a probe tests the
  // mechanism, not the user's policy.
  const probing = process.env.SLOPGUARD_PROBE === '1';

  const sessionId = payload.session_id ?? 'unknown';
  let state = null;
  try {
    state = loadSession(sessionId);
    const repoRoot = findRepoRoot(payload.cwd);
    const { config, problems } = loadConfig({ repoRoot, sessionMode: state.modeOverride });
    if (!probing) for (const problem of problems) fail(name, problem);

    if (probing) {
      config.mode = 'strict';
      config.disabled = [];
      config.ignoreRules = [];
      config.ui = { ...config.ui, cleanScans: 'silent' };
    } else {
      stamp({ sessionId, mode: config.mode, event: payload.hook_event_name ?? name });
    }

    await handler({ payload, config, state, sessionId, repoRoot, problems });
  } catch (error) {
    fail(name, error);
  }

  if (state && !probing) {
    try { saveSession(state); } catch (error) { fail(name, error); }
  }
  exitWhenFlushed(0);
}
