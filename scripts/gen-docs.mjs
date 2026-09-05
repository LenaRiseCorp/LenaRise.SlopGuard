#!/usr/bin/env node
/**
 * Documentation generator.
 *
 * The README, CLAUDE.md, the semgrep template, the default configuration and the
 * schema sections inside the skill are produced here. They are not kept in sync
 * by hand, because documentation drifting from code (DOC-07) is one of this
 * project's own categories, and a tool that breaks its own rule undermines its
 * own case.
 *
 * With `--check` nothing is written; if the generated output differs from what is
 * on disk it exits 1. That is the CI gate.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PATTERNS, TAXONOMY, CATEGORIES, PATTERN_COUNT, NEW_IDS, PROSE_EXTENSIONS, CODE_EXTENSIONS, categoryOf } from '../lib/patterns.mjs';
import { DEFAULT_CONFIG } from '../lib/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const written = [];
const stale = [];

function emit(rel, content) {
  const file = join(ROOT, rel);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === content) return;
  if (CHECK) { stale.push(rel); return; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  written.push(rel);
}

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

/**
 * The GitHub owner and repository, read from the git remote.
 *
 * Written by hand this was a placeholder nobody could run: the README told the
 * reader to `marketplace add OWNER/LenaRise.SlopGuard`. Deriving it from the
 * remote keeps the install command correct in a fork too, and falls back to the
 * placeholder only when there really is no remote to read.
 */
function repoSlug() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'],
      { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    // The repository name may contain dots (LenaRise.SlopGuard), so it cannot
    // exclude them; only a trailing .git is trimmed.
    const m = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/.exec(url);
    return m ? `${m[1]}/${m[2]}` : 'OWNER/LenaRise.SlopGuard';
  } catch {
    return 'OWNER/LenaRise.SlopGuard';
  }
}
const SLUG = repoSlug();
const SCOPE_LABEL = { code: 'source file', prose: 'text file', path: 'file path', command: 'shell command' };

// ── Shared tables ────────────────────────────────────────────────────────

function patternCatalogue() {
  const rows = ['| ID | Pattern key | Scope | Severity | What it catches |', '|---|---|---|---|---|'];
  for (const p of [...PATTERNS].sort((a, b) => a.id.localeCompare(b.id) || a.key.localeCompare(b.key))) {
    rows.push(`| ${p.id} | \`${p.key}\` | ${SCOPE_LABEL[p.scope]} | ${p.severity === 'block' ? 'blocks' : 'warns'} | ${p.detects} |`);
  }
  return rows.join('\n');
}

function taxonomyTable() {
  const rows = ['| Category | IDs | Mechanical patterns | Enforcement |', '|---|---|---|---|'];
  for (const [code, meta] of Object.entries(CATEGORIES)) {
    const ids = TAXONOMY.filter((t) => t.category === code).length;
    const mech = PATTERNS.filter((p) => categoryOf(p.id) === code).length;
    rows.push(`| **${code}** ${meta.name} | ${ids} | ${mech === 0 ? 'none — coach layer' : mech} | ${meta.enforcement} |`);
  }
  return rows.join('\n');
}

function configSchema() {
  const t = DEFAULT_CONFIG.thresholds;
  const notes = {
    maxDiffLines: 'Stop gate: lines changed since the last commit (PROC-02)',
    contextTurns: 'Coach warning: session turn threshold (AGENT-01)',
    contextUsedPercent: 'Context fill ratio threshold; measured by the status line (AGENT-01)',
    comprehensionGap: 'Coach warning: lines written minus lines read (HUMAN-01)',
    uncommittedLines: 'Coach warning: lines accumulated without a commit (AGENT-06)',
    consecutiveFixes: 'Coach warning: consecutive patches to the same file (LOGIC-05)',
    packageCheckTimeoutMs: 'Package registry lookup; exceeding it blocks (SEC-02)',
    maxStopBlocks: 'How often the same reason may block before the gate opens (AGENT-08)',
  };
  const rows = ['| Field | Default | What it does |', '|---|---|---|'];
  rows.push(`| \`enabled\` | \`${DEFAULT_CONFIG.enabled}\` | Setting it to \`false\` stops all protection; the bar reads "off" |`);
  rows.push(`| \`mode\` | \`"${DEFAULT_CONFIG.mode}"\` | \`strict\` blocks, \`explore\` only warns (except irreversible commands) |`);
  rows.push('| `disabled` | `[]` | A category (`SEC`), a taxonomy id (`SEC-03`) or a pattern key |');
  rows.push('| `trustedPackages` | `[]` | Package names that pass without a registry lookup |');
  rows.push(`| \`allowTestWrites\` | \`${DEFAULT_CONFIG.allowTestWrites}\` | \`true\` unlocks writing to test files (TEST-01) |`);
  for (const [k, v] of Object.entries(t)) rows.push(`| \`thresholds.${k}\` | \`${v}\` | ${notes[k] ?? ''} |`);
  const ui = {
    statusLine: '`compact` · `minimal` · `off`',
    cleanScans: '`silent` · `summary` — whether a clean scan is announced',
    heartbeat: 'one-line confirmation on the first turn',
    livenessCheck: '`ask` · `warn` · `off` — behaviour when the plugin does not respond',
    chatStatus: '`0` off; `N` posts a status row in chat every N turns, for places the status line is not visible',
  };
  for (const [k, v] of Object.entries(DEFAULT_CONFIG.ui)) {
    rows.push(`| \`ui.${k}\` | \`${JSON.stringify(v)}\` | ${ui[k] ?? ''} |`);
  }
  return rows.join('\n');
}

// ── Generated files ──────────────────────────────────────────────────────

emit('templates/config.default.json', JSON.stringify({
  enabled: DEFAULT_CONFIG.enabled,
  mode: DEFAULT_CONFIG.mode,
  disabled: [],
  trustedPackages: [],
  allowTestWrites: DEFAULT_CONFIG.allowTestWrites,
  thresholds: { ...DEFAULT_CONFIG.thresholds },
  ui: { ...DEFAULT_CONFIG.ui },
}, null, 2) + '\n');

emit('templates/patterns.local.example.json', JSON.stringify({
  patterns: [
    {
      key: 'example-urgent-todo', id: 'CODE-03', scope: 'code', severity: 'warn',
      match: 'TODO\\s*\\(urgent\\)', flags: 'gi',
      detects: 'A TODO marked urgent with no owner and no date.',
      fix: 'Either do it now, or open an issue and reference its number.',
    },
    {
      key: 'example-forbidden-import', id: 'CODE-07', scope: 'code', severity: 'block',
      match: "from ['\"]lodash['\"]", flags: 'g',
      detects: 'This project does not use lodash.',
      fix: 'Use the built-in array and object methods.',
    },
  ],
}, null, 2) + '\n');

const semgrepRules = PATTERNS
  .filter((p) => p.scope === 'code' || p.scope === 'prose')
  .map((p) => {
    const insensitive = p.match.flags.includes('i') ? '(?i)' : '';
    const exts = (p.scope === 'prose' ? PROSE_EXTENSIONS : CODE_EXTENSIONS).map((e) => `      - "*${e}"`).join('\n');
    return `  - id: slopguard-${p.key}
    languages: [generic]
    severity: ${p.severity === 'block' ? 'ERROR' : 'WARNING'}
    message: >-
      ${p.id} ${p.detects} Fix: ${p.fix}
    paths:
      include:
${exts}
    patterns:
      - pattern-regex: ${JSON.stringify(insensitive + p.match.source)}`;
  }).join('\n');

emit('templates/semgrep-slop.yml',
`# LenaRise.SlopGuard — semgrep rules
#
# GENERATED FILE. Do not edit; the source is lib/patterns.mjs.
# To regenerate: npm run docs
#
# This file works independently of Claude Code: any CI with semgrep can use it.
# The coverage is deliberately narrower — path and command scope patterns (the
# test-file lock, destructive commands, package verification) cannot be expressed
# as a static scanner, so they stay in the hook and git layers.

rules:
${semgrepRules}
`);

// ── README ───────────────────────────────────────────────────────────────

emit('README.md',
`# LenaRise.SlopGuard

GENERATED FILE. Do not edit; the sources are \`lib/patterns.mjs\`, \`lib/config.mjs\`
and \`scripts/gen-docs.mjs\`. To regenerate: \`npm run docs\`.

A Claude Code plugin that protects the quality and safety of what gets produced
during agentic development. Rule text carries the intent; hooks set the boundary,
and stop where the model cannot step over.

Version ${VERSION} · ${PATTERN_COUNT} mechanical patterns · ${TAXONOMY.length} taxonomy entries · zero runtime dependencies.

## What it does

Three layers, three audiences.

1. **Machine layer** — Claude Code hooks. The model cannot skip these; the
   harness runs them.
2. **Human layer** — measurement-based warnings delivered in chat. It warns, it
   never blocks.
3. **Repository layer** — a git hook and CI. These work whichever agent wrote the code.

${taxonomyTable()}

### Hook behaviour

| Hook | Event | Behaviour |
|---|---|---|
| \`session-start\` | SessionStart | Injects the rule set and the capability index |
| \`user-prompt\` | UserPromptSubmit | Turn counter, coach warnings, heartbeat stamp |
| \`pre-edit\` | PreToolUse Edit/Write | Test files and protected paths → **deny** |
| \`post-edit\` | PostToolUse Edit/Write | On a finding, **block** and record the violation |
| \`pre-bash\` | PreToolUse Bash | Destructive command → **deny**; unverified package → **deny**; redirect to a protected path → **deny** |
| \`post-bash\` | PostToolUse Bash | Test and commit stamps; scans files written through the shell |
| \`stop-gate\` | Stop | Open violations, unverified code or an oversized diff → **block** |
| \`session-end\` | SessionEnd | Measurement-based session summary |

The hard guarantee lives in \`pre-edit\` and \`stop-gate\`. A \`post-edit\` block
reaches the model but does not stop it — that was measured, see
\`docs/verification-log.md\`. So \`post-edit\` records what it found in the session
ledger and the lock is built in \`stop-gate\`.

## Installation

\`\`\`bash
claude plugin marketplace add ${SLUG}
claude plugin install lenarise-slopguard@lenarise-slopguard -y
\`\`\`

Then run \`/slop-setup\` and restart Claude Code. To verify: \`/slop-doctor\`.

If the repository is private, both commands need an account with access to it.

\`/slop-setup\` does the following and **never overwrites an existing file**: it
creates the configuration files only when they are missing, registers the status
line, and installs the silent-death protection rule into \`~/.claude/CLAUDE.md\`.
The rule is written between markers; the rest of the file is untouched and
deleting the block removes it cleanly. To skip it: \`/slop-setup --skip-claude-md\`.

Why that rule is automatic: it is the only layer that runs when the plugin is
dead — if hooks are not registered, the hook that would ask "are you running?" is
not there either. The status line is also not visible everywhere (the desktop
app's Code tab does not render statusLine), so for some users no other mechanism
would catch a silent death.

| Task | Command |
|---|---|
| Update | \`claude plugin update lenarise-slopguard\` |
| Disable temporarily | \`claude plugin disable lenarise-slopguard\` — the configuration is preserved |
| Remove | \`claude plugin uninstall lenarise-slopguard\` |

An update never touches anything in \`~/.claude/lenarise-slopguard/\`.

## What happens during a session

\`\`\`
session opens
  └─ session-start: rule set + capability index          → state: READY
you type
  └─ user-prompt: turn++ , heartbeat stamp               → state: LIVE
      └─ threshold crossed → a warning in chat
Claude wants to write a file
  ├─ pre-edit  → test file / .env / lockfile: DENY
  └─ post-edit → pattern found: BLOCK, violation recorded
Claude wants to run a command
  ├─ pre-bash  → rm -rf / DROP TABLE / force push: DENY
  ├─ pre-bash  → package not in the registry: DENY
  └─ post-bash → test or commit: stamp
Claude wants to finish
  └─ stop-gate → open violations or unverified code: BLOCK
session closes
  └─ session-end: N turns · M files · K lines · J slop blocked
\`\`\`

## Configuration reference

All editing happens in \`~/.claude/lenarise-slopguard/\`. Do not edit the plugin
directory: an update deletes it.

| File | Contents |
|---|---|
| \`config.json\` | mode, thresholds, disabled patterns, trusted packages, visibility |
| \`patterns.local.json\` | your own patterns |
| \`rules.local.md\` | free-text rules, injected at the start of every session |
| \`<repo>/.slopignore\` | per-project path exemptions |

Merge order: plugin defaults → \`config.json\` → \`patterns.local.json\` →
repository \`.slopignore\` → session mode.

### config.json

${configSchema()}

### patterns.local.json

\`\`\`json
{
  "patterns": [
    {
      "key": "unique-short-name",
      "id": "CODE-03",
      "scope": "code",
      "severity": "warn",
      "match": "TODO\\\\s*\\\\(urgent\\\\)",
      "flags": "gi",
      "detects": "What it catches, one sentence.",
      "fix": "What should be done, one sentence."
    }
  ]
}
\`\`\`

\`scope\` values: \`code\` (source file) · \`prose\` (text file) · \`path\` (file path) ·
\`command\` (shell command). \`match\` is a JSON string, so backslashes are escaped
twice. After writing one, confirm with \`/slop-doctor\` that the pattern count went up.

### Pattern catalogue

${patternCatalogue()}

Disabling works at three levels: a category (\`SEC\`), a taxonomy id (\`SEC-03\`) or
a single pattern key (\`sec-03-aws-key\`).

${NEW_IDS.length > 0 ? `\`${NEW_IDS.join('`, `')}\` are not in the source taxonomy; this project added them.` : ''}

### Game development (GAME)

GAME patterns key off engine API names (\`transform.Translate\`, \`PlayerPrefs\`,
\`get_node\`), so they stay silent in non-game projects on their own. They can
still be switched off in one line: \`disabled: ["GAME"]\`.

Their severity is \`warns\` by design: hot-path detection is a heuristic, and
opening a new domain with blocks would introduce the tool through a false
positive. **GAME-06** is the exception — economy and progression held on the
client is a security matter, and the player can edit \`PlayerPrefs\`.

**Engine-generated files are protected**, regardless of mode: \`.meta\`,
\`.uasset\`, \`.umap\`, \`.unity\`, \`.prefab\`, \`.tscn\`, \`Library/\`, \`.godot/\`,
\`Intermediate/\`, \`Saved/\`. A hand-edited \`.meta\` breaks every reference in the
scene and the damage surfaces long after the commit. Those directories are also
skipped during the scan walk — Unity's \`Library\` can hold hundreds of thousands
of files.

**Game rule text loads only in game projects.** \`session-start\` looks for an
engine signature at the root (\`Assets/\` + \`ProjectSettings/\` for Unity,
\`project.godot\` for Godot, \`*.uproject\` for Unreal) and injects nothing when it
finds none; loading rules that will never apply into every session would be too
much context (AGENT-02). The patterns are not gated on this, only the text.

### Inline waiver

\`\`\`js
// slop-guard-ignore CODE-05: third-party SDK throws here
\`\`\`

Three conditions must hold together: the directive sits on the finding's line or
the one directly above it, it names which pattern it silences, and it gives a
reason. If any is missing it silences nothing — and why it was rejected is
attached to the finding. Waivers that are used get counted and reported in the
session summary.

### Commands

| Command | What it does |
|---|---|
| \`/slop-setup\` | Creates the configuration, registers the status line. Never overwrites |
| \`/slop-status\` | Session counters **and** a live scan; it does not trust the hook record |
| \`/slop-check [path]\` | Scan on demand; no git repository required |
| \`/slop-doctor\` | Installation diagnosis; every line is a tick or a cross |
| \`/slop-config\` | Changes settings |
| \`/slop-mode strict\\|explore\` | Session mode; the persistent configuration is untouched |
| \`/slop-repo-init\` | Installs agent-agnostic protection into a repository |

#### Where it runs

\`/slop-check\` and \`/slop-status\` do not have to be inside a git repository. The
scan source is chosen from where you are:

| Where you are | What is scanned |
|---|---|
| A git repository | Changed files; every tracked file when nothing has changed |
| A plain folder | The filesystem is walked — every repository beneath it and any loose files |

In folder mode, noise directories are never entered: \`node_modules\`, \`dist\`,
\`build\`, \`.venv\`, \`__pycache__\`, and the game engine build directories. Every
nested \`.slopignore\` applies only to its own subtree; sibling repositories do not
inherit each other's exemptions.

That makes it possible to scan a parent directory holding several projects in one
call, rather than entering each repository separately.

#### The repository layer

\`/slop-repo-init\` installs four files under two different policies:

| File | Policy |
|---|---|
| \`AGENTS.md\` | Written once, then yours |
| \`.slopignore\` | Written once, then yours |
| \`.git/hooks/pre-commit\` | Refreshed on every run — if it is ours |
| \`.github/workflows/slop-gate.yml\` | Refreshed on every run — if it is ours |

The last two carry a \`LenaRise.SlopGuard\` header line. A file without that line
belongs to someone else and is never written over; the command says so and prints
the path to copy from. Without the distinction a fix to a template never reaches
the repositories that already hold an older copy — which is how a months-old
workflow kept running long after it was corrected.

\`--skip-ci\` leaves the workflow out.

#### CI and the scanner repository

The workflow reads the scanner from this repository. It is public, so a runner's
built-in \`GITHUB_TOKEN\` can read it and **no secret is needed**.

The fetch step is written to survive the other case too:

\`\`\`yaml
token: \${{ secrets.SLOPGUARD_TOKEN || github.token }}
\`\`\`

If you fork this project into a private repository, set a \`SLOPGUARD_TOKEN\`
secret with \`Contents: read\` on your fork and the same file keeps working:

\`\`\`bash
gh secret set SLOPGUARD_TOKEN --org <org> --visibility all
\`\`\`

When the fetch fails the job stops and prints that command, rather than the bare
"repository not found" a private repository returns to an unauthorised caller. A
gate that cannot run must not report success (TEST-05).

### Status line

Saying \`live\` requires two separate proofs: the heartbeat stamp carries this
session's id (registration), and \`pre-edit\` answers a synthetic payload correctly
(operability). Uncertainty is never rounded up to \`live\`.

| Display | Meaning |
|---|---|
| \`SlopGuard ready\` | Installed and answering, but not yet triggered in this session |
| \`SlopGuard live · …\` | Both proofs are present |
| \`SlopGuard unregistered\` | A message was sent but no hook fired |
| \`SlopGuard broken\` | The script does not answer the probe |
| \`SlopGuard off\` | \`enabled: false\` |

The desktop app's Code tab does not render statusLine (measured). For those
places, \`ui.chatStatus: N\` posts the same row into chat every N turns; it is off
by default.

## For an AI: how you help the user

This section exists so that an AI in any session can read it and act.

### Intent to action

| What the user says | What it means | What you do |
|---|---|---|
| "this warning keeps coming up" | the pattern is noisy | add the id to \`disabled\` in \`config.json\` |
| "it blocks too much" | strict mode feels heavy | first show which ids are firing, then disable them specifically |
| "I am prototyping" | a temporary relaxation | \`/slop-mode explore\` — leave the persistent config alone |
| "it should let me write test files" | the TEST lock is in the way | \`allowTestWrites: true\`; ask for the reason |
| "it keeps blocking this package" | the package gate | verify the package, then add it to \`trustedPackages\` |
| "the diff limit is too small" | the threshold is tight | \`thresholds.maxDiffLines\` |
| "it should catch this too" | a new pattern | \`patterns.local.json\`; test it first |
| "add my own rule" | a personal rule | \`rules.local.md\`, keep it short |
| "turn it off for this repo" | a project exemption | \`.slopignore\` at the repository root |
| "where do I stand" | visibility | \`/slop-status\` |

### Safe and unsafe edits

| Safe | Unsafe |
|---|---|
| Files under \`~/.claude/lenarise-slopguard/\` | The plugin cache — an update deletes it |
| Disabling one pattern or one id | Disabling a category, especially SEC |
| \`/slop-mode explore\` (this session) | \`config.json\` → \`mode: "explore"\` (permanent) |
| Changing a threshold based on a measurement | Removing a threshold because it is annoying |
| A reasoned inline waiver | A broad glob in \`.slopignore\` |

When disabling a pattern, **say what is lost**. Never propose disabling SEC on
your own initiative; if the user explicitly asks, do it and write down the risk.

### Verification after an edit

\`\`\`bash
jq -e . ~/.claude/lenarise-slopguard/config.json      # is the JSON valid
\`\`\`

Then run \`/slop-doctor\` and confirm the pattern count is what you expected.
\`config.json\`, \`patterns.local.json\` and \`.slopignore\` take effect immediately;
changes to \`hooks.json\` or the manifest require a restart.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The bar reads \`unregistered\` | Hooks did not register | Restart Claude Code, then \`/slop-doctor\` |
| The bar reads \`broken\` | The \`node\` path or a file permission | Follow the ❌ lines from \`/slop-doctor\` |
| No bar at all | \`statusLine\` is not registered | \`/slop-setup\` |
| Nothing is being blocked | The plugin is disabled or \`enabled: false\` | \`claude plugin list\`, then \`/slop-doctor\` |
| It locks up in a repository with no tests | Code was written, no test exists, the gate is waiting | \`allowTestWrites: true\` or \`/slop-mode explore\` |
| Package installs are always blocked | No network; the gate fails closed | Verify the package, add it to \`trustedPackages\` |

## Known limits

Not hidden:

- Regex scanning produces false positives. The escape hatch is a reasoned inline waiver.
- Guard-and-go (CODE-04) cannot be caught reliably by regex; it is heuristic.
- Repository-wide duplication (CODE-01) is invisible to a per-file scanner; jscpd covers it in CI.
- Business logic errors (LOGIC) cannot be caught mechanically; they are carried by rule text alone.
- A \`post-edit\` block does not stop the model; the guarantee is in \`stop-gate\`.
- Writing through Bash is **partly** covered. Shapes whose target is visible in the
  command are parsed — \`>\`, \`>>\`, \`tee\`, \`sed -i\`, \`cp\`, \`mv\`, \`touch\` — and those
  files go through both the protected-path lock and a content scan. Writes whose
  target cannot be read from the command (\`make\`, \`npm run build\`, custom scripts)
  are invisible. \`/slop-check\`, \`/slop-status\`, the pre-commit hook and CI close
  that gap with a live scan.
- Package verification needs the network and fails closed on timeout.
- If you fork this project privately, the CI pattern scan cannot run on a pull
  request from a fork of your fork: GitHub does not pass secrets to fork
  workflows. It does not apply to this repository, which is public.

## Licence

Apache License 2.0 — see [LICENSE](LICENSE). Copyright (c) 2026 Lena Rise.

Use it, change it, ship it in a commercial product; keep the notice and say what
you changed.

What the licence does **not** grant is the name. "Lena Rise", "LenaRise",
"SlopGuard" and "LenaRise.SlopGuard" are reserved (Apache-2.0 section 6): a fork
under different maintenance carries a different name and does not imply
endorsement. The code is open; the name is not.

Pull requests need a signed [CLA](CLA.md) — it keeps a later licence change
possible without tracking down every past contributor. Contributing is described
in [CONTRIBUTING.md](CONTRIBUTING.md); vulnerabilities go through
[SECURITY.md](SECURITY.md), never a public issue.

## Removal

\`\`\`bash
claude plugin uninstall lenarise-slopguard
claude plugin marketplace remove lenarise-slopguard
\`\`\`

Delete the \`statusLine\` entry in \`~/.claude/settings.json\`, the
\`~/.claude/lenarise-slopguard/\` directory, and the marked block in
\`~/.claude/CLAUDE.md\`. If \`/slop-setup\` left backups they are at
\`settings.json.slopguard-backup\` and \`CLAUDE.md.slopguard-backup\`.
`);

// The binding commitments appear in CLAUDE.md (for an agent working here) and
// in CONTRIBUTING.md (for a contributor). One source, or the two drift (DOC-07).
const BINDING_TABLE = `| Commitment | Category |
|---|---|
| Zero runtime dependencies — Node stdlib only | SEC-02 |
| Pattern definitions in a single source (\`lib/patterns.mjs\`); hooks, skills, semgrep and the README derive from it | CODE-01 |
| Documentation generated from code (\`npm run docs\`), never synced by hand | DOC-07 |
| No empty \`catch\` — errors go to \`stderr\`, never swallowed | CODE-05 |
| Hook tests run with real stdin payloads; a test is never weakened to pass | TEST-01 · TEST-02 |
| The command output is shown before anything is called working | TEST-05 |
| No emoji in headings, no buzzwords | DOC-04 · DOC-01 |
| No time estimates; scope is expressed as files, steps and unknowns | PROC-08 |
| A commit at every step; no single enormous commit | AGENT-06 · PROC-02 |
| Self-scan: the source passes through its own scanner | all |`;

// ── CLAUDE.md — for an agent working in this repository ──────────────────

emit('CLAUDE.md',
`# Working in the LenaRise.SlopGuard repository

GENERATED FILE. Do not edit; the source is \`scripts/gen-docs.mjs\`.

This repository is a slop protection tool. A tool against slop cannot be written
by breaking its own rules — the items below are binding, not aspirational.

## Binding commitments

${BINDING_TABLE}

The last item is the strictest: if our own scanner rejects our own code then
either the pattern is wrong or the code is. One of them gets fixed and **no
waiver is written**. The rule cuts both ways — if it should trip and does not,
the pattern gets widened.

## Before making a change

\`\`\`bash
npm test          # ${PATTERN_COUNT} patterns, pipe tests included
npm run selfscan  # our source through our own scanner
npm run docs      # refresh the generated documentation
\`\`\`

\`npm run docs -- --check\` exits 1 when a generated file is stale; that is the CI gate.

## The measurements the architecture rests on

The design decisions here are based on measurement, not assumption. All of them
are in \`docs/verification-log.md\` in a form that can be re-run:

- Hooks work in bypass permissions mode; a \`PreToolUse\` deny really stops the
  tool, and a \`Stop\` block prevents the turn from ending.
- A \`PostToolUse\` block reaches the model but does not stop it. That is why the
  hard guarantee lives in \`stop-gate\`.
- \`PostToolUse\` does not fire at all when a Bash command fails, and
  \`tool_response\` carries no exit code. "The tests passed" is known from the
  firing itself.
- \`statusLine\` receives \`session_id\` on stdin, and it is the same one the hooks see.
- \`process.exit()\` does not wait for a pending stdout write; output beyond the
  pipe buffer is truncated. Hooks use \`exitWhenFlushed()\`.
- \`commandSegments\` must split on newlines: a \`git commit\` on the second line of
  a multi-line block was invisible, so commits were never recorded.

If you are about to rely on a new platform behaviour, measure it first and write
what you measured into \`docs/verification-log.md\`.

## Language

Identifiers, messages, comments and documentation are English, so that any agent
reads the same directives and the plugin works anywhere. The two prose patterns
(DOC-01, PROC-08) deliberately keep non-English alternatives: they match written
text, and text comes in many languages.

## Directory map

| Path | Contents |
|---|---|
| \`lib/patterns.mjs\` | Pattern registry — the single source |
| \`lib/scan.mjs\` · \`lib/ignore.mjs\` | Matching engine and waiver policy |
| \`lib/config.mjs\` · \`lib/session.mjs\` · \`lib/coach.mjs\` | Configuration, session state, thresholds |
| \`lib/hook.mjs\` · \`lib/report.mjs\` · \`lib/heartbeat.mjs\` | Hook runner, output contract, liveness |
| \`lib/commands.mjs\` · \`lib/project.mjs\` | Shell command understanding, engine detection |
| \`hooks/\` | Eight hooks plus \`hooks.json\` |
| \`bin/statusline.mjs\` | Status line; works even when the plugin is dead |
| \`scripts/\` | Command scripts, scanner CLIs, the documentation generator |
| \`test/\` | ${'`node --test`'}; pipe tests run in a real process |
`);

// ── CONTRIBUTING.md — for someone sending a pull request ─────────────────

emit('CONTRIBUTING.md',
`# Contributing

GENERATED FILE. Do not edit; the source is \`scripts/gen-docs.mjs\`.

## Before the first pull request: the CLA

A first pull request cannot be merged until the Contributor License Agreement is
signed. A bot comments on the pull request with a link; agreeing there records
the signature against the GitHub account, once. The text is in
[CLA.md](CLA.md), and the reason it exists is in its opening paragraph.

## The three gates

Run these and paste the output into the pull request. A claim that they pass is
not the same as their output, and this project does not accept the first in
place of the second (TEST-05).

\`\`\`bash
npm test                  # every pattern, hook pipe tests included
npm run selfscan          # this source through its own scanner
npm run docs -- --check   # exits 1 when a generated file is stale
\`\`\`

If \`npm run docs -- --check\` fails, run \`npm run docs\` and commit what changes.
Editing a generated file by hand is reverted on the next run.

## Adding or changing a pattern

Patterns live in one place, \`lib/patterns.mjs\`. Hooks, the semgrep template,
the skills and the README are all derived from it, so a pattern is added there
and nowhere else.

A pattern is accepted with three things, not one:

1. The taxonomy entry — id, category, scope, severity, and the fix line the user
   will read.
2. A test that it matches what it is meant to match.
3. A test that it stays **silent** on the code nearby that looks similar and is
   correct.

The third is not optional. A pattern without a false-positive test is reverted
the first time it misfires, and it will misfire — regex scanning of real code
always does. The proposal template asks for the negative example for this reason.

Then run \`npm run docs\`, which moves the README, the semgrep rules and the
skill text with it.

## What gets rejected

- A new runtime dependency. Node standard library only; this is not negotiable
  and it is the reason the scanner can be read in one sitting.
- A test weakened, skipped or deleted to make a change pass.
- A pattern with no negative test.
- A generated file edited by hand.
- A change that makes the scanner's own source fail \`npm run selfscan\`. If our
  scanner rejects our code, either the pattern is wrong or the code is — one of
  them gets fixed, and no waiver is written.

## Review

Every path has a code owner, and a merge needs that owner's approval. Pushing
straight to \`main\` is blocked for everyone, including maintainers.

Small pull requests are read; a diff over 400 lines is not (PROC-02). Splitting
a change into steps is worth more than sending it complete.

## The commitments this project holds itself to

A tool against slop cannot be written by breaking its own rules. These are
binding here, not aspirational:

${BINDING_TABLE}

## Reporting rather than fixing

- A false positive is a normal issue, not a security report.
- A way to make the scanner pass content it should block **is** a security
  report — see [SECURITY.md](SECURITY.md), and do not open a public issue.
`);

// ── generated sections inside the skill ──────────────────────────────────

const skillFile = join(ROOT, 'skills/slop-config/SKILL.md');
if (existsSync(skillFile)) {
  let skill = readFileSync(skillFile, 'utf8');
  const inject = (name, body) => {
    const re = new RegExp(`(<!-- GENERATED: ${name} -->)[\\s\\S]*?(<!-- /GENERATED: ${name} -->)`);
    if (!re.test(skill)) {
      process.stderr.write(`gen-docs: no "${name}" marker in SKILL.md\n`);
      return;
    }
    skill = skill.replace(re, `$1\n${body}\n$2`);
  };
  inject('config-schema', configSchema());
  inject('pattern-catalogue', patternCatalogue());
  emit('skills/slop-config/SKILL.md', skill);
}

// ── Result ───────────────────────────────────────────────────────────────

if (CHECK) {
  if (stale.length === 0) {
    process.stdout.write('Generated documentation is current.\n');
    process.exit(0);
  }
  process.stdout.write(`Generated documentation is stale (${stale.length}):\n`);
  for (const rel of stale) process.stdout.write(`  ${rel}\n`);
  process.stdout.write('\nTo refresh: npm run docs\n');
  process.exit(1);
}

process.stdout.write(written.length === 0
  ? 'Documentation is already current.\n'
  : `${written.length} file(s) generated:\n${written.map((r) => `  ${r}`).join('\n')}\n`);
