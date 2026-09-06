# Working in the LenaRise.SlopGuard repository

GENERATED FILE. Do not edit; the source is `scripts/gen-docs.mjs`.

This repository is a slop protection tool. A tool against slop cannot be written
by breaking its own rules — the items below are binding, not aspirational.

## Binding commitments

| Commitment | Category |
|---|---|
| Zero runtime dependencies — Node stdlib only | SEC-02 |
| Pattern definitions in a single source (`lib/patterns.mjs`); hooks, skills, semgrep and the README derive from it | CODE-01 |
| Documentation generated from code (`npm run docs`), never synced by hand | DOC-07 |
| No empty `catch` — errors go to `stderr`, never swallowed | CODE-05 |
| Hook tests run with real stdin payloads; a test is never weakened to pass | TEST-01 · TEST-02 |
| The command output is shown before anything is called working | TEST-05 |
| No emoji in headings, no buzzwords | DOC-04 · DOC-01 |
| No time estimates; scope is expressed as files, steps and unknowns | PROC-08 |
| A commit at every step; no single enormous commit | AGENT-06 · PROC-02 |
| Self-scan: the source passes through its own scanner | all |

The last item is the strictest: if our own scanner rejects our own code then
either the pattern is wrong or the code is. One of them gets fixed and **no
waiver is written**. The rule cuts both ways — if it should trip and does not,
the pattern gets widened.

## Before making a change

```bash
npm test          # 36 patterns, pipe tests included
npm run selfscan  # our source through our own scanner
npm run docs      # refresh the generated documentation
npm run mutate    # is every pattern actually watched by a test?
```

`npm run docs -- --check` exits 1 when a generated file is stale; that is the CI gate.

`npm run mutate` is separate and slower. It disables each pattern, then widens
it to match everything, running the suite both times. A pattern nothing notices
either way is a pattern no test is watching — it found one, a block-severity SQL
injection pattern that could be deleted outright with the suite still green. Run
it when adding or changing a pattern, not before every commit.

## The measurements the architecture rests on

The design decisions here are based on measurement, not assumption. All of them
are in `docs/verification-log.md` in a form that can be re-run:

- Hooks work in bypass permissions mode; a `PreToolUse` deny really stops the
  tool, and a `Stop` block prevents the turn from ending.
- A `PostToolUse` block reaches the model but does not stop it. That is why the
  hard guarantee lives in `stop-gate`.
- `PostToolUse` does not fire at all when a Bash command fails, and
  `tool_response` carries no exit code. "The tests passed" is known from the
  firing itself.
- `statusLine` receives `session_id` on stdin, and it is the same one the hooks see.
- `process.exit()` does not wait for a pending stdout write; output beyond the
  pipe buffer is truncated. Hooks use `exitWhenFlushed()`.
- `commandSegments` must split on newlines: a `git commit` on the second line of
  a multi-line block was invisible, so commits were never recorded.

If you are about to rely on a new platform behaviour, measure it first and write
what you measured into `docs/verification-log.md`.

## Language

Identifiers, messages, comments and documentation are English, so that any agent
reads the same directives and the plugin works anywhere. The two prose patterns
(DOC-01, PROC-08) deliberately keep non-English alternatives: they match written
text, and text comes in many languages.

## Directory map

| Path | Contents |
|---|---|
| `lib/patterns.mjs` | Pattern registry — the single source |
| `lib/scan.mjs` · `lib/ignore.mjs` | Matching engine and waiver policy |
| `lib/config.mjs` · `lib/session.mjs` · `lib/coach.mjs` | Configuration, session state, thresholds |
| `lib/hook.mjs` · `lib/report.mjs` · `lib/heartbeat.mjs` | Hook runner, output contract, liveness |
| `lib/commands.mjs` · `lib/project.mjs` | Shell command understanding, engine detection |
| `hooks/` | Eight hooks plus `hooks.json` |
| `bin/statusline.mjs` | Status line; works even when the plugin is dead |
| `scripts/` | Command scripts, scanner CLIs, the documentation generator |
| `test/` | `node --test`; pipe tests run in a real process |
