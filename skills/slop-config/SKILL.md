---
name: slop-config
description: Use this to change LenaRise.SlopGuard settings — when the user says a warning keeps appearing, that it blocks too much, that a threshold is too tight, that a package is being refused, that they cannot write test files, or when they want to add a pattern, write their own rule, or turn protection off for one repository. Also for phrases like "I am prototyping", "this pattern is noisy", "catch this too".
---

# LenaRise.SlopGuard configuration

## Know this first

**Never edit the plugin directory.** An update deletes everything in it. All
edits go into `~/.claude/lenarise-slopguard/`, which an update never touches.

| File | Purpose |
|---|---|
| `config.json` | mode, thresholds, disabled patterns, trusted packages |
| `patterns.local.json` | patterns you add |
| `rules.local.md` | free-text rules, injected at the start of every session |
| `<repo>/.slopignore` | per-project path exemptions |

The session mode (`/slop-mode`) writes to no file — it affects that session only.

## Intent to action

| What the user says | What it means | What you do |
|---|---|---|
| "this warning keeps coming up" | the pattern is noisy | add the pattern id to `disabled` in `config.json` |
| "it blocks too much" | strict mode feels heavy | first show which ids are firing with `/slop-status`, then disable them specifically. Do not loosen everything |
| "I am prototyping" | a temporary relaxation | `/slop-mode explore` — leave the persistent config alone |
| "it should let me write test files" | the TEST lock is in the way | `allowTestWrites: true` in `config.json`. Ask for the reason and note it |
| "it keeps blocking this package" | the package gate tripped | verify the package really exists, then add it to `trustedPackages` |
| "the diff limit is too small" | the threshold is tight | `thresholds.maxDiffLines` in `config.json` |
| "it should catch this too" | a new pattern | add it to `patterns.local.json`, and **test it first** |
| "add my own rule" | a personal rule | add it to `rules.local.md`, keep it short |
| "turn it off for this repo" | a project exemption | `.slopignore` at the repository root |
| "where do I stand" | visibility | `/slop-status` |
| "the bar is missing or wrong" | a visibility setting | `ui.statusLine` in `config.json`; if it is a registration problem, `/slop-doctor` |

## Safety rules

These are rules, not preferences:

1. **When disabling a pattern, say what is lost.** For example: "disabling SEC-03
   means API keys committed to source will no longer be caught."
2. **Never propose disabling the SEC category on your own initiative.** Do it if
   the user explicitly asks, and write down the risk.
3. **Back up before editing**, then validate the JSON:
   `cp config.json config.json.backup && jq -e . config.json`
4. **Make the narrowest change that works.** Do not disable a category when one
   pattern is enough; do not change the mode when a category is enough.
5. **Say whether a restart is needed.** `config.json`, `patterns.local.json` and
   `.slopignore` take effect immediately. Changes to `hooks.json` or the manifest
   require Claude Code to be restarted.
6. **Do not propose a waiver on your own initiative.** Try the fix first. An
   inline waiver is written only when the pattern really is a false positive and
   the user agrees — the id and the reason are both required, and without either
   it silences nothing.

## config.json schema

<!-- GENERATED: config-schema -->
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
<!-- /GENERATED: config-schema -->

## patterns.local.json schema

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

| Field | Required | Note |
|---|---|---|
| `key` | yes | unique; this is what `disabled` uses to switch it off |
| `id` | yes | taxonomy id; this is what appears in the message |
| `scope` | yes | `code` · `prose` · `path` · `command` |
| `match` | yes | a regex as a JSON string — backslashes are escaped **twice** |
| `severity` | no | `block` (default) or `warn` |
| `flags` | no | defaults to `g` |
| `detects` / `fix` | no | strongly recommended; they appear in the message |

The most common mistake when writing `match` is the escaping layer. After writing
it, **always** try it:

```bash
node -e 'import("/PATH/lib/config.mjs").then(m=>{const r=m.loadConfig({});console.log(r.problems,r.config.localPatterns.map(p=>[p.key,String(p.match)]))})'
```

If the problem list is not empty the pattern did not load. Do not leave it at that.

## Pattern catalogue

<!-- GENERATED: pattern-catalogue -->
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
<!-- /GENERATED: pattern-catalogue -->

## After a change

1. Validate the JSON with `jq -e . <file>`.
2. Run `/slop-doctor` — is the pattern count what you expected?
3. Summarise for the user what the change does and **what it no longer catches**.
