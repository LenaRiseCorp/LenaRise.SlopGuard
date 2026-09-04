#!/usr/bin/env node
/**
 * Status line — invoked from settings.json, and it keeps working even if the
 * plugin is dead.
 *
 * This script lives outside the plugin on purpose. The logical trap: if hooks
 * are not registered, no hook runs — including the one that would ask "are you
 * running?". An absence cannot be detected by asking the thing that is absent.
 *
 * Saying "live" requires TWO separate proofs, each establishing something
 * different:
 *
 *   Registration — does the heartbeat stamp carry THIS session's id? The stamp
 *                  is written by user-prompt.mjs; if it matches, Claude Code
 *                  recognises the hook and is firing it.
 *   Operability  — does pre-edit.mjs answer a synthetic payload correctly right
 *                  now? A hook can be registered while the node path is broken.
 *
 * One proof is not enough, and uncertainty is never rounded up to "live":
 * registration cannot be proved before the first message, so it is not claimed —
 * the bar says "ready".
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, openSync, readSync, closeSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, paths } from '../lib/config.mjs';
import { exitWhenFlushed, statusMetrics } from '../lib/report.mjs';
import { loadSession } from '../lib/session.mjs';
import { read as readHeartbeat, ageSeconds, formatAge } from '../lib/heartbeat.mjs';
import { findRepoRoot } from '../lib/hook.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRE_EDIT = join(HERE, '..', 'hooks', 'pre-edit.mjs');
const PROBE_CACHE = join(paths.dir, 'probe.json');
const PROBE_TTL_MS = 60_000;
const BRAND = 'SlopGuard';

/** The bar swallows nothing silently — but it does not crash either. Notes go to stderr. */
function warn(message) {
  process.stderr.write(`LenaRise.SlopGuard [statusline] ${message}\n`);
}

/**
 * Sends a synthetic payload to pre-edit.mjs and checks for the expected deny.
 *
 * pre-edit is the deliberate target: it is the hook with real stopping power, so
 * it is the most meaningful thing to ask "are you working?". The payload is a
 * version-suffixed filename because path patterns are matched against the file
 * *name* — that string sits harmlessly in source and does not trip our own
 * scanner. Using a dirty-code string would have required writing a waiver
 * against our own rule.
 *
 * SLOPGUARD_PROBE=1 disables the heartbeat stamp and the session write — the
 * probe must not manufacture its own registration proof, or the bar would be
 * lying to itself.
 */
function runProbe(cwd) {
  const payload = {
    session_id: '__probe__',
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: '/__slopguard_probe__/parser_v2.js', content: '' },
  };
  try {
    const out = execFileSync(process.execPath, [PRE_EDIT], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, SLOPGUARD_PROBE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out);
    const decision = parsed.hookSpecificOutput ?? {};
    const ok = decision.permissionDecision === 'deny'
      && /CODE-01/.test(decision.permissionDecisionReason ?? '');
    return { ok, reason: ok ? null : 'the expected deny did not come back' };
  } catch (error) {
    // The failure is the result: the script is not answering. The reason is
    // cached so /slop-doctor can say what happened.
    return { ok: false, reason: error.message };
  }
}

function readProbeCache() {
  if (!existsSync(PROBE_CACHE)) return null;
  try {
    const cached = JSON.parse(readFileSync(PROBE_CACHE, 'utf8'));
    return Date.now() - cached.ts < PROBE_TTL_MS ? cached : null;
  } catch (error) {
    warn(`probe cache could not be read, re-measuring — ${error.message}`);
    return null;
  }
}

/**
 * Probe result, cached for 60 seconds. The cache is not for speed but for
 * courtesy: the bar should not spawn a node process on every refresh.
 */
function probeResult(cwd) {
  const cached = readProbeCache();
  if (cached) return cached;
  const result = runProbe(cwd);
  const record = { ts: Date.now(), ok: result.ok, reason: result.reason };
  try {
    writeFileSync(PROBE_CACHE, JSON.stringify(record));
  } catch (error) {
    warn(`probe cache could not be written — ${error.message}`);
  }
  return record;
}

/**
 * Has the user sent any message in this session?
 *
 * Missing registration proof does not by itself mean "unregistered": before the
 * first message it is normal for no hook to have fired. The transcript is the
 * only evidence that reaches the status line and is independent of the plugin.
 * Only the first chunk is read, because the first user message appears early.
 */
function promptSubmitted(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return false;
  let fd;
  try {
    const size = statSync(transcriptPath).size;
    if (size === 0) return false;
    const length = Math.min(size, 256 * 1024);
    const buffer = Buffer.alloc(length);
    fd = openSync(transcriptPath, 'r');
    readSync(fd, buffer, 0, length, 0);
    return /"type"\s*:\s*"user"/.test(buffer.toString('utf8'));
  } catch (error) {
    warn(`transcript could not be read, registration treated as unknown — ${error.message}`);
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch (error) {
        warn(`transcript could not be closed — ${error.message}`);
      }
    }
  }
}

function render(status, { config, state, beat, payload }) {
  if (config.ui.statusLine === 'minimal') {
    return status.live ? `${BRAND} ${status.label} · ${state.blocked}` : `${BRAND} ${status.label}`;
  }
  if (!status.live) {
    const extra = status.detail ? ` · ${status.detail}` : '';
    return `${BRAND} ${status.label}${extra}`;
  }
  const parts = [
    `${BRAND} ${status.label}`,
    ...statusMetrics(state, config, {
      added: payload?.cost?.total_lines_added ?? 0,
      removed: payload?.cost?.total_lines_removed ?? 0,
    }),
  ];
  void beat;
  return parts.join(' · ');
}

function main(raw) {
  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    warn(`stdin could not be parsed, continuing with an empty payload — ${error.message}`);
  }

  const cwd = payload.cwd ?? payload.workspace?.current_dir ?? process.cwd();
  const { config } = loadConfig({ repoRoot: findRepoRoot(cwd) });

  if (config.ui.statusLine === 'off') return '';
  if (!config.enabled) return `${BRAND} off`;

  const state = loadSession(payload.session_id ?? 'unknown');
  const beat = readHeartbeat();

  const probe = probeResult(cwd);
  if (!probe.ok) {
    return render({ live: false, label: 'broken', detail: probe.reason ?? 'the script is not answering' },
      { config, state, beat, payload });
  }

  const registered = Boolean(beat?.sessionId) && beat.sessionId === payload.session_id;
  if (registered) {
    return render({ live: true, label: 'live' }, { config, state, beat, payload });
  }

  if (promptSubmitted(payload.transcript_path)) {
    const age = beat ? formatAge(ageSeconds(beat)) : 'never';
    return render({ live: false, label: 'unregistered', detail: `last stamp ${age}` }, { config, state, beat, payload });
  }

  return render({ live: false, label: 'ready' }, { config, state, beat, payload });
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let line;
  try {
    line = main(raw);
  } catch (error) {
    // The bar never crashes: a crash makes Claude Code show an error and the
    // user then sees nothing at all about the state of their protection.
    process.stderr.write(`LenaRise.SlopGuard [statusline] error: ${error.stack ?? error}\n`);
    line = `${BRAND} broken`;
  }
  if (line) process.stdout.write(line);
  exitWhenFlushed(0);
});
