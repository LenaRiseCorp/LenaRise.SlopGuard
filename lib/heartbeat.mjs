/**
 * Heartbeat stamp — the liveness primitive.
 *
 * The logical trap: if hooks are not registered, no hook runs — including the
 * one that would ask "are you running?". An absence cannot be detected by asking
 * the thing that is absent. So every trigger writes a stamp to disk, and "is it
 * alive?" becomes a file check — answering it does not require the plugin to be
 * alive.
 *
 * Three independent consumers read the stamp: the status line script (which
 * lives in settings.json), the ~/.claude/CLAUDE.md rule, and /slop-doctor.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from './config.mjs';
import { PATTERN_COUNT } from './patterns.mjs';
import { fail } from './report.mjs';

// formatAge moved to report.mjs and is re-exported here so existing callers
// (statusline, doctor) keep working unchanged.
export { formatAge } from './report.mjs';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');

let cachedVersion = null;
/** Version from package.json. If it cannot be read, "unknown" — never invented. */
export function version() {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = JSON.parse(readFileSync(PKG, 'utf8')).version ?? 'unknown';
  } catch (error) {
    fail('heartbeat', `package.json could not be read — ${error.message}`);
    cachedVersion = 'unknown';
  }
  return cachedVersion;
}

/**
 * Writes the stamp. Atomic, because a half-written stamp would read as broken
 * and would mislead the status line.
 */
export function stamp({ sessionId, mode, event }) {
  const file = paths.heartbeat;
  const tmp = `${file}.${process.pid}.tmp`;
  const body = {
    ts: Date.now(),
    version: version(),
    patterns: PATTERN_COUNT,
    mode: mode ?? 'strict',
    sessionId: sessionId ?? null,
    event: event ?? null,
  };
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(tmp, JSON.stringify(body, null, 2));
    renameSync(tmp, file);
    return body;
  } catch (error) {
    fail('heartbeat', `stamp could not be written (${file}) — ${error.message}`);
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch (cleanupError) { fail('heartbeat', `temp stamp could not be removed — ${cleanupError.message}`); }
    }
    return null;
  }
}

/** Reads the stamp. Null when missing; null plus a stderr note when corrupt. */
export function read() {
  const file = paths.heartbeat;
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Number.isFinite(parsed?.ts) ? parsed : null;
  } catch (error) {
    fail('heartbeat', `stamp could not be read — ${error.message}`);
    return null;
  }
}

export function ageSeconds(beat, now = Date.now()) {
  if (!beat?.ts) return Infinity;
  return Math.max(0, Math.round((now - beat.ts) / 1000));
}

/** Is the stamp stale? Default threshold: 24 hours. */
export function isStale(beat, maxAgeSeconds = 86400, now = Date.now()) {
  return ageSeconds(beat, now) > maxAgeSeconds;
}
