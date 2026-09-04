import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'slopguard-session-'));
process.env.SLOPGUARD_CONFIG_DIR = DIR;
const S = await import('../lib/session.mjs');
const C = await import('../lib/coach.mjs');
const { DEFAULT_CONFIG, paths } = await import('../lib/config.mjs');
const { scanContent } = await import('../lib/scan.mjs');

const SID = 'test-oturum';
beforeEach(() => rmSync(paths.session(SID), { force: true }));

function captureStderr(fn) {
  const original = process.stderr.write;
  let buf = '';
  process.stderr.write = (c) => { buf += c; return true; };
  try { return [fn(), buf]; } finally { process.stderr.write = original; }
}

// ── Kalıcılık ────────────────────────────────────────────────────────────

test('yeni oturum boş sayaçlarla başlar', () => {
  const s = S.loadSession(SID);
  assert.equal(s.turns, 0);
  assert.equal(s.blocked, 0);
  assert.deepEqual(s.violations, {});
  assert.equal(s.version, S.SESSION_VERSION);
});

test('kaydet ve yeniden yükle: sayaçlar korunur', () => {
  const s = S.loadSession(SID);
  s.turns = 7; s.linesWritten = 420;
  assert.equal(S.saveSession(s), true);
  assert.equal(S.loadSession(SID).turns, 7);
  assert.equal(S.loadSession(SID).linesWritten, 420);
});

test('bozuk oturum dosyası sessizce yutulmaz — stderr yazar, sıfırdan başlar', () => {
  writeFileSync(paths.session(SID), '{ bozuk');
  const [state, err] = captureStderr(() => S.loadSession(SID));
  assert.equal(state.turns, 0);
  assert.match(err, /oturum dosyası okunamadı/);
});

test('yazma atomik: geçici dosya bırakılmaz', () => {
  const s = S.loadSession(SID);
  S.saveSession(s);
  assert.equal(existsSync(`${paths.session(SID)}.${process.pid}.tmp`), false);
  JSON.parse(readFileSync(paths.session(SID), 'utf8'));
});

test('updateSession oku-değiştir-yaz yapar ve mutator dönüşünü verir', () => {
  const turn = S.updateSession(SID, (s) => S.recordTurn(s));
  assert.equal(turn, 1);
  assert.equal(S.loadSession(SID).turns, 1);
});

// ── Sayaçlar ─────────────────────────────────────────────────────────────

test('aynı dosyaya ardışık yazma sayılır, başka dosya sayacı sıfırlar', () => {
  const s = S.loadSession(SID);
  assert.equal(S.recordWrite(s, 'a.js', { added: 10 }), 1);
  assert.equal(S.recordWrite(s, 'a.js', { added: 5 }), 2);
  assert.equal(S.recordWrite(s, 'b.js', { added: 5 }), 1, 'farklı dosya zinciri kırar');
  assert.equal(S.recordWrite(s, 'b.js'), 2);
  assert.equal(s.linesWritten, 20);
  assert.equal(Object.keys(s.filesWritten).length, 2);
});

test('okunan satır kavrayış borcu için sayılır', () => {
  const s = S.loadSession(SID);
  S.recordRead(s, 60);
  S.recordRead(s, -5);
  assert.equal(s.linesRead, 60, 'negatif değer sayacı bozmamalı');
});

test('commit sayaçları sıfırlar ve doğrulamayı geçersiz kılar', () => {
  const s = S.loadSession(SID);
  S.recordWrite(s, 'a.js', { added: 100, removed: 20 });
  S.recordTestRun(s);
  assert.equal(s.linesSinceCommit, 120);
  S.recordCommit(s);
  assert.equal(s.linesSinceCommit, 0);
  assert.equal(s.testRunAt, null, 'yeni commit yeni doğrulama ister');
});

// ── İhlal defteri: stop-gate'in dayanağı ────────────────────────────────

test('ihlal defteri dosya bazlı tazelenir; düzeltilen ihlal kendiliğinden düşer', () => {
  const s = S.loadSession(SID);
  const kirli = scanContent({ filePath: 'a.js', content: 'try{a()}catch(e){}' });
  assert.equal(S.recordViolations(s, 'a.js', kirli), 1);
  assert.equal(S.openViolations(s).length, 1);
  assert.equal(S.openViolations(s)[0].file, 'a.js');

  const temiz = scanContent({ filePath: 'a.js', content: 'try{a()}catch(e){log(e)}' });
  assert.equal(S.recordViolations(s, 'a.js', temiz), 0);
  assert.deepEqual(S.openViolations(s), [], 'düzeltilen dosya defterden düşmeli');
});

test('susturulmuş bulgu deftere girmez ama sayılır', () => {
  const s = S.loadSession(SID);
  const f = scanContent({ filePath: 'a.js', content: '// slop-guard-ignore KOD-05: gerekçe\ntry{a()}catch(e){}' });
  assert.equal(S.recordViolations(s, 'a.js', f), 0);
  assert.deepEqual(S.openViolations(s), []);
  assert.equal(s.suppressions, 1);
});

test('birden çok dosyanın ihlalleri ayrı tutulur', () => {
  const s = S.loadSession(SID);
  S.recordViolations(s, 'a.js', scanContent({ filePath: 'a.js', content: 'try{}catch(e){}' }));
  S.recordViolations(s, 'b.js', scanContent({ filePath: 'b.js', content: 'const k="AKIAIOSFODNN7EXAMPLE"' }));
  assert.equal(S.openViolations(s).length, 2);
  assert.deepEqual(S.openViolations(s).map((v) => v.file).sort(), ['a.js', 'b.js']);
  assert.equal(s.byCategory.KOD, 1);
  assert.equal(s.byCategory.GUV, 1);
});

test('uyarı oturumda bir kez talep edilebilir', () => {
  const s = S.loadSession(SID);
  assert.equal(S.claimWarning(s, 'x'), true);
  assert.equal(S.claimWarning(s, 'x'), false);
  assert.equal(S.claimWarning(s, 'y'), true);
});

test('oturum özeti ölçüm verir, beyan değil', () => {
  const s = S.loadSession(SID);
  s.turns = 12; s.linesWritten = 420; s.blocked = 3; s.suppressions = 2;
  S.recordWrite(s, 'a.js');
  const text = S.sessionSummary(s);
  assert.match(text, /12 tur/);
  assert.match(text, /420 satır yazıldı/);
  assert.match(text, /3 engellenen slop/);
  assert.match(text, /2 muafiyet kullanıldı/);
});

// ── Koç katmanı: sahte oturum durumuyla eşikler ─────────────────────────

const cfg = { thresholds: { ...DEFAULT_CONFIG.thresholds } };

test('bağlam çürümesi eşiği tur sayacıyla tetiklenir (AGT-01)', () => {
  const s = S.loadSession(SID);
  s.turns = cfg.thresholds.contextTurns - 1;
  assert.deepEqual(C.evaluate(s, cfg), []);
  s.turns = cfg.thresholds.contextTurns;
  const w = C.evaluate(s, cfg);
  assert.equal(w.length, 1);
  assert.equal(w[0].pattern, 'AGT-01');
  assert.match(w[0].message, /40 tura ulaştı/);
});

test('uyarı oturumda yalnızca bir kez çıkar', () => {
  const s = S.loadSession(SID);
  s.turns = 100;
  assert.equal(C.evaluate(s, cfg).length, 1);
  assert.equal(C.evaluate(s, cfg).length, 0, 'ikinci kez çıkmamalı');
});

test('kavrayış borcu yazılan eksi okunan ile ölçülür (INS-01)', () => {
  const s = S.loadSession(SID);
  s.linesWritten = 800; s.linesRead = 400;
  assert.deepEqual(C.evaluate(s, cfg), [], '400 fark eşiğin altında');
  s.linesRead = 60;
  const w = C.evaluate(s, cfg);
  assert.equal(w[0].pattern, 'INS-01');
  assert.match(w[0].message, /800 satır üretildi, 60 satır okundu/);
});

test('commitsiz ilerleme eşiği (AGT-06)', () => {
  const s = S.loadSession(SID);
  s.linesSinceCommit = 300;
  assert.equal(C.evaluate(s, cfg)[0].pattern, 'AGT-06');
});

test('zincirleme düzeltme eşiği (MTK-05)', () => {
  const s = S.loadSession(SID);
  s.lastEditedFile = 'parser.ts'; s.consecutiveEdits = 3;
  const w = C.evaluate(s, cfg);
  assert.equal(w[0].pattern, 'MTK-05');
  assert.match(w[0].message, /parser\.ts/);
});

test('eşik config ile değiştirilebilir', () => {
  const s = S.loadSession(SID);
  s.turns = 5;
  assert.deepEqual(C.evaluate(s, cfg), []);
  assert.equal(C.evaluate(s, { thresholds: { ...cfg.thresholds, contextTurns: 5 } }).length, 1);
});

test('birden çok eşik aynı anda aşılırsa hepsi raporlanır', () => {
  const s = S.loadSession(SID);
  s.turns = 50; s.linesSinceCommit = 900;
  assert.equal(C.evaluate(s, cfg).length, 2);
});

test('commit öncesi doğrulama her seferinde sorulur (TST-05)', () => {
  const s = S.loadSession(SID);
  assert.equal(C.verifyBeforeCommit(s).pattern, 'TST-05');
  assert.equal(C.verifyBeforeCommit(s).pattern, 'TST-05', 'bir kez kuralının dışında');
  S.recordTestRun(s);
  assert.equal(C.verifyBeforeCommit(s), null, 'test çalıştıysa sormaz');
});

test('uyarılar tek systemMessage gövdesinde birleşir', () => {
  assert.equal(C.formatWarnings([]), '');
  const one = C.formatWarnings([{ message: 'tek uyarı' }]);
  assert.match(one, /^LenaRise\.SlopGuard\n\n {2}· tek uyarı$/);
  const two = C.formatWarnings([{ message: 'bir' }, { message: 'iki' }]);
  assert.match(two, /2 uyarı/);
});
