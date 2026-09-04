#!/usr/bin/env node
/**
 * /slop-check [yol...] — talep üzerine tarama.
 * Yol verilmezse çalışma ağacındaki izlenen ve değişmiş dosyalar taranır.
 */

import { execFileSync } from 'node:child_process';
import { statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoRoot, gitFiles, runScan } from './scan-cli.mjs';
import { BRAND } from '../lib/report.mjs';

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const root = repoRoot() ?? process.cwd();

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
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === '.git' || entry === 'node_modules') continue;
      const child = join(dir, entry);
      if (statSync(child).isDirectory()) walk(child);
      else out.push(relative(root, child));
    }
  };
  walk(full);
  return out;
}

let files;
let label;
if (args.length > 0) {
  files = args.flatMap(expand);
  label = args.join(' ');
} else {
  const changed = gitFiles(['status', '--porcelain', '--untracked-files=all'], root)
    ?.map((line) => line.slice(3).trim())
    .filter(Boolean) ?? [];
  files = changed;
  label = 'değişmiş dosyalar';
  if (files.length === 0) {
    files = gitFiles(['ls-files'], root) ?? [];
    label = 'tüm izlenen dosyalar';
  }
}

if (files.length === 0) {
  process.stdout.write(`${BRAND}: taranacak dosya yok.\n`);
  process.exit(0);
}

process.exit(runScan([...new Set(files)], root, label));
