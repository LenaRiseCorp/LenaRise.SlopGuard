import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './pipe.mjs';
import { walkFiles, listFiles, repoRoot } from '../scripts/scan-cli.mjs';

/**
 * Commands do not have to run inside a git repository.
 *
 * Scanning a parent folder that holds several projects is a legitimate use;
 * refusing to work there would be an artificial limit. With no git, the
 * filesystem is walked and every nested `.slopignore` applies to its own subtree.
 */

const base = mkdtempSync(join(tmpdir(), 'slopguard-folder-'));
const cfg = mkdtempSync(join(tmpdir(), 'slopguard-foldercfg-'));
after(() => { rmSync(base, { recursive: true, force: true }); rmSync(cfg, { recursive: true, force: true }); });

const file = (rel, body) => {
  const full = join(base, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, body);
  return full;
};

mkdirSync(join(base, 'proje-a'), { recursive: true });
mkdirSync(join(base, 'proje-b'), { recursive: true });
execFileSync('git', ['init', '-q'], { cwd: join(base, 'proje-a') });
execFileSync('git', ['init', '-q'], { cwd: join(base, 'proje-b') });
file('proje-a/src/a.js', 'try{ a() }catch(e){}\n');
file('proje-b/src/b.js', 'const k = "AKIAIOSFODNN7EXAMPLE"\n');
file('gevsek/c.js', 'if (false) { eski() }\n');
mkdirSync(join(base, 'proje-a/node_modules/paket'), { recursive: true });
file('proje-a/node_modules/paket/index.js', 'try{}catch(e){}\n');

function runCheck(cwd, args = []) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [join(ROOT, 'scripts/check.mjs'), ...args], {
      cwd, encoding: 'utf8', env: { ...process.env, SLOPGUARD_CONFIG_DIR: cfg }, stdio: ['pipe', 'pipe', 'pipe'],
    }), stderr: '' };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('scanning works in a non-git folder and covers nested repositories', () => {
  const r = runCheck(base);
  assert.equal(r.code, 1, 'bulgu varsa sıfır olmayan çıkış');
  assert.match(r.stdout, /folder, no git/);
  assert.match(r.stdout, /proje-a\/src\/a\.js/);
  assert.match(r.stdout, /proje-b\/src\/b\.js/);
  assert.match(r.stdout, /gevsek\/c\.js/);
});

test('the absence of git is not reported as an error', () => {
  assert.doesNotMatch(runCheck(base).stderr, /no git repository found/,
    'klasörde çalışmak meşru; olmayan bir sorunu varmış gibi göstermemeli');
});

test('noise directories are never walked', () => {
  assert.doesNotMatch(runCheck(base).stdout, /node_modules/);
  assert.equal(walkFiles(base).some((rel) => rel.includes('node_modules')), false);
});

test('a nested .slopignore applies to its own subtree', () => {
  writeFileSync(join(base, 'proje-b/.slopignore'), 'src\n');
  const r = runCheck(base);
  assert.doesNotMatch(r.stdout, /proje-b\/src/, 'alt deponun muafiyeti uygulanmalı');
  assert.match(r.stdout, /proje-a\/src\/a\.js/, 'kardeş depo etkilenmemeli');
  rmSync(join(base, 'proje-b/.slopignore'), { force: true });
});

test('a path argument works in a folder too', () => {
  const r = runCheck(base, ['gevsek']);
  assert.match(r.stdout, /gevsek\/c\.js/);
  assert.doesNotMatch(r.stdout, /proje-a/);
});

test('behaviour inside a repository is unchanged', () => {
  const repo = join(base, 'proje-a');
  const r = runCheck(repo);
  assert.match(r.stdout, /changed files|all tracked files/);
  assert.doesNotMatch(r.stdout, /folder, no git/);
});

test('listFiles labels the source', () => {
  assert.equal(listFiles(base, { isRepo: false }).label, 'folder, no git');
  assert.ok(listFiles(base, { isRepo: false }).files.length >= 3);
});

test('repoRoot does not pollute stderr in quiet mode', () => {
  const out = execFileSync(process.execPath, ['-e', `
    import('${join(ROOT, 'scripts/scan-cli.mjs')}').then((m) => {
      process.stdout.write(String(m.repoRoot({ quiet: true })));
    });`], { cwd: base, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  assert.equal(out, 'null');
});

test('a clean folder is reported as clean', () => {
  const clean = mkdtempSync(join(tmpdir(), 'slopguard-clean-'));
  writeFileSync(join(clean, 'ok.js'), 'export const a = 1;\n');
  const r = runCheck(clean);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /clean/);
  rmSync(clean, { recursive: true, force: true });
});
