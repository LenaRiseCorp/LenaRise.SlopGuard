import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { makeWorkspace, pipe } from './pipe.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const prompt = (sid) => pipe('hooks/user-prompt.mjs', {
  session_id: sid, cwd: ws.repo, hook_event_name: 'UserPromptSubmit', prompt: 'devam',
}, { cfgDir: ws.cfgDir });

const end = (sid) => pipe('hooks/session-end.mjs', {
  session_id: sid, cwd: ws.repo, hook_event_name: 'SessionEnd', reason: 'clear',
}, { cfgDir: ws.cfgDir });

const sessionFile = (sid) => join(ws.cfgDir, `session-${sid}.json`);
const session = (sid) => JSON.parse(readFileSync(sessionFile(sid), 'utf8'));
const seed = (sid, patch) => writeFileSync(sessionFile(sid), JSON.stringify({ version: 1, sessionId: sid, ...patch }));

test('her kullanıcı mesajı tur sayacını artırır', () => {
  prompt('tur'); prompt('tur'); prompt('tur');
  assert.equal(session('tur').turns, 3);
});

test('ilk turda tek satır onay çıkar (ui.heartbeat)', () => {
  const r = prompt('onay');
  assert.match(r.json.systemMessage, /etkin — sert kip · \d+ desen/);
  assert.equal(prompt('onay').stdout, '', 'ikinci turda tekrar etmez');
});

test('ui.heartbeat kapalıysa onay çıkmaz — ayar gerçekten okunuyor', () => {
  ws.config({ ui: { heartbeat: false } });
  assert.equal(prompt('sessiz-onay').stdout, '');
  ws.config({});
});

test('eşik altında ve ilk tur dışında uyarı çıkmaz', () => {
  prompt('sessiz');
  assert.equal(prompt('sessiz').stdout, '');
});

test('kalp atışı bu oturumun kimliğiyle damgalanır — kayıt kanıtı', () => {
  prompt('kimlik');
  const beat = JSON.parse(readFileSync(join(ws.cfgDir, 'heartbeat.json'), 'utf8'));
  assert.equal(beat.sessionId, 'kimlik');
  assert.equal(beat.event, 'UserPromptSubmit');
});

test('bağlam çürümesi eşiği sohbete uyarı düşürür (AGT-01)', () => {
  seed('uzun', { turns: 39, warned: [] });   // turn 40 olacak, ilk tur değil
  const r = prompt('uzun');
  assert.match(r.json.systemMessage, /40 tura ulaştı/);
  assert.match(r.json.systemMessage, /AGT-01/);
});

test('aynı uyarı ikinci kez çıkmaz', () => {
  seed('tekrar', { turns: 39, warned: [] });
  assert.match(prompt('tekrar').json.systemMessage, /AGT-01/);
  assert.equal(prompt('tekrar').stdout, '', 'tekrar eden uyarı görmezden gelinir');
});

test('kavrayış borcu uyarısı ölçümle konuşur (INS-01)', () => {
  seed('borc', { turns: 1, linesWritten: 800, linesRead: 60, warned: [] });
  assert.match(prompt('borc').json.systemMessage, /800 satır üretildi, 60 satır okundu/);
});

test('birden çok eşik tek mesajda birleşir', () => {
  seed('coklu', { turns: 45, linesSinceCommit: 900, warned: [] });
  const msg = prompt('coklu').json.systemMessage;
  assert.match(msg, /2 uyarı/);
  assert.match(msg, /AGT-01/);
  assert.match(msg, /AGT-06/);
});

test('eşik config ile değiştirilebilir', () => {
  ws.config({ thresholds: { contextTurns: 3 } });
  seed('esik', { turns: 2, warned: [] });
  assert.match(prompt('esik').json.systemMessage, /3 tura ulaştı/);
  ws.config({});
});

// ── oturum sonu ─────────────────────────────────────────────────────────

test('boş oturumda özet basılmaz — gürültü olurdu', () => {
  assert.equal(end('bos-oturum').stdout, '');
});

test('oturum özeti ölçüm verir', () => {
  seed('ozet', { turns: 12, linesWritten: 420, blocked: 3, suppressions: 2, filesWritten: { 'a.js': 1 } });
  const msg = end('ozet').json.systemMessage;
  assert.match(msg, /oturum özeti/);
  assert.match(msg, /12 tur/);
  assert.match(msg, /420 satır yazıldı/);
  assert.match(msg, /3 engellenen slop/);
  assert.match(msg, /2 muafiyet kullanıldı/);
});

test('açık ihlal özet satırında görünür', () => {
  seed('acik', { turns: 2, linesWritten: 10, violations: { 'a.js': [{ id: 'KOD-05', line: 1, shown: 'a.js' }] } });
  assert.match(end('acik').json.systemMessage, /1 açık ihlal/);
});

test('eski oturum dosyaları temizlenir, güncel olan korunur', () => {
  seed('eski', { turns: 1 });
  seed('yeni', { turns: 1, linesWritten: 5 });
  const old = Date.now() / 1000 - 8 * 86400;
  utimesSync(sessionFile('eski'), old, old);
  end('yeni');
  assert.equal(existsSync(sessionFile('eski')), false, '7 günden eski silinmeli');
  assert.equal(existsSync(sessionFile('yeni')), true);
});
