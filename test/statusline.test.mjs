import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, mkdtempSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { makeWorkspace, pipe, ROOT } from './pipe.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const SID = 'canli-oturum';
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
  ts: Date.now(), version: '0.1.0', patterns: 26, mode: 'strict', sessionId, event: 'UserPromptSubmit',
}));
const session = (patch) => writeFileSync(join(ws.cfgDir, `session-${SID}.json`),
  JSON.stringify({ version: 1, sessionId: SID, ...patch }));
const freshProbe = () => rmSync(probeCache, { force: true });

// ── Doğrulama 12: çubuk yalan söylemez ──────────────────────────────────

test('mesaj atılmadan önce "hazır" der, "canlı" DEMEZ', () => {
  freshProbe();
  rmSync(beatFile, { force: true });
  rmSync(transcript, { force: true });
  const out = bar();
  assert.match(out, /SlopGuard hazır/);
  assert.doesNotMatch(out, /canlı/, 'kayıt kanıtlanmadan canlı denemez');
});

test('başka oturumun damgası "canlı" için yetmez', () => {
  freshProbe();
  heartbeat('bambaska-oturum');
  assert.match(bar(), /hazır/);
});

test('bu oturumun damgası varsa "canlı" — iki kanıt da tamam', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 12, blocked: 3, testRunAt: Date.now() - 240000, violations: {}, suppressions: 0 });
  const out = bar();
  assert.match(out, /SlopGuard canlı/);
  assert.match(out, /sert/);
  assert.match(out, /3 engellendi/);
  assert.match(out, /tur 12\/40/);
  assert.match(out, /\+420\/-80/, 'satır sayıları statusLine yükünden gelir');
  assert.match(out, /test 4 dk önce/);
});

test('mesaj atılmış ama damga yoksa "kayıtsız" — hook kaydolmamış', () => {
  freshProbe();
  heartbeat('eski-oturum');
  writeFileSync(transcript, '{"type":"user","message":{"role":"user"}}\n');
  const out = bar();
  assert.match(out, /⚠️ kayıtsız/);
  assert.doesNotMatch(out, /canlı/);
  rmSync(transcript, { force: true });
});

test('script bozulursa çubuk "canlı" kalmaz, "bozuk"a düşer', () => {
  // Planın senaryosu: oturum ortasında hook script'i ortadan kalkar.
  // Eksik hooks/ dizini olan bir kopya kurulur; probe cevap alamaz.
  const broken = mkdtempSync(join(tmpdir(), 'slopguard-bozuk-'));
  cpSync(join(ROOT, 'lib'), join(broken, 'lib'), { recursive: true });
  cpSync(join(ROOT, 'bin'), join(broken, 'bin'), { recursive: true });
  cpSync(join(ROOT, 'package.json'), join(broken, 'package.json'));
  assert.equal(existsSync(join(broken, 'hooks')), false, 'hooks bilerek kopyalanmadı');

  const brokenCfg = mkdtempSync(join(tmpdir(), 'slopguard-bozukcfg-'));
  writeFileSync(join(brokenCfg, 'heartbeat.json'), JSON.stringify({ ts: Date.now(), sessionId: SID }));

  const out = execFileSync(process.execPath, [join(broken, 'bin', 'statusline.mjs')], {
    input: JSON.stringify({ session_id: SID, cwd: ws.repo }),
    encoding: 'utf8',
    env: { ...process.env, SLOPGUARD_CONFIG_DIR: brokenCfg },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.match(out, /⚠️ bozuk/, `beklenen bozuk, gelen: ${out}`);
  assert.doesNotMatch(out, /canlı/, 'kayıt kanıtı varken bile çalışabilirlik yoksa canlı denemez');

  rmSync(broken, { recursive: true, force: true });
  rmSync(brokenCfg, { recursive: true, force: true });
});

// ── Doğrulama 11: görünürlük kipleri ────────────────────────────────────

test('minimal kip yalnızca durum ve sayaç gösterir', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 12, blocked: 3 });
  ws.config({ ui: { statusLine: 'minimal' } });
  assert.equal(bar(), 'SlopGuard canlı · 3');
  ws.config({});
});

test('off kipinde çubuk hiçbir şey yazmaz', () => {
  ws.config({ ui: { statusLine: 'off' } });
  assert.equal(bar(), '');
  ws.config({});
});

test('kullanıcı bilerek kapattıysa "kapalı" der', () => {
  ws.config({ enabled: false });
  assert.equal(bar(), 'SlopGuard kapalı');
  ws.config({});
});

test('keşif kipi çubukta görünür', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 3, blocked: 0 });
  ws.config({ mode: 'explore' });
  assert.match(bar(), /canlı · keşif/);
  ws.config({});
});

test('açık ihlal ve muafiyet sayısı çubuğa yansır', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 5, blocked: 2, suppressions: 1, violations: { 'a.js': [{ id: 'KOD-05', line: 1 }] } });
  const out = bar();
  assert.match(out, /1 açık ihlal/);
  assert.match(out, /1 muafiyet/);
});

test('test hiç çalışmadıysa çubuk bunu söyler', () => {
  freshProbe();
  heartbeat(SID);
  session({ turns: 2, blocked: 0, testRunAt: null });
  assert.match(bar(), /test yok/);
});

test('bozuk stdin çubuğu çökertmez', () => {
  const r = pipe('bin/statusline.mjs', undefined, { cfgDir: ws.cfgDir });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /SlopGuard/);
});
