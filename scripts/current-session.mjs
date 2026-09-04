/**
 * Komut satırından "şu anki oturum" hangisi?
 *
 * Komutlar hook değil; stdin'de session_id almazlar. Kalp atışı damgası her
 * hook tetiklenmesinde bu oturumun kimliğiyle yazıldığı için en güvenilir
 * kaynak odur. Damga yoksa en son güncellenen oturum dosyasına düşülür —
 * ve hangi yoldan bulunduğu çağırana söylenir, çünkü "muhtemelen bu oturumdur"
 * demek ile kanıtlamak arasındaki farkı gizlemek bu projenin karşı olduğu şey.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../lib/config.mjs';
import { read as readHeartbeat, ageSeconds } from '../lib/heartbeat.mjs';

export function currentSessionId({ maxAgeSeconds = 3600 } = {}) {
  const beat = readHeartbeat();
  if (beat?.sessionId && ageSeconds(beat) <= maxAgeSeconds) {
    return { id: beat.sessionId, source: 'kalp atışı', confident: true };
  }

  let newest = null;
  try {
    for (const name of readdirSync(paths.dir)) {
      if (!name.startsWith('session-') || !name.endsWith('.json')) continue;
      const file = join(paths.dir, name);
      const mtime = statSync(file).mtimeMs;
      if (!newest || mtime > newest.mtime) {
        newest = { mtime, id: name.slice('session-'.length, -'.json'.length) };
      }
    }
  } catch (error) {
    return { id: null, source: `oturum dizini okunamadı: ${error.message}`, confident: false };
  }

  if (!newest) return { id: null, source: 'hiç oturum kaydı yok', confident: false };
  return { id: newest.id, source: 'en son güncellenen oturum dosyası', confident: false };
}
