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
import { scanFiles } from '../lib/scan.mjs';
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
 * Walks the filesystem. Because it does not use git it also works in a folder
 * holding several repositories; every nested `.slopignore` applies to its own subtree.
 */
export function walkFiles(root, { maxFiles = 20000 } = {}) {
  const found = [];
  const walk = (dir, rules) => {
    if (found.length >= maxFiles) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      process.stderr.write(`${BRAND}: directory could not be read ${relative(root, dir) || '.'} — ${error.message}\n`);
      return;
    }

    // A .slopignore in this directory applies to the whole subtree below it.
    let active = rules;
    const ignoreFile = join(dir, '.slopignore');
    if (existsSync(ignoreFile)) {
      try {
        active = [...rules, ...parseSlopignore(readFileSync(ignoreFile, 'utf8')).map((r) => ({ ...r, base: dir }))];
      } catch (error) {
        process.stderr.write(`${BRAND}: .slopignore could not be read ${relative(root, ignoreFile)} — ${error.message}\n`);
      }
    }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      const ignored = active.some((rule) => rule.re.test(relative(rule.base, full).split('\\').join('/')));
      if (ignored) continue;
      if (entry.isDirectory()) walk(full, active);
      else if (entry.isFile()) found.push(relative(root, full));
      if (found.length >= maxFiles) return;
    }
  };
  walk(root, []);
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

  if (total === 0) {
    process.stdout.write(`${BRAND}: ${scanned} file(s) scanned (${label}) · clean`);
    if (suppressed > 0) process.stdout.write(` · ${suppressed} reasoned waiver(s)`);
    process.stdout.write('\n');
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
  return 1;
}
