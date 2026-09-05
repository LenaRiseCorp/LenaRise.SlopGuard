import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'slopguard-session-'));
process.env.SLOPGUARD_CONFIG_DIR = DIR;
const S = await import('../lib/session.mjs');
const C = await import('../lib/coach.mjs');
const { DEFAULT_CONFIG, paths } = await import('../lib/config.mjs');
const { scanContent } = await import('../lib/scan.mjs');

const SID = 'test-session';
beforeEach(() => rmSync(paths.session(SID), { force: true }));

function captureStderr(fn) {
  const original = process.stderr.write;
  let buf = '';
  process.stderr.write = (c) => { buf += c; return true; };
  try { return [fn(), buf]; } finally { process.stderr.write = original; }
}

// Seeded session state, so thresholds can be crossed deterministically.

test('a new session starts with empty counters', () => {
  const s = S.loadSession(SID);
  assert.equal(s.turns, 0);
  assert.equal(s.blocked, 0);
  assert.deepEqual(s.violations, {});
  assert.equal(s.version, S.SESSION_VERSION);
});

test('save and reload: the counters survive', () => {
  const s = S.loadSession(SID);
  s.turns = 7; s.linesWritten = 420;
  assert.equal(S.saveSession(s), true);
  assert.equal(S.loadSession(SID).turns, 7);
  assert.equal(S.loadSession(SID).linesWritten, 420);
});

test('a corrupt session file is not swallowed — it writes to stderr and starts fresh', () => {
  writeFileSync(paths.session(SID), '{ bozuk');
  const [state, err] = captureStderr(() => S.loadSession(SID));
  assert.equal(state.turns, 0);
  assert.match(err, /session file could not be read/);
});

test('the write is atomic: no temp file is left behind', () => {
  const s = S.loadSession(SID);
  S.saveSession(s);
  assert.equal(existsSync(`${paths.session(SID)}.${process.pid}.tmp`), false);
  JSON.parse(readFileSync(paths.session(SID), 'utf8'));
});

test('updateSession reads, mutates, writes and returns the mutator result', () => {
  const turn = S.updateSession(SID, (s) => S.recordTurn(s));
  assert.equal(turn, 1);
  assert.equal(S.loadSession(SID).turns, 1);
});

// Seeded session state, so thresholds can be crossed deterministically.

test('consecutive writes to one file are counted; another file resets it', () => {
  const s = S.loadSession(SID);
  assert.equal(S.recordWrite(s, 'a.js', { added: 10 }), 1);
  assert.equal(S.recordWrite(s, 'a.js', { added: 5 }), 2);
  assert.equal(S.recordWrite(s, 'b.js', { added: 5 }), 1, 'farklı dosya zinciri kırar');
  assert.equal(S.recordWrite(s, 'b.js'), 2);
  assert.equal(s.linesWritten, 20);
  assert.equal(Object.keys(s.filesWritten).length, 2);
});

test('lines read are counted for comprehension debt', () => {
  const s = S.loadSession(SID);
  S.recordRead(s, 60);
  S.recordRead(s, -5);
  assert.equal(s.linesRead, 60, 'negatif değer sayacı bozmamalı');
});

test('a commit resets the counters and invalidates verification', () => {
  const s = S.loadSession(SID);
  S.recordWrite(s, 'a.js', { added: 100, removed: 20 });
  S.recordTestRun(s);
  assert.equal(s.linesSinceCommit, 120);
  S.recordCommit(s);
  assert.equal(s.linesSinceCommit, 0);
  assert.equal(s.testRunAt, null, 'yeni commit yeni doğrulama ister');
});

// Seeded session state, so thresholds can be crossed deterministically.

test('the ledger refreshes per file; a fixed violation drops out on its own', () => {
  const s = S.loadSession(SID);
  const kirli = scanContent({ filePath: 'a.js', content: 'try{a()}catch(e){}' });
  assert.equal(S.recordViolations(s, 'a.js', kirli), 1);
  assert.equal(S.openViolations(s).length, 1);
  assert.equal(S.openViolations(s)[0].file, 'a.js');

  const clean = scanContent({ filePath: 'a.js', content: 'try{a()}catch(e){log(e)}' });
  assert.equal(S.recordViolations(s, 'a.js', clean), 0);
  assert.deepEqual(S.openViolations(s), [], 'düzeltilen dosya defterden düşmeli');
});

test('a silenced finding stays out of the ledger but is counted', () => {
  const s = S.loadSession(SID);
  const f = scanContent({ filePath: 'a.js', content: '// slop-guard-ignore CODE-05: gerekçe\ntry{a()}catch(e){}' });
  assert.equal(S.recordViolations(s, 'a.js', f), 0);
  assert.deepEqual(S.openViolations(s), []);
  assert.equal(s.suppressions, 1);
});

test('violations from several files are kept apart', () => {
  const s = S.loadSession(SID);
  S.recordViolations(s, 'a.js', scanContent({ filePath: 'a.js', content: 'try{}catch(e){}' }));
  S.recordViolations(s, 'b.js', scanContent({ filePath: 'b.js', content: 'const k="AKIAIOSFODNN7EXAMPLE"' }));
  assert.equal(S.openViolations(s).length, 2);
  assert.deepEqual(S.openViolations(s).map((v) => v.file).sort(), ['a.js', 'b.js']);
  assert.equal(s.byCategory.CODE, 1);
  assert.equal(s.byCategory.SEC, 1);
});

test('a warning can be claimed once per session', () => {
  const s = S.loadSession(SID);
  assert.equal(S.claimWarning(s, 'x'), true);
  assert.equal(S.claimWarning(s, 'x'), false);
  assert.equal(S.claimWarning(s, 'y'), true);
});

test('the session summary reports measurement, not assertion', () => {
  const s = S.loadSession(SID);
  s.turns = 12; s.linesWritten = 420; s.blocked = 3; s.suppressions = 2;
  S.recordWrite(s, 'a.js');
  const text = S.sessionSummary(s);
  assert.match(text, /12 turns/);
  assert.match(text, /420 lines written/);
  assert.match(text, /3 slop blocked/);
  assert.match(text, /2 waivers used/);
});

// Seeded session state, so thresholds can be crossed deterministically.

const cfg = { thresholds: { ...DEFAULT_CONFIG.thresholds } };

test('the context rot threshold fires on the turn counter (AGENT-01)', () => {
  const s = S.loadSession(SID);
  s.turns = cfg.thresholds.contextTurns - 1;
  assert.deepEqual(C.evaluate(s, cfg), []);
  s.turns = cfg.thresholds.contextTurns;
  const w = C.evaluate(s, cfg);
  assert.equal(w.length, 1);
  assert.equal(w[0].pattern, 'AGENT-01');
  assert.match(w[0].message, /reached 40 turns/);
});

test('a warning appears only once per session', () => {
  const s = S.loadSession(SID);
  s.turns = 100;
  assert.equal(C.evaluate(s, cfg).length, 1);
  assert.equal(C.evaluate(s, cfg).length, 0, 'ikinci kez çıkmamalı');
});

test('comprehension debt is measured as written minus read (HUMAN-01)', () => {
  const s = S.loadSession(SID);
  s.linesWritten = 800; s.linesRead = 400;
  assert.deepEqual(C.evaluate(s, cfg), [], '400 fark eşiğin altında');
  s.linesRead = 60;
  const w = C.evaluate(s, cfg);
  assert.equal(w[0].pattern, 'HUMAN-01');
  assert.match(w[0].message, /800 lines produced, 60 lines read/);
});

test('the uncommitted progress threshold (AGENT-06)', () => {
  const s = S.loadSession(SID);
  s.linesSinceCommit = 300;
  assert.equal(C.evaluate(s, cfg)[0].pattern, 'AGENT-06');
});

test('the cascading-patch threshold (LOGIC-05)', () => {
  const s = S.loadSession(SID);
  s.lastEditedFile = 'parser.ts'; s.consecutiveEdits = 3;
  const w = C.evaluate(s, cfg);
  assert.equal(w[0].pattern, 'LOGIC-05');
  assert.match(w[0].message, /parser\.ts/);
});

test('a threshold can be changed through the configuration', () => {
  const s = S.loadSession(SID);
  s.turns = 5;
  assert.deepEqual(C.evaluate(s, cfg), []);
  assert.equal(C.evaluate(s, { thresholds: { ...cfg.thresholds, contextTurns: 5 } }).length, 1);
});

test('several thresholds crossed at once are all reported', () => {
  const s = S.loadSession(SID);
  s.turns = 50; s.linesSinceCommit = 900;
  assert.equal(C.evaluate(s, cfg).length, 2);
});

test('the pre-commit verification is asked every time (TEST-05)', () => {
  const s = S.loadSession(SID);
  assert.equal(C.verifyBeforeCommit(s).pattern, 'TEST-05');
  assert.equal(C.verifyBeforeCommit(s).pattern, 'TEST-05', 'bir kez kuralının dışında');
  S.recordTestRun(s);
  assert.equal(C.verifyBeforeCommit(s), null, 'test çalıştıysa sormaz');
});

test('warnings merge into one systemMessage body', () => {
  assert.equal(C.formatWarnings([]), '');
  const one = C.formatWarnings([{ message: 'single notice' }]);
  assert.match(one, /^LenaRise\.SlopGuard\n\n {2}· single notice$/);
  const two = C.formatWarnings([{ message: 'one' }, { message: 'two' }]);
  assert.match(two, /2 notices/);
});

test('only writes inside the repository count as uncommitted work', () => {
  // PROC-02 and AGENT-06 mean "there is no point left to roll back to". A file
  // outside any repository can never be committed, so counting it produces a
  // warning whose advice cannot be followed — which is how a session spent
  // entirely on measurement scripts in a temp directory got told to commit.
  const s = S.loadSession(SID);
  S.recordWrite(s, '/tmp/probe.mjs', { added: 300, removed: 100, inRepo: false });
  assert.equal(s.linesSinceCommit, 0, 'a scratch file is activity, not uncommitted debt');
  assert.equal(s.linesWritten, 300, 'it is still recorded as work done');

  S.recordWrite(s, 'src/a.js', { added: 40, removed: 10, inRepo: true });
  assert.equal(s.linesSinceCommit, 50);
});

test('inRepo defaults to true so an unaware caller still counts', () => {
  const s = S.loadSession(SID);
  S.recordWrite(s, 'src/a.js', { added: 7 });
  assert.equal(s.linesSinceCommit, 7, 'the safe default is to count, not to skip');
});
