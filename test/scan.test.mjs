import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, TAXONOMY, PATTERN_COUNT, titleOf } from '../lib/patterns.mjs';
import { scanContent, scanPath, scanCommand, actionable, suppressed, stripCodeSpans, classify } from '../lib/scan.mjs';

const ids = (fs) => fs.map((f) => f.key);

test('taksonomi bütünlüğü: her desen ID kanonik listede', () => {
  for (const p of PATTERNS) assert.ok(titleOf(p.id), `${p.key} → ${p.id}`);
  assert.equal(TAXONOMY.length, 63, '62 kanonik + SUR-08');
});

test('desen şeması: her desende detects, fix, geçerli severity', () => {
  for (const p of PATTERNS) {
    assert.ok(p.detects?.length > 0, `${p.key}: detects eksik`);
    assert.ok(p.fix?.length > 0, `${p.key}: fix eksik`);
    assert.ok(['block', 'warn'].includes(p.severity), `${p.key}: severity`);
    assert.ok(['code', 'prose', 'path', 'command'].includes(p.scope), `${p.key}: scope`);
  }
  assert.equal(PATTERN_COUNT, PATTERNS.length);
});

// ── Pozitif eşleşmeler: her block deseni gerçek bir yükü yakalamalı ────────

const CODE_CASES = [
  ['kod-05-empty-catch',    'a.js', 'try { risky() } catch (e) {}'],
  ['kod-05-except-pass',    'a.py', 'try:\n    risky()\nexcept ValueError:\n    pass'],
  ['kod-05-catch-noop',     'a.js', 'fetch(u).catch(() => {})'],
  ['kod-04-guard-and-go',   'a.js', 'if (false) { legacyPath() }'],
  ['tst-04-tautological-assert', 'a.py', 'def test_x():\n    assert True'],
  ['tst-01-skipped-test',   'a.js', 'it.skip("bozuk", () => {})'],
  ['tst-03-fake-impl',      'a.py', 'def parse():\n    raise NotImplementedError'],
  ['guv-03-aws-key',        'a.js', 'const k = "AKIAIOSFODNN7EXAMPLE"'],
  ['guv-03-private-key',    'a.js', '-----BEGIN RSA PRIVATE KEY-----'],
  ['guv-01-eval',           'a.js', 'const out = eval(userInput)'],
  ['guv-05-sql-fstring',    'a.py', 'q = f"SELECT * FROM users WHERE id={uid}"'],
];

for (const [key, file, body] of CODE_CASES) {
  test(`yakalar: ${key}`, () => {
    const found = actionable(scanContent({ filePath: file, content: body }));
    assert.ok(ids(found).includes(key), `beklenen ${key}, bulunan: ${ids(found).join(',') || 'hiçbiri'}`);
  });
}

test('yakalar: guv-03-inline-secret', () => {
  const body = 'const config = { api_key: "sk_live_abcdefghijklmnop0123" }';
  const found = actionable(scanContent({ filePath: 'a.js', content: body }));
  assert.ok(ids(found).includes('guv-03-inline-secret'), ids(found).join(','));
});

const COMMAND_CASES = [
  ['agt-05-rm-recursive-force',  'rm -rf /var/data'],
  ['agt-05-rm-recursive-force',  'rm -fr build'],
  ['agt-05-git-force-push',      'git push --force origin main'],
  ['agt-05-git-reset-hard',      'git reset --hard HEAD~3'],
  ['agt-05-chmod-777',           'chmod -R 777 /srv'],
  ['agt-05-sql-destructive',     'psql -c "DROP TABLE users"'],
  ['agt-05-delete-without-where', 'psql -c "DELETE FROM sessions;"'],
  ['mtk-02-package-install',     'npm install left-pad'],
  ['mtk-02-package-install',     'pip install requests'],
  ['dok-03-empty-commit-msg',    'git commit -m "fix stuff"'],
];

for (const [key, command] of COMMAND_CASES) {
  test(`komut yakalar: ${key} — ${command}`, () => {
    const found = scanCommand({ command });
    assert.ok(ids(found).includes(key), `beklenen ${key}, bulunan: ${ids(found).join(',') || 'hiçbiri'}`);
  });
}

test('yol yakalar: sürüm ekli dosya adı', () => {
  assert.ok(ids(scanPath({ filePath: 'src/parser_v2.ts' })).includes('kod-01-versioned-filename'));
  assert.ok(ids(scanPath({ filePath: 'src/utils.old.js' })).includes('kod-01-versioned-filename'));
});

// ── Yanlış pozitif kontrolü: temiz içerik hiçbir bulgu üretmemeli ─────────

const CLEAN_CODE = `
export function parseAmount(raw) {
  try {
    return Number.parseFloat(raw);
  } catch (error) {
    logger.warn('parseAmount başarısız', { raw, error });
    throw error;
  }
}

async function load(url) {
  const res = await fetch(url).catch((error) => {
    logger.error('istek başarısız', error);
    throw error;
  });
  return res.json();
}

const query = 'SELECT id, name FROM users WHERE tenant = $1';
`;

test('yanlış pozitif yok: doğru yazılmış kod temiz geçer', () => {
  const found = actionable(scanContent({ filePath: 'clean.js', content: CLEAN_CODE }));
  assert.deepEqual(ids(found), [], `beklenmedik bulgu: ${JSON.stringify(found.map((f) => [f.key, f.line]))}`);
});

const CLEAN_COMMANDS = [
  'rm build/artifact.tgz',
  'git push origin main',
  'git push --force-with-lease origin feature',
  'chmod 640 config.yml',
  'psql -c "DELETE FROM sessions WHERE expired_at < now()"',
  'npm run test',
  'git commit -m "parseAmount NaN girdide sessizce 0 dönüyordu; artık hata fırlatıyor"',
];

for (const command of CLEAN_COMMANDS) {
  test(`temiz komut geçer: ${command}`, () => {
    assert.deepEqual(scanCommand({ command }).map((f) => f.key), []);
  });
}

test('bilinmeyen uzantı taranmaz', () => {
  assert.equal(classify('data.bin'), 'other');
  assert.deepEqual(scanContent({ filePath: 'data.bin', content: 'try{}catch(e){}' }), []);
});

// ── prose kapsamı: anmak ile kullanmak ayrımı ────────────────────────────

test('prose: buzzword düz metinde yakalanır', () => {
  const found = actionable(scanContent({ filePath: 'README.md', content: 'Bu araç seamlessly çalışır.' }));
  assert.ok(ids(found).includes('dok-01-buzzword'));
});

test('prose: backtick içindeki buzzword yakalanmaz — anmak kullanmak değildir', () => {
  const doc = 'Desen `seamlessly` ifadesini yakalar.\n\n```\nrobust and flexible\n```\n';
  const found = actionable(scanContent({ filePath: 'README.md', content: doc }));
  assert.deepEqual(ids(found), [], JSON.stringify(found.map((f) => [f.key, f.line])));
});

test('prose: emoji başlık yakalanır, gövdedeki emoji yakalanmaz', () => {
  const found = actionable(scanContent({ filePath: 'd.md', content: '# 🚀 Başlangıç\n\nMetin içinde 🚀 sorun değil.\n' }));
  assert.equal(ids(found).filter((k) => k === 'dok-04-emoji-heading').length, 1);
});

test('prose: temelsiz süre tahmini yakalanır', () => {
  const found = actionable(scanContent({ filePath: 'p.md', content: 'Bu iş tahminen 3 gün sürer.\n' }));
  assert.ok(ids(found).includes('sur-08-effort-estimate'));
});

test('kod dosyasında prose deseni çalışmaz', () => {
  const found = actionable(scanContent({ filePath: 'a.js', content: 'const s = "seamlessly";' }));
  assert.deepEqual(ids(found), []);
});

test('stripCodeSpans satır numaralarını kaydırmaz', () => {
  const src = 'bir\n```\nreddedilen\n```\nseamlessly\n';
  const stripped = stripCodeSpans(src);
  assert.equal(stripped.split('\n').length, src.split('\n').length);
  const found = actionable(scanContent({ filePath: 'x.md', content: src }));
  assert.equal(found[0].line, 5);
});

// ── Devre dışı bırakma üç düzeyde ────────────────────────────────────────

test('devre dışı: tekil desen key', () => {
  const found = actionable(scanContent({ filePath: 'a.js', content: 'try{}catch(e){}', config: { disabled: ['kod-05-empty-catch'] } }));
  assert.deepEqual(ids(found), []);
});

test('devre dışı: taksonomi ID', () => {
  const body = 'try { a() } catch (e) {}\nfetch(u).catch(() => {})';
  assert.deepEqual(ids(actionable(scanContent({ filePath: 'a.js', content: body, config: { disabled: ['KOD-05'] } }))), []);
});

test('devre dışı: kategori', () => {
  const body = 'const k = "AKIAIOSFODNN7EXAMPLE"\nconst x = eval(y)';
  assert.deepEqual(ids(actionable(scanContent({ filePath: 'a.js', content: body, config: { disabled: ['GUV'] } }))), []);
});

test('satır ve sütun doğru raporlanır', () => {
  const body = 'satır bir\nsatır iki\ntry { x() } catch (e) {}\n';
  const [f] = actionable(scanContent({ filePath: 'a.js', content: body }));
  assert.equal(f.line, 3);
  assert.equal(f.excerpt, 'try { x() } catch (e) {}');
});

test('sur-08: fiil sondaki Türkçe biçimi de yakalar', () => {
  const found = actionable(scanContent({ filePath: 'p.md', content: 'Bu iş 3 gün sürer.\n' }));
  assert.ok(ids(found).includes('sur-08-effort-estimate'));
});

test('sur-08: ölçülmüş makine zamanını tahmin sanmaz', () => {
  for (const line of ['Testler 2 dakika sürer.', '48 saat içinde yanıt veriyoruz.', 'Bu dosya 3 gün önce yazıldı.']) {
    const found = actionable(scanContent({ filePath: 'p.md', content: line + '\n' }));
    assert.deepEqual(ids(found), [], line);
  }
});

test('yorumdan ibaret catch de boş catch sayılır', () => {
  for (const body of ['try{a()}catch{ /* önemsiz */ }', 'try{a()}catch (e) {\n  // yok sayılır\n}']) {
    const found = actionable(scanContent({ filePath: 'a.js', content: body }));
    assert.ok(ids(found).includes('kod-05-comment-only-catch'), body);
  }
});

test('gerçekten ele alınan catch yakalanmaz', () => {
  const body = 'try{a()}catch (e) {\n  // ağ hatası beklenen durum\n  logger.warn(e);\n}';
  assert.deepEqual(ids(actionable(scanContent({ filePath: 'a.js', content: body }))), []);
});
