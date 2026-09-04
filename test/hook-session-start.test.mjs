import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeWorkspace, pipe } from './pipe.mjs';
import { PATTERN_COUNT, CATEGORIES } from '../lib/patterns.mjs';

const ws = makeWorkspace();
after(() => ws.cleanup());

const start = (sid = 'baslangic') => pipe('hooks/session-start.mjs', {
  session_id: sid, cwd: ws.repo, hook_event_name: 'SessionStart', source: 'startup',
}, { cfgDir: ws.cfgDir });

const localRules = join(ws.cfgDir, 'rules.local.md');
const context = (r) => r.json?.hookSpecificOutput?.additionalContext ?? '';

test('the rule set is injected into the model context', () => {
  const c = context(start());
  assert.match(c, /LenaRise\.SlopGuard — rule set/);
  for (const cat of ['## Code \\(CODE\\)', '## Accuracy \\(LOGIC\\)', '## Testing \\(TEST\\)', '## Security \\(SEC\\)',
                     '## Agent operations \\(AGENT\\)', '## Process \\(PROC\\)', '## Non-code output \\(DOC\\)', '## Human factors \\(HUMAN\\)']) {
    assert.match(c, new RegExp(cat), cat);
  }
});

test('the schema is correct: SessionStart additionalContext', () => {
  const r = start();
  assert.equal(r.json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.ok(typeof r.json.hookSpecificOutput.additionalContext === 'string');
});

test('the capability index takes the pattern count from the registry', () => {
  const c = context(start());
  assert.match(c, new RegExp(`${PATTERN_COUNT} patterns`));
  assert.match(c, new RegExp(`${Object.keys(CATEGORIES).length} categories`));
  assert.match(c, /strict mode/);
});

test('the capability index says where the levers are', () => {
  const c = context(start());
  for (const lever of ['config.json', 'patterns.local.json', 'rules.local.md', '.slopignore']) {
    assert.ok(c.includes(lever), lever);
  }
  assert.match(c, /slop-guard-ignore <ID>: reason/);
  assert.match(c, /do not edit the plugin directory/);
});

test('disabled patterns appear in the index', () => {
  ws.config({ disabled: ['DOC-04'] });
  assert.match(context(start()), /disabled: DOC-04/);
  ws.config({});
});

test('explore mode is visible in the index', () => {
  ws.config({ mode: 'explore' });
  assert.match(context(start()), /explore mode/);
  ws.config({});
});

test('the user own rules are appended', () => {
  writeFileSync(localRules, 'Bu repoda tarih biçimi ISO 8601 olacak.\n');
  const c = context(start());
  assert.match(c, /The user's own rules/);
  assert.match(c, /ISO 8601/);
  rmSync(localRules, { force: true });
});

test('an oversized user rule is truncated and it is said so (AGENT-02)', () => {
  writeFileSync(localRules, 'x'.repeat(9000));
  const c = context(start());
  assert.match(c, /truncated/);
  assert.ok(c.length < 20000, 'bağlam şişirilmemeli');
  rmSync(localRules, { force: true });
});

test('an empty rules.local.md opens no section', () => {
  writeFileSync(localRules, '   \n');
  assert.doesNotMatch(context(start()), /The user's own rules/);
  rmSync(localRules, { force: true });
});

test('nothing is injected when the plugin is disabled', () => {
  ws.config({ enabled: false });
  assert.equal(start().stdout, '');
  ws.config({});
});

test('session start stamps the heartbeat', () => {
  start('atis-baslangic');
  const beat = JSON.parse(readFileSync(join(ws.cfgDir, 'heartbeat.json'), 'utf8'));
  assert.equal(beat.event, 'SessionStart');
  assert.equal(beat.sessionId, 'atis-baslangic');
});

test('the injected text passes our own patterns', async () => {
  const { scanContent, actionable } = await import('../lib/scan.mjs');
  const c = context(start());
  const findings = actionable(scanContent({ filePath: 'injected.md', content: c }));
  assert.deepEqual(findings.map((f) => `${f.id}:${f.line}`), [], 'kendi kural setimiz kendi kurallarını ihlal edemez');
});

test('large output is delivered without truncation — pipe buffer regression', () => {
  // process.exit() did not wait for a pending stdout write, and output beyond
  // ~8 KB was silently truncated. The rule set is above that limit, so the
  // regression would have been expensive.
  // (note)
  writeFileSync(localRules, 'A'.repeat(40000));
  const r = start();
  assert.notEqual(r.json, null, 'çıktı geçerli JSON olmalı, yani kesilmemiş olmalı');
  const c = context(r);
  assert.ok(c.length > 10000, `beklenen büyük bağlam, gelen ${c.length} karakter`);
  assert.match(c, /truncated/);
  assert.match(c, /Commands: \/slop-check/, 'metnin SONU da gelmiş olmalı');
  rmSync(localRules, { force: true });
});
