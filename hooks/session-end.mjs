#!/usr/bin/env node
/**
 * SessionEnd → oturum özeti.
 *
 * METR bulgusu: deneyimli geliştiriciler kendi AI destekli hızlarını 39 puan
 * yanlış tahmin etti. Oturum sonunda öz-beyan yerine ölçüm koymak bu yüzden
 * kozmetik değil — "çok iş çıkardık" hissiyle "N satır, M engellenen slop,
 * K muafiyet" arasındaki fark, verimlilik illüzyonunun (INS-02) tam yeri.
 *
 * Ayrıca eski oturum dosyalarını temizler: her oturum bir dosya bırakıyor ve
 * kimse silmiyorsa bu da bir tür ölü kod birikimi olurdu (KOD-03).
 */

import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { runHook } from '../lib/hook.mjs';
import { sessionSummary } from '../lib/session.mjs';
import { paths } from '../lib/config.mjs';
import { notify, fail, BRAND } from '../lib/report.mjs';

const KEEP_DAYS = 7;

function pruneOldSessions(currentId) {
  const cutoff = Date.now() - KEEP_DAYS * 86400 * 1000;
  let removed = 0;
  let entries;
  try {
    entries = readdirSync(paths.dir);
  } catch (error) {
    fail('session-end', `oturum dizini okunamadı — ${error.message}`);
    return 0;
  }
  for (const name of entries) {
    if (!name.startsWith('session-') || !name.endsWith('.json')) continue;
    if (name === `session-${currentId}.json`) continue;
    const file = join(paths.dir, name);
    try {
      if (statSync(file).mtimeMs < cutoff) { unlinkSync(file); removed++; }
    } catch (error) {
      fail('session-end', `eski oturum silinemedi (${name}) — ${error.message}`);
    }
  }
  return removed;
}

runHook('session-end', ({ state, sessionId }) => {
  pruneOldSessions(String(sessionId).replace(/[^\w-]/g, '_'));

  // Hiç iş yapılmamış oturumda özet gürültüdür.
  if (state.turns === 0 && state.linesWritten === 0) return;

  notify(`${BRAND} — oturum özeti\n\n  ${sessionSummary(state)}`);
});
