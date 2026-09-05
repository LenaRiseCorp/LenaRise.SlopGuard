/**
 * Session state.
 *
 * Kept in ~/.claude/lenarise-slopguard/session-<id>.json. Two consumers:
 *   - the coach layer (layer 2): measures thresholds, shows each warning once
 *   - stop-gate: reads open violations and verification state
 *
 * Why the open-violation ledger lives here: post-edit's block does not stop the
 * model (measured — docs/verification-log.md). The hard guarantee is built in
 * the Stop layer instead: post-edit records what it found, and stop-gate refuses
 * to end the turn while the ledger is not empty.
 *
 * The ledger is per file, and each scan replaces that file's entry entirely. A
 * fixed violation therefore drops out on its own; there is no separate "resolved"
 * flag to forget to set.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { paths } from './config.mjs';
import { fail } from './report.mjs';

export const SESSION_VERSION = 1;

export function emptySession(sessionId) {
  return {
    version: SESSION_VERSION,
    sessionId: String(sessionId ?? 'unknown'),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    turns: 0,
    linesWritten: 0,
    linesRead: 0,
    linesSinceCommit: 0,
    filesWritten: {},          // path → write count
    lastEditedFile: null,
    consecutiveEdits: 0,       // consecutive edits to the same file (LOGIC-05)
    blocked: 0,                // slop blocked
    suppressions: 0,           // inline waivers used
    byCategory: {},            // category → finding count
    violations: {},            // path → [{key, id, line, title}]
    codeWritesSinceVerify: 0,  // code files written since the last test run
    stopBlocks: {},            // violation fingerprint → block count (AGENT-08 loop guard)
    testRunAt: null,
    commitAt: null,
    warned: [],                // coach warnings already shown — the once-per-session rule
    decisions: {},             // e.g. { unprotected: true }
    modeOverride: null,
  };
}

/** Reads the session. A missing or corrupt file yields a fresh session — but not silently. */
export function loadSession(sessionId) {
  const file = paths.session(sessionId);
  if (!existsSync(file)) return emptySession(sessionId);
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed?.version !== SESSION_VERSION) {
      return { ...emptySession(sessionId), ...parsed, version: SESSION_VERSION };
    }
    return { ...emptySession(sessionId), ...parsed };
  } catch (error) {
    fail('session', `session file could not be read (${file}); starting fresh — ${error.message}`);
    return emptySession(sessionId);
  }
}

/**
 * Writes the session. Temp file plus rename, so it is atomic: two hooks firing
 * at once cannot leave half-written JSON behind.
 */
export function saveSession(state) {
  const file = paths.session(state.sessionId);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    state.updatedAt = Date.now();
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, file);
    return true;
  } catch (error) {
    fail('session', `session could not be written (${file}) — ${error.message}`);
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch (cleanupError) { fail('session', `temp file could not be removed — ${cleanupError.message}`); }
    }
    return false;
  }
}

/** Read, mutate, write. The mutator's return value is passed back to the caller. */
export function updateSession(sessionId, mutator) {
  const state = loadSession(sessionId);
  const result = mutator(state);
  saveSession(state);
  return result;
}

// ── Recording helpers ────────────────────────────────────────────────────

/** Records one turn. Called from UserPromptSubmit. */
export function recordTurn(state) {
  state.turns += 1;
  return state.turns;
}

/**
 * Records a file write; counts consecutive edits to the same file (LOGIC-05).
 *
 * `inRepo` decides whether the write counts toward linesSinceCommit. That number
 * means "how much work has no point to roll back to" (PROC-02, AGENT-06), and a
 * file outside any repository can never be committed — counting it produces a
 * warning whose advice cannot be followed. Scratch files, temporary probes and
 * anything written outside the working repository are activity, not debt.
 */
export function recordWrite(state, filePath, { added = 0, removed = 0, isCode = false, inRepo = true } = {}) {
  if (isCode) state.codeWritesSinceVerify += 1;
  state.filesWritten[filePath] = (state.filesWritten[filePath] ?? 0) + 1;
  state.linesWritten += added;
  if (inRepo) state.linesSinceCommit += added + removed;
  if (state.lastEditedFile === filePath) state.consecutiveEdits += 1;
  else { state.lastEditedFile = filePath; state.consecutiveEdits = 1; }
  return state.consecutiveEdits;
}

/** Records lines read — the comprehension-debt measurement (HUMAN-01). */
export function recordRead(state, lineCount) {
  state.linesRead += Math.max(0, Number(lineCount) || 0);
}

/**
 * Refreshes one file's violation ledger.
 * Passing an empty list drops the file from the ledger — that is how a fix is recognised.
 */
export function recordViolations(state, filePath, findings, shown = filePath) {
  const live = findings.filter((f) => !f.suppression);
  if (live.length === 0) delete state.violations[filePath];
  else state.violations[filePath] = live.map((f) => ({ key: f.key, id: f.id, line: f.line, title: f.title, shown }));

  state.blocked += live.filter((f) => f.severity === 'block').length;
  state.suppressions += findings.filter((f) => f.suppression).length;
  for (const f of live) state.byCategory[f.category] = (state.byCategory[f.category] ?? 0) + 1;
  return live.length;
}

/** Every open violation in the ledger, flattened. */
export function openViolations(state) {
  return Object.entries(state.violations ?? {}).flatMap(([file, items]) =>
    items.map((item) => ({ ...item, file: item.shown ?? file, absolute: file })));
}

export function recordTestRun(state) {
  state.testRunAt = Date.now();
  state.codeWritesSinceVerify = 0;   // the verification debt is settled
}

export function recordCommit(state) {
  state.commitAt = Date.now();
  state.linesSinceCommit = 0;
  state.testRunAt = null;   // a new commit needs new verification
}

/**
 * Counts how often the stop gate blocked for the same reason.
 *
 * The fingerprint derives from the violation set: if the set changed there was
 * progress, and the counter restarts. If it did not, the counter grows — our own
 * AGENT-08 rule forbids blocking forever, so a ceiling is required.
 */
export function countStopBlock(state, fingerprint) {
  state.stopBlocks[fingerprint] = (state.stopBlocks[fingerprint] ?? 0) + 1;
  return state.stopBlocks[fingerprint];
}

/** Has this warning been shown in this session? If not, mark it and return true. */
export function claimWarning(state, signal) {
  if (state.warned.includes(signal)) return false;
  state.warned.push(signal);
  return true;
}

/** End-of-session summary — measurement instead of self-report (HUMAN-02). */
export function sessionSummary(state) {
  const files = Object.keys(state.filesWritten).length;
  const parts = [
    `${state.turns} turns`,
    `${files} files`,
    `${state.linesWritten} lines written`,
    `${state.blocked} slop blocked`,
  ];
  if (state.suppressions > 0) parts.push(`${state.suppressions} waivers used`);
  const open = openViolations(state).length;
  if (open > 0) parts.push(`${open} open violations`);
  return parts.join(' · ');
}
