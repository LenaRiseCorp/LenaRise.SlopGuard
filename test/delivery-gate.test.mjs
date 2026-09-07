import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorkspace, pipe, postToolUsePayload } from './pipe.mjs';

/**
 * The delivery gate.
 *
 * What is asserted here is the shape of the guarantee: the turn stays open while
 * interface files have been written and the gate has not run. It is the run that
 * counts, never a sentence in the transcript — the same reasoning the
 * verification log records for test runs.
 */

const ws = makeWorkspace();
after(() => ws.cleanup());

const write = (rel, body, sid) => {
  const f = ws.file(rel, body);
  pipe('hooks/post-edit.mjs', postToolUsePayload({ cwd: ws.repo, filePath: f, sessionId: sid }), { cfgDir: ws.cfgDir });
  return f;
};
const stop = (sid) => pipe('hooks/stop-gate.mjs', {
  session_id: sid, cwd: ws.repo, hook_event_name: 'Stop', stop_hook_active: false,
}, { cfgDir: ws.cfgDir });


test('an interface change with no delivery report holds the turn open', () => {
  ws.file('package.json', JSON.stringify({ dependencies: { react: '^18.0.0' } }));
  write('src/Hero.tsx', '<section className="min-h-screen"><button onClick={go}>Go</button></section>\n', 'teslim');
  const r = stop('teslim');
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, /interface file\(s\) changed and the delivery gate has not run/);
  assert.match(r.json.reason, /deliver\.mjs/);
});

test('the same change in a project with no interface asks for no delivery report', () => {
  const plain = makeWorkspace();
  after(() => plain.cleanup());
  const f = plain.file('theme.css', '.a { color: red; }\n');
  pipe('hooks/post-edit.mjs', postToolUsePayload({ cwd: plain.repo, filePath: f, sessionId: 'duz' }), { cfgDir: plain.cfgDir });
  const r = pipe('hooks/stop-gate.mjs', {
    session_id: 'duz', cwd: plain.repo, hook_event_name: 'Stop', stop_hook_active: false,
  }, { cfgDir: plain.cfgDir });
  assert.doesNotMatch(r.json?.reason ?? '', /delivery gate/);
});
