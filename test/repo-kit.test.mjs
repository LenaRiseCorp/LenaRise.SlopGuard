import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './pipe.mjs';

const repo = mkdtempSync(join(tmpdir(), 'slopguard-git-'));
const cfg = mkdtempSync(join(tmpdir(), 'slopguard-gitcfg-'));
after(() => { rmSync(repo, { recursive: true, force: true }); rmSync(cfg, { recursive: true, force: true }); });

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
git('init', '-q');
git('config', 'user.email', 'test@example.com');
git('config', 'user.name', 'Test');

function runScript(rel, args = []) {
  try {
    const stdout = execFileSync(process.execPath, [join(ROOT, rel), ...args], {
      cwd: repo, encoding: 'utf8',
      env: { ...process.env, SLOPGUARD_CONFIG_DIR: cfg },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('staged tarayıcı temiz kodu geçirir', () => {
  writeFileSync(join(repo, 'clean.js'), 'export const a = 1;\n');
  git('add', 'clean.js');
  const r = runScript('scripts/scan-staged.mjs');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /temiz/);
});

test('staged tarayıcı kirli kodu 1 ile reddeder — commit durur', () => {
  writeFileSync(join(repo, 'dirty.js'), 'try{ a() }catch(e){}\n');
  git('add', 'dirty.js');
  const r = runScript('scripts/scan-staged.mjs');
  assert.equal(r.code, 1, 'sıfır olmayan çıkış commit i durdurur');
  assert.match(r.stdout, /KOD-05/);
  assert.match(r.stdout, /slop-guard-ignore/, 'kaçış yolu da söylenmeli');
});

test('gerekçeli muafiyet commit i geçirir', () => {
  writeFileSync(join(repo, 'dirty.js'), '// slop-guard-ignore KOD-05: SDK sözleşmesi\ntry{ a() }catch(e){}\n');
  git('add', 'dirty.js');
  const r = runScript('scripts/scan-staged.mjs');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /1 gerekçeli muafiyet/);
});

test('.slopignore staged taramada da geçerli', () => {
  mkdirSync(join(repo, 'vendor'), { recursive: true });
  writeFileSync(join(repo, '.slopignore'), 'vendor\n');
  writeFileSync(join(repo, 'vendor/lib.js'), 'try{}catch(e){}\n');
  git('add', '.slopignore', 'vendor/lib.js');
  assert.equal(runScript('scripts/scan-staged.mjs').code, 0);
});

test('diff tarayıcısı iki commit arasını tarar', () => {
  git('add', '-A'); git('commit', '-q', '-m', 'temel');
  const base = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(repo, 'later.js'), 'const k = "AKIAIOSFODNN7EXAMPLE"\n');
  git('add', 'later.js'); git('commit', '-q', '-m', 'sır eklendi');
  const r = runScript('scripts/scan-diff.mjs', ['--base', base]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /GUV-03/);
  assert.match(r.stdout, /later\.js/);
});

test('geçersiz temel referansta sessizce hiçbir şey taramaz değil, hepsini tarar', () => {
  const r = runScript('scripts/scan-diff.mjs', ['--base', 'boyle-bir-ref-yok']);
  assert.match(r.stdout, /tüm izlenen dosyalar|GUV-03/, 'taramayı atlamak korumasız kalmak olurdu');
});

// ── Şablonların bütünlüğü ───────────────────────────────────────────────

test('pre-commit şablonu çalıştırılabilir ve gerçek bir script e işaret eder', () => {
  const file = join(ROOT, 'templates/pre-commit');
  assert.ok(statSync(file).mode & 0o111, 'çalıştırma biti açık olmalı');
  const body = readFileSync(file, 'utf8');
  assert.match(body, /scripts\/scan-staged\.mjs/);
  assert.ok(statSync(join(ROOT, 'scripts/scan-staged.mjs')).isFile(),
    'şablonun işaret ettiği script gerçekten var olmalı — yoksa doküman-kod ayrışması (DOK-07)');
});

test('CI şablonunun çağırdığı script var', () => {
  const body = readFileSync(join(ROOT, 'templates/github-workflow-slop-gate.yml'), 'utf8');
  assert.match(body, /scripts\/scan-diff\.mjs/);
  assert.ok(statSync(join(ROOT, 'scripts/scan-diff.mjs')).isFile());
});

test('pre-commit tarayıcı bulunamazsa commit i engellemez ama sessiz kalmaz', () => {
  const body = readFileSync(join(ROOT, 'templates/pre-commit'), 'utf8');
  assert.match(body, /taranmadı/);
  assert.match(body, /exit 0/);
});
