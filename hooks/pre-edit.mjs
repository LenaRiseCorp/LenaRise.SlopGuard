#!/usr/bin/env node
/**
 * PreToolUse: Edit|Write|MultiEdit → test ve korumalı yol savunması.
 *
 * Bu hook'un durdurması gerçek: ölçüm PreToolUse deny'ın bypass permissions
 * modunda bile aracı yürütmediğini gösterdi (docs/dogrulama-kaydi.md).
 * Sert garantinin iki ayağından biri burası.
 *
 * TST kilidi en güçlü mekanizma: ImpossibleBench bulgusu, test dosyası
 * modele görünmediğinde hile oranının sıfıra yaklaştığı yönünde. Testi
 * değiştiremeyen bir agent, testi geçmek için kodu düzeltmek zorunda kalır.
 */

import { relative } from 'node:path';
import { runHook, editedPath } from '../lib/hook.mjs';
import { scanPath, isTestPath, protectedPathReason } from '../lib/scan.mjs';
import { isPathIgnored } from '../lib/config.mjs';
import { deny, formatFindings } from '../lib/report.mjs';

runHook('pre-edit', ({ payload, config, repoRoot }) => {
  const filePath = editedPath(payload);
  if (!filePath) return;

  const shown = repoRoot ? relative(repoRoot, filePath) : filePath;
  if (isPathIgnored(config, filePath, repoRoot)) return;

  // Korumalı yollar kipten bağımsız: bunlar üslup kuralı değil, sır ve
  // bütünlük koruması. Keşif kipi prototip içindir, .env'i açmak için değil.
  const why = protectedPathReason(shown);
  if (why) {
    deny(`LenaRise.SlopGuard: ${shown} korumalı (${why}).\n`
       + `Bu dosyayı agent yazmamalı. Gerçekten gerekiyorsa kullanıcı elle düzenlesin, `
       + `ya da yolu repo kökündeki .slopignore dosyasına ekleyin.`);
    return;
  }

  if (isTestPath(shown) && !config.allowTestWrites) {
    deny(`LenaRise.SlopGuard: ${shown} bir test dosyası (TST-01).\n`
       + `Testi değiştirmek yerine testi geçiren kodu düzelt. Test gerçekten `
       + `değişmeliyse config.json içinde allowTestWrites: true yapın — `
       + `gerekçesini de yazın.`);
    return;
  }

  const findings = scanPath({ filePath: shown, config });
  if (config.mode === 'strict' && findings.some((f) => f.severity === 'block')) {
    deny(formatFindings(findings, { config, target: shown, action: 'block' }));
  }
});
