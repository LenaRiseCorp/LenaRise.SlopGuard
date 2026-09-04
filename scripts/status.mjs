#!/usr/bin/env node
/**
 * /slop-status — bu oturumun ölçümleri.
 *
 * İki kaynak var ve ayrımı gizlenmiyor:
 *
 *   Oturum sayaçları  hook'ların kaydettiği. Hook tetiklenmediyse boş kalır —
 *                     ve boş sayaç "temiz" demek değildir, "ölçülmedi" demektir.
 *   Canlı tarama      bu komut çalışırken yapılan. Hook'lardan bağımsız,
 *                     dolayısıyla hook'lar hiç çalışmamış olsa bile gerçeği verir.
 *
 * Komut elle çağrılır, yani ui.chatStatus ayarından etkilenmez: periyodik satır
 * kapalı olsa da bu komut her zaman cevap döndürür.
 */

import { loadConfig, isPathIgnored } from '../lib/config.mjs';
import { scanFiles } from '../lib/scan.mjs';
import { repoRoot, gitFiles } from './scan-cli.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadSession, openViolations, sessionSummary } from '../lib/session.mjs';
import { read as readHeartbeat, ageSeconds, formatAge } from '../lib/heartbeat.mjs';
import { PATTERN_COUNT } from '../lib/patterns.mjs';
import { currentSessionId } from './current-session.mjs';
import { BRAND } from '../lib/report.mjs';

const out = [];
const { id, source, confident } = currentSessionId();

if (!id) {
  out.push(`${BRAND}: bu oturuma ait kayıt bulunamadı (${source}).`);
  out.push('Hook hiç tetiklenmemiş olabilir — /slop-doctor teşhis eder.');
  process.stdout.write(out.join('\n') + '\n');
  process.exit(0);
}

const { config } = loadConfig({ repoRoot: process.cwd() });
const state = loadSession(id);
const beat = readHeartbeat();

out.push(`${BRAND} — oturum ${id}`);
if (!confident) out.push(`  (kimlik ${source} üzerinden bulundu; kesin değil)`);
out.push('');
out.push(`  Kip           ${config.mode}${state.modeOverride ? ' (oturum ezmesi)' : ''}${config.enabled ? '' : ' · PLUGIN KAPALI'}`);
out.push(`  Desenler      ${PATTERN_COUNT} yerleşik + ${config.localPatterns.length} kullanıcı${config.disabled.length ? ` · kapalı: ${config.disabled.join(', ')}` : ''}`);
out.push(`  Kalp atışı    ${beat ? formatAge(ageSeconds(beat)) : 'yok'}`);
out.push('');
out.push(`  Ölçüm         ${sessionSummary(state)}   (hook kaydı)`);
out.push(`  Okunan satır  ${state.linesRead}${state.linesWritten - state.linesRead >= config.thresholds.comprehensionGap ? '  ← kavrayış borcu eşiğin üstünde (INS-01)' : ''}`);
out.push(`  Commit borcu  ${state.linesSinceCommit} satır${state.linesSinceCommit > config.thresholds.uncommittedLines ? '  ← eşiğin üstünde (AGT-06)' : ''}`);
out.push(`  Doğrulama     ${state.testRunAt ? `test ${formatAge(Math.round((Date.now() - state.testRunAt) / 1000))}` : 'bu turda test çalışmadı (TST-05)'}`);

const open = openViolations(state);
if (open.length > 0) {
  out.push('');
  out.push(`  Açık ihlaller (stop kapısı bunları bekliyor):`);
  for (const v of open) out.push(`    ${v.id}  ${v.file}:${v.line}  ${v.title}`);
}

// Canlı tarama: hook'ların kaydettiğine güvenmeden, şimdi ölç.
const root = repoRoot();
if (root) {
  const files = (gitFiles(['status', '--porcelain', '--untracked-files=all'], root) ?? [])
    .map((line) => line.slice(3).trim()).filter(Boolean);
  const target = files.length > 0 ? files : (gitFiles(['ls-files'], root) ?? []);
  const { results, scanned, total, suppressed: sup } = scanFiles({
    files: [...new Set(target)],
    config,
    skip: (rel) => isPathIgnored(config, join(root, rel), root),
    read: (rel) => {
      const full = join(root, rel);
      if (!existsSync(full)) return null;
      try { return readFileSync(full, 'utf8'); } catch { return null; }
    },
  });
  out.push('');
  out.push(`  Canlı tarama  ${scanned} dosya (${files.length > 0 ? 'değişmiş' : 'tüm izlenen'})`
    + ` · ${total === 0 ? 'temiz' : `${total} bulgu`}${sup > 0 ? ` · ${sup} gerekçeli muafiyet` : ''}`);
  for (const [rel, findings] of results.slice(0, 10)) {
    out.push(`    ${rel}`);
    for (const f of findings.slice(0, 5)) out.push(`      ${f.id}  satır ${f.line}  ${f.title}`);
  }
  if (results.length > 10) out.push(`    … ve ${results.length - 10} dosya daha`);
} else {
  out.push('');
  out.push('  Canlı tarama  git deposu değil, atlandı');
}

// Sayaçlar boşsa sebebini söyle: boş sayaç "temiz" değil, "ölçülmedi" demektir.
if (state.turns > 0 && Object.keys(state.filesWritten).length === 0) {
  out.push('');
  out.push('  Not: bu oturumda hiç dosya yazımı kaydedilmedi.');
  out.push('    Muhtemel sebep: dosyalar Bash içinden yazıldı (cat > , python -c , sed -i).');
  out.push('    post-edit yalnızca Edit/Write araçlarını dinler; Bash üzerinden yazılan');
  out.push('    içerik ona görünmez. Yukarıdaki canlı tarama bu boşluğu kapatır.');
}

const cats = Object.entries(state.byCategory ?? {});
if (cats.length > 0) {
  out.push('');
  out.push(`  Kategoriye göre: ${cats.map(([c, n]) => `${c}=${n}`).join(' · ')}`);
}

if (state.warned.length > 0) {
  out.push('');
  out.push(`  Gösterilen uyarılar: ${state.warned.join(', ')}`);
}

process.stdout.write(out.join('\n') + '\n');
