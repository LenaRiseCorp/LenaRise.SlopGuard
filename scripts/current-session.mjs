/**
 * Which session is "the current one", from the command line?
 *
 * Commands are not hooks; they receive no session_id on stdin. The heartbeat
 * stamp is written with this session's id on every hook trigger, so it is the
 * most reliable source. With no stamp we fall back to the most recently updated
 * session file — and the caller is told which route was taken, because hiding
 * the difference between "this is probably the session" and proving it is
 * exactly what this project is against.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../lib/config.mjs';
import { read as readHeartbeat, ageSeconds } from '../lib/heartbeat.mjs';

export function currentSessionId({ maxAgeSeconds = 3600 } = {}) {
  const beat = readHeartbeat();
  if (beat?.sessionId && ageSeconds(beat) <= maxAgeSeconds) {
    return { id: beat.sessionId, source: 'heartbeat', confident: true };
  }

  let newest = null;
  try {
    for (const name of readdirSync(paths.dir)) {
      if (!name.startsWith('session-') || !name.endsWith('.json')) continue;
      const file = join(paths.dir, name);
      const mtime = statSync(file).mtimeMs;
      if (!newest || mtime > newest.mtime) {
        newest = { mtime, id: name.slice('session-'.length, -'.json'.length) };
      }
    }
  } catch (error) {
    return { id: null, source: `the session directory could not be read: ${error.message}`, confident: false };
  }

  if (!newest) return { id: null, source: 'no session records exist', confident: false };
  return { id: newest.id, source: 'the most recently updated session file', confident: false };
}
