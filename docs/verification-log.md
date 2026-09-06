# Verification log

The results of actually exercising the verification items from PLAN.md. Measured,
not assumed. Every line rests on a command that can be run and an output that was
observed.

Environment: Claude Code 2.1.241 · Node v22.14.0 · darwin 25.6.0

---

## V5 — Do hooks run in bypass permissions mode?

**Result: yes.** The protection can stay in the hook layer; there is no need to
move it to the permission layer.

Setup: probe hooks were registered with `--settings` in a temporary directory,
`claude -p` was run headless, and the payload each hook received on stdin was
dumped to a file.

| Tested | Command | Observed |
|---|---|---|
| Do hooks fire | `claude -p … --permission-mode bypassPermissions` | SessionStart · UserPromptSubmit · PreToolUse · PostToolUse · Stop all fired |
| Can a hook see the mode | The PreToolUse payload | It carries `permission_mode: "bypassPermissions"` |
| Is `permissionDecision: "deny"` honoured | A deny returned for the Bash tool | The command **did not run**; PostToolUse never fired; the model reported "denied" |
| Same with `--dangerously-skip-permissions` | The same test with the real flag | Same result |
| Stop `decision: "block"` | The Stop hook blocked on the first call | The model could not stop, `num_turns` went 2→3; the second call carried `stop_hook_active: true` |

### The nuance the plan needed corrected

`PostToolUse` with `decision: "block"` does fire, and the reason **is delivered**
to the transcript as a `hook_blocking_error` attachment:

```json
{ "attachment": { "type": "hook_blocking_error", "hookName": "PostToolUse:Write",
    "hookEvent": "PostToolUse",
    "blockingError": { "blockingError": "…reason…", "command": "…" } } }
```

But two things are not true:

1. The write has **already happened** — PostToolUse runs after the tool, as the
   name says. The file is on disk; the block only tells the model to fix it.
2. The model **can ignore** the block. In the test the model received the block
   and still finished with "Done".

So the hard-stop guarantee lives only in **`PreToolUse deny`** and **`Stop block`**.
`post-edit` is a *request to fix*, not a lock. The guarantee is built like this:
`post-edit` writes what it found into the session ledger as an open violation, and
`stop-gate` refuses to end the turn while the ledger is not empty. The lock is in
the Stop layer.

## V13 — Does statusLine receive `session_id` on stdin?

**Result: yes.** The plan's fallback counting method is not needed.

In headless `-p` mode statusLine is **never called**; a real TTY was required for
the measurement (an interactive session under a pty via `expect`).

The full shape of the payload:

```json
{ "session_id": "…", "transcript_path": "…", "cwd": "…",
  "model": { "id": "…", "display_name": "…" },
  "workspace": { "current_dir": "…", "project_dir": "…", "added_dirs": [] },
  "version": "2.1.241", "output_style": { "name": "default" },
  "cost": { "total_cost_usd": 0, "total_duration_ms": 0, "total_api_duration_ms": 0,
            "total_lines_added": 0, "total_lines_removed": 0 },
  "context_window": { "total_input_tokens": 0, "total_output_tokens": 0,
                      "context_window_size": 200000, "current_usage": null,
                      "used_percentage": null, "remaining_percentage": null },
  "exceeds_200k_tokens": false, "fast_mode": false, "thinking": { "enabled": true },
  "rate_limits": { "five_hour": {…}, "seven_day": {…} } }
```

### Registration proof confirmed

In one live session the SessionStart hook, the UserPromptSubmit hook and the
status line all saw the **same** `session_id`. Comparing the `sessionId` in the
stamp against the bar's `session_id` is therefore a valid registration proof.

### Two gains that fed back into the plan

- The `+420/-80` counter does not have to be maintained by hand:
  `cost.total_lines_added` / `total_lines_removed` arrive ready-made.
- Context rot (AGENT-01) can be measured with `context_window.used_percentage`
  instead of a turn counter — the turn count is a proxy, the fill ratio is the
  direct measure.

### The measured limit

statusLine refreshes **on events, not continuously**: two calls in a ~30 second
session. A `broken` state becomes visible on the next event, not immediately. The
bar must not claim otherwise.

---

## Further measurements — hook schemas

Taken during build steps 2 and 3. All via `claude -p` with real hook registration.

### The PostToolUse `tool_response` shape differs per tool

For `Write` / `Edit`:

```json
{ "type": "create", "filePath": "…", "content": "…",
  "structuredPatch": [], "originalFile": null, "userModified": false }
```

`structuredPatch` carries the real diff: each hunk's `lines` array holds `+`/`-`
prefixed lines. The line counter feeds off this; if the shape arrives unexpected
the counter stays at zero rather than inventing a number.

For `Bash`:

```json
{ "stdout": "…", "stderr": "", "interrupted": false,
  "isImage": false, "noOutputExpected": false }
```

**There is no exit code.** Whether the command passed cannot be read from the response.

### PostToolUse does not fire when a Bash command fails

Three measurements showed this:

| Command | Matcher | Result |
|---|---|---|
| `echo ok` (exit 0) | `"Bash"` | Fired |
| `echo hello` (exit 0) | `""` | Fired |
| `false` (exit 1) | `"Bash"` | **Did not fire** |
| `ls /missing-directory` (exit ≠ 0) | `"Bash"` | **Did not fire** |

The `"Bash"` matcher works correctly; the early misses were caused by the
commands failing.

**Effect on the design.** Even without an exit code field, "the tests ran and
passed" is honestly knowable: PostToolUse firing is itself proof that the command
completed successfully. That is why `post-bash.mjs` exists — stamping the test
run *before* the command would count a test that never ran, or crashed, as
passing, which is precisely what we are here to prevent (TEST-05).

**The asymmetry must be preserved:** firing ⇒ success. Not firing ⇏ failure — the
command may have failed, the hook may not be registered, or the tool may have
been denied. The stop gate reads that uncertainty as "not verified", never as
"passed".

## V4 — Live trigger (end to end)

`${CLAUDE_PLUGIN_ROOT}` in `hooks/hooks.json` was resolved to a real path and
loaded through `--settings` — the same thing the plugin loader does, but without
touching the user's installation. One prompt in an empty git repository asked for
a test file first, then a source file containing an empty `catch`.

| Expected | Observed |
|---|---|
| The test file is refused | The file was never created; `pre-edit` denied |
| The empty catch is caught | `post-edit` blocked; the session recorded `blocked: 1` |
| The model fixes it | The file ended as `catch (e) { throw e; }`; the ledger emptied |
| The stop gate demands verification | It blocked three times, then passed at the ceiling (the AGENT-08 guard) |
| The escape routes reach the user | The model offered `/slop-mode explore` and `allowTestWrites` |
| The bar reads correctly | `SlopGuard live · strict · 1 blocked · turn 1/40 · +3/-0 · no tests` |

### An observed real constraint

In a repository with no tests, strict mode puts the agent in a tight spot: it
cannot write a test file (the TEST lock), it cannot run tests (no infrastructure),
so the stop gate blocks on the TEST-05 debt. There is no deadlock, because the
AGENT-08 ceiling opens the gate on the third attempt and the model relays the two
documented escape routes to the user. Still, this is a known friction point of
the design: in a new, test-less repository the first decision is whether to set
`allowTestWrites` or switch to explore mode.

## The package gate — against the real registries

The unit tests stub the network layer; this measurement used real lookups.

| Command | Result | Time |
|---|---|---|
| `npm install react` | allowed (no output) | ~0.26 s |
| `npm install sol-hayali-paket-xyz123-lenarise` | **deny** — "NOT FOUND in the npm registry" | — |
| `pip install requests` | allowed | — |
| `pip install bu-paket-kesinlikle-yok-lenarise-123` | **deny** — "NOT FOUND in the pypi registry" | — |

## A model refusing on its own does not test the gate

In a live session, asked to run `npm install <invented-name>` and
`git push --force`, the model **refused both on its own** and never made the tool
call; the hooks never came into play. The outcome was in the right direction, but
it is not evidence about the gate.

This is a concrete illustration of why the layered design is necessary: the
model's own judgement works most of the time, but protection that rests on it
also disappears silently on the day that judgement fails. Evidence for the gates
is therefore sought in pipe tests and direct measurement, not in the model
behaving politely.

---

## The protected-path lock — what it actually covered

Measured by driving `hooks/pre-bash.mjs` with real PreToolUse payloads, against a
path the lock protects.

| Command shape | Result |
|---|---|
| Shell redirection | refused |
| The same wrapped in `sh -c` | refused |
| `cp` onto a git hook | refused |
| A python one-liner opening it for writing | **passed** |
| `node script.mjs`, target not in the command | **passed** |

The python case is not the documented "target cannot be read from the command"
limit: the path is in plain sight. It simply is not a shell redirection, so the
redirection parser never saw it. `writeTargets` now reads `-c` / `-e` bodies for
python, node, ruby, perl and php.

The last row cannot be closed by parsing, and it is why the notice was added at
the git layer. Reading the source settled a second question: `protectedPathReason`
was called from `pre-edit` and `pre-bash` and nowhere else, so `scan-staged`,
`scan-diff` and `scan-cli` never looked. The repository layer exists to cover
agents that are not Claude Code, and this was the one rule it did not carry.

## Folder mode was reading everything git ignores

One repository, timed end to end:

| | files | |
|---|---|---|
| `walk` | 1139 | Electron build output, `.exe` installers, `.claude/worktrees` |
| `git ls-files` | 122 | |

`scanContent` over the tracked files totals **20 ms**, and no pattern took more
than a few milliseconds on any file — the engine was never the problem. The
command took **63 seconds**; after asking git instead of walking, **0.08 s**.

Ignored files are also a false-positive farm: minified bundles and vendored
copies are precisely what the patterns are not written for.

`git ls-files` alone was the wrong call and the existing tests caught it —
untracked files disappeared, and a file just created is the one most worth
scanning. It takes `--cached --others --exclude-standard`.

## A repository silently not scanned

While surveying 23 repositories one printed

```
LenaRise.SlopGuard: the file list could not be obtained — spawnSync git ENOBUFS
```

and was then skipped, with the run still exiting 0 — the tool reporting safety it
had never checked. `execFileSync` defaults to a 1 MB buffer, which
`git status --porcelain --untracked-files=all` passes in any repository with a
large untracked tree. After raising it, the same survey covered 33264 files
instead of 18364: roughly 15000 files had been going unread.

The same default broke the mutation runner, where a widened pattern produces tens
of megabytes of failures and the truncation took the `# fail` summary with it.

## Mutation: is every pattern actually watched?

Each pattern is disabled, then widened to match everything, and the suite is run
both times. A pattern nothing notices either way is a pattern no test is watching.

First real run: **one survivor.** `sec-05-sql-concat` could be deleted outright
with all 351 tests green — a block-severity SQL injection pattern with no
coverage at all.

Writing its missing test produced more than the coverage. The match is
case-insensitive, so the English words in interface strings such as a "Select a
file" label were read as SQL and blocked. A keyword alone is not a query; the
pattern now requires the statement shape.

The runner itself measured the wrong thing three times before it measured
anything real, all the same class of error:

- `git archive HEAD` tested the last commit rather than the working tree, so
  deleting a test and re-running still reported the pattern covered.
- `gen-docs` asserts that generated files match the registry, so it failed for
  any change to a regex and made every mutant look caught.
- Truncated output, as above.

It is not treated as working on a green result. Adding a pattern with no test of
its own must make it report SURVIVED, and it does. An unmeasurable mutant counts
against coverage rather than passing quietly.

## The false-positive rate, measured

23 repositories, 33264 files. Every block-severity finding was read rather than
counted.

| Pattern | Findings | Verdict |
|---|---|---|
| `code-01-versioned-filename` | 45 | all assets or documents — image renders, a `brand-new.md` command file |
| `sec-03-aws-key` | 3 | all three were AWS's own published documentation key |
| `sec-03-inline-secret` in tests | 100 | invented credentials in `.test.mjs` fixtures |
| `code-05-comment-only-catch` | 489 | true by the rule, and the largest block source by far |
| `proc-08-effort-estimate` | 5 | true |
| `code-05-except-pass` | 1 | true |

The first three were fixed. The fourth was moved to `warn`: the rule did not
change, but refusing 489 commits would have got the tool switched off, and a rule
nobody runs protects nobody.

One was knowingly left: `test-backup.sh` reads as a backup copy. Telling it from
`config-backup.js` is not something a path pattern can do, and the waiver exists
for exactly that.

After the three new SEC patterns, the same 33264 files produced one further
finding: a test comment quoting `rejectUnauthorized` while explaining why they do
not use it. Mention rather than use, one in 33264, and already a warning under the
test carve-out — not worth over-fitting the pattern for.

## Commit signing without gpg

`gpg` is not installed on this machine. Git 2.50 signs with SSH
(`gpg.format = ssh`), using a key that already exists, and GitHub verifies those
signatures once the key is registered as a **signing** key — a separate list from
authentication keys. Configured; the registration is an account action.
