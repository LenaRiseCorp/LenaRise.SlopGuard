/**
 * Finding formatting and the hook output contract.
 *
 * The schemas here are not guesses: each was exercised on this machine against
 * this Claude Code version. The measurements are in docs/verification-log.md.
 *
 *   PreToolUse   → hookSpecificOutput.permissionDecision: deny  (really stops the tool)
 *   PostToolUse  → decision: "block"  (the reason reaches the model, but the tool already ran)
 *   Stop         → decision: "block"  (the turn does not end; stop_hook_active guards the loop)
 *   systemMessage→ shown to the user as a notice; never reaches the model
 *   additionalContext → injected into the model's context at SessionStart
 *
 * The hard guarantee lives only in PreToolUse deny and Stop block. post-edit is
 * a request to fix; the lock is in stop-gate.
 */

const BRAND = 'LenaRise.SlopGuard';

/** Writes one JSON line. The hook protocol expects a single object on stdout. */
export function emit(payload) {
  process.stdout.write(JSON.stringify(payload));
}

/**
 * Exits once the pending stdout write has drained.
 *
 * process.exit() does not wait for it: when stdout is a pipe the write is
 * asynchronous, and output beyond the pipe buffer (~8 KB) is truncated.
 * session-start injects the rule set and that text is above the limit — with a
 * plain process.exit() the end of the rules would vanish silently. Protection
 * that disappears silently is the very thing this project exists to prevent.
 *
 * The safety timer is unref'd, so the process never hangs if drain never fires.
 */
export function exitWhenFlushed(code = 0) {
  process.exitCode = code;
  const guard = setTimeout(() => process.exit(code), 2000);
  if (typeof guard.unref === 'function') guard.unref();
  process.stdout.write('', () => process.exit(code));
}

/** Silent approval: no output, exit 0. This is what a clean scan looks like. */
export function allow() {
  // Intentionally empty: Claude Code treats a silent, zero-exit hook as "no opinion".
}

export function deny(reason, { hookEventName = 'PreToolUse' } = {}) {
  emit({ hookSpecificOutput: { hookEventName, permissionDecision: 'deny', permissionDecisionReason: reason } });
}

export function ask(reason, { hookEventName = 'PreToolUse' } = {}) {
  emit({ hookSpecificOutput: { hookEventName, permissionDecision: 'ask', permissionDecisionReason: reason } });
}

/** Block, for PostToolUse and Stop. */
export function block(reason) {
  emit({ decision: 'block', reason });
}

/** A notice shown to the user. It does not reach the model — layer 2 is built on this. */
export function notify(message, extra = {}) {
  emit({ systemMessage: message, ...extra });
}

/** Injects text into the model's context. */
export function inject(hookEventName, additionalContext) {
  emit({ hookSpecificOutput: { hookEventName, additionalContext } });
}

/**
 * Error reporting — never silent.
 *
 * A hook does not block because of its own failure: our bug stopping the user's
 * work is not acceptable. But the failure must not be invisible either. It goes
 * to stderr, the caller records it as a broken heartbeat, and the status line
 * reports "broken".
 */
export function fail(where, error) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${BRAND} [${where}] error: ${detail}\n`);
}

/** Readable age, such as "3 days ago". Used by the status line, the coach and /slop-doctor. */
export function formatAge(seconds) {
  if (!Number.isFinite(seconds)) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Status metrics — the shared source for the status line and the chat status row.
 *
 * Both show the same information; formatting it in two places would diverge on
 * the first change (CODE-01). Only the input differs: line counts arrive in the
 * statusLine payload and never reach hooks, so they are optional here.
 */
export function statusMetrics(state, config, { added = null, removed = null } = {}) {
  const parts = [
    config.mode === 'explore' ? 'explore' : 'strict',
    `${state.blocked} blocked`,
    `turn ${state.turns}/${config.thresholds.contextTurns}`,
  ];
  if (added !== null) parts.push(`+${added}/-${removed ?? 0}`);
  parts.push(state.testRunAt
    ? `tests ${formatAge(Math.round((Date.now() - state.testRunAt) / 1000))}`
    : 'no tests');
  const open = Object.keys(state.violations ?? {}).length;
  if (open > 0) parts.push(`${open} open`);
  if (state.suppressions > 0) parts.push(`${state.suppressions} waived`);
  return parts;
}

/**
 * Capability index — injected into the model's context at session start.
 *
 * Loading the full README into every session would be AGENT-02 (too much
 * context) itself. Only "which levers exist, and where" goes in; the model opens
 * the /slop-config skill when it needs the detail.
 *
 * The content derives from the pattern registry rather than being written by
 * hand, so the numbers change with the code.
 */
export function capabilityIndex(config, { patternCount, categories, configDir }) {
  const mode = config.mode === 'explore' ? 'explore' : 'strict';
  const off = config.disabled?.length ? ` · disabled: ${config.disabled.join(', ')}` : '';
  return [
    `${BRAND} active — ${mode} mode · ${patternCount} patterns · ${categories} categories${off}`,
    '',
    `Configuration (${configDir}) — an update never overwrites these:`,
    '  config.json          mode · thresholds · disabled · trustedPackages · allowTestWrites · ui',
    '  patterns.local.json  your own patterns',
    '  rules.local.md       your own rules',
    '  <repo>/.slopignore   per-project path exemptions',
    '',
    'Commands: /slop-check /slop-status /slop-doctor /slop-config /slop-mode /slop-repo-init /slop-setup',
    'Inline waiver: // slop-guard-ignore <ID>: reason — the id and the reason are both required.',
    '',
    'If the user complains about a warning, wants a threshold changed or a pattern added:',
    'do not edit the plugin directory. Open the /slop-config skill and write to the config directory.',
  ].join('\n');
}

/** Counts findings by outcome. */
export function summarize(findings, config = {}) {
  const strict = config.mode !== 'explore';
  const live = findings.filter((f) => !f.suppression);
  return {
    total: findings.length,
    blocked: strict ? live.filter((f) => f.severity === 'block').length : 0,
    warned: strict ? live.filter((f) => f.severity === 'warn').length : live.length,
    suppressed: findings.filter((f) => f.suppression).length,
    rejectedDirectives: findings.filter((f) => f.suppressionRejected).length,
  };
}

function locate(finding) {
  if (finding.scope === 'command') return 'command';
  if (finding.scope === 'path') return 'filename';
  return `line ${finding.line}`;
}

const REJECTION_TEXT = {
  'no-target': 'it does not name which pattern it silences (for example slop-guard-ignore CODE-05: reason)',
  'no-reason': 'no reason was given; a waiver without a reason is not accepted',
  'other-target': 'it targets a different pattern',
};

/** Readable form of one finding. Both the human and the model read this. */
export function formatFinding(finding) {
  const lines = [
    `  ${finding.id}  ${locate(finding)}  ${finding.title}`,
    `        ${finding.detects}`,
  ];
  if (finding.excerpt) lines.push(`        > ${finding.excerpt}`);
  lines.push(`        Fix: ${finding.fix}`);
  if (finding.suppressionRejected) {
    lines.push(`        Note: the waiver on line ${finding.suppressionRejected.atLine} is not valid — ${REJECTION_TEXT[finding.suppressionRejected.rejected]}`);
  }
  return lines.join('\n');
}

/**
 * Turns a finding list into a hook message.
 * `target` is the file path or the command; it appears in the header.
 */
export function formatFindings(findings, { config = {}, target, action = 'block' } = {}) {
  const live = findings.filter((f) => !f.suppression);
  if (live.length === 0) return '';
  const mode = config.mode === 'explore' ? 'explore mode' : 'strict mode';
  const verb = action === 'block' ? 'blocked' : 'warning';
  const head = `${BRAND} — ${live.length} pattern ${verb} (${mode})${target ? `\n  ${target}` : ''}`;
  const body = live.map(formatFinding).join('\n\n');
  const sup = findings.filter((f) => f.suppression).length;
  const tail = sup > 0 ? `\n\n  (${sup} finding(s) silenced by an inline waiver)` : '';
  return `${head}\n\n${body}${tail}`;
}

/** Clean-scan line — used when `cleanScans: "summary"`. */
export function formatCleanScan(fileCount) {
  return `${BRAND}: ${fileCount} file(s) scanned · clean`;
}

export { BRAND };
