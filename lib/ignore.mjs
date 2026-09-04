/**
 * Inline waiver policy — strict mode.
 *
 * Regex scanning produces false positives; that is not hidden, it is a stated
 * limit. The waiver mechanism exists for exactly that. But the same mechanism is
 * the most fragile part of the tool: too loose and it becomes a rubber stamp,
 * leaving no difference between having the scanner and not having it.
 *
 * So three conditions must hold together:
 *   1. The directive sits on the finding's line or the line directly above it
 *   2. It names which pattern it silences (key, id or category)
 *   3. It gives a reason — a waiver without a reason is not a waiver, it is silence
 *
 * Recognised form:
 *   // slop-guard-ignore CODE-05: third-party SDK throws here
 *   #  slop-guard-ignore SEC-03: test fixture, not a real key
 *
 * A directive that fails a condition does not silence the finding — and does not
 * vanish either: why it was rejected is attached to the finding, so the author
 * sees that the line they wrote had no effect.
 */

/** Parses a waiver directive on a line; null when there is none. */
export function parseDirective(line) {
  const text = String(line ?? '');
  if (!text.includes('slop-guard-ignore')) return null;
  const m = /slop-guard-ignore(?:-file)?(?:[ \t]+([A-Za-z]+-\d{2}|[A-Za-z]+|[a-z0-9][a-z0-9-]*))?[ \t]*(?::[ \t]*(.*))?$/
    .exec(text);
  if (!m) return { target: null, reason: '', hasReason: false };
  const reason = (m[2] ?? '').trim();
  return { target: m[1] ?? null, reason, hasReason: reason.length > 0 };
}

/** Does the directive target this finding? A directive without a target targets nothing. */
export function directiveMatches(directive, finding) {
  if (!directive?.target) return false;
  const t = directive.target.toLowerCase();
  return t === finding.key.toLowerCase()
      || t === finding.id.toLowerCase()
      || t === finding.category.toLowerCase();
}

/** Human-readable form of each rejection reason. */
export const REJECTION_REASONS = {
  'no-target': 'the waiver does not name which pattern it silences',
  'no-reason': 'the waiver gives no reason',
  'other-target': 'the waiver targets a different pattern',
};

/**
 * Looks for a valid waiver covering the finding.
 *
 * Returns:
 *   null                                     — no directive on the relevant lines
 *   { ok: true,  reason, target, atLine }    — valid waiver, the finding is silenced
 *   { ok: false, rejected, atLine }          — a directive exists but does not qualify
 */
export function suppressionFor(finding, lines) {
  if (!Array.isArray(lines) || !Number.isInteger(finding?.line) || finding.line < 1) return null;

  // The finding's own line, then the one above it. Nothing further is considered.
  const candidates = [finding.line, finding.line - 1];
  let rejection = null;

  for (const lineNo of candidates) {
    const directive = parseDirective(lines[lineNo - 1]);
    if (!directive) continue;
    if (!directive.target) {
      rejection ??= { ok: false, rejected: 'no-target', atLine: lineNo };
      continue;
    }
    if (!directiveMatches(directive, finding)) {
      rejection ??= { ok: false, rejected: 'other-target', atLine: lineNo };
      continue;
    }
    if (!directive.hasReason) {
      rejection ??= { ok: false, rejected: 'no-reason', atLine: lineNo };
      continue;
    }
    return { ok: true, reason: directive.reason, target: directive.target, atLine: lineNo };
  }
  return rejection;
}
