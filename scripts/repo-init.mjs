#!/usr/bin/env node
/**
 * /slop-repo-init — installs the repository layer (agent-agnostic).
 *
 * Claude Code hooks only cover Claude Code. The files here work whichever agent
 * writes the code: the git hook covers everyone on this machine, CI covers everyone.
 *
 * Existing files are never overwritten; doing so would quietly change the user's
 * own setup.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BRAND } from '../lib/report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let repo;
try {
  repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
} catch (error) {
  process.stdout.write(`${BRAND}: no git repository found — ${error.message}\n`);
  process.stdout.write('The repository kit installs into a git repository. Run git init first.\n');
  process.exit(1);
}

const out = [`${BRAND} repository kit — ${repo}`, ''];
const done = (t) => out.push(`  + ${t}`);
const kept = (t) => out.push(`  = ${t}`);
const warn = (t) => out.push(`  ! ${t}`);

function writeIfAbsent(rel, content, label) {
  const file = join(repo, rel);
  if (existsSync(file)) { kept(`${rel} already exists, left alone`); return; }
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    done(`${rel} — ${label}`);
  } catch (error) {
    warn(`${rel} could not be written — ${error.message}`);
  }
}

// AGENTS.md derives from the rule set; keeping a second copy would be DOC-07.
let baseRules = null;
try {
  baseRules = readFileSync(join(ROOT, 'rules', 'base-rules.md'), 'utf8');
} catch (error) {
  warn(`the rule set could not be read, so AGENTS.md was not generated — ${error.message}`);
}
if (baseRules) {
  const body = baseRules.replace(/^# .*$/m,
    '# AGENTS.md\n\nCursor, Codex, Copilot and Claude Code all read this file.\n'
    + 'It is generated from the LenaRise.SlopGuard rule set; editing it by hand is safe\n'
    + '(a later /slop-repo-init will not overwrite it) but it will drift from the source.');
  writeIfAbsent('AGENTS.md', body, 'shared rule file (agent-agnostic)');
}

writeIfAbsent('.slopignore',
  '# LenaRise.SlopGuard — path exemptions\n'
  + '# One glob per line. Naming a directory covers everything beneath it.\n'
  + '# Adding a path here removes it from scanning ENTIRELY.\n\n'
  + 'node_modules\ndist\nbuild\nvendor\n\n'
  + '# Game engine build directories — uncomment if they apply\n'
  + '# Library\n# Temp\n# Builds\n# .godot\n# Binaries\n# Intermediate\n# Saved\n',
  'per-project exemption list');

// --skip-ci: the CI job clones the scanner repository, so when that repository
// is private the workflow fails on every push until a read token is configured.
// Installing a workflow that is red from the first commit is worse than not
// installing one, so skipping it has to be possible.
const workflow = join(ROOT, 'templates', 'github-workflow-slop-gate.yml');
if (process.argv.includes('--skip-ci')) {
  kept('CI workflow skipped (--skip-ci)');
} else if (existsSync(workflow)) {
  try {
    writeIfAbsent('.github/workflows/slop-gate.yml', readFileSync(workflow, 'utf8'), 'CI gate');
    out.push('     Note: if the scanner repository is private, the CI job needs a read token.');
  } catch (error) {
    warn(`the CI template could not be read — ${error.message}`);
  }
} else {
  warn('the CI template was not found');
}

const hookSource = join(ROOT, 'templates', 'pre-commit');
const hookTarget = join(repo, '.git', 'hooks', 'pre-commit');
if (!existsSync(hookSource)) {
  warn('the pre-commit template was not found');
} else if (existsSync(hookTarget)) {
  kept('.git/hooks/pre-commit already exists, left alone');
  out.push(`     To add ours, take the contents from: ${hookSource}`);
} else {
  try {
    mkdirSync(dirname(hookTarget), { recursive: true });
    copyFileSync(hookSource, hookTarget);
    chmodSync(hookTarget, 0o755);
    done('.git/hooks/pre-commit — scanning at the git level');
  } catch (error) {
    warn(`pre-commit could not be installed — ${error.message}`);
  }
}

out.push('');
out.push('  The git hook runs only on your machine and is not cloned.');
out.push('  For the team, the CI workflow is the real gate.');
process.stdout.write(out.join('\n') + '\n');
