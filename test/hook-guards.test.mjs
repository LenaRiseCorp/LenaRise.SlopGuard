import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeWorkspace, pipe } from './pipe.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const preEdit = (filePath, sessionId = 'g') =>
  pipe('hooks/pre-edit.mjs', {
    session_id: sessionId, cwd: ws.repo, hook_event_name: 'PreToolUse',
    tool_name: 'Write', tool_input: { file_path: filePath, content: 'x' },
  }, { cfgDir: ws.cfgDir });

const preBash = (command, sessionId = 'g') =>
  pipe('hooks/pre-bash.mjs', {
    session_id: sessionId, cwd: ws.repo, hook_event_name: 'PreToolUse',
    tool_name: 'Bash', tool_input: { command },
  }, { cfgDir: ws.cfgDir });

const postBash = (command, sessionId = 'g') =>
  pipe('hooks/post-bash.mjs', {
    session_id: sessionId, cwd: ws.repo, hook_event_name: 'PostToolUse',
    tool_name: 'Bash', tool_input: { command },
    tool_response: { stdout: '', stderr: '', interrupted: false },
  }, { cfgDir: ws.cfgDir });

const denied = (r) => r.json?.hookSpecificOutput?.permissionDecision === 'deny';
const reason = (r) => r.json?.hookSpecificOutput?.permissionDecisionReason ?? '';
const session = (id) => JSON.parse(readFileSync(join(ws.cfgDir, `session-${id}.json`), 'utf8'));

// ── pre-edit ─────────────────────────────────────────────────────────────

test('writing to a test file is refused (TEST-01)', () => {
  for (const p of ['test/x.test.js', 'src/__tests__/a.js', 'tests/helper.py', 'api/test_views.py', 'pkg/main_test.go']) {
    const r = preEdit(join(ws.repo, p));
    assert.ok(denied(r), p);
    assert.match(reason(r), /test file/);
  }
});

test('with allowTestWrites on, test files are permitted', () => {
  ws.config({ allowTestWrites: true });
  assert.equal(preEdit(join(ws.repo, 'test/x.test.js')).stdout, '');
  ws.config({});
});

test('protected paths are refused with a reason', () => {
  const cases = [['.env', 'environment secrets'], ['.env.production', 'environment secrets'],
                 ['package-lock.json', 'dependency lockfile'], ['poetry.lock', 'dependency lockfile'],
                 ['.github/workflows/ci.yml', 'CI configuration'], ['.npmrc', 'package registry credentials']];
  for (const [p, why] of cases) {
    const r = preEdit(join(ws.repo, p));
    assert.ok(denied(r), p);
    assert.match(reason(r), new RegExp(why));
  }
});

test('a protected path is refused in explore mode too', () => {
  ws.config({ mode: 'explore' });
  assert.ok(denied(preEdit(join(ws.repo, '.env'))));
  ws.config({});
});

test('a version-suffixed filename is refused in strict mode and passes in explore', () => {
  const p = join(ws.repo, 'src/parser_v2.ts');
  assert.ok(denied(preEdit(p)));
  ws.config({ mode: 'explore' });
  assert.equal(preEdit(p).stdout, '', 'üslup kuralı explore modende gevşer');
  ws.config({});
});

test('an ordinary file passes silently', () => {
  const r = preEdit(join(ws.repo, 'src/index.ts'));
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
});

test('.slopignore also exempts a path from the pre-edit check', () => {
  writeFileSync(join(ws.repo, '.slopignore'), 'legacy\n');
  assert.equal(preEdit(join(ws.repo, 'legacy/old_v2.js')).stdout, '');
  writeFileSync(join(ws.repo, '.slopignore'), '');
});

// ── pre-bash ─────────────────────────────────────────────────────────────

test('destructive commands are refused', () => {
  for (const c of ['rm -rf /var/data', 'git push --force origin main', 'git reset --hard HEAD~2',
                   'chmod -R 777 /srv', 'psql -c "DROP TABLE users"', 'psql -c "DELETE FROM sessions;"']) {
    assert.ok(denied(preBash(c)), c);
  }
});

test('a destructive command is refused in explore mode too', () => {
  ws.config({ mode: 'explore' });
  assert.ok(denied(preBash('rm -rf /var/data')), 'geri dönüşsüzlük kipe bağlı değil');
  ws.config({});
});

test('clean commands pass', () => {
  for (const c of ['npm run build', 'git push origin main', 'ls -la', 'chmod 640 x.yml',
                   'git push --force-with-lease origin feat']) {
    assert.equal(preBash(c).stdout, '', c);
  }
});

test('a trusted package passes without a network lookup', () => {
  ws.config({ trustedPackages: ['react'] });
  assert.equal(preBash('npm install react').stdout, '');
  ws.config({});
});

test('an unverifiable package is blocked — fail-closed', () => {
  // Writing through the shell must not bypass the pre-edit lock.
  ws.config({ thresholds: { packageCheckTimeoutMs: 1 } });
  const r = preBash('npm install bilinmeyen-paket-xyz');
  assert.ok(denied(r));
  assert.match(reason(r), /Could not be verified/);
  assert.match(reason(r), /trustedPackages/);
  ws.config({});
});

test('with LOGIC-02 disabled the package gate does not run', () => {
  ws.config({ disabled: ['LOGIC-02'], thresholds: { packageCheckTimeoutMs: 1 } });
  assert.equal(preBash('npm install her-neyse').stdout, '');
  ws.config({});
});

test('committing without verification warns but does not block', () => {
  const r = preBash('git commit -m "parser NaN girdide sessizce 0 dönüyordu"', 'commit-uyari');
  assert.equal(denied(r), false, 'uyarı bloklamaz');
  assert.match(r.json.systemMessage, /No tests ran this turn/);
});

test('an empty commit message produces a warning', () => {
  const r = preBash('git commit -m "fix stuff"', 'commit-bos');
  assert.match(r.json.systemMessage, /DOC-03/);
});

// Writing through the shell must not bypass the pre-edit lock.

test('post-bash stamps the test run — firing is the proof of success', () => {
  postBash('npm test', 'damga');
  assert.ok(session('damga').testRunAt > 0);
});

test('after a test stamp the commit warning goes quiet', () => {
  postBash('pytest -q', 'sessiz-commit');
  const r = preBash('git commit -m "parser hatası düzeltildi"', 'sessiz-commit');
  assert.equal(r.stdout, '');
});

test('a commit resets the counters and invalidates verification', () => {
  postBash('npm test', 'sayac');
  postBash('git commit -m "iş"', 'sayac');
  const s = session('sayac');
  assert.equal(s.linesSinceCommit, 0);
  assert.equal(s.testRunAt, null, 'yeni commit yeni doğrulama ister');
  assert.ok(s.commitAt > 0);
});

test('an install command does not stamp a test run', () => {
  postBash('npm install jest', 'kurulum');
  assert.equal(session('kurulum').testRunAt, null);
});

// Writing through the shell must not bypass the pre-edit lock.

test('writing to a protected path through the shell is refused', () => {
  for (const cmd of ['printf x > .env', "cat > .github/workflows/ci.yml <<'EOF'", 'cp a package-lock.json']) {
    const r = preBash(cmd);
    assert.ok(denied(r), cmd);
    assert.match(reason(r), /protected/);
  }
});

test('writing to a test file through the shell is refused', () => {
  const r = preBash('cat > test/yeni.test.js');
  assert.ok(denied(r));
  assert.match(reason(r), /test file/);
  assert.match(reason(r), /does not bypass the lock/);
});

test('with allowTestWrites on, shell writes are allowed too', () => {
  ws.config({ allowTestWrites: true });
  assert.equal(preBash('cat > test/yeni.test.js').stdout, '');
  ws.config({});
});

test('an ordinary file written through the shell is not blocked', () => {
  assert.equal(preBash('cat > src/index.js').stdout, '');
  assert.equal(preBash('npm test 2>&1 | tee out.log').stdout, '');
});

test('post-bash scans a file written through the shell and records it', () => {
  const f = ws.file('kabuk.js', 'try{ a() }catch(e){}\n');
  const r = postBash(`cat > ${f}`, 'kabuk-tarama');
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, /CODE-05/);
  assert.match(r.json.reason, /kabuk\.js/);
  assert.match(r.json.reason, /Written through the shell, but the scan is not skipped/);
  const s = session('kabuk-tarama');
  assert.equal(Object.keys(s.violations).length, 1, 'stop kapısı için deftere yazılmalı');
});

test('post-bash stays silent on a clean shell write', () => {
  const f = ws.file('clean-kabuk.js', 'export const a = 1;\n');
  assert.equal(postBash(`cat > ${f}`, 'kabuk-clean').stdout, '');
});

test('post-bash scans nothing for a command that writes nothing', () => {
  assert.equal(postBash('git status', 'kabuk-yok').stdout, '');
});
