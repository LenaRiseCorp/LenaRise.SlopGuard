#!/usr/bin/env node
/**
 * /slop-repo-init — repo katmanını kurar (agent-agnostic).
 *
 * Claude Code hook'ları yalnızca Claude Code'u kapsar. Buradaki dosyalar
 * kodu hangi agent yazarsa yazsın çalışır: git hook'u herkesi, CI hepsini.
 *
 * Var olan dosya ezilmez; üzerine yazmak kullanıcının kendi kurulumunu
 * sessizce değiştirmek olurdu.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BRAND } from '../lib/report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let repo;
try {
  repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
} catch (error) {
  process.stdout.write(`${BRAND}: git repo bulunamadı — ${error.message}\n`);
  process.stdout.write('Repo kiti bir git deposuna kurulur. Önce: git init\n');
  process.exit(1);
}

const out = [`${BRAND} repo kiti — ${repo}`, ''];
const done = (t) => out.push(`  + ${t}`);
const kept = (t) => out.push(`  = ${t}`);
const warn = (t) => out.push(`  ! ${t}`);

function writeIfAbsent(rel, content, label) {
  const file = join(repo, rel);
  if (existsSync(file)) { kept(`${rel} zaten var, dokunulmadı`); return; }
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    done(`${rel} — ${label}`);
  } catch (error) {
    warn(`${rel} yazılamadı — ${error.message}`);
  }
}

// AGENTS.md kural setinden türetilir; ikinci bir kopya tutmak DOK-07 olurdu.
let baseRules = null;
try {
  baseRules = readFileSync(join(ROOT, 'rules', 'base-rules.md'), 'utf8');
} catch (error) {
  warn(`kural seti okunamadı, AGENTS.md üretilemedi — ${error.message}`);
}
if (baseRules) {
  const body = baseRules.replace(/^# .*$/m,
    '# AGENTS.md\n\nBu dosyayı Cursor, Codex, Copilot ve Claude Code okur.\n'
    + 'Kaynağı LenaRise.SlopGuard kural setidir; elle düzenlersen bir dahaki\n'
    + '/slop-repo-init üzerine yazmaz, ama kaynakla ayrışır.');
  writeIfAbsent('AGENTS.md', body, 'ortak kural dosyası (agent-agnostic)');
}

writeIfAbsent('.slopignore',
  '# LenaRise.SlopGuard — yol muafiyeti\n'
  + '# Her satır bir glob. Dizin adı altındaki her şeyi kapsar.\n'
  + '# Bir yolu buraya eklemek onu TAMAMEN taramanın dışına çıkarır.\n\n'
  + 'node_modules\ndist\nbuild\nvendor\n\n'
  + '# Oyun motoru üretim dizinleri — varsa açın\n'
  + '# Library\n# Temp\n# Builds\n# .godot\n# Binaries\n# Intermediate\n# Saved\n',
  'proje bazlı muafiyet listesi');

const workflow = join(ROOT, 'templates', 'github-workflow-slop-gate.yml');
if (existsSync(workflow)) {
  try {
    writeIfAbsent('.github/workflows/slop-gate.yml', readFileSync(workflow, 'utf8'), 'CI kapısı');
    out.push('     Not: iş akışındaki OWNER yerine gerçek GitHub hesabını yaz.');
  } catch (error) {
    warn(`CI şablonu okunamadı — ${error.message}`);
  }
} else {
  warn('CI şablonu bulunamadı');
}

const hookSource = join(ROOT, 'templates', 'pre-commit');
const hookTarget = join(repo, '.git', 'hooks', 'pre-commit');
if (!existsSync(hookSource)) {
  warn('pre-commit şablonu bulunamadı');
} else if (existsSync(hookTarget)) {
  kept('.git/hooks/pre-commit zaten var, dokunulmadı');
  out.push(`     Bizimkini eklemek için içeriğini şuradan al: ${hookSource}`);
} else {
  try {
    mkdirSync(dirname(hookTarget), { recursive: true });
    copyFileSync(hookSource, hookTarget);
    chmodSync(hookTarget, 0o755);
    done('.git/hooks/pre-commit — git düzeyinde tarama');
  } catch (error) {
    warn(`pre-commit kurulamadı — ${error.message}`);
  }
}

out.push('');
out.push('  Git hook\'u yalnızca senin makinende çalışır ve klonlanmaz.');
out.push('  Ekip için asıl kapı CI iş akışıdır.');
process.stdout.write(out.join('\n') + '\n');
