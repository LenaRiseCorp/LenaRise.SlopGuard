#!/usr/bin/env node
/**
 * Ortak komut satırı tarayıcısı.
 *
 * İki giriş noktası bunu kullanır:
 *   scan-staged.mjs — git pre-commit hook'u (staged dosyalar)
 *   scan-diff.mjs   — CI (bir referansa göre değişen dosyalar)
 *
 * Aynı motor, aynı yapılandırma, aynı çıktı. Farklı olan yalnızca dosya listesi.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { scanFiles } from '../lib/scan.mjs';
import { loadConfig, isPathIgnored } from '../lib/config.mjs';
import { formatFinding, BRAND } from '../lib/report.mjs';

export function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch (error) {
    process.stderr.write(`${BRAND}: git repo bulunamadı — ${error.message}\n`);
    return null;
  }
}

export function gitFiles(args, root) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', cwd: root })
      .split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (error) {
    process.stderr.write(`${BRAND}: dosya listesi alınamadı — ${error.message}\n`);
    return null;
  }
}

/**
 * Listeyi tarar ve sonucu basar.
 * @returns {number} çıkış kodu — bulgu varsa 1
 */
export function runScan(files, root, label) {
  const { config, problems } = loadConfig({ repoRoot: root });
  for (const problem of problems) process.stderr.write(`${BRAND}: ${problem}\n`);

  const { results, scanned, suppressed, total } = scanFiles({
    files,
    config,
    skip: (rel) => isPathIgnored(config, join(root, rel), root),
    read: (rel) => {
      const full = join(root, rel);
      if (!existsSync(full)) return null;   // silinmiş dosya taranmaz
      try {
        return readFileSync(full, 'utf8');
      } catch (error) {
        process.stderr.write(`${BRAND}: okunamadı ${rel} — ${error.message}\n`);
        return null;
      }
    },
  });

  if (total === 0) {
    process.stdout.write(`${BRAND}: ${scanned} dosya tarandı (${label}) · temiz`);
    if (suppressed > 0) process.stdout.write(` · ${suppressed} gerekçeli muafiyet`);
    process.stdout.write('\n');
    return 0;
  }

  process.stdout.write(`${BRAND}: ${label} — ${total} bulgu\n\n`);
  for (const [rel, findings] of results) {
    process.stdout.write(`${rel}\n`);
    for (const f of findings) process.stdout.write(`${formatFinding(f)}\n`);
    process.stdout.write('\n');
  }
  process.stdout.write('Düzelt ya da gerekçeli satır içi muafiyet yaz:\n');
  process.stdout.write('  // slop-guard-ignore <ID>: neden bu satırın böyle kalması gerektiği\n');
  return 1;
}
