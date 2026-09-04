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

test('test dosyasına yazma reddedilir (TST-01)', () => {
  for (const p of ['test/x.test.js', 'src/__tests__/a.js', 'tests/helper.py', 'api/test_views.py', 'pkg/main_test.go']) {
    const r = preEdit(join(ws.repo, p));
    assert.ok(denied(r), p);
    assert.match(reason(r), /test dosyası/);
  }
});

test('allowTestWrites açıkken test dosyasına izin verilir', () => {
  ws.config({ allowTestWrites: true });
  assert.equal(preEdit(join(ws.repo, 'test/x.test.js')).stdout, '');
  ws.config({});
});

test('korumalı yollar reddedilir ve gerekçe söylenir', () => {
  const cases = [['.env', 'ortam sırları'], ['.env.production', 'ortam sırları'],
                 ['package-lock.json', 'bağımlılık kilidi'], ['poetry.lock', 'bağımlılık kilidi'],
                 ['.github/workflows/ci.yml', 'CI yapılandırması'], ['.npmrc', 'paket deposu kimlik bilgisi']];
  for (const [p, why] of cases) {
    const r = preEdit(join(ws.repo, p));
    assert.ok(denied(r), p);
    assert.match(reason(r), new RegExp(why));
  }
});

test('korumalı yol keşif kipinde de reddedilir — kip üslup içindir, sır için değil', () => {
  ws.config({ mode: 'explore' });
  assert.ok(denied(preEdit(join(ws.repo, '.env'))));
  ws.config({});
});

test('sürüm ekli dosya adı sert kipte reddedilir, keşif kipinde geçer', () => {
  const p = join(ws.repo, 'src/parser_v2.ts');
  assert.ok(denied(preEdit(p)));
  ws.config({ mode: 'explore' });
  assert.equal(preEdit(p).stdout, '', 'üslup kuralı keşif kipinde gevşer');
  ws.config({});
});

test('normal dosya sessizce geçer', () => {
  const r = preEdit(join(ws.repo, 'src/index.ts'));
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
});

test('.slopignore yolu pre-edit kontrolünden de muaf tutar', () => {
  writeFileSync(join(ws.repo, '.slopignore'), 'legacy\n');
  assert.equal(preEdit(join(ws.repo, 'legacy/old_v2.js')).stdout, '');
  writeFileSync(join(ws.repo, '.slopignore'), '');
});

// ── pre-bash ─────────────────────────────────────────────────────────────

test('yıkıcı komutlar reddedilir', () => {
  for (const c of ['rm -rf /var/data', 'git push --force origin main', 'git reset --hard HEAD~2',
                   'chmod -R 777 /srv', 'psql -c "DROP TABLE users"', 'psql -c "DELETE FROM sessions;"']) {
    assert.ok(denied(preBash(c)), c);
  }
});

test('yıkıcı komut keşif kipinde de reddedilir', () => {
  ws.config({ mode: 'explore' });
  assert.ok(denied(preBash('rm -rf /var/data')), 'geri dönüşsüzlük kipe bağlı değil');
  ws.config({});
});

test('temiz komutlar geçer', () => {
  for (const c of ['npm run build', 'git push origin main', 'ls -la', 'chmod 640 x.yml',
                   'git push --force-with-lease origin feat']) {
    assert.equal(preBash(c).stdout, '', c);
  }
});

test('güvenilen paket ağ sorgusu olmadan geçer', () => {
  ws.config({ trustedPackages: ['react'] });
  assert.equal(preBash('npm install react').stdout, '');
  ws.config({});
});

test('doğrulanamayan paket engellenir — fail-closed', () => {
  // Zaman aşımı 1 ms: kayıt defteri yanıtı beklenmez, sonuç "bilinmiyor" olur.
  ws.config({ thresholds: { packageCheckTimeoutMs: 1 } });
  const r = preBash('npm install bilinmeyen-paket-xyz');
  assert.ok(denied(r));
  assert.match(reason(r), /Doğrulanamadı/);
  assert.match(reason(r), /trustedPackages/);
  ws.config({});
});

test('MTK-02 devre dışıysa paket kapısı çalışmaz', () => {
  ws.config({ disabled: ['MTK-02'], thresholds: { packageCheckTimeoutMs: 1 } });
  assert.equal(preBash('npm install her-neyse').stdout, '');
  ws.config({});
});

test('doğrulama yapılmadan commit uyarı verir ama bloklamaz', () => {
  const r = preBash('git commit -m "parser NaN girdide sessizce 0 dönüyordu"', 'commit-uyari');
  assert.equal(denied(r), false, 'uyarı bloklamaz');
  assert.match(r.json.systemMessage, /test çalıştırılmadı/);
});

test('boş commit mesajı uyarısı verilir', () => {
  const r = preBash('git commit -m "fix stuff"', 'commit-bos');
  assert.match(r.json.systemMessage, /DOK-03/);
});

// ── post-bash: doğrulama damgası ────────────────────────────────────────

test('post-bash test damgası atar — tetiklenmiş olmak başarının kanıtı', () => {
  postBash('npm test', 'damga');
  assert.ok(session('damga').testRunAt > 0);
});

test('test damgasından sonra commit uyarısı susar', () => {
  postBash('pytest -q', 'sessiz-commit');
  const r = preBash('git commit -m "parser hatası düzeltildi"', 'sessiz-commit');
  assert.equal(r.stdout, '');
});

test('commit sayaçları sıfırlar ve doğrulamayı geçersiz kılar', () => {
  postBash('npm test', 'sayac');
  postBash('git commit -m "iş"', 'sayac');
  const s = session('sayac');
  assert.equal(s.linesSinceCommit, 0);
  assert.equal(s.testRunAt, null, 'yeni commit yeni doğrulama ister');
  assert.ok(s.commitAt > 0);
});

test('kurulum komutu test damgası atmaz', () => {
  postBash('npm install jest', 'kurulum');
  assert.equal(session('kurulum').testRunAt, null);
});

// ── Bash üzerinden yazma: kilit ve tarama ───────────────────────────────

test('kabuk üzerinden korumalı yola yazma reddedilir', () => {
  for (const cmd of ['printf x > .env', "cat > .github/workflows/ci.yml <<'EOF'", 'cp a package-lock.json']) {
    const r = preBash(cmd);
    assert.ok(denied(r), cmd);
    assert.match(reason(r), /korumalı/);
  }
});

test('kabuk üzerinden test dosyasına yazma reddedilir — kilit yönlendirmeyle aşılamaz', () => {
  const r = preBash('cat > test/yeni.test.js');
  assert.ok(denied(r));
  assert.match(reason(r), /test dosyası/);
  assert.match(reason(r), /kilidi aşmaz/);
});

test('allowTestWrites açıkken kabuk yazımı da serbest', () => {
  ws.config({ allowTestWrites: true });
  assert.equal(preBash('cat > test/yeni.test.js').stdout, '');
  ws.config({});
});

test('sıradan dosyaya kabuk yazımı engellenmez', () => {
  assert.equal(preBash('cat > src/index.js').stdout, '');
  assert.equal(preBash('npm test 2>&1 | tee out.log').stdout, '');
});

test('post-bash kabuk üzerinden yazılan dosyayı tarar ve deftere işler', () => {
  const f = ws.file('kabuk.js', 'try{ a() }catch(e){}\n');
  const r = postBash(`cat > ${f}`, 'kabuk-tarama');
  assert.equal(r.json.decision, 'block');
  assert.match(r.json.reason, /KOD-05/);
  assert.match(r.json.reason, /kabuk\.js/);
  assert.match(r.json.reason, /Kabuk üzerinden yazıldı ama tarama atlanmaz/);
  const s = session('kabuk-tarama');
  assert.equal(Object.keys(s.violations).length, 1, 'stop kapısı için deftere yazılmalı');
});

test('post-bash temiz kabuk yazımında sessiz', () => {
  const f = ws.file('temiz-kabuk.js', 'export const a = 1;\n');
  assert.equal(postBash(`cat > ${f}`, 'kabuk-temiz').stdout, '');
});

test('post-bash yazmayan komutta dosya taramaz', () => {
  assert.equal(postBash('git status', 'kabuk-yok').stdout, '');
});
