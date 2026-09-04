#!/usr/bin/env node
/**
 * Durum çubuğu başlatıcısı — sürümden bağımsız.
 *
 * settings.json bu dosyaya işaret eder, plugin cache'ine değil. Sebep kurulum
 * provasında ölçüldü: cache yolu sürüm numarası içeriyor
 * (.../lenarise-slopguard/0.1.2/bin/statusline.mjs) ve her güncelleme o yolu
 * geçersiz kılıyor. Sürümlü yol yazmak, her güncellemede çubuğu sessizce
 * kırardı — koruma var sanılırken bozuk olması, bu aracın engellemek için
 * var olduğu durumun ta kendisi.
 *
 * Bu dosya kullanıcının yapılandırma dizininde yaşar; plugin güncellemesi
 * ona dokunmaz. Yaptığı tek iş en yeni kurulu sürümü bulup ona devretmek.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CACHE = join(homedir(), '.claude', 'plugins', 'cache',
  'lenarise-slopguard', 'lenarise-slopguard');

function newestVersion() {
  if (!existsSync(CACHE)) return null;
  let entries;
  try {
    entries = readdirSync(CACHE, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (error) {
    process.stderr.write(`LenaRise.SlopGuard [launcher] cache okunamadı — ${error.message}\n`);
    return null;
  }
  const usable = entries.filter((name) => existsSync(join(CACHE, name, 'bin', 'statusline.mjs')));
  if (usable.length === 0) return null;
  usable.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return join(CACHE, usable[usable.length - 1], 'bin', 'statusline.mjs');
}

const target = newestVersion();
if (!target) {
  // Kurulu sürüm yok. Bunu söylemek, sessiz kalmaktan iyidir: kullanıcı
  // korumanın kaldırıldığını çubuktan görür.
  process.stdout.write('SlopGuard ⚠️ kurulu değil');
  process.exit(0);
}

await import(`file://${target}`);
