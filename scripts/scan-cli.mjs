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
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanFiles } from '../lib/scan.mjs';
import { loadConfig, isPathIgnored, parseSlopignore } from '../lib/config.mjs';
import { formatFinding, BRAND } from '../lib/report.mjs';

/**
 * Git kökü; burası bir depo değilse null.
 *
 * `quiet` ile stderr'e yazmaz: git olmaması her zaman hata değildir. Bir
 * klasörde tarama yapmak meşru bir kullanım ve orada "repo bulunamadı"
 * uyarısı basmak, olmayan bir sorunu varmış gibi göstermek olurdu.
 */
export function repoRoot({ quiet = false } = {}) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (!quiet) process.stderr.write(`${BRAND}: git repo bulunamadı — ${error.message}\n`);
    return null;
  }
}

/** Yürüyüş sırasında hiç girilmeyen dizinler. */
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor',
  '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.cache', 'coverage',
  // Oyun motorlarının üretim dizinleri. Bunlar yalnızca gürültü değil, boyut
  // sorunu: Unity'nin Library dizini yüz binlerce dosya içerebilir ve
  // yürüyüşü dakikalarca uzatır.
  'Library', 'Temp', 'Logs', 'UserSettings', 'Builds', '.godot', '.import',
  'Binaries', 'Intermediate', 'Saved', 'DerivedDataCache', 'obj', 'bin',
]);

/**
 * Dosya sistemini yürür. Git kullanılmadığı için birden çok depo içeren bir
 * klasörde de çalışır; iç içe her `.slopignore` kendi alt ağacında geçerlidir.
 */
export function walkFiles(root, { maxFiles = 20000 } = {}) {
  const found = [];
  const walk = (dir, rules) => {
    if (found.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      process.stderr.write(`${BRAND}: dizin okunamadı ${relative(root, dir) || '.'} — ${error.message}\n`);
      return;
    }

    // Bu dizindeki .slopignore alt ağacın tamamı için geçerli olur.
    let active = rules;
    const ignoreFile = join(dir, '.slopignore');
    if (existsSync(ignoreFile)) {
      try {
        active = [...rules, ...parseSlopignore(readFileSync(ignoreFile, 'utf8')).map((r) => ({ ...r, base: dir }))];
      } catch (error) {
        process.stderr.write(`${BRAND}: .slopignore okunamadı ${relative(root, ignoreFile)} — ${error.message}\n`);
      }
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const ignored = active.some((rule) => rule.re.test(relative(rule.base, full).split('\\').join('/')));
      if (ignored) continue;
      if (entry.isDirectory()) walk(full, active);
      else if (entry.isFile()) found.push(relative(root, full));
      if (found.length >= maxFiles) return;
    }
  };
  walk(root, []);
  return found;
}

/**
 * Taranacak dosya listesi ve etiketi.
 *
 * Git deposundaysak değişmiş dosyalar (yoksa izlenenlerin tamamı) taranır —
 * hızlı ve anlamlı. Depo değilsek dosya sistemi yürünür, böylece komut sıradan
 * bir klasörde ve birden çok depo içeren bir üst dizinde de çalışır.
 */
export function listFiles(root, { isRepo }) {
  if (isRepo) {
    const changed = (gitFiles(['status', '--porcelain', '--untracked-files=all'], root) ?? [])
      .map((line) => line.slice(3).trim()).filter(Boolean);
    if (changed.length > 0) return { files: [...new Set(changed)], label: 'değişmiş dosyalar' };
    return { files: gitFiles(['ls-files'], root) ?? [], label: 'tüm izlenen dosyalar' };
  }
  return { files: walkFiles(root), label: 'git dışı klasör' };
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
