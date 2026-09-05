# LenaRise.SlopGuard

GENERATED FILE. Do not edit; the sources are `lib/patterns.mjs`, `lib/config.mjs`
and `scripts/gen-docs.mjs`. To regenerate: `npm run docs`.

A Claude Code plugin that protects the quality and safety of what gets produced
during agentic development. Rule text carries the intent; hooks set the boundary,
and stop where the model cannot step over.

Version 0.4.3 · 33 mechanical patterns · 71 taxonomy entries · zero runtime dependencies.

## What it does

Three layers, three audiences.

1. **Machine layer** — Claude Code hooks. The model cannot skip these; the
   harness runs them.
2. **Human layer** — measurement-based warnings delivered in chat. It warns, it
   never blocks.
3. **Repository layer** — a git hook and CI. These work whichever agent wrote the code.

| Category | IDs | Mechanical patterns | Enforcement |
|---|---|---|---|
| **CODE** Code quality | 9 | 6 | strong |
| **LOGIC** Logic and accuracy | 9 | 1 | partial |
| **TEST** Testing | 7 | 3 | strongest |
| **SEC** Security | 8 | 6 | strong |
| **AGENT** Agent operations | 9 | 6 | strong |
| **PROC** Process and team | 8 | 1 | moderate |
| **DOC** Non-code output | 7 | 3 | moderate |
| **HUMAN** Human factors | 6 | none — coach layer | measure and warn |
| **GAME** Game development | 8 | 7 | domain-scoped |

### Hook behaviour

| Hook | Event | Behaviour |
|---|---|---|
| `session-start` | SessionStart | Injects the rule set and the capability index |
| `user-prompt` | UserPromptSubmit | Turn counter, coach warnings, heartbeat stamp |
| `pre-edit` | PreToolUse Edit/Write | Test files and protected paths → **deny** |
| `post-edit` | PostToolUse Edit/Write | On a finding, **block** and record the violation |
| `pre-bash` | PreToolUse Bash | Destructive command → **deny**; unverified package → **deny**; redirect to a protected path → **deny** |
| `post-bash` | PostToolUse Bash | Test and commit stamps; scans files written through the shell |
| `stop-gate` | Stop | Open violations, unverified code or an oversized diff → **block** |
| `session-end` | SessionEnd | Measurement-based session summary |

The hard guarantee lives in `pre-edit` and `stop-gate`. A `post-edit` block
reaches the model but does not stop it — that was measured, see
`docs/verification-log.md`. So `post-edit` records what it found in the session
ledger and the lock is built in `stop-gate`.

## Installation

```bash
claude plugin marketplace add LenaRiseCorp/LenaRise.SlopGuard
claude plugin install lenarise-slopguard@lenarise-slopguard -y
```

Then run `/slop-setup` and restart Claude Code. To verify: `/slop-doctor`.

If the repository is private, both commands need an account with access to it.

`/slop-setup` does the following and **never overwrites an existing file**: it
creates the configuration files only when they are missing, registers the status
line, and installs the silent-death protection rule into `~/.claude/CLAUDE.md`.
The rule is written between markers; the rest of the file is untouched and
deleting the block removes it cleanly. To skip it: `/slop-setup --skip-claude-md`.

Why that rule is automatic: it is the only layer that runs when the plugin is
dead — if hooks are not registered, the hook that would ask "are you running?" is
not there either. The status line is also not visible everywhere (the desktop
app's Code tab does not render statusLine), so for some users no other mechanism
would catch a silent death.

| Task | Command |
|---|---|
| Update | `claude plugin update lenarise-slopguard` |
| Disable temporarily | `claude plugin disable lenarise-slopguard` — the configuration is preserved |
| Remove | `claude plugin uninstall lenarise-slopguard` |

An update never touches anything in `~/.claude/lenarise-slopguard/`.

## What happens during a session

```
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
```

## Configuration reference

All editing happens in `~/.claude/lenarise-slopguard/`. Do not edit the plugin
directory: an update deletes it.

| File | Contents |
|---|---|
| `config.json` | mode, thresholds, disabled patterns, trusted packages, visibility |
| `patterns.local.json` | your own patterns |
| `rules.local.md` | free-text rules, injected at the start of every session |
| `<repo>/.slopignore` | per-project path exemptions |

Merge order: plugin defaults → `config.json` → `patterns.local.json` →
repository `.slopignore` → session mode.

### config.json

| Field | Default | What it does |
|---|---|---|
| `enabled` | `true` | Setting it to `false` stops all protection; the bar reads "off" |
| `mode` | `"strict"` | `strict` blocks, `explore` only warns (except irreversible commands) |
| `disabled` | `[]` | A category (`SEC`), a taxonomy id (`SEC-03`) or a pattern key |
| `trustedPackages` | `[]` | Package names that pass without a registry lookup |
| `allowTestWrites` | `false` | `true` unlocks writing to test files (TEST-01) |
| `thresholds.maxDiffLines` | `400` | Stop gate: lines changed since the last commit (PROC-02) |
| `thresholds.contextTurns` | `40` | Coach warning: session turn threshold (AGENT-01) |
| `thresholds.contextUsedPercent` | `75` | Context fill ratio threshold; measured by the status line (AGENT-01) |
| `thresholds.comprehensionGap` | `500` | Coach warning: lines written minus lines read (HUMAN-01) |
| `thresholds.uncommittedLines` | `300` | Coach warning: lines accumulated without a commit (AGENT-06) |
| `thresholds.consecutiveFixes` | `3` | Coach warning: consecutive patches to the same file (LOGIC-05) |
| `thresholds.packageCheckTimeoutMs` | `2500` | Package registry lookup; exceeding it blocks (SEC-02) |
| `thresholds.maxStopBlocks` | `2` | How often the same reason may block before the gate opens (AGENT-08) |
| `ui.statusLine` | `"compact"` | `compact` · `minimal` · `off` |
| `ui.cleanScans` | `"silent"` | `silent` · `summary` — whether a clean scan is announced |
| `ui.heartbeat` | `true` | one-line confirmation on the first turn |
| `ui.livenessCheck` | `"ask"` | `ask` · `warn` · `off` — behaviour when the plugin does not respond |
| `ui.chatStatus` | `0` | `0` off; `N` posts a status row in chat every N turns, for places the status line is not visible |

### patterns.local.json

```json
{
  "patterns": [
    {
      "key": "unique-short-name",
      "id": "CODE-03",
      "scope": "code",
      "severity": "warn",
      "match": "TODO\\s*\\(urgent\\)",
      "flags": "gi",
      "detects": "What it catches, one sentence.",
      "fix": "What should be done, one sentence."
    }
  ]
}
```

`scope` values: `code` (source file) · `prose` (text file) · `path` (file path) ·
`command` (shell command). `match` is a JSON string, so backslashes are escaped
twice. After writing one, confirm with `/slop-doctor` that the pattern count went up.

### Pattern catalogue

| ID | Pattern key | Scope | Severity | What it catches |
|---|---|---|---|---|
| AGENT-05 | `agent-05-chmod-777` | shell command | blocks | World-writable permissions. |
| AGENT-05 | `agent-05-delete-without-where` | shell command | blocks | DELETE without WHERE — it empties the table. |
| AGENT-05 | `agent-05-git-force-push` | shell command | blocks | Force push — it erases someone else’s work. |
| AGENT-05 | `agent-05-git-reset-hard` | shell command | blocks | Uncommitted work is being hard-reset away. |
| AGENT-05 | `agent-05-rm-recursive-force` | shell command | blocks | Recursive forced delete — there is no undo. |
| AGENT-05 | `agent-05-sql-destructive` | shell command | blocks | Destructive schema command. |
| CODE-01 | `code-01-versioned-filename` | file path | blocks | Version-suffixed filename — a new copy placed beside the old one. |
| CODE-04 | `code-04-guard-and-go` | source file | warns | Code parked on a dead branch — wrapped instead of deleted. |
| CODE-05 | `code-05-catch-noop` | source file | blocks | Empty .catch() — the rejected promise is silently swallowed. |
| CODE-05 | `code-05-comment-only-catch` | source file | blocks | Catch body containing only comments — the error is still swallowed. |
| CODE-05 | `code-05-empty-catch` | source file | blocks | Empty catch body — the error is caught and swallowed. |
| CODE-05 | `code-05-except-pass` | source file | blocks | except: pass — the exception is silently swallowed. |
| DOC-01 | `doc-01-buzzword` | text file | warns | Marketing language carrying no information. |
| DOC-03 | `doc-03-empty-commit-msg` | shell command | warns | Empty commit message — it does not say what changed or why. |
| DOC-04 | `doc-04-emoji-heading` | text file | warns | Heading that opens with an emoji. |
| GAME-01 | `game-01-framerate-dependent-motion` | source file | warns | Motion is frame-rate dependent — not scaled by Time.deltaTime. |
| GAME-02 | `game-02-scene-lookup-per-frame` | source file | warns | Scene lookup or component resolution inside the frame loop. |
| GAME-03 | `game-03-physics-in-update` | source file | warns | Physics call inside Update — not synchronised with the physics step. |
| GAME-04 | `game-04-hot-path-allocation` | source file | warns | LINQ inside the frame loop — garbage every frame, visible as hitching. |
| GAME-05 | `game-05-logging-per-frame` | source file | warns | Logging every frame — measurably lowers frame time in the editor. |
| GAME-06 | `game-06-client-side-economy` | source file | blocks | Economy or progression value stored on the client (SEC-04). |
| GAME-07 | `game-07-fragile-node-path` | source file | warns | Relative scene tree path — it breaks silently when a node moves. |
| LOGIC-02 | `logic-02-package-install` | shell command | blocks | Package install — installing an unverified name is a slopsquatting surface (SEC-02). |
| PROC-08 | `proc-08-effort-estimate` | text file | blocks | A time estimate that cannot be measured. |
| SEC-01 | `sec-01-eval` | source file | blocks | Dynamic code execution. |
| SEC-03 | `sec-03-aws-key` | source file | blocks | AWS access key ID. |
| SEC-03 | `sec-03-inline-secret` | source file | blocks | Secret committed to source. |
| SEC-03 | `sec-03-private-key` | source file | blocks | Private key embedded in a file. |
| SEC-05 | `sec-05-sql-concat` | source file | blocks | SQL built by string concatenation — an injection surface. |
| SEC-05 | `sec-05-sql-fstring` | source file | blocks | SQL built with an f-string — an injection surface. |
| TEST-01 | `test-01-skipped-test` | source file | blocks | A skipped test — the shortest route from red to green. |
| TEST-03 | `test-03-fake-impl` | source file | warns | Fake implementation — a signature with no body. |
| TEST-04 | `test-04-tautological-assert` | source file | blocks | An assertion that passes under every condition — it verifies nothing. |

Disabling works at three levels: a category (`SEC`), a taxonomy id (`SEC-03`) or
a single pattern key (`sec-03-aws-key`).

`PROC-08`, `GAME-01`, `GAME-02`, `GAME-03`, `GAME-04`, `GAME-05`, `GAME-06`, `GAME-07`, `GAME-08` are not in the source taxonomy; this project added them.

### Game development (GAME)

GAME patterns key off engine API names (`transform.Translate`, `PlayerPrefs`,
`get_node`), so they stay silent in non-game projects on their own. They can
still be switched off in one line: `disabled: ["GAME"]`.

Their severity is `warns` by design: hot-path detection is a heuristic, and
opening a new domain with blocks would introduce the tool through a false
positive. **GAME-06** is the exception — economy and progression held on the
client is a security matter, and the player can edit `PlayerPrefs`.

**Engine-generated files are protected**, regardless of mode: `.meta`,
`.uasset`, `.umap`, `.unity`, `.prefab`, `.tscn`, `Library/`, `.godot/`,
`Intermediate/`, `Saved/`. A hand-edited `.meta` breaks every reference in the
scene and the damage surfaces long after the commit. Those directories are also
skipped during the scan walk — Unity's `Library` can hold hundreds of thousands
of files.

**Game rule text loads only in game projects.** `session-start` looks for an
engine signature at the root (`Assets/` + `ProjectSettings/` for Unity,
`project.godot` for Godot, `*.uproject` for Unreal) and injects nothing when it
finds none; loading rules that will never apply into every session would be too
much context (AGENT-02). The patterns are not gated on this, only the text.

### Inline waiver

```js
// slop-guard-ignore CODE-05: third-party SDK throws here
```

Three conditions must hold together: the directive sits on the finding's line or
the one directly above it, it names which pattern it silences, and it gives a
reason. If any is missing it silences nothing — and why it was rejected is
attached to the finding. Waivers that are used get counted and reported in the
session summary.

### Commands

| Command | What it does |
|---|---|
| `/slop-setup` | Creates the configuration, registers the status line. Never overwrites |
| `/slop-status` | Session counters **and** a live scan; it does not trust the hook record |
| `/slop-check [path]` | Scan on demand; no git repository required |
| `/slop-doctor` | Installation diagnosis; every line is a tick or a cross |
| `/slop-config` | Changes settings |
| `/slop-mode strict\|explore` | Session mode; the persistent configuration is untouched |
| `/slop-repo-init` | Installs agent-agnostic protection into a repository |

#### Where it runs

`/slop-check` and `/slop-status` do not have to be inside a git repository. The
scan source is chosen from where you are:

| Where you are | What is scanned |
|---|---|
| A git repository | Changed files; every tracked file when nothing has changed |
| A plain folder | The filesystem is walked — every repository beneath it and any loose files |

In folder mode, noise directories are never entered: `node_modules`, `dist`,
`build`, `.venv`, `__pycache__`, and the game engine build directories. Every
nested `.slopignore` applies only to its own subtree; sibling repositories do not
inherit each other's exemptions.

That makes it possible to scan a parent directory holding several projects in one
call, rather than entering each repository separately.

### Status line

Saying `live` requires two separate proofs: the heartbeat stamp carries this
session's id (registration), and `pre-edit` answers a synthetic payload correctly
(operability). Uncertainty is never rounded up to `live`.

| Display | Meaning |
|---|---|
| `SlopGuard ready` | Installed and answering, but not yet triggered in this session |
| `SlopGuard live · …` | Both proofs are present |
| `SlopGuard unregistered` | A message was sent but no hook fired |
| `SlopGuard broken` | The script does not answer the probe |
| `SlopGuard off` | `enabled: false` |

The desktop app's Code tab does not render statusLine (measured). For those
places, `ui.chatStatus: N` posts the same row into chat every N turns; it is off
by default.

## For an AI: how you help the user

This section exists so that an AI in any session can read it and act.

### Intent to action

| What the user says | What it means | What you do |
|---|---|---|
| "this warning keeps coming up" | the pattern is noisy | add the id to `disabled` in `config.json` |
| "it blocks too much" | strict mode feels heavy | first show which ids are firing, then disable them specifically |
| "I am prototyping" | a temporary relaxation | `/slop-mode explore` — leave the persistent config alone |
| "it should let me write test files" | the TEST lock is in the way | `allowTestWrites: true`; ask for the reason |
| "it keeps blocking this package" | the package gate | verify the package, then add it to `trustedPackages` |
| "the diff limit is too small" | the threshold is tight | `thresholds.maxDiffLines` |
| "it should catch this too" | a new pattern | `patterns.local.json`; test it first |
| "add my own rule" | a personal rule | `rules.local.md`, keep it short |
| "turn it off for this repo" | a project exemption | `.slopignore` at the repository root |
| "where do I stand" | visibility | `/slop-status` |

### Safe and unsafe edits

| Safe | Unsafe |
|---|---|
| Files under `~/.claude/lenarise-slopguard/` | The plugin cache — an update deletes it |
| Disabling one pattern or one id | Disabling a category, especially SEC |
| `/slop-mode explore` (this session) | `config.json` → `mode: "explore"` (permanent) |
| Changing a threshold based on a measurement | Removing a threshold because it is annoying |
| A reasoned inline waiver | A broad glob in `.slopignore` |

When disabling a pattern, **say what is lost**. Never propose disabling SEC on
your own initiative; if the user explicitly asks, do it and write down the risk.

### Verification after an edit

```bash
jq -e . ~/.claude/lenarise-slopguard/config.json      # is the JSON valid
```

Then run `/slop-doctor` and confirm the pattern count is what you expected.
`config.json`, `patterns.local.json` and `.slopignore` take effect immediately;
changes to `hooks.json` or the manifest require a restart.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The bar reads `unregistered` | Hooks did not register | Restart Claude Code, then `/slop-doctor` |
| The bar reads `broken` | The `node` path or a file permission | Follow the ❌ lines from `/slop-doctor` |
| No bar at all | `statusLine` is not registered | `/slop-setup` |
| Nothing is being blocked | The plugin is disabled or `enabled: false` | `claude plugin list`, then `/slop-doctor` |
| It locks up in a repository with no tests | Code was written, no test exists, the gate is waiting | `allowTestWrites: true` or `/slop-mode explore` |
| Package installs are always blocked | No network; the gate fails closed | Verify the package, add it to `trustedPackages` |

## Known limits

Not hidden:

- Regex scanning produces false positives. The escape hatch is a reasoned inline waiver.
- Guard-and-go (CODE-04) cannot be caught reliably by regex; it is heuristic.
- Repository-wide duplication (CODE-01) is invisible to a per-file scanner; jscpd covers it in CI.
- Business logic errors (LOGIC) cannot be caught mechanically; they are carried by rule text alone.
- A `post-edit` block does not stop the model; the guarantee is in `stop-gate`.
- Writing through Bash is **partly** covered. Shapes whose target is visible in the
  command are parsed — `>`, `>>`, `tee`, `sed -i`, `cp`, `mv`, `touch` — and those
  files go through both the protected-path lock and a content scan. Writes whose
  target cannot be read from the command (`make`, `npm run build`, custom scripts)
  are invisible. `/slop-check`, `/slop-status`, the pre-commit hook and CI close
  that gap with a live scan.
- Package verification needs the network and fails closed on timeout.

## Removal

```bash
claude plugin uninstall lenarise-slopguard
claude plugin marketplace remove lenarise-slopguard
```

Delete the `statusLine` entry in `~/.claude/settings.json`, the
`~/.claude/lenarise-slopguard/` directory, and the marked block in
`~/.claude/CLAUDE.md`. If `/slop-setup` left backups they are at
`settings.json.slopguard-backup` and `CLAUDE.md.slopguard-backup`.
