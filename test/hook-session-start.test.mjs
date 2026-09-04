import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeWorkspace, pipe } from './pipe.mjs';
import { PATTERN_COUNT, CATEGORIES } from '../lib/patterns.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const start = (sid = 'baslangic') => pipe('hooks/session-start.mjs', {
  session_id: sid, cwd: ws.repo, hook_event_name: 'SessionStart', source: 'startup',
}, { cfgDir: ws.cfgDir });

const localRules = join(ws.cfgDir, 'rules.local.md');
const context = (r) => r.json?.hookSpecificOutput?.additionalContext ?? '';

test('kural seti modelin bağlamına enjekte edilir', () => {
  const c = context(start());
  assert.match(c, /LenaRise\.SlopGuard — kural seti/);
  for (const cat of ['## Kod \\(KOD\\)', '## Doğruluk \\(MTK\\)', '## Test \\(TST\\)', '## Güvenlik \\(GUV\\)',
                     '## Agent operasyonu \\(AGT\\)', '## Süreç \\(SUR\\)', '## Kod dışı çıktı \\(DOK\\)', '## İnsan \\(INS\\)']) {
    assert.match(c, new RegExp(cat), cat);
  }
});

test('şema doğru: SessionStart additionalContext', () => {
  const r = start();
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(typeof r.json.hookSpecificOutput.additionalContext === 'string');
});

test('yetenek indeksi desen sayısını defterden alır, elle yazmaz', () => {
  const c = context(start());
  assert.match(c, new RegExp(`${PATTERN_COUNT} desen`));
  assert.match(c, new RegExp(`${Object.keys(CATEGORIES).length} kategori`));
  assert.match(c, /sert kip/);
});

test('yetenek indeksi levyelerin nerede olduğunu söyler', () => {
  const c = context(start());
  for (const lever of ['config.json', 'patterns.local.json', 'rules.local.md', '.slopignore']) {
    assert.ok(c.includes(lever), lever);
  }
  assert.match(c, /slop-guard-ignore <ID>: gerekçe/);
  assert.match(c, /plugin dizinini düzenleme/);
});

test('kapalı desenler indekste görünür', () => {
  ws.config({ disabled: ['DOK-04'] });
  assert.match(context(start()), /kapalı: DOK-04/);
  ws.config({});
});

test('keşif kipi indekste görünür', () => {
  ws.config({ mode: 'explore' });
  assert.match(context(start()), /keşif kip/);
  ws.config({});
});

test('kullanıcının kendi kuralları eklenir', () => {
  writeFileSync(localRules, 'Bu repoda tarih biçimi ISO 8601 olacak.\n');
  const c = context(start());
  assert.match(c, /Kullanıcının kendi kuralları/);
  assert.match(c, /ISO 8601/);
  rmSync(localRules, { force: true });
});

test('aşırı uzun kullanıcı kuralı kısaltılır ve bu söylenir (AGT-02)', () => {
  writeFileSync(localRules, 'x'.repeat(9000));
  const c = context(start());
  assert.match(c, /kısaltıldı/);
  assert.ok(c.length < 20000, 'bağlam şişirilmemeli');
  rmSync(localRules, { force: true });
});

test('boş rules.local.md bölüm açmaz', () => {
  writeFileSync(localRules, '   \n');
  assert.doesNotMatch(context(start()), /Kullanıcının kendi kuralları/);
  rmSync(localRules, { force: true });
});

test('plugin kapalıysa hiçbir şey enjekte edilmez', () => {
  ws.config({ enabled: false });
  assert.equal(start().stdout, '');
  ws.config({});
});

test('oturum başı kalp atışı damgalar', () => {
  start('atis-baslangic');
  const beat = JSON.parse(readFileSync(join(ws.cfgDir, 'heartbeat.json'), 'utf8'));
  assert.equal(beat.event, 'SessionStart');
  assert.equal(beat.sessionId, 'atis-baslangic');
});

test('enjekte edilen metin kendi desenlerimizden geçer', async () => {
  const { scanContent, actionable } = await import('../lib/scan.mjs');
  const c = context(start());
  const findings = actionable(scanContent({ filePath: 'injected.md', content: c }));
  assert.deepEqual(findings.map((f) => `${f.id}:${f.line}`), [], 'kendi kural setimiz kendi kurallarını ihlal edemez');
});

test('büyük çıktı kesilmeden teslim edilir — boru tamponu regresyonu', () => {
  // process.exit() bekleyen stdout yazmasını beklemiyordu ve ~8 KB üstü çıktı
  // sessizce kesiliyordu. Kural seti bu sınırın üstünde; regresyon pahalı olurdu.
  writeFileSync(localRules, 'A'.repeat(40000));
  const r = start();
  assert.notEqual(r.json, null, 'çıktı geçerli JSON olmalı, yani kesilmemiş olmalı');
  const c = context(r);
  assert.ok(c.length > 10000, `beklenen büyük bağlam, gelen ${c.length} karakter`);
  assert.match(c, /kısaltıldı/);
  assert.match(c, /Komutlar: \/slop-check/, 'metnin SONU da gelmiş olmalı');
  rmSync(localRules, { force: true });
});
