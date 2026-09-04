import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './pipe.mjs';
import { PATTERNS, PATTERN_COUNT, TAXONOMY } from '../lib/patterns.mjs';
import { DEFAULT_CONFIG } from '../lib/config.mjs';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

test('üretilen doküman güncel — doküman-kod ayrışması kapısı (DOK-07)', () => {
  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/gen-docs.mjs'), '--check'], { encoding: 'utf8' });
  } catch (error) {
    code = error.status ?? 1;
    out = error.stdout ?? '';
  }
  assert.equal(code, 0, `bayat dosyalar var, npm run docs çalıştır:\n${out}`);
});

test('README desen kataloğunu defterden alır, elle yazmaz', () => {
  const readme = read('README.md');
  for (const p of PATTERNS) {
    assert.ok(readme.includes(`\`${p.key}\``), `katalogda eksik: ${p.key}`);
  }
  assert.match(readme, new RegExp(`${PATTERN_COUNT} mekanik desen`));
  assert.match(readme, new RegExp(`${TAXONOMY.length} taksonomi girdisi`));
});

test('README eşik varsayılanlarını koddan alır', () => {
  const readme = read('README.md');
  for (const [k, v] of Object.entries(DEFAULT_CONFIG.thresholds)) {
    assert.ok(readme.includes(`\`thresholds.${k}\``), `eşik eksik: ${k}`);
    assert.ok(readme.includes(`\`${v}\``), `değer eksik: ${k}=${v}`);
  }
});

test('README kendi DOK kurallarımızı ihlal etmiyor', async () => {
  const { scanContent, actionable } = await import('../lib/scan.mjs');
  const findings = actionable(scanContent({ filePath: 'README.md', content: read('README.md') }));
  assert.deepEqual(findings.map((f) => `${f.id}:${f.line}`), []);
  assert.doesNotMatch(read('README.md'), /^#{1,6}\s+\p{Extended_Pictographic}/mu, 'başlıkta emoji yok');
});

test('README planın istediği bölümleri taşıyor', () => {
  const readme = read('README.md');
  for (const heading of ['## Ne yapar', '## Kurulum', '## Oturumda ne olur',
                         '## Yapılandırma referansı', '### Desen kataloğu', '### Komutlar',
                         '## AI için: kullanıcıya nasıl yardım edersin', '### Niyet → eylem',
                         '### Güvenli ve güvensiz düzenlemeler', '## Sorun giderme',
                         '## Bilinen sınırlar', '## Kaldırma']) {
    assert.ok(readme.includes(heading), `bölüm eksik: ${heading}`);
  }
});

test('README bilinen sınırları gizlemiyor', () => {
  const readme = read('README.md');
  assert.match(readme, /yanlış pozitif üretir/);
  assert.match(readme, /post-edit` bloğu modeli durdurmaz/);
  assert.match(readme, /Guard-and-Go .* tam yakalanamaz/);
});

test('CLAUDE.md bağlayıcı taahhütleri ve ölçümleri taşıyor', () => {
  const claude = read('CLAUDE.md');
  assert.match(claude, /Sıfır runtime bağımlılığı/);
  assert.match(claude, /muafiyet yazılmaz/);
  assert.match(claude, /exitWhenFlushed/);
  assert.match(claude, /dogrulama-kaydi\.md/);
});

test('semgrep şablonu her içerik deseni için kural üretir', () => {
  const yaml = read('templates/semgrep-slop.yml');
  const contentPatterns = PATTERNS.filter((p) => p.scope === 'code' || p.scope === 'prose');
  for (const p of contentPatterns) {
    assert.ok(yaml.includes(`slopguard-${p.key}`), `semgrep kuralı eksik: ${p.key}`);
  }
  assert.ok(!yaml.includes('slopguard-agt-05-rm-recursive-force'),
    'komut kapsamı statik tarayıcıya çevrilemez, dışarıda kalmalı');
  assert.match(yaml, /ÜRETİLEN DOSYA/);
});

test('config.default.json çalışan varsayılanlarla birebir', () => {
  const generated = JSON.parse(read('templates/config.default.json'));
  assert.equal(generated.mode, DEFAULT_CONFIG.mode);
  assert.equal(generated.enabled, DEFAULT_CONFIG.enabled);
  assert.deepEqual(generated.thresholds, { ...DEFAULT_CONFIG.thresholds });
  assert.deepEqual(generated.ui, { ...DEFAULT_CONFIG.ui });
});

test('örnek patterns.local.json gerçekten derleniyor', async () => {
  const { compileLocalPatterns } = await import('../lib/config.mjs');
  const problems = [];
  const compiled = compileLocalPatterns(JSON.parse(read('templates/patterns.local.example.json')), problems);
  assert.deepEqual(problems, [], 'örnek dosya sorunsuz yüklenmeli');
  assert.equal(compiled.length, 2);
  assert.ok(compiled[0].match.test('TODO (acil) bunu düzelt'));
  assert.ok(compiled[1].match.test("import x from 'lodash'"));
});

test('skill şema bölümleri üretilmiş içerikle dolu', () => {
  const skill = read('skills/slop-config/SKILL.md');
  assert.match(skill, /<!-- ÜRETİLEN: config-şeması -->\n\| Alan \| Varsayılan/);
  assert.match(skill, /<!-- ÜRETİLEN: desen-kataloğu -->\n\| ID \| Desen anahtarı/);
  assert.ok(skill.includes('`kod-05-empty-catch`'), 'katalog skill e de enjekte edilmeli');
});
