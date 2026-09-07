import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS } from '../lib/patterns.mjs';
import { scanContent } from '../lib/scan.mjs';

/**
 * DOC-08 — the shape of machine prose, and DOC-09 — evidence with nothing
 * behind it.
 *
 * DOC-01 already catches marketing words one at a time. These catch the moves:
 * the closing offer of help, the announcement of what comes next, the authority
 * that is never named. DOC-09 is the honesty half and runs in three file
 * classes, because the same invented number is the same lie in a README, in JSX
 * and in HTML.
 */

const keys = (findings) => findings.map((f) => f.key);
const scan = (content, file = 'a.md') => keys(scanContent({ filePath: file, content }));

const CAUGHT = [
  ['doc-08-chatbot-closer',      'a.md', 'The gate is closed. Let me know if you would like another pass.'],
  ['doc-08-chatbot-closer',      'a.md', 'I hope this helps!'],
  ['doc-08-signposting',         'a.md', "In this section, we'll explore the hook layer."],
  ['doc-08-signposting',         'a.md', "Let's dive into the scanner."],
  ['doc-08-weasel-attribution',  'a.md', 'Experts agree that static analysis is necessary.'],
  ['doc-08-weasel-attribution',  'a.md', 'Studies show that reviews catch more defects.'],
  ['doc-08-stacked-hedging',     'a.md', 'This may potentially break the build.'],
  ['doc-08-filler-opener',       'a.md', "It's important to note that the hook runs first."],
  ['doc-08-filler-opener',       'a.md', "In today's fast-paced world, teams ship faster."],
  ['doc-08-negative-parallelism','a.md', "It's not just a linter, it's a philosophy."],
  ['doc-08-inline-header-list',  'a.md', '- **One**: first\n- **Two**: second\n- **Three**: third'],
  ['doc-09-fabricated-metric-prose',  'a.md',  'Trusted by 10K+ users worldwide.'],
  ['doc-09-fabricated-metric-code',   'a.tsx', 'const stat = <p>99.9% uptime</p>'],
  ['doc-09-fabricated-metric-markup', 'a.html','<span>500+ companies</span>'],
  ['doc-09-filler-identity-prose',    'a.md',  'Reviewed by John Doe, CTO.'],
  ['doc-09-filler-identity-code',     'a.jsx', 'const author = "Jane Smith"'],
  ['doc-09-filler-identity-markup',   'a.html','<p>Acme Inc</p>'],
];

for (const [key, file, content] of CAUGHT) {
  test(`${key} catches: ${content.slice(0, 46)}`, () => {
    const found = scan(content, file);
    assert.ok(found.includes(key), `expected ${key}, got ${found.join(', ') || 'nothing'}`);
  });
}

const LEFT_ALONE = [
  ['a fact, not a hedge stack',   'a.md', 'This may fail when the registry is unreachable.'],
  ['a named source',              'a.md', 'The Node documentation says the stream is destroyed on error.'],
  ['a plain negation',            'a.md', 'This is not a style guide. The rules are mechanical.'],
  ['one bold lead-in only',       'a.md', '- **Scope**: the file classes a pattern reads\n- an ordinary second item\n- a third'],
  ['a sourced number',            'a.md', 'Two of the 12 users hit the timeout (see the log).'],
  ['note that, without filler',   'a.md', 'Note that the hook does not fire when the command fails.'],
];

for (const [label, file, content] of LEFT_ALONE) {
  test(`left alone: ${label}`, () => {
    const found = scan(content, file).filter((k) => k.startsWith('doc-08-') || k.startsWith('doc-09-'));
    assert.deepEqual(found, [], `unexpected: ${found.join(', ')}`);
  });
}

test('prose patterns do not read fenced code blocks', () => {
  const doc = '# Title\n\n```js\n// Let me know if you would like more\n```\n';
  assert.deepEqual(scan(doc).filter((k) => k.startsWith('doc-08-')), []);
});

test('DOC-09 runs in every file class it claims, from one regex', () => {
  const metric = PATTERNS.filter((p) => p.key.startsWith('doc-09-fabricated-metric-'));
  assert.deepEqual(metric.map((p) => p.scope), ['prose', 'code', 'markup']);
  const sources = new Set(metric.map((p) => p.match.source));
  assert.equal(sources.size, 1, 'the three entries must share one regex');
});

test('every DOC-08 and DOC-09 pattern warns and carries a counter-list', () => {
  const entries = PATTERNS.filter((p) => p.id === 'DOC-08' || p.id === 'DOC-09');
  assert.equal(entries.length, 13);
  for (const p of entries) {
    assert.equal(p.severity, 'warn', `${p.key}`);
    assert.ok(p.notFlagged?.length > 0, `${p.key}: no counter-examples`);
  }
});
