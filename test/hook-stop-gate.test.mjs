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

test('hiç değişiklik yoksa kapı sessizce geçirir', () => {
  const r = stop('bos');
  assert.equal(r.stdout, '');
});

test('açık ihlal turu bitirtmez — post-edit bloğunun gerçek kilidi burası', () => {
  write('open.js', 'try{}catch(e){}\n', 'ihlal');
  const r = stop('ihlal');
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, /1 düzeltilmemiş ihlal/);
  assert.match(r.json.reason, /KOD-05/);
  assert.match(r.json.reason, /open\.js:1/, 'göreli yol gösterilmeli');
});

test('ihlal düzeltilince kapı açılır — ama doğrulama borcu kalır', () => {
  write('fix.js', 'try{}catch(e){}\n', 'duzelt');
  assert.equal(stop('duzelt').json.decision, 'block');
  write('fix.js', 'try{ a() }catch(e){ throw e }\n', 'duzelt');
  const r = stop('duzelt');
  assert.match(r.json.reason, /test çalışmadı/);
  assert.doesNotMatch(r.json.reason, /düzeltilmemiş ihlal/);
});

test('kod yazıldı ve test çalıştıysa kapı geçirir', () => {
  write('verified.js', 'export const a = 1;\n', 'dogrulu');
  assert.equal(stop('dogrulu').json.decision, 'block', 'önce doğrulama borcu var');
  bash('npm test', 'dogrulu');
  assert.equal(stop('dogrulu').stdout, '', 'test çalışınca borç kapanır');
});

test('yalnızca doküman değiştiyse test istenmez', () => {
  write('notes.md', 'Sade bir not.\n', 'dokuman');
  assert.equal(stop('dokuman').stdout, '', 'kod yazılmadıysa doğrulama borcu doğmaz');
});

test('diff eşiği aşılırsa kapı bloklar (SUR-02)', () => {
  ws.config({ thresholds: { maxDiffLines: 5 } });
  const f = ws.file('big.js', 'const a = 1;\n');
  pipe('hooks/post-edit.mjs', postToolUsePayload({
    cwd: ws.repo, filePath: f, sessionId: 'diff',
    patch: [{ lines: Array.from({ length: 40 }, (_, i) => `+satir${i}`) }],
  }), { cfgDir: ws.cfgDir });
  bash('npm test', 'diff');
  const r = stop('diff');
  assert.match(r.json.reason, /40 satır değişti, eşik 5/);
  ws.config({});
});

test('commit sayacı sıfırlayınca diff kapısı açılır', () => {
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

test('keşif kipinde kapı bloklamaz, bildirir', () => {
  ws.config({ mode: 'explore' });
  write('exp.js', 'const a = 1;\n', 'kesif');
  const r = stop('kesif');
  assert.equal(r.json.decision, undefined);
  assert.match(r.json.systemMessage, /keşif kipi, kapı bloklamıyor/);
  ws.config({});
});

// ── AGT-08 döngü koruması ───────────────────────────────────────────────

test('aynı gerekçe tavana gelince kapı aşılır ve bu açıkça söylenir', () => {
  write('loop.js', 'try{}catch(e){}\n', 'dongu');
  assert.match(stop('dongu').json.reason, /\(1\/2\)/);
  assert.match(stop('dongu').json.reason, /\(2\/2\)/);
  const third = stop('dongu');
  assert.equal(third.json.decision, undefined, 'üçüncüde bloklamaz — sonsuz döngü olurdu');
  assert.match(third.json.systemMessage, /kapı AŞILDI/);
  assert.match(third.json.systemMessage, /Bu bir onay değil/);
});

test('ihlal kümesi değişirse sayaç sıfırdan başlar — ilerleme cezalandırılmaz', () => {
  write('prog.js', 'try{}catch(e){}\n', 'ilerleme');
  assert.match(stop('ilerleme').json.reason, /\(1\/2\)/);
  assert.match(stop('ilerleme').json.reason, /\(2\/2\)/);
  ws.file('prog.js', 'const k = "AKIAIOSFODNN7EXAMPLE"\n');
  pipe('hooks/post-edit.mjs', postToolUsePayload({ cwd: ws.repo, filePath: ws.file('prog.js', 'const k = "AKIAIOSFODNN7EXAMPLE"\n'), sessionId: 'ilerleme' }), { cfgDir: ws.cfgDir });
  const r = stop('ilerleme');
  assert.match(r.json.reason, /\(1\/2\)/, 'farklı ihlal, yeni sayaç');
  assert.match(r.json.reason, /GUV-03/);
});

test('tavan yapılandırılabilir', () => {
  ws.config({ thresholds: { maxStopBlocks: 1 } });
  write('tavan.js', 'try{}catch(e){}\n', 'tavan');
  assert.match(stop('tavan').json.reason, /\(1\/1\)/);
  assert.match(stop('tavan').json.systemMessage, /kapı AŞILDI/);
  ws.config({});
});
