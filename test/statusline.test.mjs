import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeWorkspace, pipe, ROOT } from './pipe.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const SID = 'live-session';
const beatFile = join(ws.cfgDir, 'heartbeat.json');
const probeCache = join(ws.cfgDir, 'probe.json');
const transcript = join(ws.base, 'transcript.jsonl');

const bar = (payload = {}, cfgDir = ws.cfgDir) => pipe('bin/statusline.mjs', {
  session_id: SID, cwd: ws.repo, transcript_path: transcript,
  model: { id: 'claude-opus-5', display_name: 'Opus 5' },
  workspace: { current_dir: ws.repo, project_dir: ws.repo },
  cost: { total_lines_added: 420, total_lines_removed: 80 },
  ...payload,
}, { cfgDir }).stdout;

const heartbeat = (sessionId) => writeFileSync(beatFile, JSON.stringify({
  ts: Date.now(), version: '0.1.0', patterns: 33, mode: 'strict', sessionId, event: 'UserPromptSubmit',
}));
const session = (patch) => writeFileSync(join(ws.cfgDir, `session-${SID}.json`),
  JSON.stringify({ version: 1, sessionId: SID, ...patch }));
const freshProbe = () => rmSync(probeCache, { force: true });

// ── The bar does not lie ────────────────────────────────────────────────

test('before any message it says "ready" and NOT "live"', () => {
  freshProbe();
  rmSync(beatFile, { force: true });
  rmSync(transcript, { force: true });
  const out = bar();
  assert.match(out, /SlopGuard ready/);
  assert.doesNotMatch(out, /live/, 'it cannot claim live before registration is proved');
});

test('another session\'s stamp is not enough for "live"', () => {
  freshProbe();
  heartbeat('some-other-session');
  assert.match(bar(), /ready/);
});

test('with this session\'s stamp it reads "live" — both proofs present', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 12, blocked: 3, testRunAt: Date.now() - 240000, violations: {}, suppressions: 0 });
  const out = bar();
  assert.match(out, /SlopGuard live/);
  assert.match(out, /strict/);
  assert.match(out, /3 blocked/);
  assert.match(out, /turn 12\/40/);
  assert.match(out, /\+420\/-80/, 'line counts come from the statusLine payload');
  assert.match(out, /tests 4m ago/);
});

test('a message was sent but no stamp exists — "unregistered"', () => {
  freshProbe();
  heartbeat('older-session');
  writeFileSync(transcript, '{"type":"user","message":{"role":"user"}}\n');
  const out = bar();
  assert.match(out, /unregistered/);
  assert.doesNotMatch(out, /live/);
  rmSync(transcript, { force: true });
});

test('when the script breaks the bar drops to "broken" rather than staying "live"', () => {
  // The scenario: the hook script disappears mid-session. A copy without the
  // hooks directory is set up, so the probe gets no answer.
  const broken = mkdtempSync(join(tmpdir(), 'slopguard-broken-'));
  cpSync(join(ROOT, 'lib'), join(broken, 'lib'), { recursive: true });
  cpSync(join(ROOT, 'bin'), join(broken, 'bin'), { recursive: true });
  cpSync(join(ROOT, 'package.json'), join(broken, 'package.json'));
  assert.equal(existsSync(join(broken, 'hooks')), false, 'hooks was deliberately not copied');

  const brokenCfg = mkdtempSync(join(tmpdir(), 'slopguard-brokencfg-'));
  writeFileSync(join(brokenCfg, 'heartbeat.json'), JSON.stringify({ ts: Date.now(), sessionId: SID }));

  const out = execFileSync(process.execPath, [join(broken, 'bin', 'statusline.mjs')], {
    input: JSON.stringify({ session_id: SID, cwd: ws.repo }),
    encoding: 'utf8',
    env: { ...process.env, SLOPGUARD_CONFIG_DIR: brokenCfg },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.match(out, /broken/, `expected broken, got: ${out}`);
  assert.doesNotMatch(out, /live/, 'registration alone is not enough without operability');

  rmSync(broken, { recursive: true, force: true });
  rmSync(brokenCfg, { recursive: true, force: true });
});

// ── Visibility modes ────────────────────────────────────────────────────

test('minimal mode shows only the state and the counter', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 12, blocked: 3 });
  ws.config({ ui: { statusLine: 'minimal' } });
  assert.equal(bar(), 'SlopGuard live · 3');
  ws.config({});
});

test('off mode prints nothing at all', () => {
  ws.config({ ui: { statusLine: 'off' } });
  assert.equal(bar(), '');
  ws.config({});
});

test('when the user disabled it deliberately the bar says "off"', () => {
  ws.config({ enabled: false });
  assert.equal(bar(), 'SlopGuard off');
  ws.config({});
});

test('explore mode is visible on the bar', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 3, blocked: 0 });
  ws.config({ mode: 'explore' });
  assert.match(bar(), /live · explore/);
  ws.config({});
});

test('open violations and waiver counts reach the bar', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 5, blocked: 2, suppressions: 1, violations: { 'a.js': [{ id: 'CODE-05', line: 1 }] } });
  const out = bar();
  assert.match(out, /1 open/);
  assert.match(out, /1 waived/);
});

test('when no test has run the bar says so', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 2, blocked: 0, testRunAt: null });
  assert.match(bar(), /no tests/);
});

test('malformed stdin does not crash the bar', () => {
  const r = pipe('bin/statusline.mjs', undefined, { cfgDir: ws.cfgDir });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /SlopGuard/);
});
