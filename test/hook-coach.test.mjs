import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { makeWorkspace, pipe } from './pipe.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const prompt = (sid) => pipe('hooks/user-prompt.mjs', {
  session_id: sid, cwd: ws.repo, hook_event_name: 'UserPromptSubmit', prompt: 'go on',
}, { cfgDir: ws.cfgDir });

const end = (sid) => pipe('hooks/session-end.mjs', {
  session_id: sid, cwd: ws.repo, hook_event_name: 'SessionEnd', reason: 'clear',
}, { cfgDir: ws.cfgDir });

const sessionFile = (sid) => join(ws.cfgDir, `session-${sid}.json`);
const session = (sid) => JSON.parse(readFileSync(sessionFile(sid), 'utf8'));
const seed = (sid, patch) => writeFileSync(sessionFile(sid), JSON.stringify({ version: 1, sessionId: sid, ...patch }));

test('every user message increments the turn counter', () => {
  prompt('turns'); prompt('turns'); prompt('turns');
  assert.equal(session('turns').turns, 3);
});

test('the first turn shows the one-line confirmation (ui.heartbeat)', () => {
  const r = prompt('confirm');
  assert.match(r.json.systemMessage, /active — strict mode · \d+ patterns/);
  assert.equal(prompt('confirm').stdout, '', 'it does not repeat on the second turn');
});

test('with ui.heartbeat off there is no confirmation — the setting is really read', () => {
  ws.config({ ui: { heartbeat: false } });
  assert.equal(prompt('silent-confirm').stdout, '');
  ws.config({});
});

test('below the threshold and past the first turn, nothing is emitted', () => {
  prompt('quiet');
  assert.equal(prompt('quiet').stdout, '');
});

test('the heartbeat is stamped with this session id — the registration proof', () => {
  prompt('identity');
  const beat = JSON.parse(readFileSync(join(ws.cfgDir, 'heartbeat.json'), 'utf8'));
  assert.equal(beat.sessionId, 'identity');
  assert.equal(beat.event, 'UserPromptSubmit');
});

test('the context rot threshold delivers a warning to chat (AGENT-01)', () => {
  seed('long', { turns: 39, warned: [] });   // becomes turn 40, not the first turn
  const r = prompt('long');
  assert.match(r.json.systemMessage, /reached 40 turns/);
  assert.match(r.json.systemMessage, /AGENT-01/);
});

test('the same warning does not appear twice', () => {
  seed('repeat', { turns: 39, warned: [] });
  assert.match(prompt('repeat').json.systemMessage, /AGENT-01/);
  assert.equal(prompt('repeat').stdout, '', 'a repeated warning gets ignored');
});

test('the comprehension debt warning speaks in measurements (HUMAN-01)', () => {
  seed('debt', { turns: 1, linesWritten: 800, linesRead: 60, warned: [] });
  assert.match(prompt('debt').json.systemMessage, /800 lines produced, 60 lines read/);
});

test('several thresholds crossed at once are merged into one message', () => {
  seed('multi', { turns: 45, linesSinceCommit: 900, warned: [] });
  const msg = prompt('multi').json.systemMessage;
  assert.match(msg, /2 notices/);
  assert.match(msg, /AGENT-01/);
  assert.match(msg, /AGENT-06/);
});

test('a threshold can be changed through the configuration', () => {
  ws.config({ thresholds: { contextTurns: 3 } });
  seed('threshold', { turns: 2, warned: [] });
  assert.match(prompt('threshold').json.systemMessage, /reached 3 turns/);
  ws.config({});
});

test('chatStatus is off by default — an unrequested row is noise', () => {
  prompt('off-status'); prompt('off-status'); prompt('off-status');
  assert.equal(prompt('off-status').stdout, '');
});

test('chatStatus: 2 posts a status row every second turn', () => {
  ws.config({ ui: { chatStatus: 2, heartbeat: false } });
  assert.equal(prompt('period').stdout, '', 'turn 1: nothing');
  assert.match(prompt('period').json.systemMessage, /strict · 0 blocked · turn 2\/40/, 'turn 2: present');
  assert.equal(prompt('period').stdout, '', 'turn 3: nothing');
  assert.match(prompt('period').json.systemMessage, /turn 4\/40/, 'turn 4: present');
  ws.config({});
});

test('the status row carries open violations and verification debt', () => {
  ws.config({ ui: { chatStatus: 1, heartbeat: false } });
  seed('full', { turns: 0, blocked: 3, suppressions: 1, warned: [],
    violations: { 'a.js': [{ id: 'CODE-05', line: 1, shown: 'a.js' }] } });
  const msg = prompt('full').json.systemMessage;
  assert.match(msg, /3 blocked/);
  assert.match(msg, /1 open/);
  assert.match(msg, /1 waived/);
  assert.match(msg, /no tests/);
  ws.config({});
});

test('an invalid chatStatus is not accepted silently', () => {
  ws.config({ ui: { chatStatus: 'always' } });
  const r = prompt('invalid');
  assert.match(r.stderr, /ui\.chatStatus: expected 0 or a positive integer/);
  ws.config({});
});

// ── Session end ─────────────────────────────────────────────────────────

test('an empty session prints no summary — it would be noise', () => {
  assert.equal(end('empty-session').stdout, '');
});

test('the session summary reports measurements', () => {
  seed('summary', { turns: 12, linesWritten: 420, blocked: 3, suppressions: 2, filesWritten: { 'a.js': 1 } });
  const msg = end('summary').json.systemMessage;
  assert.match(msg, /session summary/);
  assert.match(msg, /12 turns/);
  assert.match(msg, /420 lines written/);
  assert.match(msg, /3 slop blocked/);
  assert.match(msg, /2 waivers used/);
});

test('open violations appear in the summary line', () => {
  seed('open', { turns: 2, linesWritten: 10, violations: { 'a.js': [{ id: 'CODE-05', line: 1, shown: 'a.js' }] } });
  assert.match(end('open').json.systemMessage, /1 open violations/);
});

test('old session files are pruned and the current one is kept', () => {
  seed('old', { turns: 1 });
  seed('new', { turns: 1, linesWritten: 5 });
  const stamp = Date.now() / 1000 - 8 * 86400;
  utimesSync(sessionFile('old'), stamp, stamp);
  end('new');
  assert.equal(existsSync(sessionFile('old')), false, 'older than 7 days should be removed');
  assert.equal(existsSync(sessionFile('new')), true);
});
