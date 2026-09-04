import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDirective, suppressionFor } from '../lib/ignore.mjs';
import { scanContent, actionable, suppressed } from '../lib/scan.mjs';

const scan = (content) => scanContent({ filePath: 'a.js', content });

test('valid waiver: same line, id named, reason given', () => {
  const src = 'try { sdk.close() } catch (e) {} // slop-guard-ignore CODE-05: SDK burada throw ediyor';
  const all = scan(src);
  assert.equal(all.length, 1);
  assert.equal(actionable(all).length, 0, 'the finding should have been silenced');
  assert.equal(suppressed(all).length, 1);
  assert.equal(suppressed(all)[0].suppression.reason, 'SDK burada throw ediyor');
});

test('valid waiver: on the line above', () => {
  const src = '// slop-guard-ignore CODE-05: third-party contract\ntry { a() } catch (e) {}';
  assert.equal(actionable(scan(src)).length, 0);
});

test('valid waiver: by pattern key instead of taxonomy id', () => {
  const src = '// slop-guard-ignore code-05-empty-catch: reason given\ntry { a() } catch (e) {}';
  assert.equal(actionable(scan(src)).length, 0);
});

test('valid waiver: by category name', () => {
  const src = '// slop-guard-ignore CODE: reason given\ntry { a() } catch (e) {}';
  assert.equal(actionable(scan(src)).length, 0);
});

// ── Three rejection paths: a directive exists but does not silence ────────

test('rejected: no pattern named', () => {
  const src = '// slop-guard-ignore: it is noisy\ntry { a() } catch (e) {}';
  const all = scan(src);
  assert.equal(actionable(all).length, 1, 'a waiver with no target must not silence');
  assert.equal(all[0].suppressionRejected.rejected, 'no-target');
});

test('rejected: no reason given', () => {
  const src = '// slop-guard-ignore CODE-05\ntry { a() } catch (e) {}';
  const all = scan(src);
  assert.equal(actionable(all).length, 1, 'a waiver with no reason must not silence');
  assert.equal(all[0].suppressionRejected.rejected, 'no-reason');
});

test('rejected: it targets a different pattern', () => {
  const src = '// slop-guard-ignore SEC-03: not a secret\ntry { a() } catch (e) {}';
  const all = scan(src);
  assert.equal(actionable(all).length, 1);
  assert.equal(all[0].suppressionRejected.rejected, 'other-target');
});

test('scope is narrow: a waiver two lines up does not reach', () => {
  const src = '// slop-guard-ignore CODE-05: far away\n\ntry { a() } catch (e) {}';
  assert.equal(actionable(scan(src)).length, 1);
});

test('a waiver silences only its own finding', () => {
  const src = [
    '// slop-guard-ignore CODE-05: only this',
    'try { a() } catch (e) {}',
    'const k = "AKIAIOSFODNN7EXAMPLE"',
  ].join('\n');
  const all = scan(src);
  assert.equal(suppressed(all).length, 1);
  assert.deepEqual(actionable(all).map((f) => f.key), ['sec-03-aws-key']);
});

// ── The parser ───────────────────────────────────────────────────────────

test('parseDirective shapes', () => {
  assert.equal(parseDirective('code satırı'), null);
  assert.deepEqual(parseDirective('# slop-guard-ignore SEC-03: fixture'), { target: 'SEC-03', reason: 'fixture', hasReason: true });
  assert.deepEqual(parseDirective('// slop-guard-ignore: sebep'), { target: null, reason: 'sebep', hasReason: true });
  assert.equal(parseDirective('// slop-guard-ignore CODE-05').hasReason, false);
});

test('path and command findings carry no inline waiver', () => {
  const f = { line: 0, key: 'x', id: 'CODE-01', category: 'CODE' };
  assert.equal(suppressionFor(f, ['// slop-guard-ignore CODE-01: sebep']), null);
});
