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
<!-- /GENERATED: pattern-catalogue -->

## After a change

1. Validate the JSON with `jq -e . <file>`.
2. Run `/slop-doctor` — is the pattern count what you expected?
3. Summarise for the user what the change does and **what it no longer catches**.
