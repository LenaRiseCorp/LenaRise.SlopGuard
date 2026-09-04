#!/usr/bin/env node
/**
 * Stop → doğrulama kapısı.
 *
 * Sert garantinin ikinci ve asıl ayağı. Ölçüm şunu gösterdi: PreToolUse deny
 * aracı durdurur, Stop block turu bitirtmez; PostToolUse block ise yalnızca
 * modele iletilir ve görmezden gelinebilir. Bu yüzden post-edit'in bulduğu
 * ihlal oturum defterine yazılıyor ve kilit burada kuruluyor.
 *
 * Üç gerekçeyle bloklar:
 *   1. Defterde düzeltilmemiş ihlal var
 *   2. Kod değişti ama bu turda doğrulama çalışmadı (TST-05)
 *   3. Son commit'ten beri biriken diff gözden geçirilemez boyutta (SUR-02)
 *
 * Döngü koruması: aynı gerekçeyle sınırsız bloklamak kendi AGT-08 kuralımızı
 * ihlal ederdi. Parmak izi tutulur; ihlal kümesi değişiyorsa ilerleme vardır
 * ve sayaç sıfırlanır, değişmiyorsa tavana gelince kapı açılır — ama sessizce
 * değil, aşıldığı açıkça söylenerek. Kapının aşıldığını gizlemek, korumanın
 * hiç olmamasından beter olurdu (INS-04).
 */

import { createHash } from 'node:crypto';
import { runHook } from '../lib/hook.mjs';
import { openViolations, countStopBlock } from '../lib/session.mjs';
import { block, notify, BRAND } from '../lib/report.mjs';

function fingerprint(reasons) {
  return createHash('sha256').update(reasons.join('|')).digest('hex').slice(0, 12);
}

runHook('stop-gate', ({ payload, config, state }) => {
  const reasons = [];
  const detail = [];

  const open = openViolations(state);
  if (open.length > 0) {
    reasons.push(`ihlal:${open.map((v) => `${v.file}:${v.id}:${v.line}`).sort().join(',')}`);
    detail.push(`  ${open.length} düzeltilmemiş ihlal:`);
    for (const v of open.slice(0, 10)) detail.push(`    ${v.id}  ${v.file}:${v.line}  ${v.title}`);
    if (open.length > 10) detail.push(`    … ve ${open.length - 10} tane daha`);
  }

  if (state.codeWritesSinceVerify > 0 && !state.testRunAt) {
    reasons.push(`dogrulama:${state.codeWritesSinceVerify}`);
    detail.push(`  ${state.codeWritesSinceVerify} kod yazımı yapıldı, bu turda hiç test çalışmadı (TST-05).`);
    detail.push('    "Çalışıyor" demeden önce çalıştır.');
  }

  const limit = config.thresholds.maxDiffLines;
  if (state.linesSinceCommit > limit) {
    reasons.push(`diff:${Math.floor(state.linesSinceCommit / 100)}`);
    detail.push(`  Son commit'ten beri ${state.linesSinceCommit} satır değişti, eşik ${limit} (SUR-02).`);
    detail.push('    Gözden geçirilebilir parçalara böl ve commit et.');
  }

  if (reasons.length === 0) return;

  if (config.mode === 'explore') {
    notify(`${BRAND} — keşif kipi, kapı bloklamıyor\n\n${detail.join('\n')}`);
    return;
  }

  const print = fingerprint(reasons);
  const attempts = countStopBlock(state, print);
  const max = config.thresholds.maxStopBlocks;

  if (attempts > max) {
    notify(`${BRAND} — kapı AŞILDI\n\n`
      + `  Aynı gerekçeyle ${attempts - 1} kez bloklandı, ilerleme olmadı; döngüye girmemek için\n`
      + `  geçiriliyor (AGT-08). Aşağıdakiler hâlâ açık:\n\n${detail.join('\n')}\n\n`
      + `  Bu bir onay değil. Devam etmeden önce sen bak.`);
    return;
  }

  block(`${BRAND} — tur bitirilemez (${attempts}/${max})\n\n${detail.join('\n')}\n\n`
    + `  Bunları çöz, sonra bitir. Geçici olarak gevşetmek istersen: /slop-mode explore`);
});
