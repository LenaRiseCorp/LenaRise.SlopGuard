#!/usr/bin/env node
/**
 * /slop-doctor — diagnosis on demand.
 *
 * Every line prints either a tick or a cross, and every cross says how to fix
 * it. There is no "probably fine" line: a diagnostic tool that rounds
 * uncertainty towards optimism is worse than no diagnosis at all (HUMAN-04).
 *
 * The hook pipe tests use real stdin payloads and SLOPGUARD_PROBE=1, so the
 * diagnosis never stamps its own heartbeat and manufactures an appearance of life.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig, paths, readJsonFile } from '../lib/config.mjs';
import { PATTERN_COUNT, CATEGORIES } from '../lib/patterns.mjs';
import { read as readHeartbeat, ageSeconds, formatAge, isStale, version } from '../lib/heartbeat.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS = join(homedir(), '.claude', 'settings.json');

const lines = [];
let failures = 0;
const ok = (text) => lines.push(`  ✅ ${text}`);
const bad = (text, fix) => { failures++; lines.push(`  ❌ ${text}`); if (fix) lines.push(`     → ${fix}`); };
const info = (text) => lines.push(`     ${text}`);
const section = (title) => lines.push('', title);

/** Sends a synthetic payload to a hook and checks whether the expected key is in the output. */
function probeHook(file, payload, expect) {
  const script = join(ROOT, 'hooks', file);
  if (!existsSync(script)) return { ok: false, why: 'file missing' };
  try {
    const out = execFileSync(process.execPath, [script], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 8000,
      env: { ...process.env, SLOPGUARD_PROBE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (expect === null) return { ok: out.trim() === '', why: out.trim() === '' ? null : 'unexpected output' };
    if (out.trim() === '') return { ok: false, why: 'no output' };
    const parsed = JSON.parse(out);
    return expect(parsed) ? { ok: true } : { ok: false, why: 'the expected answer did not come back' };
  } catch (error) {
    return { ok: false, why: error.message.split('\n')[0] };
  }
}

section('Files');
const required = [
  'hooks/hooks.json', 'hooks/session-start.mjs', 'hooks/user-prompt.mjs',
  'hooks/pre-edit.mjs', 'hooks/post-edit.mjs', 'hooks/pre-bash.mjs',
  'hooks/post-bash.mjs', 'hooks/stop-gate.mjs', 'hooks/session-end.mjs',
  'bin/statusline.mjs', 'lib/patterns.mjs', 'rules/base-rules.md',
];
const missing = required.filter((rel) => !existsSync(join(ROOT, rel)));
if (missing.length === 0) ok(`${required.length} core files present`);
else bad(`missing files: ${missing.join(', ')}`, 'run claude plugin update lenarise-slopguard, or reinstall');

section('hooks.json');
const hooksJson = readJsonFile(join(ROOT, 'hooks/hooks.json'));
if (!hooksJson.ok) {
  bad(`hooks.json ${hooksJson.error}`, 'the plugin needs to be reinstalled');
} else {
  const events = Object.keys(hooksJson.value?.hooks ?? {});
  ok(`valid JSON · ${events.length} events: ${events.join(', ')}`);
  const referenced = JSON.stringify(hooksJson.value).match(/hooks\/[a-z-]+\.mjs/g) ?? [];
  const broken = [...new Set(referenced)].filter((rel) => !existsSync(join(ROOT, rel)));
  if (broken.length === 0) ok('every registered hook file exists');
  else bad(`hooks.json points at missing files: ${broken.join(', ')}`, 'the plugin needs to be reinstalled');
}

section('Hook pipe tests (real stdin payloads)');
const probes = [
  ['pre-edit.mjs', { session_id: '__doctor__', tool_input: { file_path: '/x/parser_v2.js' } },
    (p) => p.hookSpecificOutput?.permissionDecision === 'deny', 'should refuse a version-suffixed filename'],
  ['pre-edit.mjs', { session_id: '__doctor__', tool_input: { file_path: '/x/normal.js' } },
    null, 'should stay silent on a clean path'],
  // The payload is deliberately chosen from prose scope: this string sits in a
  // .mjs file, where prose patterns do not apply, so the diagnostic tool does not
  // trip its own scanner. A dirty-code string would have required writing a waiver.
  ['post-edit.mjs', { session_id: '__doctor__', tool_input: { file_path: '/x/plan.md' },
    tool_response: { filePath: '/x/plan.md', content: 'This work takes about 3 days.' } },
    (p) => p.decision === 'block', 'should block an unfounded time estimate'],
  ['pre-bash.mjs', { session_id: '__doctor__', tool_input: { command: 'rm -rf /data' } },
    (p) => p.hookSpecificOutput?.permissionDecision === 'deny', 'should refuse a destructive command'],
  ['pre-bash.mjs', { session_id: '__doctor__', tool_input: { command: 'ls -la' } },
    null, 'should stay silent on a clean command'],
  ['session-start.mjs', { session_id: '__doctor__' },
    (p) => typeof p.hookSpecificOutput?.additionalContext === 'string', 'should inject the rule set'],
  ['stop-gate.mjs', { session_id: '__doctor__', stop_hook_active: false },
    null, 'should pass a clean session'],
];
for (const [file, payload, expect, what] of probes) {
  const result = probeHook(file, payload, expect);
  if (result.ok) ok(`${file} — ${what}`);
  else bad(`${file} — ${what} (${result.why})`, 'check the node path, file permissions and plugin integrity');
}

section('Configuration');
const { config, problems, sources } = loadConfig({ repoRoot: process.cwd() });
if (problems.length === 0) ok('config.json and patterns.local.json are valid');
else for (const p of problems) bad(p, 'fix the file or delete it; deleting falls back to the defaults');
info(`sources: ${sources.join(' → ')}`);
ok(`mode: ${config.mode} · plugin ${config.enabled ? 'enabled' : 'DISABLED'}`);

const localCount = config.localPatterns.length;
ok(`${PATTERN_COUNT} built-in patterns + ${localCount} user patterns · ${Object.keys(CATEGORIES).length} categories`);
if (config.disabled.length > 0) info(`disabled: ${config.disabled.join(', ')}`);

section('Registration');
const settings = readJsonFile(SETTINGS);
if (!settings.ok) {
  bad(`~/.claude/settings.json ${settings.error}`, 'fix the file; a malformed settings.json affects every hook registration');
} else if (settings.missing) {
  bad('~/.claude/settings.json does not exist', 'run /slop-setup');
} else {
  // The recognition test must match setup.mjs exactly: the launcher is named
  // statusline-launcher.mjs, so searching for "statusline.mjs" would miss it.
  // Written separately once before, and each side then mistook the other's entry
  // for a stranger's.
  const statusLine = settings.value.statusLine?.command ?? '';
  const mark = statusLine.toLowerCase();
  const isOurs = mark.includes('statusline') && mark.includes('slopguard');
  if (isOurs && mark.includes('statusline-launcher')) {
    ok('statusLine is registered (version-independent launcher)');
  } else if (isOurs) {
    bad('statusLine points at a versioned cache path — every update breaks it',
      'run /slop-setup; the entry is migrated to the version-independent launcher');
  } else if (statusLine) {
    bad('statusLine points at a different command', 'run /slop-setup to add ours; your existing entry is preserved');
  } else {
    bad('statusLine is not registered', 'run /slop-setup — without the liveness indicator a silent death is invisible');
  }
}

section('Heartbeat');
const beat = readHeartbeat();
if (!beat) {
  bad('no heartbeat stamp', 'the plugin has never fired. Was Claude Code restarted after installation?');
} else {
  const age = ageSeconds(beat);
  if (isStale(beat)) bad(`last stamp ${formatAge(age)} — stale`, '/slop-setup followed by a restart may be needed');
  else ok(`last stamp ${formatAge(age)} · version ${beat.version} · ${beat.patterns} patterns · event ${beat.event}`);
  if (beat.version !== version()) {
    info(`the stamp reports ${beat.version}, the running version is ${version()} — waiting for the first trigger after the update`);
  }
}

section('Bypass permissions mode');
ok('The hook layer works in bypass mode — measured, docs/verification-log.md');
info('A PreToolUse deny really stops the tool; a Stop block prevents the turn from ending.');
info('A PostToolUse block reaches the model but does not stop it — the hard guarantee is in stop-gate.');

lines.push('');
lines.push(failures === 0
  ? 'Result: no problems.'
  : `Result: ${failures} problem(s) found. The → lines above say what to do.`);

process.stdout.write(lines.join('\n') + '\n');
process.exit(failures === 0 ? 0 : 1);
