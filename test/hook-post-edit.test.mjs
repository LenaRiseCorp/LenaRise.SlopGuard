import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeWorkspace, pipe, postToolUsePayload } from './pipe.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const run = (filePath, extra = {}) =>
  pipe('hooks/post-edit.mjs', postToolUsePayload({ cwd: ws.repo, filePath, ...extra }), { cfgDir: ws.cfgDir });

test('a dirty file returns a block carrying category and line', () => {
  const f = ws.file('dirty.js', 'try {\n  risky();\n} catch (e) {}\n');
  const r = run(f, { sessionId: 'kirli' });
  assert.equal(r.code, 0, 'hook her zaman 0 ile çıkar');
  assert.equal(r.stderr, '');
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, /CODE-05/);
  assert.match(r.json.reason, /line 3/);
  assert.match(r.json.reason, /dirty\.js/);
});

test('a clean file passes silently — no output, no error', () => {
  const f = ws.file('clean.js', 'try {\n  risky();\n} catch (e) {\n  logger.warn(e);\n  throw e;\n}\n');
  const r = run(f, { sessionId: 'clean' });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '', 'clean tarama sessizdir');
  assert.equal(r.stderr, '');
});

test('the violation is written to the session ledger', () => {
  const f = ws.file('ledger.js', 'try{}catch(e){}\n');
  run(f, { sessionId: 'defter' });
  const state = JSON.parse(readFileSync(join(ws.cfgDir, 'session-defter.json'), 'utf8'));
  assert.equal(Object.keys(state.violations).length, 1);
  assert.equal(state.violations[f][0].id, 'CODE-05');
  assert.equal(state.blocked, 1);
});

test('a fixed file drops out of the ledger', () => {
  const f = ws.file('fixme.js', 'try{}catch(e){}\n');
  run(f, { sessionId: 'duzelt' });
  ws.file('fixme.js', 'try{ a() }catch(e){ throw e }\n');
  run(f, { sessionId: 'duzelt' });
  const state = JSON.parse(readFileSync(join(ws.cfgDir, 'session-duzelt.json'), 'utf8'));
  assert.deepEqual(state.violations, {}, 'düzeltme defteri cleanlemeli');
});

test('the heartbeat is stamped on every trigger', () => {
  const beatFile = join(ws.cfgDir, 'heartbeat.json');
  run(ws.file('beat.js', 'const a = 1;\n'), { sessionId: 'atis' });
  assert.ok(existsSync(beatFile));
  const beat = JSON.parse(readFileSync(beatFile, 'utf8'));
  assert.equal(beat.sessionId, 'atis');
  assert.equal(beat.event, 'PostToolUse');
  assert.ok(beat.patterns > 0);
  assert.ok(Date.now() - beat.ts < 10000);
});

test('explore mode warns instead of blocking', () => {
  ws.config({ mode: 'explore' });
  const r = run(ws.file('explore.js', 'try{}catch(e){}\n'), { sessionId: 'kesif' });
  assert.equal(r.json.decision, undefined);
  assert.match(r.json.systemMessage, /explore mode/);
  ws.config({});
});

test('.slopignore ile muaf yol taranmaz', () => {
  ws.file('.slopignore', 'vendor\n');
  const r = run(ws.file('vendor/lib.js', 'try{}catch(e){}\n'), { sessionId: 'muaf' });
  assert.equal(r.stdout, '');
});

test('a disabled pattern does not block', () => {
  ws.config({ disabled: ['CODE-05'] });
  const r = run(ws.file('disabled.js', 'try{}catch(e){}\n'), { sessionId: 'kapali' });
  assert.equal(r.stdout, '');
  ws.config({});
});

test('in cleanScans summary mode a clean scan is announced', () => {
  ws.config({ ui: { cleanScans: 'summary' } });
  const r = run(ws.file('quiet.js', 'const a = 1;\n'), { sessionId: 'ozet' });
  assert.match(r.json.systemMessage, /1 file\(s\) scanned · clean/);
  ws.config({});
});

test('an unscanned extension passes silently but the counter still runs', () => {
  const f = ws.file('data.bin', 'try{}catch(e){}\n');
  const r = run(f, { sessionId: 'ikili', content: 'try{}catch(e){}\n' });
  assert.equal(r.stdout, '');
  const state = JSON.parse(readFileSync(join(ws.cfgDir, 'session-ikili.json'), 'utf8'));
  assert.ok(state.linesWritten > 0);
});

test('malformed stdin does not block but is not silent either', () => {
  const r = pipe('hooks/post-edit.mjs', undefined, { cfgDir: ws.cfgDir });
  assert.equal(r.code, 0, 'kendi hatamız kullanıcının işini durduramaz');
  assert.equal(r.stdout, '');
});

test('fallback content is used for a deleted file', () => {
  const missing = join(ws.repo, 'yok.js');
  const r = pipe('hooks/post-edit.mjs',
    postToolUsePayload({ cwd: ws.repo, filePath: missing, content: 'try{}catch(e){}\n', sessionId: 'yedek' }),
    { cfgDir: ws.cfgDir });
  assert.equal(r.json?.decision, 'block', 'diskten okunamayınca tool_response içeriği taranmalı');
});

test('structuredPatch line counting: added and removed are counted separately', () => {
  const f = ws.file('patched.js', 'const a = 1;\n');
  pipe('hooks/post-edit.mjs', postToolUsePayload({
    cwd: ws.repo, filePath: f, sessionId: 'yama',
    patch: [{ lines: ['+bir', '+iki', '-eski', ' aynı'] }],
  }), { cfgDir: ws.cfgDir });
  const state = JSON.parse(readFileSync(join(ws.cfgDir, 'session-yama.json'), 'utf8'));
  assert.equal(state.linesWritten, 2, 'yalnızca + satırları yazılan sayılır');
  assert.equal(state.linesSinceCommit, 3, 'commit borcu eklenen + silinen');
});
