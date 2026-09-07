import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS } from '../lib/patterns.mjs';
import { scanContent } from '../lib/scan.mjs';

/**
 * CODE-10 — comment noise.
 *
 * The boundary this file holds: the patterns fire on a comment that is accurate
 * and worthless, never on one that carries information. Both halves are tested,
 * because a pattern that only proves it catches things proves nothing about
 * what it leaves alone.
 */

const keys = (findings) => findings.map((f) => f.key);
const scan = (content, file = 'a.js') => scanContent({ filePath: file, content });

const CAUGHT = [
  ['code-10-banner-rule',     'a.js', '// ========================\nfunction go() {}'],
  ['code-10-banner-rule',     'a.py', '# ------------------\ndef go(): pass'],
  ['code-10-banner-rule',     'a.js', '/* ******** */'],
  ['code-10-shouted-banner',  'a.js', '// ==== ROUTES ===='],
  ['code-10-shouted-banner',  'a.py', '# -------- WORKFLOW --------'],
  ['code-10-step-narration',  'a.js', '// Step 1: Validate input\nvalidate(x)'],
  ['code-10-step-narration',  'a.py', '# Step 2. Process request'],
  ['code-10-empty-label',     'a.js', '// Main logic\nrun()'],
  ['code-10-empty-label',     'a.py', '# Error handling'],
  ['code-10-empty-note',      'a.js', '// Note: This is important.'],
  ['code-10-empty-note',      'a.js', '// Important: Please read'],
  ['code-10-vague-todo',      'a.js', '// TODO: Improve this'],
  ['code-10-vague-todo',      'a.py', '# FIXME: clean up later'],
  ['code-10-future-work',     'a.js', '// Future improvements'],
  ['code-10-future-work',     'a.js', '// Additional optimization can be added here'],
  ['code-10-signature-echo',  'a.js', '/**\n * @param price The price.\n */'],
  ['code-10-signature-echo',  'a.ts', '/**\n * @param {string} name name\n */'],
  ['code-10-comment-emoji',   'a.js', '// ✅ Validation'],
  ['code-10-comment-emoji',   'a.py', '# 🚀 Performance'],
  ['code-10-end-marker',      'a.js', '} // end if'],
  ['code-10-end-marker',      'a.py', '# End of function'],
];

for (const [key, file, content] of CAUGHT) {
  test(`${key} catches: ${content.split('\n')[0]}`, () => {
    assert.ok(keys(scan(content, file)).includes(key), `expected ${key} in ${keys(scan(content, file)).join(', ') || 'no findings'}`);
  });
}

const LEFT_ALONE = [
  ['labelled separator in this codebase', 'a.js', '// ── Shared tables ────────────────────────'],
  ['a comment stating a fact',            'a.js', '// Note: retries happen only on 5xx'],
  ['a TODO naming the task',              'a.js', '// TODO: optimise the O(n^2) join once the index lands (see #431)'],
  ['documented parameter',                'a.js', '/**\n * @param price the amount charged before tax, in minor units\n */'],
  ['C preprocessor directive',            'a.c',  '#ifdef DEBUG\n#endif'],
  ['emoji in a string, not a comment',    'a.js', 'const STATUS_ICON = "✅";'],
  ['python encoding cookie',              'a.py', '# -*- coding: utf-8 -*-'],
  ['a real explanation of a step',        'a.js', '// step size is 4 bytes because the header is packed'],
  ['dashes inside a string literal',      'a.js', 'const RULE = "----------";'],
];

for (const [label, file, content] of LEFT_ALONE) {
  test(`left alone: ${label}`, () => {
    const found = keys(scan(content, file)).filter((k) => k.startsWith('code-10-'));
    assert.deepEqual(found, [], `unexpected: ${found.join(', ')}`);
  });
}

test('every CODE-10 pattern warns and carries a counter-list', () => {
  const entries = PATTERNS.filter((p) => p.id === 'CODE-10');
  assert.equal(entries.length, 10);
  for (const p of entries) {
    assert.equal(p.severity, 'warn', `${p.key}: comment noise never blocks`);
    assert.ok(p.notFlagged?.length > 0, `${p.key}: no counter-examples`);
    assert.match(p.fix, /^Do not write it\./, `${p.key}: the fix must not read as a licence to delete`);
  }
});
