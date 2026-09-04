/**
 * Paylaşılan hook koşucusu.
 *
 * Yedi hook aynı beş adımı yapıyor: stdin'i oku, oturumu yükle, yapılandırmayı
 * birleştir, kalp atışını damgala, hatayı görünür kıl. Bunu her dosyada
 * tekrarlamak KOD-01 olurdu — kendi kuralımız.
 *
 * Hata politikası: hook kendi hatası yüzünden ASLA bloklamaz. Kendi bug'ımızın
 * kullanıcının işini durdurması kabul edilemez. Ama hata görünmez de olmaz —
 * stderr'e yazılır, damga yazılamaz, durum çubuğu "bozuk" gösterir. Sessizce
 * geçmek, koruma olduğunu sanmakla aynı sonucu verirdi (INS-04).
 */

import { existsSync } from 'node:fs';
import { dirname, join, parse as parsePath } from 'node:path';
import { loadConfig } from './config.mjs';
import { loadSession, saveSession } from './session.mjs';
import { stamp } from './heartbeat.mjs';
import { fail, exitWhenFlushed } from './report.mjs';

/** stdin'i tamamen okur. Hook protokolü tek JSON nesnesi gönderir. */
export function readStdin() {
  return new Promise((resolve, reject) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', reject);
  });
}

/** cwd'den yukarı doğru .git arar. Bulamazsa null — repo dışında da çalışırız. */
export function findRepoRoot(startDir) {
  let dir = startDir ? String(startDir) : process.cwd();
  const { root } = parsePath(dir);
  while (dir && dir !== root) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return existsSync(join(dir, '.git')) ? dir : null;
}

/**
 * Değişen satır sayısı.
 *
 * tool_response.structuredPatch şeması ölçüldü (docs/dogrulama-kaydi.md):
 * create için boş gelir ve içerik content'te durur; update için hunk'lar
 * "+"/"-" önekli satırlar taşır. Şema beklenmedik gelirse sayaç sıfır kalır,
 * uydurma sayı üretilmez.
 */
export function linesChanged(toolResponse, toolInput) {
  const patch = toolResponse?.structuredPatch;
  if (Array.isArray(patch) && patch.length > 0) {
    let added = 0, removed = 0;
    for (const hunk of patch) {
      for (const line of hunk?.lines ?? []) {
        if (line.startsWith('+')) added++;
        else if (line.startsWith('-')) removed++;
      }
    }
    return { added, removed };
  }
  const content = toolResponse?.content ?? toolInput?.content;
  if (typeof content === 'string') return { added: content.split('\n').length, removed: 0 };
  const added = typeof toolInput?.new_string === 'string' ? toolInput.new_string.split('\n').length : 0;
  const removed = typeof toolInput?.old_string === 'string' ? toolInput.old_string.split('\n').length : 0;
  return { added, removed };
}

/** Düzenlenen dosyanın yolu; araca göre farklı alanda gelebilir. */
export function editedPath(payload) {
  return payload?.tool_input?.file_path
      ?? payload?.tool_response?.filePath
      ?? payload?.tool_input?.notebook_path
      ?? null;
}

/**
 * Hook gövdesini çalıştırır.
 *
 * @param {string} name     stderr'de görünecek hook adı
 * @param {(ctx) => void} handler  ctx: { payload, config, state, sessionId, repoRoot, problems }
 */
export async function runHook(name, handler) {
  let payload;
  try {
    const raw = await readStdin();
    payload = raw.trim() === '' ? {} : JSON.parse(raw);
  } catch (error) {
    fail(name, `stdin ayrıştırılamadı — ${error.message}`);
    exitWhenFlushed(0);
    return;
  }

  // Probe kipi: durum çubuğu bu script'in doğru cevap verdiğini sınarken
  // kullanır. Kalp atışı damgalanmaz ve oturum yazılmaz — aksi hâlde probe
  // kendi kayıt kanıtını üretmiş olurdu, yani çubuk kendi kendine yalan söylerdi.
  // Yapılandırma da sabitlenir: probe mekanizmayı sınar, kullanıcı politikasını değil.
  const probing = process.env.SLOPGUARD_PROBE === '1';

  const sessionId = payload.session_id ?? 'bilinmeyen';
  let state = null;
  try {
    state = loadSession(sessionId);
    const repoRoot = findRepoRoot(payload.cwd);
    const { config, problems } = loadConfig({ repoRoot, sessionMode: state.modeOverride });
    if (!probing) for (const problem of problems) fail(name, problem);

    if (probing) {
      config.mode = 'strict';
      config.disabled = [];
      config.ignoreRules = [];
      config.ui = { ...config.ui, cleanScans: 'silent' };
    } else {
      stamp({ sessionId, mode: config.mode, event: payload.hook_event_name ?? name });
    }

    await handler({ payload, config, state, sessionId, repoRoot, problems });
  } catch (error) {
    fail(name, error);
  }

  if (state && !probing) {
    try { saveSession(state); } catch (error) { fail(name, error); }
  }
  exitWhenFlushed(0);
}
