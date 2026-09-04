#!/usr/bin/env node
/**
 * Kendi kendini tarama.
 *
 * Bağlayıcı taahhüt: plugin kendi kaynak kodunu kendi tarayıcısından geçirir.
 * Kendi kodunda takılıyorsa ya desen yanlıştır ya kod — ikisinden biri
 * düzeltilir, muafiyet yazılmaz.
 *
 * Tarama yüzeyi runtime ile aynı tutulur: test yolları hariç. Bu bir muafiyet
 * değil, sadakat meselesi — pre-edit'in TST kilidi test dosyalarına yazmayı
 * zaten reddediyor, yani post-edit bir test dosyasını hiçbir zaman görmüyor.
 * Runtime'ın taramadığı bir yüzeyi taramak, olmayan bir davranışı sınamak olurdu.
 * Yine de test dizinindeki bulgu sayısı bilgi olarak basılır; hiçbir şey gizlenmez.
 *
 * Çıkış kodu: bulgu varsa 1, temizse 0. CI bunu kapı olarak kullanır.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { scanContent, scanPath, actionable, suppressed, isTestPath } from '../lib/scan.mjs';
import { formatFinding } from '../lib/report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const results = [];
let scanned = 0;
let suppressedCount = 0;
let fixtureFindings = 0;

for (const file of files) {
  const rel = relative(ROOT, file);
  if (isTestPath(rel)) {
    try {
      const body = readFileSync(file, 'utf8');
      fixtureFindings += actionable(scanContent({ filePath: rel.replace(/\.test\./, '.'), content: body })).length;
    } catch (error) {
      process.stderr.write(`fixture sayımı başarısız: ${rel} — ${error.message}\n`);
    }
    continue;
  }
  const pathFindings = scanPath({ filePath: rel });
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch (error) {
    process.stderr.write(`okunamadı: ${rel} — ${error.message}\n`);
    continue;
  }
  const contentFindings = scanContent({ filePath: rel, content });
  if (contentFindings.length > 0 || pathFindings.length > 0) scanned++;
  else scanned++;
  suppressedCount += suppressed(contentFindings).length;
  const live = [...actionable(pathFindings), ...actionable(contentFindings)];
  if (live.length > 0) results.push([rel, live]);
}

const total = results.reduce((n, [, f]) => n + f.length, 0);

const fixtureNote = fixtureFindings > 0
  ? `\n  (test fixture'larında ${fixtureFindings} kasıtlı desen var; runtime bu yolları taramaz)`
  : '';

if (total === 0) {
  process.stdout.write(`Kendi kendini tarama: ${scanned} dosya · temiz`);
  if (suppressedCount > 0) process.stdout.write(` · ${suppressedCount} gerekçeli muafiyet`);
  process.stdout.write(`${fixtureNote}\n`);
  process.exit(0);
}

process.stdout.write(`Kendi kendini tarama: ${scanned} dosya tarandı, ${total} bulgu\n\n`);
for (const [rel, findings] of results) {
  process.stdout.write(`${rel}\n`);
  for (const f of findings) process.stdout.write(`${formatFinding(f)}\n`);
  process.stdout.write('\n');
}
process.exit(1);
