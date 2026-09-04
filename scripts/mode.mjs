#!/usr/bin/env node
/**
 * /slop-mode strict|explore — the session mode.
 *
 * It does not touch the persistent config.json; it writes only to this session's
 * state. Reason: "I am prototyping" is a temporary condition, and writing a
 * temporary relaxation into the persistent configuration would quietly leave
 * later sessions unprotected too. A new session opens in strict mode.
 */

import { loadSession, saveSession } from '../lib/session.mjs';
import { currentSessionId } from './current-session.mjs';
import { BRAND } from '../lib/report.mjs';

const requested = (process.argv[2] ?? '').trim().toLowerCase();
const VALID = ['strict', 'explore'];

if (!VALID.includes(requested)) {
  process.stdout.write('Usage: /slop-mode strict|explore\n');
  process.stdout.write('  strict   stops when a pattern is found (default)\n');
  process.stdout.write('  explore  relaxes the style rules\n\n');
  process.stdout.write('Explore mode does not relax irreversibility: rm -rf, DROP TABLE,\n');
  process.stdout.write('force push, protected paths and unverified packages are blocked in every mode.\n');
  process.exit(requested === '' ? 0 : 1);
}

const { id, confident, source } = currentSessionId();
if (!id) {
  process.stdout.write(`${BRAND}: no session found (${source}). /slop-doctor can diagnose it.\n`);
  process.exit(1);
}

const state = loadSession(id);
state.modeOverride = requested;
if (!saveSession(state)) {
  process.stdout.write(`${BRAND}: the session could not be written; the mode did not change.\n`);
  process.exit(1);
}

process.stdout.write(`${BRAND}: mode "${requested}" — for this session only (${id}).\n`);
if (!confident) process.stdout.write(`  The session id came from ${source}; it is not certain.\n`);
if (requested === 'explore') {
  process.stdout.write('  The persistent configuration did not change; a new session opens in strict mode.\n');
  process.stdout.write('  Irreversible commands and protected paths are still blocked in this mode.\n');
}
