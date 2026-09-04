#!/usr/bin/env node
/**
 * /slop-check [yol...] — talep üzerine tarama.
 *
 * Git deposunda: değişmiş dosyalar (yoksa izlenenlerin tamamı).
 * Sıradan bir klasörde: dosya sistemi yürünür. Komut bir depo içinde
 * çalıştırılmak zorunda değil — birden çok proje barındıran bir üst dizinde
 * de anlamlı, ve orada çalışmaması yapay bir kısıt olurdu.
 */

import { statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoRoot, runScan, listFiles, walkFiles } from './scan-cli.mjs';
import { BRAND } from '../lib/report.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const detected = repoRoot({ quiet: true });
const root = detected ?? process.cwd();

function expand(target) {
  const full = join(root, target);
  let info;
  try {
    info = statSync(full);
  } catch (error) {
    process.stderr.write(`${BRAND}: bulunamadı ${target} — ${error.message}\n`);
    return [];
  }
  if (info.isFile()) return [relative(root, full)];
  return walkFiles(full).map((rel) => relative(root, join(full, rel)));
}

let files;
let label;
if (args.length > 0) {
  files = args.flatMap(expand);
  label = args.join(' ');
} else {
  ({ files, label } = listFiles(root, { isRepo: Boolean(detected) }));
}

if (files.length === 0) {
  process.stdout.write(`${BRAND}: taranacak dosya yok.\n`);
  process.exit(0);
}

process.exit(runScan([...new Set(files)], root, label));
