/**
 * Layer 2 — the human coach.
 *
 * This layer never blocks, not even in strict mode; it warns. A human decision
 * is not something to block. Each warning appears once per session — a repeated
 * warning gets ignored, and an ignored warning is itself a form of slop.
 *
 * Warnings go to the user via systemMessage, not to the model: they are
 * information for a person, not instructions for an agent.
 *
 * Measurement note: context rot is approximated here with the turn counter,
 * because hooks never receive the context fill ratio. The real ratio does reach
 * the status line (context_window.used_percentage) — the bar shows the better
 * measure while the coach uses the proxy it has. That it is a proxy is not hidden.
 */

import { claimWarning } from './session.mjs';

/** Signal definitions. Thresholds come from config.thresholds; only the logic lives here. */
const SIGNALS = [
  {
    id: 'context-rot',
    pattern: 'AGENT-01',
    test: (s, t) => s.turns >= t.contextTurns,
    message: (s, t) => `This session has reached ${s.turns} turns (threshold ${t.contextTurns}). Start a new task in a new session — instructions decay quietly in long context (AGENT-01).`,
  },
  {
    id: 'comprehension-debt',
    pattern: 'HUMAN-01',
    test: (s, t) => s.linesWritten - s.linesRead >= t.comprehensionGap,
    message: (s) => `${s.linesWritten} lines produced, ${s.linesRead} lines read. Close the gap before merging — you own the code you did not read (HUMAN-01).`,
  },
  {
    id: 'uncommitted-progress',
    pattern: 'AGENT-06',
    test: (s, t) => s.linesSinceCommit >= t.uncommittedLines,
    message: (s, t) => `${s.linesSinceCommit} lines have changed since the last commit (threshold ${t.uncommittedLines}). There is no point left to roll back to (AGENT-06).`,
  },
  {
    id: 'cascading-fixes',
    pattern: 'LOGIC-05',
    test: (s, t) => s.consecutiveEdits >= t.consecutiveFixes,
    message: (s) => `${s.lastEditedFile} has been patched ${s.consecutiveEdits} times in a row. The approach may need to change — cascading patches hide the root cause (LOGIC-05).`,
  },
];

/**
 * Measures the thresholds and returns the warnings that should be shown.
 * Marks them as shown on `state`; the caller must save the session.
 */
export function evaluate(state, config) {
  const t = config?.thresholds ?? {};
  const out = [];
  for (const signal of SIGNALS) {
    if (!signal.test(state, t)) continue;
    if (!claimWarning(state, signal.id)) continue;
    out.push({ signal: signal.id, pattern: signal.pattern, message: signal.message(state, t) });
  }
  return out;
}

/**
 * The pre-commit verification warning.
 *
 * This signal is deliberately outside the once-per-session rule: it is asked on
 * every commit attempt, because every commit is a separate decision (TEST-05).
 */
export function verifyBeforeCommit(state) {
  if (state.testRunAt) return null;
  return {
    signal: 'unverified-commit',
    pattern: 'TEST-05',
    message: 'No tests ran this turn. You are committing, but the claim that it works has not been verified (TEST-05).',
  };
}

/** Merges warnings into a single systemMessage body. */
export function formatWarnings(warnings) {
  if (warnings.length === 0) return '';
  const head = warnings.length === 1 ? 'LenaRise.SlopGuard' : `LenaRise.SlopGuard — ${warnings.length} notices`;
  return `${head}\n\n${warnings.map((w) => `  · ${w.message}`).join('\n')}`;
}

export { SIGNALS };
