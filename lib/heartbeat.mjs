/**
 * Kalp atışı damgası — canlılık primitifi.
 *
 * Mantıksal tuzak: hook'lar kayıtlı değilse hiçbir hook çalışmaz, "çalışıyor
 * musun?" diye soracak hook dahil. Yokluk, yok olan şeye sordurularak tespit
 * edilemez. Bu yüzden her tetiklenmede diske damga yazılır ve "canlı mı?"
 * sorusu bir dosya kontrolüne dönüşür — cevaplamak için plugin'in canlı
 * olması gerekmez.
 *
 * Damgayı üç bağımsız tüketici okur: statusLine script'i (settings.json'da
 * yaşar), ~/.claude/CLAUDE.md kuralı ve /slop-doctor.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from './config.mjs';
import { PATTERN_COUNT } from './patterns.mjs';
import { fail } from './report.mjs';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');

let cachedVersion = null;
/** package.json'daki sürüm. Okunamazsa "bilinmeyen" — uydurulmaz. */
export function version() {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = JSON.parse(readFileSync(PKG, 'utf8')).version ?? 'bilinmeyen';
  } catch (error) {
    fail('heartbeat', `package.json okunamadı — ${error.message}`);
    cachedVersion = 'bilinmeyen';
  }
  return cachedVersion;
}

/**
 * Damgayı yazar. Atomik: yarı yazılmış damga "bozuk" olarak okunur ve
 * durum çubuğunu yanlış yönlendirirdi.
 */
export function stamp({ sessionId, mode, event }) {
  const file = paths.heartbeat;
  const tmp = `${file}.${process.pid}.tmp`;
  const body = {
    ts: Date.now(),
    version: version(),
    patterns: PATTERN_COUNT,
    mode: mode ?? 'strict',
    sessionId: sessionId ?? null,
    event: event ?? null,
  };
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(tmp, JSON.stringify(body, null, 2));
    renameSync(tmp, file);
    return body;
  } catch (error) {
    fail('heartbeat', `damga yazılamadı (${file}) — ${error.message}`);
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch (cleanupError) { fail('heartbeat', `geçici damga silinemedi — ${cleanupError.message}`); }
    }
    return null;
  }
}

/** Damgayı okur. Yoksa null; bozuksa null ve stderr'e not. */
export function read() {
  const file = paths.heartbeat;
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return Number.isFinite(parsed?.ts) ? parsed : null;
  } catch (error) {
    fail('heartbeat', `damga okunamadı — ${error.message}`);
    return null;
  }
}

export function ageSeconds(beat, now = Date.now()) {
  if (!beat?.ts) return Infinity;
  return Math.max(0, Math.round((now - beat.ts) / 1000));
}

/** Damga bayat mı? Varsayılan eşik 24 saat. */
export function isStale(beat, maxAgeSeconds = 86400, now = Date.now()) {
  return ageSeconds(beat, now) > maxAgeSeconds;
}

/** "3 gün önce" gibi okunur yaş. Durum çubuğu ve /slop-doctor kullanır. */
export function formatAge(seconds) {
  if (!Number.isFinite(seconds)) return 'hiç';
  if (seconds < 60) return `${seconds} sn önce`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} dk önce`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} sa önce`;
  return `${Math.floor(seconds / 86400)} gün önce`;
}
