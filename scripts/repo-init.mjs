#!/usr/bin/env node
/**
 * /slop-repo-init — installs the repository layer (agent-agnostic).
 *
 * Claude Code hooks only cover Claude Code. The files here work whichever agent
 * writes the code: the git hook covers everyone on this machine, CI covers everyone.
 *
 * Two policies, deliberately different:
 *   - Files the user owns (AGENTS.md, .slopignore) are written once and never
 *     touched again; overwriting them would quietly change the user's own setup.
 *   - Files we own (the pre-commit hook, the CI workflow) are refreshed when they
 *     came from us and left alone when they did not. Without that, a fix to a
 *     template never reached the repositories that already had it.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
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

/**
 * Install a file we own, or refresh it when an older copy of ours is already there.
 *
 * Ours is recognised by the BRAND string in the body, which every template carries
 * in a header comment. Anything else is someone's own file and is never written over.
 */
function installOrRefresh({ rel, source, target, label, executable = false }) {
  if (!existsSync(source)) { warn(`the template for ${rel} was not found`); return; }
  let fresh;
  try {
    fresh = readFileSync(source, 'utf8');
  } catch (error) {
    warn(`the template for ${rel} could not be read — ${error.message}`);
    return;
  }

  if (existsSync(target)) {
    let existing = null;
    try {
      existing = readFileSync(target, 'utf8');
    } catch (error) {
      warn(`${rel} could not be read — ${error.message}`);
      return;
    }
    if (!existing.includes('LenaRise.SlopGuard')) {
      kept(`${rel} belongs to something else, left alone`);
      out.push(`     To adopt ours, take the contents from: ${source}`);
      return;
    }
    if (fresh === existing) { kept(`${rel} is current`); return; }
  }

  try {
    mkdirSync(dirname(target), { recursive: true });
    const isNew = !existsSync(target);
    writeFileSync(target, fresh);
    if (executable) chmodSync(target, 0o755);
    done(isNew ? `${rel} — ${label}` : `${rel} refreshed`);
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

// --skip-ci: the CI job reads the scanner from its own repository. While that
// repository is private the job needs a SLOPGUARD_TOKEN secret, and until the
// secret exists every push goes red. A workflow that is red from the first
// commit is worse than no workflow, so skipping it has to be possible.
const CI_REL = '.github/workflows/slop-gate.yml';
if (process.argv.includes('--skip-ci')) {
  kept('CI workflow skipped (--skip-ci)');
} else {
  installOrRefresh({
    rel: CI_REL,
    source: join(ROOT, 'templates', 'github-workflow-slop-gate.yml'),
    target: join(repo, CI_REL),
    label: 'CI gate',
  });
  out.push('     While the scanner repository is private the CI job needs a read token:');
  out.push('       gh secret set SLOPGUARD_TOKEN --org LenaRiseCorp --visibility all');
  out.push('     A fine-grained token with Contents: read on the scanner repository is enough.');
}

installOrRefresh({
  rel: '.git/hooks/pre-commit',
  source: join(ROOT, 'templates', 'pre-commit'),
  target: join(repo, '.git', 'hooks', 'pre-commit'),
  label: 'scanning at the git level',
  executable: true,
});

out.push('');
out.push('  The git hook runs only on your machine and is not cloned.');
out.push('  For the team, the CI workflow is the real gate.');
process.stdout.write(out.join('\n') + '\n');
