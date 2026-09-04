import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deny, block, notify, inject, fail, summarize, formatFindings, formatFinding, formatCleanScan } from '../lib/report.mjs';
import { scanContent, scanCommand } from '../lib/scan.mjs';

/** Captures stdout and returns the single JSON object written. */
function capture(fn) {
  const original = process.stdout.write;
  let buf = '';
  process.stdout.write = (chunk) => { buf += chunk; return true; };
  try { fn(); } finally { process.stdout.write = original; }
  return buf === '' ? null : JSON.parse(buf);
}

function captureStderr(fn) {
  const original = process.stderr.write;
  let buf = '';
  process.stderr.write = (chunk) => { buf += chunk; return true; };
  try { fn(); } finally { process.stderr.write = original; }
  return buf;
}

// The schemas were exercised for real (docs/verification-log.md); these tests lock the contract.

test('the deny shape matches the PreToolUse contract', () => {
  const out = capture(() => deny('test file is protected'));
  assert.deepEqual(out, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'test file is protected',
    },
  });
});

test('the block shape matches the PostToolUse and Stop contract', () => {
  assert.deepEqual(capture(() => block('CODE-05 line 3')), { decision: 'block', reason: 'CODE-05 line 3' });
});

test('notify writes systemMessage to the user channel', () => {
  assert.deepEqual(capture(() => notify('the session has grown long')), { systemMessage: 'the session has grown long' });
});

test('inject adds additionalContext for the model', () => {
  assert.deepEqual(capture(() => inject('SessionStart', 'rule set')), {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'rule set' },
  });
});

test('fail writes to stderr and leaves stdout untouched — errors are not swallowed', () => {
  let stdout = null;
  const err = captureStderr(() => { stdout = capture(() => fail('post-edit', new Error('disk full'))); });
  assert.equal(stdout, null, 'stdout must stay empty or the hook protocol breaks');
  assert.match(err, /LenaRise\.SlopGuard \[post-edit\] error: Error: disk full/);
});

test('fail does not swallow a non-Error value either', () => {
  assert.match(captureStderr(() => fail('pre-bash', 'plain text error')), /plain text error/);
});

// ── Counting and formatting ──────────────────────────────────────────────

const findings = scanContent({
  filePath: 'a.js',
  content: [
    'try { a() } catch (e) {}',
    'const k = "AKIAIOSFODNN7EXAMPLE"',
    '// slop-guard-ignore CODE-04: deliberate dead branch, removed when the migration lands',
    'if (false) { legacy() }',
  ].join('\n'),
});

test('summarize counts blocks in strict mode', () => {
  const s = summarize(findings, { mode: 'strict' });
  assert.equal(s.blocked, 2, 'empty catch plus the AWS key');
  assert.equal(s.suppressed, 1, 'the waived guard-and-go');
  assert.equal(s.warned, 0);
});

test('summarize blocks nothing in explore mode', () => {
  const s = summarize(findings, { mode: 'explore' });
  assert.equal(s.blocked, 0);
  assert.equal(s.warned, 2);
});

test('formatFindings omits a suppressed finding but reports the count', () => {
  const text = formatFindings(findings, { config: { mode: 'strict' }, target: 'a.js' });
  assert.match(text, /2 pattern blocked \(strict mode\)/);
  assert.match(text, /CODE-05/);
  assert.match(text, /SEC-03/);
  assert.doesNotMatch(text, /CODE-04/, 'a suppressed finding must not be listed');
  assert.match(text, /1 finding\(s\) silenced by an inline waiver/);
});

test('formatFindings returns an empty string for a clean list', () => {
  assert.equal(formatFindings([], { config: {} }), '');
});

test('formatFinding carries the fix and the excerpt', () => {
  const [f] = scanContent({ filePath: 'a.js', content: 'try { a() } catch (e) {}' });
  const text = formatFinding(f);
  assert.match(text, /line 1/);
  assert.match(text, /Error suppression/);
  assert.match(text, /> try \{ a\(\) \} catch \(e\) \{\}/);
  assert.match(text, /Fix: Log it, rethrow it/);
});

test('formatFinding tells the user when a waiver is invalid', () => {
  const [f] = scanContent({ filePath: 'a.js', content: '// slop-guard-ignore CODE-05\ntry { a() } catch (e) {}' });
  assert.match(formatFinding(f), /waiver on line 1 is not valid — no reason was given/);
});

test('a command finding says "command" instead of a line number', () => {
  const [f] = scanCommand({ command: 'rm -rf /tmp/x' });
  assert.match(formatFinding(f), /AGENT-05 {2}command/);
});

test('the clean scan line', () => {
  assert.equal(formatCleanScan(4), 'LenaRise.SlopGuard: 4 file(s) scanned · clean');
});
