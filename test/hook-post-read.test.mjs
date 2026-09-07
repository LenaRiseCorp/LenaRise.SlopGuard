import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeWorkspace, pipe, postToolUsePayload } from './pipe.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const run = (filePath, { sessionId, input = {} } = {}) =>
  pipe('hooks/post-read.mjs', postToolUsePayload({
    cwd: ws.repo, filePath, toolName: 'Read', sessionId, input,
  }), { cfgDir: ws.cfgDir });

const ledger = (sessionId) =>
  JSON.parse(readFileSync(join(ws.cfgDir, `session-${sessionId}.json`), 'utf8'));

// The measurement HUMAN-01 rests on. Before this hook existed recordRead was
// never called outside the tests, so linesRead stayed 0 for every real session
// and the comprehension-debt warning was driven by written lines alone.

test('a read records the lines it delivered', () => {
  const f = ws.file('read-me.js', Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n'));
  const r = run(f, { sessionId: 'okundu' });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '', 'the read hook says nothing');
  assert.equal(r.stderr, '');
  assert.equal(ledger('okundu').linesRead, 40);
});

test('reads accumulate across calls', () => {
  const f = ws.file('twice.js', 'a\nb\nc\n');
  run(f, { sessionId: 'birikir' });
  run(f, { sessionId: 'birikir' });
  assert.equal(ledger('birikir').linesRead, 8, 'two reads of a 4-line file');
});

test('offset and limit narrow the count to what was delivered', () => {
  const f = ws.file('sliced.js', Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'));
  run(f, { sessionId: 'dilim', input: { offset: 90, limit: 50 } });
  assert.equal(ledger('dilim').linesRead, 10, 'only 10 lines remain after the offset');
});

test('a read with no limit is capped at the tool default, never the whole file', () => {
  const f = ws.file('huge.js', Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n'));
  run(f, { sessionId: 'buyuk' });
  assert.equal(ledger('buyuk').linesRead, 2000,
    'counting 5000 would credit lines the model never received and hide the debt');
});

test('a binary file records nothing', () => {
  const f = join(ws.repo, 'logo.png');
  writeFileSync(f, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0x1a]));
  const r = run(f, { sessionId: 'ikili' });
  assert.equal(r.code, 0);
  assert.equal(ledger('ikili').linesRead, 0, 'bytes in an image are not lines anyone read');
});

test('an unreadable file records nothing and reports the reason', () => {
  const r = run(join(ws.repo, 'absent.js'), { sessionId: 'yok' });
  assert.equal(r.code, 0, 'a hook never blocks on its own failure');
  assert.equal(ledger('yok').linesRead, 0);
  assert.match(r.stderr, /absent\.js/, 'the error goes to stderr, never swallowed (CODE-05)');
});

test('a payload with no file path is ignored', () => {
  const r = pipe('hooks/post-read.mjs', {
    session_id: 'bos', cwd: ws.repo, hook_event_name: 'PostToolUse',
    tool_name: 'Read', tool_input: {}, tool_response: {},
  }, { cfgDir: ws.cfgDir });
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
});
