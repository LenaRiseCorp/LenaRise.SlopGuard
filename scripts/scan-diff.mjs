#!/usr/bin/env node
/**
 * CI: bir referansa göre değişen dosyaları tarar.
 *
 * Kullanım: node scripts/scan-diff.mjs --base <sha|ref>
 * --base verilmezse ya da geçersizse tüm izlenen dosyalar taranır; sessizce
 * hiçbir şey taramamak, taramış gibi görünüp korumasız kalmak olurdu.
 */
import { repoRoot, gitFiles, runScan } from './scan-cli.mjs';

const argv = process.argv.slice(2);
const baseIndex = argv.indexOf('--base');
const base = baseIndex !== -1 ? argv[baseIndex + 1] : null;

const root = repoRoot();
if (!root) process.exit(1);

let files = null;
let label = 'tüm izlenen dosyalar';

if (base && /^[0-9a-zA-Z._\/-]+$/.test(base)) {
  files = gitFiles(['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`], root);
  label = `${base}...HEAD`;
  if (files === null) {
    process.stderr.write('LenaRise.SlopGuard: temel referans çözülemedi, tüm dosyalar taranıyor\n');
  }
}

if (files === null) {
  files = gitFiles(['ls-files'], root);
  label = 'tüm izlenen dosyalar';
}
if (!files) process.exit(1);

process.exit(runScan(files, root, label));
