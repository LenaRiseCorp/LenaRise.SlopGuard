#!/usr/bin/env node
/**
 * /slop-mode strict|explore — oturum kipi.
 *
 * Kalıcı config.json'a dokunmaz; yalnızca bu oturumun durumuna yazar.
 * Sebep: "prototip yapıyorum" geçici bir durumdur, ve geçici gevşetmeyi
 * kalıcı yapılandırmaya yazmak sonraki oturumları da sessizce korumasız
 * bırakırdı. Yeni oturum sert kiple açılır.
 */

import { loadSession, saveSession } from '../lib/session.mjs';
import { currentSessionId } from './current-session.mjs';
import { BRAND } from '../lib/report.mjs';

const requested = (process.argv[2] ?? '').trim().toLowerCase();
const VALID = ['strict', 'explore'];

if (!VALID.includes(requested)) {
  process.stdout.write(`Kullanım: /slop-mode strict|explore\n`);
  process.stdout.write(`  strict   sert kip — desen bulunca durur (varsayılan)\n`);
  process.stdout.write(`  explore  keşif kipi — üslup kurallarını gevşetir\n\n`);
  process.stdout.write(`Keşif kipi geri dönüşsüzlüğü gevşetmez: rm -rf, DROP TABLE,\n`);
  process.stdout.write(`force push, korumalı yollar ve doğrulanmamış paketler her kipte engellenir.\n`);
  process.exit(requested === '' ? 0 : 1);
}

const { id, confident, source } = currentSessionId();
if (!id) {
  process.stdout.write(`${BRAND}: oturum bulunamadı (${source}). /slop-doctor teşhis eder.\n`);
  process.exit(1);
}

const state = loadSession(id);
state.modeOverride = requested;
if (!saveSession(state)) {
  process.stdout.write(`${BRAND}: oturum yazılamadı, kip değişmedi.\n`);
  process.exit(1);
}

process.stdout.write(`${BRAND}: kip "${requested}" — yalnızca bu oturum için (${id}).\n`);
if (!confident) process.stdout.write(`  Oturum kimliği ${source} üzerinden bulundu; kesin değil.\n`);
if (requested === 'explore') {
  process.stdout.write(`  Kalıcı yapılandırma değişmedi; yeni oturum sert kiple açılır.\n`);
  process.stdout.write(`  Geri dönüşsüz komutlar ve korumalı yollar bu kipte de engellenir.\n`);
}
