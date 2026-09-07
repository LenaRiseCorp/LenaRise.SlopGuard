/**
 * Shared hook runner.
 *
 * Every hook does the same five things: read stdin, load the session, merge the
 * configuration, stamp the heartbeat, make failures visible. Repeating that in
 * every file would break our own CODE-01 rule.
 *
 * Failure policy: a hook NEVER blocks because of its own error. Our bug stopping
 * the user's work is not acceptable. But the error is not invisible either — it
 * goes to stderr, the stamp is not written, and the status line reports "broken".
 * Passing silently would produce the same outcome as having no protection while
 * appearing to have some (HUMAN-04).
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, parse as parsePath, relative, isAbsolute } from 'node:path';
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
/**
 * Is this path inside the repository we are working in?
 *
 * With no repository, nothing is committable, so nothing counts as uncommitted.
 */
export function isInsideRepo(filePath, repoRoot) {
  if (!repoRoot || !filePath) return false;
  const rel = relative(repoRoot, filePath);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

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

/**
 * The Read tool's default ceiling on how many lines one call returns.
 *
 * Counting a whole 5000-line file when the tool handed back 2000 would credit
 * the model with lines it never received, and an inflated linesRead hides
 * comprehension debt instead of showing it (HUMAN-01). Erring low makes the
 * warning arrive early; erring high makes it never arrive.
 */
export const READ_DEFAULT_LIMIT = 2000;

/**
 * How many lines a Read call actually delivered.
 *
 * Derived from tool_input, not tool_response: the input fields (file_path,
 * offset, limit) are the documented contract of the Read tool, while the shape
 * of a Read tool_response has not been measured here. docs/verification-log.md
 * records the ones that were, and this file already had to fall back once when
 * an assumed response shape did not arrive.
 *
 * @returns {number} 0 when the path is missing, unreadable or not text
 */
export function linesRead(toolInput, onError) {
  const filePath = toolInput?.file_path;
  if (typeof filePath !== 'string' || filePath === '') return 0;

  let buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (error) {
    if (onError) onError(error);
    return 0;
  }

  // A NUL byte in the head is the cheapest reliable "this is not text" signal,
  // and it beats an extension list that would have to be maintained: .json,
  // .yml and .toml are read constantly and none of them are a scanning scope.
  if (buffer.subarray(0, 8192).includes(0)) return 0;

  const total = buffer.toString('utf8').split('\n').length;
  const offset = Math.max(0, Number(toolInput.offset) || 0);
  const limit = Number(toolInput.limit) > 0 ? Number(toolInput.limit) : READ_DEFAULT_LIMIT;
  return Math.min(Math.max(0, total - offset), limit);
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
