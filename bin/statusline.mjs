#!/usr/bin/env node
/**
 * Durum çubuğu — settings.json'dan çağrılır, plugin ölse bile çalışır.
 *
 * Bu script kasıtlı olarak plugin'in dışında yaşıyor. Mantıksal tuzak şu:
 * hook'lar kayıtlı değilse hiçbir hook çalışmaz, "çalışıyor musun?" diye
 * soracak hook dahil. Yokluk, yok olan şeye sordurularak tespit edilemez.
 *
 * "canlı" demek için İKİ ayrı kanıt gerekir ve ikisi farklı şeyi kanıtlar:
 *
 *   Kayıt          — kalp atışı damgası BU oturumun kimliğini taşıyor mu?
 *                    Damgayı user-prompt.mjs atar; taşıyorsa Claude Code
 *                    hook'u tanıyor ve tetikliyor demektir.
 *   Çalışabilirlik — post-edit.mjs sentetik yüke şu an doğru cevap veriyor mu?
 *                    Kayıtlı olup node yolu bozulmuş olabilir.
 *
 * Tek kanıt yetmez ve belirsizlik "canlı" diye yuvarlanmaz: ilk mesajdan önce
 * kayıt kanıtlanamaz, o yüzden iddia edilmez — "hazır" denir.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, openSync, readSync, closeSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, paths } from '../lib/config.mjs';
import { exitWhenFlushed } from '../lib/report.mjs';
import { loadSession } from '../lib/session.mjs';
import { read as readHeartbeat, ageSeconds, formatAge } from '../lib/heartbeat.mjs';
import { findRepoRoot } from '../lib/hook.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRE_EDIT = join(HERE, '..', 'hooks', 'pre-edit.mjs');
const PROBE_CACHE = join(paths.dir, 'probe.json');
const PROBE_TTL_MS = 60_000;
const BRAND = 'SlopGuard';

/** Çubuk hiçbir şeyi sessizce yutmaz; ama çökmez de. Not stderr'e gider. */
function warn(message) {
  process.stderr.write(`LenaRise.SlopGuard [statusline] ${message}\n`);
}

/**
 * pre-edit.mjs'e sentetik yük gönderir ve beklenen deny cevabını doğrular.
 *
 * Hedef bilerek pre-edit: gerçek durdurma yetkisi olan hook o, dolayısıyla
 * "çalışıyor mu?" sorusunun en anlamlı muhatabı. Yük olarak sürüm ekli bir
 * dosya adı seçildi çünkü yol deseni dosya *adında* aranır — bu dize kaynak
 * kodda zararsız durur ve kendi tarayıcımızı tetiklemez. Kirli kod dizesi
 * kullanmak, kendi kuralımıza muafiyet yazmayı gerektirirdi.
 *
 * SLOPGUARD_PROBE=1 kalp atışını ve oturum yazımını kapatır — probe kendi
 * kayıt kanıtını üretemez, yoksa çubuk kendi kendine yalan söylerdi.
 */
function runProbe(cwd) {
  const payload = {
    session_id: '__probe__',
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: '/__slopguard_probe__/parser_v2.js', content: '' },
  };
  try {
    const out = execFileSync(process.execPath, [PRE_EDIT], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, SLOPGUARD_PROBE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const parsed = JSON.parse(out);
    const decision = parsed.hookSpecificOutput ?? {};
    const ok = decision.permissionDecision === 'deny'
      && /KOD-01/.test(decision.permissionDecisionReason ?? '');
    return { ok, reason: ok ? null : 'beklenen deny cevabı gelmedi' };
  } catch (error) {
    // Başarısızlık sonucun kendisi: script cevap vermiyor. Gerekçe önbelleğe
    // yazılır, /slop-doctor onu okuyup ne olduğunu söyleyebilsin diye.
    return { ok: false, reason: error.message };
  }
}

function readProbeCache() {
  if (!existsSync(PROBE_CACHE)) return null;
  try {
    const cached = JSON.parse(readFileSync(PROBE_CACHE, 'utf8'));
    return Date.now() - cached.ts < PROBE_TTL_MS ? cached : null;
  } catch (error) {
    warn(`probe önbelleği okunamadı, yeniden ölçülüyor — ${error.message}`);
    return null;
  }
}

/**
 * Probe sonucu, 60 saniyelik önbellekle. Önbellek performans için değil,
 * nezaket için: çubuk her yenilemede node süreci doğurmasın.
 */
function probeResult(cwd) {
  const cached = readProbeCache();
  if (cached) return cached;
  const result = runProbe(cwd);
  const record = { ts: Date.now(), ok: result.ok, reason: result.reason };
  try {
    writeFileSync(PROBE_CACHE, JSON.stringify(record));
  } catch (error) {
    warn(`probe önbelleği yazılamadı — ${error.message}`);
  }
  return record;
}

/**
 * Bu oturumda kullanıcı hiç mesaj gönderdi mi?
 *
 * Kayıt kanıtının yokluğu tek başına "kayıtsız" demek değil: ilk mesajdan önce
 * hiçbir hook tetiklenmemiş olması normaldir. Transcript, statusLine'a gelen
 * ve plugin'den bağımsız olan tek kanıt. İlk kullanıcı mesajı dosyanın
 * başlarında olduğu için yalnızca ilk parça okunur.
 */
function promptSubmitted(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return false;
  let fd;
  try {
    const size = statSync(transcriptPath).size;
    if (size === 0) return false;
    const length = Math.min(size, 256 * 1024);
    const buffer = Buffer.alloc(length);
    fd = openSync(transcriptPath, 'r');
    readSync(fd, buffer, 0, length, 0);
    return /"type"\s*:\s*"user"/.test(buffer.toString('utf8'));
  } catch (error) {
    warn(`transcript okunamadı, kayıt durumu belirsiz sayılıyor — ${error.message}`);
    return false;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch (error) {
        warn(`transcript kapatılamadı — ${error.message}`);
      }
    }
  }
}

function render(status, { config, state, beat, payload }) {
  if (config.ui.statusLine === 'minimal') {
    return status.live ? `${BRAND} ${status.label} · ${state.blocked}` : `${BRAND} ${status.label}`;
  }
  if (!status.live) {
    const extra = status.detail ? ` · ${status.detail}` : '';
    return `${BRAND} ${status.label}${extra}`;
  }
  const t = config.thresholds;
  const added = payload?.cost?.total_lines_added ?? 0;
  const removed = payload?.cost?.total_lines_removed ?? 0;
  const parts = [
    `${BRAND} ${status.label}`,
    config.mode === 'explore' ? 'keşif' : 'sert',
    `${state.blocked} engellendi`,
    `tur ${state.turns}/${t.contextTurns}`,
    `+${added}/-${removed}`,
    state.testRunAt ? `test ${formatAge(Math.round((Date.now() - state.testRunAt) / 1000))}` : 'test yok',
  ];
  const open = Object.keys(state.violations ?? {}).length;
  if (open > 0) parts.push(`${open} açık ihlal`);
  if (state.suppressions > 0) parts.push(`${state.suppressions} muafiyet`);
  void beat;
  return parts.join(' · ');
}

function main(raw) {
  let payload = {};
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    warn(`stdin ayrıştırılamadı, boş yükle devam ediliyor — ${error.message}`);
  }

  const cwd = payload.cwd ?? payload.workspace?.current_dir ?? process.cwd();
  const { config } = loadConfig({ repoRoot: findRepoRoot(cwd) });

  if (config.ui.statusLine === 'off') return '';
  if (!config.enabled) return `${BRAND} kapalı`;

  const state = loadSession(payload.session_id ?? 'bilinmeyen');
  const beat = readHeartbeat();

  const probe = probeResult(cwd);
  if (!probe.ok) {
    return render({ live: false, label: '⚠️ bozuk', detail: probe.reason ?? 'script cevap vermiyor' },
      { config, state, beat, payload });
  }

  const registered = Boolean(beat?.sessionId) && beat.sessionId === payload.session_id;
  if (registered) {
    return render({ live: true, label: 'canlı' }, { config, state, beat, payload });
  }

  if (promptSubmitted(payload.transcript_path)) {
    const age = beat ? formatAge(ageSeconds(beat)) : 'hiç';
    return render({ live: false, label: '⚠️ kayıtsız', detail: `son damga ${age}` }, { config, state, beat, payload });
  }

  return render({ live: false, label: 'hazır' }, { config, state, beat, payload });
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let line;
  try {
    line = main(raw);
  } catch (error) {
    // Çubuk hiçbir koşulda çökmez: çökerse Claude Code hata gösterir ve
    // kullanıcı korumanın durumunu hiç göremez.
    process.stderr.write(`LenaRise.SlopGuard [statusline] hata: ${error.stack ?? error}\n`);
    line = `${BRAND} ⚠️ bozuk`;
  }
  if (line) process.stdout.write(line);
  exitWhenFlushed(0);
});
