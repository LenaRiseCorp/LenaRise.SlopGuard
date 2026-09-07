# LenaRise.SlopGuard

GENERATED FILE. Do not edit; the sources are `lib/patterns.mjs`, `lib/config.mjs`
and `scripts/gen-docs.mjs`. To regenerate: `npm run docs`.

A Claude Code plugin that protects the quality and safety of what gets produced
during agentic development. Rule text carries the intent; hooks set the boundary,
and stop where the model cannot step over.

Version 0.8.0 · 81 mechanical patterns · 86 taxonomy entries · zero runtime dependencies.

## What changes when it runs

The agent meets the rules while it works rather than at review time: an empty
`catch`, a skipped test, an assertion that cannot fail, a secret pasted into
source, an `rm -rf` about to run. 23 of the 81 patterns
carry block severity and 58 warn. The table describes strict mode;
`explore` warns and lets the rest through, apart from irreversible commands.

| | Without it | With it |
|---|---|---|
| A finding surfaces | At review, or never | In the turn that produced it |
| What enforces the rule | The model remembering it | A hook the harness runs, which the model cannot skip |
| `rm -rf` · `DROP TABLE` · force push | They run | `pre-bash` denies before the command runs |
| Installing a package | Whatever answers to that name | The name is checked against the registry first |
| A pattern in written content | Ships | `post-edit` records it and `stop-gate` holds the turn |
| Saying "done" | The model declares it | A test has to have run in that turn (TEST-05) |
| The agent's own conduct | Unmeasured | Turns and uncommitted lines are counted |
| The rest of the team | Your machine only | `/slop-repo-init` adds a pre-commit hook, and CI with `--with-ci` |

The gate is deliberately not unconditional: when the same reason blocks more
than `maxStopBlocks` times with no progress it opens and says that it did,
because a gate nobody can pass is one people learn to route around (AGENT-08).

Mechanical matching covers what has a shape: LOGIC — an invented API, a package
name nobody published — holds 1 of the 81 patterns and
leans on the rule text. The rest of what it cannot see is in
[Known limits](#known-limits).

## What it does

Three layers, three audiences.

1. **Machine layer** — Claude Code hooks. The model cannot skip these; the
   harness runs them.
2. **Human layer** — measurement-based warnings delivered in chat. It warns, it
   never blocks.
3. **Repository layer** — a git hook and CI. These work whichever agent wrote the code.

| Category | IDs | Mechanical patterns | Enforcement |
|---|---|---|---|
| **CODE** Code quality | 10 | 16 | strong |
| **LOGIC** Logic and accuracy | 9 | 1 | partial |
| **TEST** Testing | 7 | 3 | strongest |
| **SEC** Security | 8 | 9 | strong |
| **AGENT** Agent operations | 9 | 6 | strong |
| **PROC** Process and team | 8 | 1 | moderate |
| **DOC** Non-code output | 9 | 16 | moderate |
| **HUMAN** Human factors | 6 | none — coach layer | measure and warn |
| **GAME** Game development | 8 | 7 | domain-scoped |
| **UI** Interface output | 7 | 15 | domain-scoped |
| **A11Y** Accessibility | 5 | 7 | domain-scoped |

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

`scope` values: `code` (source file) · `prose` (text file) · `style` (stylesheet) ·
`markup` (markup file) · `path` (file path) · `command` (shell command). `match` is a JSON string, so backslashes are escaped
twice. After writing one, confirm with `/slop-doctor` that the pattern count went up.

### Pattern catalogue

| ID | Pattern key | Scope | Severity | What it catches |
|---|---|---|---|---|
| A11Y-01 | `a11y-01-outline-none-class` | source file | warns | outline-none with no focus style beside it. |
| A11Y-01 | `a11y-01-outline-none-css` | stylesheet | warns | Focus outline removed with no visible replacement. |
| A11Y-03 | `a11y-03-hover-only-reveal` | stylesheet | warns | Content revealed on hover with no focus equivalent anywhere in the file. |
| A11Y-04 | `a11y-04-zoom-disabled` | markup file | warns | Pinch zoom disabled in the viewport meta tag. |
| A11Y-05 | `a11y-05-root-overflow-hidden` | stylesheet | warns | Horizontal overflow hidden on the root — the leak is covered, not fixed. |
| A11Y-06 | `a11y-06-viewport-locked-class` | source file | warns | h-screen locks the element to the viewport height. |
| A11Y-06 | `a11y-06-viewport-locked-css` | stylesheet | warns | Section locked to the viewport height. |
| AGENT-05 | `agent-05-chmod-777` | shell command | blocks | World-writable permissions. |
| AGENT-05 | `agent-05-delete-without-where` | shell command | blocks | DELETE without WHERE — it empties the table. |
| AGENT-05 | `agent-05-git-force-push` | shell command | blocks | Force push — it erases someone else’s work. |
| AGENT-05 | `agent-05-git-reset-hard` | shell command | blocks | Uncommitted work is being hard-reset away. |
| AGENT-05 | `agent-05-rm-recursive-force` | shell command | blocks | Recursive forced delete — there is no undo. |
| AGENT-05 | `agent-05-sql-destructive` | shell command | blocks | Destructive schema command. |
| CODE-01 | `code-01-versioned-filename` | file path | blocks | Version-suffixed filename — a new copy placed beside the old one. |
| CODE-04 | `code-04-guard-and-go` | source file | warns | Code parked on a dead branch — wrapped instead of deleted. |
| CODE-05 | `code-05-catch-noop` | source file | blocks | Empty .catch() — the rejected promise is silently swallowed. |
| CODE-05 | `code-05-comment-only-catch` | source file | warns | Catch body containing only comments — the error is still swallowed. |
| CODE-05 | `code-05-empty-catch` | source file | blocks | Empty catch body — the error is caught and swallowed. |
| CODE-05 | `code-05-except-pass` | source file | blocks | except: pass — the exception is silently swallowed. |
| CODE-10 | `code-10-banner-rule` | source file | warns | Comment made only of repeated characters — decoration standing in for a section. |
| CODE-10 | `code-10-comment-emoji` | source file | warns | Emoji used as decoration in a comment. |
| CODE-10 | `code-10-empty-label` | source file | warns | Comment naming a category instead of stating a fact. |
| CODE-10 | `code-10-empty-note` | source file | warns | A note that announces importance without saying what is important. |
| CODE-10 | `code-10-end-marker` | source file | warns | Comment marking the end of a block the closing brace already ends. |
| CODE-10 | `code-10-future-work` | source file | warns | A placeholder promising work that is never specified. |
| CODE-10 | `code-10-shouted-banner` | source file | warns | Section name shouted between rows of punctuation. |
| CODE-10 | `code-10-signature-echo` | source file | warns | Documentation repeating the parameter name back as its description. |
| CODE-10 | `code-10-step-narration` | source file | warns | Comment narrating the flow step by step. |
| CODE-10 | `code-10-vague-todo` | source file | warns | A TODO naming a feeling rather than a task. |
| DOC-01 | `doc-01-buzzword` | text file | warns | Marketing language carrying no information. |
| DOC-03 | `doc-03-empty-commit-msg` | shell command | warns | Empty commit message — it does not say what changed or why. |
| DOC-04 | `doc-04-emoji-heading` | text file | warns | Heading that opens with an emoji. |
| DOC-08 | `doc-08-chatbot-closer` | text file | warns | A chat turn closing a document that has no reader to answer it. |
| DOC-08 | `doc-08-filler-opener` | text file | warns | An opener that delays the sentence without adding to it. |
| DOC-08 | `doc-08-inline-header-list` | text file | warns | A list where every item is a bold lead-in followed by a colon. |
| DOC-08 | `doc-08-negative-parallelism` | text file | warns | The "not X, but Y" cadence used as emphasis. |
| DOC-08 | `doc-08-signposting` | text file | warns | A sentence announcing what the next sentences will do. |
| DOC-08 | `doc-08-stacked-hedging` | text file | warns | Two hedges on one verb — the sentence commits to nothing. |
| DOC-08 | `doc-08-weasel-attribution` | text file | warns | A claim attributed to an authority that is never named. |
| DOC-09 | `doc-09-fabricated-metric-code` | source file | warns | A headline number with nothing behind it. |
| DOC-09 | `doc-09-fabricated-metric-markup` | markup file | warns | A headline number with nothing behind it. |
| DOC-09 | `doc-09-fabricated-metric-prose` | text file | warns | A headline number with nothing behind it. |
| DOC-09 | `doc-09-filler-identity-code` | source file | warns | Placeholder identity shipped as if it were content. |
| DOC-09 | `doc-09-filler-identity-markup` | markup file | warns | Placeholder identity shipped as if it were content. |
| DOC-09 | `doc-09-filler-identity-prose` | text file | warns | Placeholder identity shipped as if it were content. |
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
| SEC-01 | `sec-01-tls-verification-disabled` | source file | blocks | TLS certificate verification disabled. |
| SEC-03 | `sec-03-aws-key` | source file | blocks | AWS access key ID. |
| SEC-03 | `sec-03-inline-secret` | source file | blocks | Secret committed to source. |
| SEC-03 | `sec-03-private-key` | source file | blocks | Private key embedded in a file. |
| SEC-05 | `sec-05-sql-concat` | source file | blocks | SQL built by string concatenation — an injection surface. |
| SEC-05 | `sec-05-sql-fstring` | source file | blocks | SQL built with an f-string — an injection surface. |
| SEC-08 | `sec-08-open-ingress` | source file | warns | Network rule open to the whole internet. |
| SEC-08 | `sec-08-public-write-storage` | source file | blocks | Storage open for anyone to write to. |
| TEST-01 | `test-01-skipped-test` | source file | blocks | A skipped test — the shortest route from red to green. |
| TEST-03 | `test-03-fake-impl` | source file | warns | Fake implementation — a signature with no body. |
| TEST-04 | `test-04-tautological-assert` | source file | blocks | An assertion that passes under every condition — it verifies nothing. |
| UI-01 | `ui-01-default-gradient-classes` | source file | warns | The default blue-to-purple gradient pair. |
| UI-01 | `ui-01-default-gradient-css` | stylesheet | warns | Gradient built from the default indigo and violet hexes. |
| UI-02 | `ui-02-glass-stacking` | source file | warns | Glassmorphism on three or more elements close together. |
| UI-02 | `ui-02-glow-stacking` | stylesheet | warns | Glow applied to three or more elements close together. |
| UI-03 | `ui-03-background-grid` | source file | warns | Grid or dot background applied with no stated visual purpose. |
| UI-03 | `ui-03-button-arrow-code` | source file | warns | Arrow used as button decoration. |
| UI-03 | `ui-03-button-arrow-markup` | markup file | warns | Arrow used as button decoration. |
| UI-04 | `ui-04-generic-icon-import` | source file | warns | Icons picked from the default set rather than for their meaning. |
| UI-05 | `ui-05-empty-anchor-code` | source file | warns | Link that goes nowhere. |
| UI-05 | `ui-05-empty-anchor-markup` | markup file | warns | Link that goes nowhere. |
| UI-05 | `ui-05-inert-button` | source file | warns | Button with no action attached. |
| UI-06 | `ui-06-mono-heading` | source file | warns | Monospace applied to a heading as a style gesture. |
| UI-06 | `ui-06-uppercase-tracking` | source file | warns | The uppercase label with wide tracking, used as a default. |
| UI-07 | `ui-07-stock-illustration-code` | source file | warns | Stock illustration with no connection to the product. |
| UI-07 | `ui-07-stock-illustration-markup` | markup file | warns | Stock illustration with no connection to the product. |

Disabling works at three levels: a category (`SEC`), a taxonomy id (`SEC-03`) or
a single pattern key (`sec-03-aws-key`).

`PROC-08`, `CODE-10`, `DOC-08`, `DOC-09`, `UI-01`, `UI-02`, `UI-03`, `UI-04`, `UI-05`, `UI-06`, `UI-07`, `A11Y-01`, `A11Y-03`, `A11Y-04`, `A11Y-05`, `A11Y-06`, `GAME-01`, `GAME-02`, `GAME-03`, `GAME-04`, `GAME-05`, `GAME-06`, `GAME-07`, `GAME-08` are not in the source taxonomy; this project added them.

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

#### The repository layer

`/slop-repo-init` installs three files. The CI workflow is a fourth, and it is
opt-in:

| File | Installed | Policy |
|---|---|---|
| `AGENTS.md` | always | Written once, then yours |
| `.slopignore` | always | Written once, then yours |
| `.git/hooks/pre-commit` | always | Refreshed on every run — if it is ours |
| `.github/workflows/slop-gate.yml` | `--with-ci` | Refreshed once present — if it is ours |

The last two carry a `LenaRise.SlopGuard` header line. A file without that line
belongs to someone else and is never written over; the command says so and prints
the path to copy from. Without the distinction a fix to a template never reaches
the repositories that already hold an older copy — which is how a months-old
workflow kept running long after it was corrected.

**The default is local.** The protection you feel while working is the hook
layer: a `PreToolUse` deny while an agent writes, and the pre-commit hook before
anything leaves the machine. Neither needs a network, a service or an account.

CI is opt-in because a workflow nobody asked for spends someone's minutes, and a
red job nobody chose is the fastest way to teach a team that red means nothing.
Add it where the gate should cover people who are not running the hooks:

```bash
/slop-repo-init --with-ci
```

Opting out later does not delete a workflow the repository already has — an
outdated copy left behind would be worse than no copy. Remove the file to remove
the gate.

#### The optional CI gate

The workflow reads the scanner from this repository. It is public, so a runner's
built-in `GITHUB_TOKEN` can read it and **no secret is needed**.

Both inputs are variables, so a private fork of the scanner works too:

```yaml
repository: ${{ vars.SLOPGUARD_REPO || 'LenaRiseCorp/LenaRise.SlopGuard' }}
token: ${{ secrets.SLOPGUARD_TOKEN || github.token }}
```

A token on its own would not be enough — it authenticates the checkout, it does
not change which repository is checked out. That is why a private fork needs the
pair, set together:

```bash
gh variable set SLOPGUARD_REPO --body '<owner>/<fork>' --org <org>
gh secret   set SLOPGUARD_TOKEN --org <org> --visibility all
```

When the fetch fails the job stops and prints those commands rather than the bare
"repository not found" a private repository returns to an unauthorised caller. A
gate that cannot run must not report success (TEST-05).

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

```bash
claude plugin uninstall lenarise-slopguard
claude plugin marketplace remove lenarise-slopguard
```

Delete the `statusLine` entry in `~/.claude/settings.json`, the
`~/.claude/lenarise-slopguard/` directory, and the marked block in
`~/.claude/CLAUDE.md`. If `/slop-setup` left backups they are at
`settings.json.slopguard-backup` and `CLAUDE.md.slopguard-backup`.
