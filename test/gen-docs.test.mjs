import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './pipe.mjs';
import { PATTERNS, PATTERN_COUNT, TAXONOMY } from '../lib/patterns.mjs';
import { DEFAULT_CONFIG } from '../lib/config.mjs';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('generated documentation is current — the DOC-07 gate', () => {
  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/gen-docs.mjs'), '--check'], { encoding: 'utf8' });
  } catch (error) {
    code = error.status ?? 1;
    out = error.stdout ?? '';
  }
  assert.equal(code, 0, `stale dosyalar var, npm run docs çalıştır:\n${out}`);
});

test('the README takes the catalogue from the registry', () => {
  const readme = read('README.md');
  for (const p of PATTERNS) {
    assert.ok(readme.includes(`\`${p.key}\``), `missing from the catalogue: ${p.key}`);
  }
  // Generated from the registry, so the numbers change with the code.
  // Generated from the registry, so the numbers change with the code.
  assert.match(readme, /\| DOC-01 \|/);
  assert.match(readme, /\| DOC-04 \|/);
  assert.match(readme, new RegExp(`${PATTERN_COUNT} mechanical patterns`));
  assert.match(readme, new RegExp(`${TAXONOMY.length} taxonomy entries`));
});

test('the README takes threshold defaults from the code', () => {
  const readme = read('README.md');
  for (const [k, v] of Object.entries(DEFAULT_CONFIG.thresholds)) {
    assert.ok(readme.includes(`\`thresholds.${k}\``), `threshold missing: ${k}`);
    assert.ok(readme.includes(`\`${v}\``), `value missing: ${k}=${v}`);
  }
});

test('the README does not break our own DOC rules', async () => {
  const { scanContent, actionable } = await import('../lib/scan.mjs');
  const findings = actionable(scanContent({ filePath: 'README.md', content: read('README.md') }));
  assert.deepEqual(findings.map((f) => `${f.id}:${f.line}`), []);
  assert.doesNotMatch(read('README.md'), /^#{1,6}\s+\p{Extended_Pictographic}/mu, 'başlıkta emoji yok');
});

test('the README carries the sections the plan asked for', () => {
  const readme = read('README.md');
  for (const heading of ['## What it does', '## Installation', '## What happens during a session',
                         '## Configuration reference', '### Pattern catalogue', '### Commands',
                         '## For an AI: how you help the user', '### Intent to action',
                         '### Safe and unsafe edits', '## Troubleshooting',
                         '## Known limits', '## Removal']) {
    assert.ok(readme.includes(heading), `missing section: ${heading}`);
  }
});

test('the README does not hide the known limits', () => {
  const readme = read('README.md');
  assert.match(readme, /produces false positives/);
  assert.match(readme, /post-edit` block does not stop the model/);
  assert.match(readme, /Guard-and-go .* cannot be caught reliably/);
});

test('CLAUDE.md carries the binding commitments and the measurements', () => {
  const claude = read('CLAUDE.md');
  assert.match(claude, /Zero runtime dependencies/);
  assert.match(claude, /waiver is written/);
  assert.match(claude, /exitWhenFlushed/);
  assert.match(claude, /verification-log\.md/);
});

test('the semgrep template produces a rule for every content pattern', () => {
  const yaml = read('templates/semgrep-slop.yml');
  const contentPatterns = PATTERNS.filter((p) => p.scope === 'code' || p.scope === 'prose');
  for (const p of contentPatterns) {
    assert.ok(yaml.includes(`slopguard-${p.key}`), `semgrep rule missing: ${p.key}`);
  }
  assert.ok(!yaml.includes('slopguard-agent-05-rm-recursive-force'),
    'command scope cannot be expressed statically and must stay out');
  assert.match(yaml, /GENERATED FILE/);
});

test('config.default.json matches the running defaults exactly', () => {
  const generated = JSON.parse(read('templates/config.default.json'));
  assert.equal(generated.mode, DEFAULT_CONFIG.mode);
  assert.equal(generated.enabled, DEFAULT_CONFIG.enabled);
  assert.deepEqual(generated.thresholds, { ...DEFAULT_CONFIG.thresholds });
  assert.deepEqual(generated.ui, { ...DEFAULT_CONFIG.ui });
});

test('the example patterns.local.json really compiles', async () => {
  const { compileLocalPatterns } = await import('../lib/config.mjs');
  const problems = [];
  const compiled = compileLocalPatterns(JSON.parse(read('templates/patterns.local.example.json')), problems);
  assert.deepEqual(problems, [], 'the example file must load without problems');
  assert.equal(compiled.length, 2);
  assert.ok(compiled[0].match.test('TODO (urgent) fix this'));
  assert.ok(compiled[1].match.test("import x from 'lodash'"));
});

test('the skill schema sections are filled with generated content', () => {
  const skill = read('skills/slop-config/SKILL.md');
  assert.match(skill, /<!-- GENERATED: config-schema -->\n\| Field \| Default/);
  assert.match(skill, /<!-- GENERATED: pattern-catalogue -->\n\| ID \| Pattern key/);
  assert.ok(skill.includes('`code-05-empty-catch`'), 'the catalogue must be injected into the skill too');
});

test('every documented ui setting has a consumer — no dead knobs', () => {
  const consumers = [
    read('bin/statusline.mjs'),
    read('hooks/post-edit.mjs'),
    read('hooks/session-start.mjs'),
    read('templates/claude-md-snippet.md'),
    read('hooks/user-prompt.mjs'),
  ].join('\n');
  for (const key of Object.keys(DEFAULT_CONFIG.ui)) {
    // Generated from the registry, so the numbers change with the code.
    // Generated from the registry, so the numbers change with the code.
    // Generated from the registry, so the numbers change with the code.
    const re = new RegExp(`(?:config\\.)?ui[.\\[]'?${key}`);
    assert.ok(re.test(consumers),
      `ui.${key} belgeleniyor ama hiçbir yerde okunmuyor — kullanıcı değiştirir, hiçbir şey olmaz`);
  }
});

test('the liveness rule lives outside the plugin and reads the setting', () => {
  const snippet = read('templates/claude-md-snippet.md');
  assert.match(snippet, /heartbeat\.json/);
  assert.match(snippet, /ui\.livenessCheck/);
  for (const value of ['ask', 'warn', 'off']) assert.ok(snippet.includes(`\`${value}\``), value);
  assert.match(snippet, /do not ask again in the same/);
});

test('plugin.json does not declare the standard hooks path', () => {
  // Generated from the registry, so the numbers change with the code.
  // Generated from the registry, so the numbers change with the code.
  // Generated from the registry, so the numbers change with the code.
  // Generated from the registry, so the numbers change with the code.
  const manifest = JSON.parse(read('.claude-plugin/plugin.json'));
  assert.equal(manifest.hooks, undefined,
    'hooks alanı yalnızca EK hook dosyaları için; standart yolu bildirmek yükleme hatası verir');
  assert.ok(read('hooks/hooks.json').length > 0, 'standart dosya yine de var olmalı');
});
