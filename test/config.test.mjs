import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// CONFIG_DIR is read at module load, so the env must be set before importing.
const DIR = mkdtempSync(join(tmpdir(), 'slopguard-config-'));
process.env.SLOPGUARD_CONFIG_DIR = DIR;
const { loadConfig, DEFAULT_CONFIG, globToRegExp, isPathIgnored, parseSlopignore, actionFor, compileLocalPatterns } =
  await import('../lib/config.mjs');

const writeConfig = (obj) => writeFileSync(join(DIR, 'config.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));
const writeLocal = (obj) => writeFileSync(join(DIR, 'patterns.local.json'), typeof obj === 'string' ? obj : JSON.stringify(obj));

beforeEach(() => {
  for (const f of ['config.json', 'patterns.local.json']) rmSync(join(DIR, f), { force: true });
});

test('with no file the defaults are returned and nothing is reported', () => {
  const { config, problems } = loadConfig();
  assert.equal(config.mode, 'strict');
  assert.equal(config.thresholds.maxDiffLines, 400);
  assert.equal(config.ui.statusLine, 'compact');
  assert.deepEqual(problems, []);
});

test('the defaults object is frozen — loading does not pollute it', () => {
  const { config } = loadConfig();
  config.thresholds.maxDiffLines = 1;
  assert.equal(DEFAULT_CONFIG.thresholds.maxDiffLines, 400);
});

test('config.json values override the defaults', () => {
  writeConfig({ mode: 'explore', disabled: ['DOK'], allowTestWrites: true, thresholds: { maxDiffLines: 120 }, ui: { statusLine: 'minimal' } });
  const { config, problems, sources } = loadConfig();
  assert.equal(config.mode, 'explore');
  assert.deepEqual(config.disabled, ['DOK']);
  assert.equal(config.allowTestWrites, true);
  assert.equal(config.thresholds.maxDiffLines, 120);
  assert.equal(config.ui.statusLine, 'minimal');
  assert.equal(config.ui.cleanScans, 'silent', 'an untouched field must keep its default');
  assert.deepEqual(problems, []);
  assert.ok(sources.some((s) => s.endsWith('config.json')));
});

test('malformed JSON is not swallowed — it falls back and reports', () => {
  writeConfig('{ bu json değil');
  const { config, problems } = loadConfig();
  assert.equal(config.mode, 'strict');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /config\.json is not valid JSON/);
});

test('an invalid enum is refused and reported', () => {
  writeConfig({ mode: 'off', ui: { livenessCheck: 'belki' } });
  const { config, problems } = loadConfig();
  assert.equal(config.mode, 'strict');
  assert.equal(config.ui.livenessCheck, 'ask');
  assert.equal(problems.length, 2);
});

test('a field of the wrong type is reported', () => {
  writeConfig({ disabled: 'DOK', thresholds: { maxDiffLines: 'lots' } });
  const { config, problems } = loadConfig();
  assert.deepEqual(config.disabled, []);
  assert.equal(config.thresholds.maxDiffLines, 400);
  assert.equal(problems.length, 2);
});

test('the session mode overrides config.json', () => {
  writeConfig({ mode: 'strict' });
  assert.equal(loadConfig({ sessionMode: 'explore' }).config.mode, 'explore');
  assert.equal(loadConfig({ sessionMode: 'nonsense' }).config.mode, 'strict');
  assert.equal(loadConfig({ sessionMode: 'nonsense' }).problems.length, 1);
});

test('user patterns compile; an invalid entry is skipped and reported', () => {
  writeLocal([
    { key: 'custom-1', id: 'KOD-01', scope: 'code', match: 'TODO\\s+acil', severity: 'warn' },
    { key: 'missing', id: 'KOD-01' },
    { key: 'broken-regex', id: 'KOD-01', scope: 'code', match: '([' },
    { key: 'broken-scope', id: 'KOD-01', scope: 'anywhere', match: 'x' },
  ]);
  const { config, problems } = loadConfig();
  assert.equal(config.localPatterns.length, 1);
  assert.equal(config.localPatterns[0].key, 'custom-1');
  assert.ok(config.localPatterns[0].match instanceof RegExp);
  assert.equal(problems.length, 3);
});

test('compileLocalPatterns also accepts the { patterns: [...] } shape', () => {
  const problems = [];
  const out = compileLocalPatterns({ patterns: [{ key: 'a', id: 'KOD-01', scope: 'code', match: 'x' }] }, problems);
  assert.equal(out.length, 1);
  assert.deepEqual(problems, []);
});

test('glob translation: * does not cross a directory boundary, ** does', () => {
  assert.ok(globToRegExp('src/*.js').test('src/a.js'));
  assert.equal(globToRegExp('src/*.js').test('src/deep/a.js'), false);
  assert.ok(globToRegExp('src/**/*.js').test('src/deep/a.js'));
  assert.ok(globToRegExp('vendor').test('vendor/lib/x.js'), 'a directory name covers everything below it');
  assert.equal(globToRegExp('vendor').test('vendored/x.js'), false);
});

test('.slopignore path exemptions', () => {
  const root = mkdtempSync(join(tmpdir(), 'slopguard-repo-'));
  mkdirSync(join(root, 'vendor'), { recursive: true });
  writeFileSync(join(root, '.slopignore'), '# comment\n\nvendor\n**/*.generated.ts\n');
  const { config, sources } = loadConfig({ repoRoot: root });
  assert.ok(sources.some((s) => s.endsWith('.slopignore')));
  assert.equal(isPathIgnored(config, join(root, 'vendor/lib.js'), root), true);
  assert.equal(isPathIgnored(config, join(root, 'src/api.generated.ts'), root), true);
  assert.equal(isPathIgnored(config, join(root, 'src/api.ts'), root), false);
  rmSync(root, { recursive: true, force: true });
});

test('parseSlopignore drops comments and blank lines', () => {
  assert.equal(parseSlopignore('# comment\n\n  build  \n').length, 1);
});

test('the mode decides what a finding does', () => {
  const block = { severity: 'block' };
  const warn = { severity: 'warn' };
  assert.equal(actionFor(block, { mode: 'strict' }), 'block');
  assert.equal(actionFor(warn, { mode: 'strict' }), 'warn');
  assert.equal(actionFor(block, { mode: 'explore' }), 'warn', 'explore mode does not block');
});

test('a leaked-secret finding inside a test is warned about, not blocked', () => {
  // A test that verifies credential handling has to contain credential-shaped
  // strings. Across 23 repositories, 100 SEC-03 findings were invented
  // credentials in .test.mjs files and every one would have refused a commit.
  const inTest = { severity: 'block', scope: 'code', category: 'SEC', target: 'src/credentials.test.mjs' };
  const inSource = { ...inTest, target: 'src/credentials.mjs' };
  const strict = { ...DEFAULT_CONFIG, mode: 'strict' };

  assert.equal(actionFor(inTest, strict), 'warn');
  assert.equal(actionFor(inSource, strict), 'block', 'source is unaffected');
});

test('the test carve-out is for secrets only, and never silences', () => {
  const strict = { ...DEFAULT_CONFIG, mode: 'strict' };
  // Another category in a test file still blocks — this is not a blanket exemption.
  assert.equal(actionFor(
    { severity: 'block', scope: 'code', category: 'CODE', target: 'a/b.test.js' }, strict), 'block');
  // A command is never downgraded, whatever the path.
  assert.equal(actionFor(
    { severity: 'block', scope: 'command', category: 'SEC', target: 'a/b.test.js' }, strict), 'block');
  // No path at all must not be mistaken for a test path.
  assert.equal(actionFor(
    { severity: 'block', scope: 'code', category: 'SEC', target: null }, strict), 'block');
});
