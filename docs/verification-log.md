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
