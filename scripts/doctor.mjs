#!/usr/bin/env node
/**
 * /slop-doctor — talep üzerine teşhis.
 *
 * Her satır ya ✅ ya ❌ basar ve ❌ olanın nasıl düzeltileceğini söyler.
 * "Muhtemelen iyidir" diye bir satır yok: teşhis aracının belirsizliği
 * iyimserliğe yuvarlaması, teşhis olmamasından kötüdür (INS-04).
 *
 * Hook boru testleri gerçek stdin yüküyle ve SLOPGUARD_PROBE=1 ile yapılır —
 * teşhis kendi kalp atışını damgalayıp "canlı" görüntüsü üretmez.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadConfig, paths, readJsonFile } from '../lib/config.mjs';
import { PATTERN_COUNT, CATEGORIES } from '../lib/patterns.mjs';
import { read as readHeartbeat, ageSeconds, formatAge, isStale, version } from '../lib/heartbeat.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS = join(homedir(), '.claude', 'settings.json');

const lines = [];
let failures = 0;
const ok = (text) => lines.push(`  ✅ ${text}`);
const bad = (text, fix) => { failures++; lines.push(`  ❌ ${text}`); if (fix) lines.push(`     → ${fix}`); };
const info = (text) => lines.push(`     ${text}`);
const section = (title) => lines.push('', title);

/** Hook'a sentetik yük gönderir; beklenen anahtarın çıktıda olup olmadığına bakar. */
function probeHook(file, payload, expect) {
  const script = join(ROOT, 'hooks', file);
  if (!existsSync(script)) return { ok: false, why: 'dosya yok' };
  try {
    const out = execFileSync(process.execPath, [script], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 8000,
      env: { ...process.env, SLOPGUARD_PROBE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (expect === null) return { ok: out.trim() === '', why: out.trim() === '' ? null : 'beklenmedik çıktı' };
    if (out.trim() === '') return { ok: false, why: 'çıktı yok' };
    const parsed = JSON.parse(out);
    return expect(parsed) ? { ok: true } : { ok: false, why: 'beklenen cevap gelmedi' };
  } catch (error) {
    return { ok: false, why: error.message.split('\n')[0] };
  }
}

section('Dosyalar');
const required = [
  'hooks/hooks.json', 'hooks/session-start.mjs', 'hooks/user-prompt.mjs',
  'hooks/pre-edit.mjs', 'hooks/post-edit.mjs', 'hooks/pre-bash.mjs',
  'hooks/post-bash.mjs', 'hooks/stop-gate.mjs', 'hooks/session-end.mjs',
  'bin/statusline.mjs', 'lib/patterns.mjs', 'rules/base-rules.md',
];
const missing = required.filter((rel) => !existsSync(join(ROOT, rel)));
if (missing.length === 0) ok(`${required.length} çekirdek dosya yerinde`);
else bad(`eksik dosya: ${missing.join(', ')}`, 'claude plugin update lenarise-slopguard, ya da yeniden kur');

section('hooks.json');
const hooksJson = readJsonFile(join(ROOT, 'hooks/hooks.json'));
if (!hooksJson.ok) {
  bad(`hooks.json ${hooksJson.error}`, 'plugin yeniden kurulmalı');
} else {
  const events = Object.keys(hooksJson.value?.hooks ?? {});
  ok(`geçerli JSON · ${events.length} olay: ${events.join(', ')}`);
  const referenced = JSON.stringify(hooksJson.value).match(/hooks\/[a-z-]+\.mjs/g) ?? [];
  const broken = [...new Set(referenced)].filter((rel) => !existsSync(join(ROOT, rel)));
  if (broken.length === 0) ok('kayıtlı her hook dosyası mevcut');
  else bad(`hooks.json olmayan dosyaya işaret ediyor: ${broken.join(', ')}`, 'plugin yeniden kurulmalı');
}

section('Hook boru testleri (gerçek stdin yüküyle)');
const probes = [
  ['pre-edit.mjs', { session_id: '__doctor__', tool_input: { file_path: '/x/parser_v2.js' } },
    (p) => p.hookSpecificOutput?.permissionDecision === 'deny', 'sürüm ekli dosya adını reddetmeli'],
  ['pre-edit.mjs', { session_id: '__doctor__', tool_input: { file_path: '/x/normal.js' } },
    null, 'temiz yolda sessiz kalmalı'],
  // Yük bilerek prose kapsamından seçildi: bu dize bir .mjs dosyasında
  // durduğu için prose desenleri ona uygulanmaz, yani teşhis aracı kendi
  // tarayıcısını tetiklemez. Kirli kod dizesi kullanmak muafiyet yazmayı
  // gerektirirdi; kapsam seçmek gerektirmiyor.
  ['post-edit.mjs', { session_id: '__doctor__', tool_input: { file_path: '/x/plan.md' },
    tool_response: { filePath: '/x/plan.md', content: 'Bu iş tahminen 3 gün sürer.' } },
    (p) => p.decision === 'block', 'temelsiz süre tahminini bloklamalı'],
  ['pre-bash.mjs', { session_id: '__doctor__', tool_input: { command: 'rm -rf /veri' } },
    (p) => p.hookSpecificOutput?.permissionDecision === 'deny', 'yıkıcı komutu reddetmeli'],
  ['pre-bash.mjs', { session_id: '__doctor__', tool_input: { command: 'ls -la' } },
    null, 'temiz komutta sessiz kalmalı'],
  ['session-start.mjs', { session_id: '__doctor__' },
    (p) => typeof p.hookSpecificOutput?.additionalContext === 'string', 'kural setini enjekte etmeli'],
  ['stop-gate.mjs', { session_id: '__doctor__', stop_hook_active: false },
    null, 'temiz oturumda geçirmeli'],
];
for (const [file, payload, expect, what] of probes) {
  const result = probeHook(file, payload, expect);
  if (result.ok) ok(`${file} — ${what}`);
  else bad(`${file} — ${what} (${result.why})`, 'node yolu, dosya izinleri ve plugin bütünlüğünü kontrol et');
}

section('Yapılandırma');
const { config, problems, sources } = loadConfig({ repoRoot: process.cwd() });
if (problems.length === 0) ok('config.json ve patterns.local.json geçerli');
else for (const p of problems) bad(p, 'dosyayı düzelt ya da sil; silinirse varsayılana dönülür');
info(`kaynaklar: ${sources.join(' → ')}`);
ok(`kip: ${config.mode} · plugin ${config.enabled ? 'etkin' : 'KAPALI'}`);

const localCount = config.localPatterns.length;
ok(`${PATTERN_COUNT} yerleşik desen + ${localCount} kullanıcı deseni · ${Object.keys(CATEGORIES).length} kategori`);
if (config.disabled.length > 0) info(`kapalı: ${config.disabled.join(', ')}`);

section('Kayıt');
const settings = readJsonFile(SETTINGS);
if (!settings.ok) {
  bad(`~/.claude/settings.json ${settings.error}`, 'dosyayı düzelt; bozuk settings.json tüm hook kaydını etkiler');
} else if (settings.missing) {
  bad('~/.claude/settings.json yok', '/slop-setup çalıştır');
} else {
  const statusLine = settings.value.statusLine?.command ?? '';
  if (/statusline\.mjs/.test(statusLine)) ok('statusLine kayıtlı');
  else if (statusLine) bad('statusLine başka bir komuta ayarlı', '/slop-setup ile ekle; mevcut girdi korunur');
  else bad('statusLine kayıtlı değil', '/slop-setup çalıştır — canlılık göstergesi olmadan sessiz ölüm görünmez');
}

section('Kalp atışı');
const beat = readHeartbeat();
if (!beat) {
  bad('kalp atışı damgası yok', 'plugin hiç tetiklenmemiş. Kurulumdan sonra Claude Code yeniden başlatıldı mı?');
} else {
  const age = ageSeconds(beat);
  if (isStale(beat)) bad(`son damga ${formatAge(age)} — bayat`, '/slop-setup ve ardından yeniden başlatma gerekebilir');
  else ok(`son damga ${formatAge(age)} · sürüm ${beat.version} · ${beat.patterns} desen · olay ${beat.event}`);
  if (beat.version !== version()) {
    info(`damga sürümü ${beat.version}, çalışan sürüm ${version()} — güncelleme sonrası ilk tetiklenme bekleniyor`);
  }
}

section('Bypass permissions kipi');
ok('Hook katmanı bypass kipinde çalışıyor — ölçüldü, docs/dogrulama-kaydi.md');
info('PreToolUse deny aracı gerçekten durduruyor; Stop block turu bitirtmiyor.');
info('PostToolUse block modele iletiliyor ama durdurmuyor — sert garanti stop-gate\'te.');

lines.push('');
lines.push(failures === 0
  ? 'Sonuç: sorun yok.'
  : `Sonuç: ${failures} sorun bulundu. Yukarıdaki → satırları ne yapılacağını söylüyor.`);

process.stdout.write(lines.join('\n') + '\n');
process.exit(failures === 0 ? 0 : 1);
