/**
 * Matching engine.
 *
 * patterns.mjs holds the data; this file applies it to content. The split is
 * deliberate, so gen-docs.mjs can read the registry without loading the engine.
 *
 * Three entry points, all returning the same finding shape:
 *   scanContent  — file contents   (post-edit)
 *   scanPath     — file path       (pre-edit)
 *   scanCommand  — shell command   (pre-bash)
 */

import {
  PATTERNS, CATEGORIES, titleOf, categoryOf,
  PROSE_EXTENSIONS, CODE_EXTENSIONS,
  TEST_PATH_PATTERNS, PROTECTED_PATH_PATTERNS,
} from './patterns.mjs';
import { suppressionFor } from './ignore.mjs';

/** File class by extension. An unknown extension is not scanned — by choice, not by accident. */
export function classify(filePath) {
  const lower = String(filePath || '').toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot === -1 ? '' : lower.slice(dot);
  if (PROSE_EXTENSIONS.includes(ext)) return 'prose';
  if (CODE_EXTENSIONS.includes(ext)) return 'code';
  return 'other';
}

export function isTestPath(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  return TEST_PATH_PATTERNS.some((re) => re.test(p));
}

/** Reason a path is protected, or null if it is not. */
export function protectedPathReason(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  const hit = PROTECTED_PATH_PATTERNS.find((entry) => entry.re.test(p));
  return hit ? hit.why : null;
}

/**
 * Replaces markdown code blocks and inline code with equal-length blanks;
 * newlines are preserved so line and column numbers do not shift.
 *
 * Why: prose patterns catch a phrase being *used*, not *mentioned*. A README
 * that lists `seamlessly` in a pattern catalogue is not using the word.
 */
export function stripCodeSpans(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return String(text)
    .replace(/^```[\s\S]*?^```/gm, blank)     // fenced block
    .replace(/^~~~[\s\S]*?^~~~/gm, blank)     // alternative fence
    .replace(/`[^`\n]*`/g, blank)             // inline code
    .replace(/^(?: {4}|\t)[^\n]*$/gm, blank); // indented block
}

/** One-based line and column from a character index. */
export function positionAt(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const column = index - (before.lastIndexOf('\n') + 1) + 1;
  return { line, column };
}

/**
 * Replaces heredoc bodies with equal-length blanks; newlines are preserved.
 *
 * Why: the text between `cat > x.md <<'EOF'` and `EOF` is data, not shell code.
 * Command scope scans the command; a destructive phrase inside the body may be
 * *mentioned* there rather than executed.
 *
 * Nothing is lost: if the heredoc is written to a file, that file goes through
 * the post-bash content scan. Command scope scans commands, content scope scans
 * content — real danger in the body is caught in the right layer.
 *
 * This distinction surfaced while developing the tool: a commit message that
 * referred to a destructive command was mistaken for one and blocked.
 */
export function stripHeredocs(text) {
  const out = [];
  let delimiter = null;
  for (const line of String(text).split('\n')) {
    if (delimiter === null) {
      out.push(line);
      const opener = /<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/.exec(line);
      if (opener) delimiter = opener[1] ?? opener[2] ?? opener[3];
    } else if (line.trim() === delimiter) {
      out.push(line);
      delimiter = null;
    } else {
      out.push(line.replace(/[^\n]/g, ' '));
    }
  }
  return out.join('\n');
}

function excerptAt(text, index, length) {
  const start = text.lastIndexOf('\n', index) + 1;
  let end = text.indexOf('\n', index + length);
  if (end === -1) end = text.length;
  const raw = text.slice(start, end).trim();
  return raw.length > 160 ? raw.slice(0, 157) + '...' : raw;
}

function makeFinding(pattern, { line, column, excerpt, target }) {
  return {
    key: pattern.key,
    id: pattern.id,
    category: categoryOf(pattern.id),
    categoryName: CATEGORIES[categoryOf(pattern.id)]?.name ?? categoryOf(pattern.id),
    title: titleOf(pattern.id),
    severity: pattern.severity,
    gate: pattern.gate ?? null,
    detects: pattern.detects,
    fix: pattern.fix,
    scope: pattern.scope,
    line, column, excerpt, target,
    suppression: null,          // filled when a valid inline waiver applies
    suppressionRejected: null,  // filled when a directive exists but does not qualify
  };
}

/**
 * Filters to the active patterns. Disabling works at three levels:
 * category ("SEC"), taxonomy id ("SEC-03"), single pattern ("sec-03-aws-key").
 */
export function activePatterns(scope, config = {}) {
  const disabled = new Set((config.disabled ?? []).map((d) => String(d).toLowerCase()));
  return PATTERNS.filter((p) => {
    if (p.scope !== scope) return false;
    return !(
      disabled.has(p.key.toLowerCase()) ||
      disabled.has(p.id.toLowerCase()) ||
      disabled.has(categoryOf(p.id).toLowerCase())
    );
  });
}

/** Scans file contents. A file classified as 'other' is not scanned. */
export function scanContent({ filePath, content, config = {} }) {
  const kind = classify(filePath);
  if (kind === 'other') return [];

  const text = String(content ?? '');
  const haystack = kind === 'prose' ? stripCodeSpans(text) : text;
  const lines = text.split('\n');
  const findings = [];

  for (const pattern of activePatterns(kind, config)) {
    const re = new RegExp(pattern.match.source, pattern.match.flags.includes('g')
      ? pattern.match.flags
      : pattern.match.flags + 'g');
    let m;
    while ((m = re.exec(haystack)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      const { line, column } = positionAt(haystack, m.index);
      const finding = makeFinding(pattern, {
        line, column,
        excerpt: excerptAt(text, m.index, m[0].length),
        target: filePath,
      });
      const s = suppressionFor(finding, lines);
      finding.suppression = s?.ok ? s : null;
      finding.suppressionRejected = s && !s.ok ? s : null;
      findings.push(finding);
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Scans a file path, before the write happens. */
export function scanPath({ filePath, config = {} }) {
  const target = String(filePath || '').replace(/\\/g, '/');
  const findings = [];
  for (const pattern of activePatterns('path', config)) {
    const re = new RegExp(pattern.match.source, pattern.match.flags.replace('g', ''));
    if (re.test(target)) {
      findings.push(makeFinding(pattern, { line: 0, column: 0, excerpt: target, target }));
    }
  }
  return findings;
}

/** Scans a shell command, before it runs. A heredoc body is data, not a command. */
export function scanCommand({ command, config = {} }) {
  const raw = String(command ?? '');
  const text = stripHeredocs(raw);
  const findings = [];
  for (const pattern of activePatterns('command', config)) {
    const re = new RegExp(pattern.match.source, pattern.match.flags.includes('g')
      ? pattern.match.flags
      : pattern.match.flags + 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      const { line, column } = positionAt(text, m.index);
      findings.push(makeFinding(pattern, {
        line, column,
        excerpt: excerptAt(raw, m.index, m[0].length),
        target: 'command',
      }));
    }
  }
  return findings;
}

/**
 * Scans a list of files. selfscan, pre-commit and CI share one engine here;
 * writing three separate walks would break our own CODE-01 rule.
 *
 * @param {object} opts
 * @param {string[]} opts.files      paths to scan, relative to the root
 * @param {(rel:string)=>string|null} opts.read  content reader; null skips the file
 * @param {object} [opts.config]
 * @param {(rel:string)=>boolean} [opts.skip]    a path returning true is never scanned
 */
export function scanFiles({ files, read, config = {}, skip }) {
  const results = [];
  let scanned = 0;
  let suppressedCount = 0;
  let skipped = 0;

  for (const rel of files) {
    if (skip?.(rel)) { skipped++; continue; }
    const pathFindings = scanPath({ filePath: rel, config });
    const content = read(rel);
    const contentFindings = content === null ? [] : scanContent({ filePath: rel, content, config });
    scanned++;
    suppressedCount += suppressed(contentFindings).length;
    const live = [...actionable(pathFindings), ...actionable(contentFindings)];
    if (live.length > 0) results.push([rel, live]);
  }

  const total = results.reduce((n, [, f]) => n + f.length, 0);
  return { results, scanned, skipped, suppressed: suppressedCount, total };
}

/** Findings that were not suppressed — the ones that actually need action. */
export function actionable(findings) {
  return findings.filter((f) => !f.suppression);
}

/** Findings silenced by an inline waiver. Counted and reported in the session summary. */
export function suppressed(findings) {
  return findings.filter((f) => f.suppression);
}
