#!/usr/bin/env node
/**
 * SessionStart → kural seti ve yetenek indeksi enjeksiyonu.
 *
 * Ölçüldü: additionalContext gerçekten modelin bağlamına giriyor
 * (docs/dogrulama-kaydi.md). Bu katman kuralın *niyetini* taşır; sınırı
 * hook'lar koyar. İkisi ayrı olmak zorunda: Replit vakasında talimat büyük
 * harfle ve tekrar tekrar verilmişti, yine de ihlal edildi.
 *
 * Boyut bilinçli tutuluyor. Tam README'yi her oturumda yüklemek AGT-02'nin
 * (aşırı bağlam) kendisi olurdu; buraya yalnızca kural seti, yetenek indeksi
 * ve kullanıcının kendi kuralları girer.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook } from '../lib/hook.mjs';
import { paths } from '../lib/config.mjs';
import { PATTERN_COUNT, CATEGORIES } from '../lib/patterns.mjs';
import { inject, capabilityIndex, fail } from '../lib/report.mjs';
import { detectEngines } from '../lib/project.mjs';

const RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules');
const BASE_RULES = join(RULES_DIR, 'base-rules.md');
const GAME_RULES = join(RULES_DIR, 'game-rules.md');
const LOCAL_RULES_MAX = 8000;

function readIfPresent(file, label) {
  if (!existsSync(file)) return null;
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    fail('session-start', `${label} okunamadı (${file}) — ${error.message}`);
    return null;
  }
}

runHook('session-start', ({ config, repoRoot }) => {
  if (!config.enabled) return;

  const sections = [];

  const base = readIfPresent(BASE_RULES, 'kural seti');
  if (base) sections.push(base.trim());
  else fail('session-start', 'kural seti bulunamadı; yalnızca yetenek indeksi enjekte edilecek');

  // Oyun kuralları yalnızca motor imzası bulunursa. Kullanılmayacak kuralı her
  // oturuma yüklemek aşırı bağlamdır (AGT-02) ve uzun kural seti okunmaz olur.
  const engines = detectEngines(repoRoot);
  if (engines.length > 0) {
    const game = readIfPresent(GAME_RULES, 'oyun kuralları');
    if (game) sections.push(`${game.trim()}\n\nTespit edilen motor: ${engines.join(', ')}.`);
    else fail('session-start', 'oyun kuralları bulunamadı; OYN desenleri yine de etkin');
  }

  let local = readIfPresent(paths.localRules, 'rules.local.md');
  if (local && local.trim().length > 0) {
    if (local.length > LOCAL_RULES_MAX) {
      local = `${local.slice(0, LOCAL_RULES_MAX)}\n\n[rules.local.md kısaltıldı: ${local.length} karakterin ilk ${LOCAL_RULES_MAX}'i alındı. Kısa tut — uzun kural seti okunmaz.]`;
    }
    sections.push(`## Kullanıcının kendi kuralları\n\n${local.trim()}`);
  }

  sections.push(capabilityIndex(config, {
    patternCount: PATTERN_COUNT,
    categories: Object.keys(CATEGORIES).length,
    configDir: paths.dir,
  }));

  inject('SessionStart', sections.join('\n\n---\n\n'));
});
