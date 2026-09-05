#!/usr/bin/env node
/**
 * Shared command-line scanner.
 *
 * Four entry points use it:
 *   scan-staged.mjs — the git pre-commit hook (staged files)
 *   scan-diff.mjs   — CI (files changed against a reference)
 *   check.mjs       — /slop-check
 *   status.mjs      — the live scan inside /slop-status
 *
 * Same engine, same configuration, same output. Only the file list differs.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanFiles, protectedPathReason } from '../lib/scan.mjs';
import { loadConfig, isPathIgnored, parseSlopignore } from '../lib/config.mjs';
import { formatFinding, BRAND } from '../lib/report.mjs';

/**
 * The git root, or null when this is not a repository.
 *
 * With `quiet` it writes nothing to stderr: the absence of git is not always an
 * error. Scanning a plain folder is a legitimate use, and printing "no repository
 * found" there would present a non-problem as a problem.
 */
export function repoRoot({ quiet = false } = {}) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (!quiet) process.stderr.write(`${BRAND}: no git repository found — ${error.message}\n`);
    return null;
  }
}

/** Directories the walk never enters. */
const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor',
  '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.cache', 'coverage',
  // Game engine build directories. Not merely noise but a size problem:
  // Unity's Library directory can hold hundreds of thousands of files and
  // would stretch the walk into minutes.
  'Library', 'Temp', 'Logs', 'UserSettings', 'Builds', '.godot', '.import',
  'Binaries', 'Intermediate', 'Saved', 'DerivedDataCache', 'obj', 'bin',
]);

/**
 * Walks the filesystem, so it works in a folder holding several repositories.
 * Every nested `.slopignore` applies to its own subtree.
 *
 * A repository is listed with git instead of being walked — tracked files plus
 * new ones, minus what the project ignores.
 * Without that, everything the project ignores gets scanned: in one repository
 * the walk found 1139 files where git tracks 122, the rest being Electron build
 * output and installer binaries, and a scan that should take a moment took a
 * minute. Ignored files are also a false-positive farm — minified bundles and
 * vendored copies are exactly what the patterns are not written for.
 */
export function walkFiles(root, { maxFiles = 20000 } = {}) {
  const found = [];

  /** A .slopignore in this directory applies to the whole subtree below it. */
  const withLocalIgnore = (dir, rules) => {
    const ignoreFile = join(dir, '.slopignore');
    if (!existsSync(ignoreFile)) return rules;
    try {
      return [...rules, ...parseSlopignore(readFileSync(ignoreFile, 'utf8')).map((r) => ({ ...r, base: dir }))];
    } catch (error) {
      process.stderr.write(`${BRAND}: .slopignore could not be read ${relative(root, ignoreFile)} — ${error.message}\n`);
      return rules;
    }
  };

  /**
   * A repository is asked, not walked: git already knows what it ignores.
   * Reimplementing .gitignore would mean reimplementing its negations and
   * anchoring too, and a partial version would silently skip files that should
   * be scanned. Returns false when this directory is not a repository.
   */
  const takeTracked = (dir, rules) => {
    if (!existsSync(join(dir, '.git'))) return false;
    // --others --exclude-standard: tracked files AND new ones, minus what the
    // project ignores. Plain `ls-files` would miss a file just created, which is
    // exactly the file most worth scanning.
    const tracked = gitFiles(['ls-files', '--cached', '--others', '--exclude-standard'], dir);
    if (!tracked) return false;
    // The repository's own .slopignore still applies; git does not know about it.
    const active = withLocalIgnore(dir, rules);
    for (const rel of tracked) {
      // SKIP_DIRS is not only noise reduction — Unity's Library directory alone
      // can hold hundreds of thousands of files. A repository that does not
      // ignore node_modules must not drag it into the scan either.
      if (rel.split('/').some((segment) => SKIP_DIRS.has(segment))) continue;
      const abs = join(dir, rel);
      if (active.some((rule) => rule.re.test(relative(rule.base, abs).split('\\').join('/')))) continue;
      found.push(relative(root, abs));
      if (found.length >= maxFiles) return true;
    }
    return true;
  };

  const walk = (dir, rules) => {
    if (found.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      process.stderr.write(`${BRAND}: directory could not be read ${relative(root, dir) || '.'} — ${error.message}\n`);
      return;
    }

    const active = withLocalIgnore(dir, rules);

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const ignored = active.some((rule) => rule.re.test(relative(rule.base, full).split('\\').join('/')));
      if (ignored) continue;
      if (entry.isDirectory()) {
        if (!takeTracked(full, active)) walk(full, active);
      } else if (entry.isFile()) found.push(relative(root, full));
      if (found.length >= maxFiles) return;
    }
  };
  // The root may itself be a repository — reached by a path argument, or by
  // scanning one directly. Walking it would scan everything it ignores.
  const rootRules = withLocalIgnore(root, []);
  if (!takeTracked(root, rootRules)) walk(root, rootRules);
  return found;
}

export function gitFiles(args, root) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', cwd: root })
      .split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (error) {
    process.stderr.write(`${BRAND}: the file list could not be obtained — ${error.message}\n`);
    return null;
  }
}

/**
 * The list of files to scan, and its label.
 *
 * Inside a git repository the changed files are scanned (or every tracked file
 * when nothing has changed) — fast and meaningful. Outside one the filesystem is
 * walked, so the command also works in a plain folder and in a parent directory
 * holding several repositories.
 */
export function listFiles(root, { isRepo }) {
  if (isRepo) {
    const changed = (gitFiles(['status', '--porcelain', '--untracked-files=all'], root) ?? [])
      .map((line) => line.slice(3).trim()).filter(Boolean);
    if (changed.length > 0) return { files: [...new Set(changed)], label: 'changed files' };
    return { files: gitFiles(['ls-files'], root) ?? [], label: 'all tracked files' };
  }
  return { files: walkFiles(root), label: 'folder, no git' };
}

/**
 * Scans the list and prints the result.
 * @returns {number} exit code — 1 when there are findings
 */
export function runScan(files, root, label) {
  const { config, problems } = loadConfig({ repoRoot: root });
  for (const problem of problems) process.stderr.write(`${BRAND}: ${problem}\n`);

  const { results, scanned, suppressed, total } = scanFiles({
    files,
    config,
    skip: (rel) => isPathIgnored(config, join(root, rel), root),
    read: (rel) => {
      const full = join(root, rel);
      if (!existsSync(full)) return null;   // a deleted file is not scanned
      try {
        return readFileSync(full, 'utf8');
      } catch (error) {
        process.stderr.write(`${BRAND}: could not read ${rel} — ${error.message}\n`);
        return null;
      }
    },
  });

  // The protected-path lock lived only in the hooks, so it covered Claude Code
  // and nothing else. Cursor, Copilot, a shell script or a person could change
  // CI config, a lockfile or an engine-generated file and no layer said a word.
  // Reported, not blocked: at this layer we cannot tell who made the change, and
  // a person editing their own CI is doing nothing wrong. The rule was always
  // about visibility.
  const protectedTouched = files
    .map((rel) => [rel, protectedPathReason(rel)])
    .filter(([, why]) => why);
  const noteProtected = () => {
    if (protectedTouched.length === 0) return;
    process.stdout.write(`\n${BRAND}: ${protectedTouched.length} protected file(s) in this change\n`);
    for (const [rel, why] of protectedTouched) process.stdout.write(`  ${rel}\n        ${why}\n`);
    process.stdout.write('  Intended? Carry on. Written by an agent? Read it before it lands.\n');
  };

  if (total === 0) {
    process.stdout.write(`${BRAND}: ${scanned} file(s) scanned (${label}) · clean`);
    if (suppressed > 0) process.stdout.write(` · ${suppressed} reasoned waiver(s)`);
    process.stdout.write('\n');
    noteProtected();
    return 0;
  }

  process.stdout.write(`${BRAND}: ${label} — ${total} finding(s)\n\n`);
  for (const [rel, findings] of results) {
    process.stdout.write(`${rel}\n`);
    for (const f of findings) process.stdout.write(`${formatFinding(f)}\n`);
    process.stdout.write('\n');
  }
  process.stdout.write('Fix them, or write a reasoned inline waiver:\n');
  process.stdout.write('  // slop-guard-ignore <ID>: why this line has to stay as it is\n');
  noteProtected();
  return 1;
}
