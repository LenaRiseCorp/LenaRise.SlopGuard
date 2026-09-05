import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, statSync, existsSync } from 'node:fs';
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

test('the staged scanner passes clean code', () => {
  writeFileSync(join(repo, 'clean.js'), 'export const a = 1;\n');
  git('add', 'clean.js');
  const r = runScript('scripts/scan-staged.mjs');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /clean/);
});

test('the staged scanner refuses dirty code with exit 1', () => {
  writeFileSync(join(repo, 'dirty.js'), 'try{ a() }catch(e){}\n');
  git('add', 'dirty.js');
  const r = runScript('scripts/scan-staged.mjs');
  assert.equal(r.code, 1, 'sıfır olmayan çıkış commit i durdurur');
  assert.match(r.stdout, /CODE-05/);
  assert.match(r.stdout, /slop-guard-ignore/, 'kaçış yolu da söylenmeli');
});

test('a reasoned waiver lets the commit through', () => {
  writeFileSync(join(repo, 'dirty.js'), '// slop-guard-ignore CODE-05: SDK sözleşmesi\ntry{ a() }catch(e){}\n');
  git('add', 'dirty.js');
  const r = runScript('scripts/scan-staged.mjs');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /1 reasoned waiver/);
});

test('.slopignore applies to the staged scan too', () => {
  mkdirSync(join(repo, 'vendor'), { recursive: true });
  writeFileSync(join(repo, '.slopignore'), 'vendor\n');
  writeFileSync(join(repo, 'vendor/lib.js'), 'try{}catch(e){}\n');
  git('add', '.slopignore', 'vendor/lib.js');
  assert.equal(runScript('scripts/scan-staged.mjs').code, 0);
});

test('the diff scanner scans between two commits', () => {
  git('add', '-A'); git('commit', '-q', '-m', 'temel');
  const base = git('rev-parse', 'HEAD').trim();
  writeFileSync(join(repo, 'later.js'), 'const k = "AKIAIOSFODNN7EXAMPLE"\n');
  git('add', 'later.js'); git('commit', '-q', '-m', 'sır eklendi');
  const r = runScript('scripts/scan-diff.mjs', ['--base', base]);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /SEC-03/);
  assert.match(r.stdout, /later\.js/);
});

test('an invalid base reference scans everything rather than nothing', () => {
  const r = runScript('scripts/scan-diff.mjs', ['--base', 'boyle-bir-ref-yok']);
  assert.match(r.stdout, /all tracked files|SEC-03/, 'taramayı atlamak korumasız kalmak olurdu');
});

// ── Template integrity ───────────────────────────────────────────────────

test('the pre-commit template is executable and points at a real script', () => {
  const file = join(ROOT, 'templates/pre-commit');
  assert.ok(statSync(file).mode & 0o111, 'çalıştırma biti açık olmalı');
  const body = readFileSync(file, 'utf8');
  assert.match(body, /scripts\/scan-staged\.mjs/);
  assert.ok(statSync(join(ROOT, 'scripts/scan-staged.mjs')).isFile(),
    'şablonun işaret ettiği script gerçekten var olmalı — yoksa doküman-code ayrışması (DOC-07)');
});

test('the script the CI template calls exists', () => {
  const body = readFileSync(join(ROOT, 'templates/github-workflow-slop-gate.yml'), 'utf8');
  assert.match(body, /scripts\/scan-diff\.mjs/);
  assert.ok(statSync(join(ROOT, 'scripts/scan-diff.mjs')).isFile());
});

test('pre-commit does not block when the scanner is missing, but does not stay silent', () => {
  const body = readFileSync(join(ROOT, 'templates/pre-commit'), 'utf8');
  assert.match(body, /not scanned/);
  assert.match(body, /exit 0/);
});

test('CI is left out unless it is asked for', () => {
  const repo = mkdtempSync(join(tmpdir(), 'slopguard-skipci-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/repo-init.mjs')],
    { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  assert.match(out, /CI workflow not installed/);
  assert.equal(existsSync(join(repo, '.github/workflows/slop-gate.yml')), false);
  assert.ok(existsSync(join(repo, 'AGENTS.md')), 'the other files are still installed');
  assert.ok(existsSync(join(repo, '.slopignore')));
  assert.ok(existsSync(join(repo, '.git/hooks/pre-commit')),
    'the local layer is the default, and it is what must always be there');
  rmSync(repo, { recursive: true, force: true });
});

test('--with-ci installs the workflow, and a later run keeps it current', () => {
  const repo = mkdtempSync(join(tmpdir(), 'slopguard-withci-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const run = (...args) => execFileSync(process.execPath, [join(ROOT, 'scripts/repo-init.mjs'), ...args],
    { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const wf = join(repo, '.github/workflows/slop-gate.yml');

  assert.match(run('--with-ci'), /slop-gate\.yml — CI gate/);
  assert.ok(existsSync(wf));

  // Opting out later does not delete a file the repository chose to have; an
  // outdated copy left behind would be worse than no copy at all.
  writeFileSync(wf, 'name: slop-gate\n# LenaRise.SlopGuard — old version\n');
  assert.match(run(), /slop-gate\.yml refreshed/);
  assert.equal(readFileSync(wf, 'utf8'),
    readFileSync(join(ROOT, 'templates/github-workflow-slop-gate.yml'), 'utf8'));
  rmSync(repo, { recursive: true, force: true });
});

test('repo-init refreshes its own pre-commit hook but not a foreign one', () => {
  const repo = mkdtempSync(join(tmpdir(), 'slopguard-hook-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const run = () => execFileSync(process.execPath, [join(ROOT, 'scripts/repo-init.mjs')],
    { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const hook = join(repo, '.git/hooks/pre-commit');

  run();
  assert.match(run(), /pre-commit is current/, 'an unchanged hook is reported as current');

  // An outdated hook of ours is refreshed.
  writeFileSync(hook, '#!/bin/sh\n# LenaRise.SlopGuard — old version\nexit 0\n');
  assert.match(run(), /pre-commit refreshed/);
  assert.equal(readFileSync(hook, 'utf8'), readFileSync(join(ROOT, 'templates/pre-commit'), 'utf8'));

  // Someone else's hook is never touched.
  writeFileSync(hook, '#!/bin/sh\necho mine\n');
  assert.match(run(), /belongs to something else, left alone/);
  assert.equal(readFileSync(hook, 'utf8'), '#!/bin/sh\necho mine\n');
  rmSync(repo, { recursive: true, force: true });
});

test('the pre-commit hook resolves the newest installed version', () => {
  const body = readFileSync(join(ROOT, 'templates/pre-commit'), 'utf8');
  assert.match(body, /sort -V/, 'without a version sort the oldest cached build wins');
  assert.match(body, /tail -1/);
});

// ── The CI gate against a private scanner repository ─────────────────────

test('the CI workflow can reach a private fork of the scanner', () => {
  const body = readFileSync(join(ROOT, 'templates/github-workflow-slop-gate.yml'), 'utf8');
  assert.match(body, /secrets\.SLOPGUARD_TOKEN/,
    'the built-in GITHUB_TOKEN cannot read a private repository it is not scoped to');
  assert.match(body, /\|\| github\.token/,
    'the fallback is what lets the same file work against the public upstream');
  assert.match(body, /persist-credentials: false/, 'the token must not be left in .git/config');

  // The earlier version of this test asserted the token and stopped there, so it
  // passed while `repository:` was still a hard-coded slug — a token authenticates
  // a checkout, it does not choose what is checked out. Both inputs, or the
  // private-fork claim in the documentation is false (DOC-07).
  assert.match(body, /repository: \$\{\{ vars\.SLOPGUARD_REPO \|\|/,
    'a token without a configurable slug still checks out the public upstream');
  assert.doesNotMatch(body, /^\s*repository: [\w.-]+\/[\w.-]+\s*$/m,
    'a bare slug leaves no way to point at a fork');
});

test('the private-fork path is documented as a pair, never as a token alone', () => {
  for (const rel of ['README.md', 'commands/slop-repo-init.md', 'skills/slop-repo-init/SKILL.md']) {
    const body = readFileSync(join(ROOT, rel), 'utf8');
    if (!body.includes('SLOPGUARD_TOKEN')) continue;
    assert.match(body, /SLOPGUARD_REPO/,
      `${rel} names the token without the variable, which promises something the workflow cannot do`);
  }
});

test('a failed scanner fetch explains itself instead of failing cryptically', () => {
  const body = readFileSync(join(ROOT, 'templates/github-workflow-slop-gate.yml'), 'utf8');
  assert.match(body, /continue-on-error: true/, 'the checkout has to be allowed to fail so we can explain it');
  assert.match(body, /steps\.fetch\.outcome == 'failure'/);
  assert.match(body, /gh secret set SLOPGUARD_TOKEN/, 'the message must carry the fix, not just the symptom');
  assert.match(body, /exit 1/, 'a gate that cannot run must not report success (TEST-05)');
});

test('the workflow carries the marker repo-init refreshes on', () => {
  // Strip the marker and every installed copy freezes forever; that is the bug
  // that left a months-old workflow running in two repositories.
  const body = readFileSync(join(ROOT, 'templates/github-workflow-slop-gate.yml'), 'utf8');
  assert.ok(body.includes('LenaRise.SlopGuard'));
});

test('repo-init refreshes its own CI workflow but not a foreign one', () => {
  const repo = mkdtempSync(join(tmpdir(), 'slopguard-ci-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const run = (...args) => execFileSync(process.execPath, [join(ROOT, 'scripts/repo-init.mjs'), ...args],
    { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const wf = join(repo, '.github/workflows/slop-gate.yml');
  const template = readFileSync(join(ROOT, 'templates/github-workflow-slop-gate.yml'), 'utf8');

  assert.match(run('--with-ci'), /slop-gate\.yml — CI gate/);
  assert.equal(readFileSync(wf, 'utf8'), template);
  assert.match(run(), /slop-gate\.yml is current/, 'an unchanged workflow is reported as current');

  // An outdated workflow of ours is brought up to date.
  writeFileSync(wf, 'name: slop-gate\n# LenaRise.SlopGuard — old version\n');
  assert.match(run(), /slop-gate\.yml refreshed/);
  assert.equal(readFileSync(wf, 'utf8'), template);

  // Someone else's workflow of the same name is never touched.
  writeFileSync(wf, 'name: slop-gate\njobs: {}\n');
  assert.match(run(), /slop-gate\.yml belongs to something else, left alone/);
  assert.equal(readFileSync(wf, 'utf8'), 'name: slop-gate\njobs: {}\n');
  rmSync(repo, { recursive: true, force: true });
});

test('opting into CI states the private-fork requirement at install time', () => {
  const repo = mkdtempSync(join(tmpdir(), 'slopguard-citoken-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/repo-init.mjs'), '--with-ci'],
    { cwd: repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  assert.match(out, /SLOPGUARD_TOKEN/);
  assert.match(out, /SLOPGUARD_REPO/);
  assert.match(out, /no paid action/, 'nothing in the default path may need a paid service');
  rmSync(repo, { recursive: true, force: true });
});

test('the secret scan does not depend on a licensed action', () => {
  // gitleaks-action stops with "missing gitleaks license" on an organisation
  // account, so the job went red for a billing reason in every org repository.
  // A permanently red gate teaches people to ignore the gate.
  const body = readFileSync(join(ROOT, 'templates/github-workflow-slop-gate.yml'), 'utf8');
  assert.doesNotMatch(body, /gitleaks\/gitleaks-action/,
    'the action requires a paid licence for organisations');
  assert.match(body, /releases\/download\/v\$\{GITLEAKS_VERSION\}/, 'the MIT-licensed binary is used instead');
  assert.match(body, /--exit-code 1/, 'a found secret must fail the job');
  assert.match(body, /GITLEAKS_VERSION: '\d+\.\d+\.\d+'/, 'the version is pinned, not latest');
});
