import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// CONFIG_DIR modül yüklenirken okunur; env'i içe aktarmadan önce kurmak gerekiyor.
const DIR = mkdtempSync(join(tmpdir(), 'slopguard-config-'));
process.env.SLOPGUARD_CONFIG_DIR = DIR;
const { loadConfig, DEFAULT_CONFIG, globToRegExp, isPathIgnored, parseSlopignore, actionFor, compileLocalPatterns } =
  await import('../lib/config.mjs');

const writeConfig = (obj) => writeFileSync(join(DIR, 'config.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));
const writeLocal = (obj) => writeFileSync(join(DIR, 'patterns.local.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));

beforeEach(() => {
  for (const f of ['config.json', 'patterns.local.json']) rmSync(join(DIR, f), { force: true });
});

test('dosya yokken varsayılanlar döner, sorun raporlanmaz', () => {
  const { config, problems } = loadConfig();
  assert.equal(config.mode, 'strict');
  assert.equal(config.thresholds.maxDiffLines, 400);
  assert.equal(config.ui.statusLine, 'compact');
  assert.deepEqual(problems, []);
});

test('varsayılan nesne dondurulmuş — yükleme onu kirletmez', () => {
  const { config } = loadConfig();
  config.thresholds.maxDiffLines = 1;
  assert.equal(DEFAULT_CONFIG.thresholds.maxDiffLines, 400);
});

test('config.json değerleri varsayılanı ezer', () => {
  writeConfig({ mode: 'explore', disabled: ['DOK'], allowTestWrites: true, thresholds: { maxDiffLines: 120 }, ui: { statusLine: 'minimal' } });
  const { config, problems, sources } = loadConfig();
  assert.equal(config.mode, 'explore');
  assert.deepEqual(config.disabled, ['DOK']);
  assert.equal(config.allowTestWrites, true);
  assert.equal(config.thresholds.maxDiffLines, 120);
  assert.equal(config.ui.statusLine, 'minimal');
  assert.equal(config.ui.cleanScans, 'silent', 'dokunulmayan alan varsayılanda kalmalı');
  assert.deepEqual(problems, []);
  assert.ok(sources.some((s) => s.endsWith('config.json')));
});

test('bozuk JSON sessizce yutulmaz — varsayılana döner ve raporlar', () => {
  writeConfig('{ bu json değil');
  const { config, problems } = loadConfig();
  assert.equal(config.mode, 'strict');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /config\.json geçersiz JSON/);
});

test('geçersiz enum reddedilir ve raporlanır', () => {
  writeConfig({ mode: 'kapalı', ui: { livenessCheck: 'belki' } });
  const { config, problems } = loadConfig();
  assert.equal(config.mode, 'strict');
  assert.equal(config.ui.livenessCheck, 'ask');
  assert.equal(problems.length, 2);
});

test('yanlış tipteki alan raporlanır', () => {
  writeConfig({ disabled: 'DOK', thresholds: { maxDiffLines: 'çok' } });
  const { config, problems } = loadConfig();
  assert.deepEqual(config.disabled, []);
  assert.equal(config.thresholds.maxDiffLines, 400);
  assert.equal(problems.length, 2);
});

test('oturum kipi config.json üstünde', () => {
  writeConfig({ mode: 'strict' });
  assert.equal(loadConfig({ sessionMode: 'explore' }).config.mode, 'explore');
  assert.equal(loadConfig({ sessionMode: 'saçma' }).config.mode, 'strict');
  assert.equal(loadConfig({ sessionMode: 'saçma' }).problems.length, 1);
});

test('kullanıcı desenleri derlenir; geçersiz girdi atlanır ve raporlanır', () => {
  writeLocal([
    { key: 'ozel-1', id: 'KOD-01', scope: 'code', match: 'TODO\\s+acil', severity: 'warn' },
    { key: 'eksik', id: 'KOD-01' },
    { key: 'bozuk-regex', id: 'KOD-01', scope: 'code', match: '([' },
    { key: 'bozuk-scope', id: 'KOD-01', scope: 'her-yer', match: 'x' },
  ]);
  const { config, problems } = loadConfig();
  assert.equal(config.localPatterns.length, 1);
  assert.equal(config.localPatterns[0].key, 'ozel-1');
  assert.ok(config.localPatterns[0].match instanceof RegExp);
  assert.equal(problems.length, 3);
});

test('compileLocalPatterns { patterns: [...] } biçimini de kabul eder', () => {
  const problems = [];
  const out = compileLocalPatterns({ patterns: [{ key: 'a', id: 'KOD-01', scope: 'code', match: 'x' }] }, problems);
  assert.equal(out.length, 1);
  assert.deepEqual(problems, []);
});

test('glob çevirisi: * dizin sınırını aşmaz, ** aşar', () => {
  assert.ok(globToRegExp('src/*.js').test('src/a.js'));
  assert.equal(globToRegExp('src/*.js').test('src/deep/a.js'), false);
  assert.ok(globToRegExp('src/**/*.js').test('src/deep/a.js'));
  assert.ok(globToRegExp('vendor').test('vendor/lib/x.js'), 'dizin adı altını kapsar');
  assert.equal(globToRegExp('vendor').test('vendored/x.js'), false);
});

test('.slopignore yol muafiyeti', () => {
  const root = mkdtempSync(join(tmpdir(), 'slopguard-repo-'));
  mkdirSync(join(root, 'vendor'), { recursive: true });
  writeFileSync(join(root, '.slopignore'), '# yorum\n\nvendor\n**/*.generated.ts\n');
  const { config, sources } = loadConfig({ repoRoot: root });
  assert.ok(sources.some((s) => s.endsWith('.slopignore')));
  assert.equal(isPathIgnored(config, join(root, 'vendor/lib.js'), root), true);
  assert.equal(isPathIgnored(config, join(root, 'src/api.generated.ts'), root), true);
  assert.equal(isPathIgnored(config, join(root, 'src/api.ts'), root), false);
  rmSync(root, { recursive: true, force: true });
});

test('parseSlopignore yorum ve boş satırları atar', () => {
  assert.equal(parseSlopignore('# yorum\n\n  build  \n').length, 1);
});

test('kip bulgunun eylemini belirler', () => {
  const block = { severity: 'block' };
  const warn = { severity: 'warn' };
  assert.equal(actionFor(block, { mode: 'strict' }), 'block');
  assert.equal(actionFor(warn, { mode: 'strict' }), 'warn');
  assert.equal(actionFor(block, { mode: 'explore' }), 'warn', 'keşif kipi bloklamaz');
});
