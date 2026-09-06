import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, pipe, postToolUsePayload } from './pipe.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const write = (rel, body, sid) => {
  const f = ws.file(rel, body);
  pipe('hooks/post-edit.mjs', postToolUsePayload({ cwd: ws.repo, filePath: f, sessionId: sid }), { cfgDir: ws.cfgDir });
  return f;
};
const bash = (command, sid) =>
  pipe('hooks/post-bash.mjs', {
    session_id: sid, cwd: ws.repo, hook_event_name: 'PostToolUse',
    tool_name: 'Bash', tool_input: { command }, tool_response: { stdout: '' },
  }, { cfgDir: ws.cfgDir });
const stop = (sid, active = false) =>
  pipe('hooks/stop-gate.mjs', {
    session_id: sid, cwd: ws.repo, hook_event_name: 'Stop', stop_hook_active: active,
  }, { cfgDir: ws.cfgDir });

test('with no changes the gate passes silently', () => {
  const r = stop('bos');
  assert.equal(r.stdout, '');
});

test('an open violation prevents the turn from ending', () => {
  write('open.js', 'try{}catch(e){}\n', 'ihlal');
  const r = stop('ihlal');
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, /1 unfixed violation/);
  assert.match(r.json.reason, /CODE-05/);
  assert.match(r.json.reason, /open\.js:1/, 'göreli yol gösterilmeli');
});

test('fixing the violation opens the gate but the verification debt remains', () => {
  write('fix.js', 'try{}catch(e){}\n', 'duzelt');
  assert.equal(stop('duzelt').json.decision, 'block');
  write('fix.js', 'try{ a() }catch(e){ throw e }\n', 'duzelt');
  const r = stop('duzelt');
  assert.match(r.json.reason, /no test ran/);
  assert.doesNotMatch(r.json.reason, /unfixed violation/);
});

test('the gate passes when code was written and tests ran', () => {
  write('verified.js', 'export const a = 1;\n', 'dogrulu');
  assert.equal(stop('dogrulu').json.decision, 'block', 'önce doğrulama borcu var');
  bash('npm test', 'dogrulu');
  assert.equal(stop('dogrulu').stdout, '', 'test çalışınca borç kapanır');
});

test('no test is demanded when only documentation changed', () => {
  write('notes.md', 'Sade bir not.\n', 'dokuman');
  assert.equal(stop('dokuman').stdout, '', 'code yazılmadıysa doğrulama borcu doğmaz');
});

test('the gate blocks when the diff threshold is crossed (PROC-02)', () => {
  ws.config({ thresholds: { maxDiffLines: 5 } });
  const f = ws.file('big.js', 'const a = 1;\n');
  pipe('hooks/post-edit.mjs', postToolUsePayload({
    cwd: ws.repo, filePath: f, sessionId: 'diff',
    patch: [{ lines: Array.from({ length: 40 }, (_, i) => `+satir${i}`) }],
  }), { cfgDir: ws.cfgDir });
  bash('npm test', 'diff');
  const r = stop('diff');
  assert.match(r.json.reason, /40 lines changed since the last commit, threshold 5/);
  ws.config({});
});

test('committing resets the counter and opens the diff gate', () => {
  ws.config({ thresholds: { maxDiffLines: 5 } });
  const f = ws.file('big2.js', 'const a = 1;\n');
  pipe('hooks/post-edit.mjs', postToolUsePayload({
    cwd: ws.repo, filePath: f, sessionId: 'commitli',
    patch: [{ lines: Array.from({ length: 40 }, (_, i) => `+s${i}`) }],
  }), { cfgDir: ws.cfgDir });
  bash('npm test', 'commitli');
  assert.equal(stop('commitli').json.decision, 'block');
  bash('git commit -m "parçalara bölündü"', 'commitli');
  const r = stop('commitli');
  assert.doesNotMatch(r.json?.reason ?? '', /satır değişti/);
  ws.config({});
});

test('in explore mode the gate reports instead of blocking', () => {
  ws.config({ mode: 'explore' });
  write('exp.js', 'const a = 1;\n', 'kesif');
  const r = stop('kesif');
  assert.equal(r.json.decision, undefined);
  assert.match(r.json.systemMessage, /explore mode, the gate is not blocking/);
  ws.config({});
});

// ── AGENT-08 loop guard ──────────────────────────────────────────────────

test('at the ceiling the gate is bypassed and says so plainly', () => {
  write('loop.js', 'try{}catch(e){}\n', 'dongu');
  assert.match(stop('dongu').json.reason, /\(1\/2\)/);
  assert.match(stop('dongu').json.reason, /\(2\/2\)/);
  const third = stop('dongu');
  assert.equal(third.json.decision, undefined, 'üçüncüde bloklamaz — sonsuz döngü olurdu');
  assert.match(third.json.systemMessage, /gate BYPASSED/);
  assert.match(third.json.systemMessage, /This is not approval/);
});

test('a changed violation set restarts the counter — progress is not punished', () => {
  write('prog.js', 'try{}catch(e){}\n', 'ilerleme');
  assert.match(stop('ilerleme').json.reason, /\(1\/2\)/);
  assert.match(stop('ilerleme').json.reason, /\(2\/2\)/);
  ws.file('prog.js', 'const k = "AKIA2E4RJKLMNPQRSTUV"\n');
  pipe('hooks/post-edit.mjs', postToolUsePayload({ cwd: ws.repo, filePath: ws.file('prog.js', 'const k = "AKIA2E4RJKLMNPQRSTUV"\n'), sessionId: 'ilerleme' }), { cfgDir: ws.cfgDir });
  const r = stop('ilerleme');
  assert.match(r.json.reason, /\(1\/2\)/, 'farklı ihlal, yeni sayaç');
  assert.match(r.json.reason, /SEC-03/);
});

test('the ceiling is configurable', () => {
  ws.config({ thresholds: { maxStopBlocks: 1 } });
  write('tavan.js', 'try{}catch(e){}\n', 'tavan');
  assert.match(stop('tavan').json.reason, /\(1\/1\)/);
  assert.match(stop('tavan').json.systemMessage, /gate BYPASSED/);
  ws.config({});
});
