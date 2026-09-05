---
description: Install agent-agnostic slop protection into this repository (AGENTS.md, git hook, CI)
allowed-tools: Bash(node:*)
---

Run:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/repo-init.mjs"`

Briefly explain what each installed file does:

- `AGENTS.md` — the shared rule file read by Cursor, Codex, Copilot and Claude Code
- `.slopignore` — paths that are not scanned in this repository
- `.git/hooks/pre-commit` — runs only on this machine, and is not cloned
- `.github/workflows/slop-gate.yml` — **only with `--with-ci`**; covers people who are not running the hooks

`AGENTS.md` and `.slopignore` are written once and then belong to the user. The
hook and the workflow are refreshed on every run when they are ours, and left
alone when they are not — say which happened.

CI is not installed unless the user asks for it with `--with-ci`. Do not add it
on your own initiative: a workflow nobody chose spends their CI minutes. Say it
is available and let them decide.

Nothing in the default path needs a network, an account or a paid service. When
CI is opted into, it needs no secret either — the scanner repository is public.

A token is needed in exactly one case: the user points `SLOPGUARD_REPO` at a
private fork of the scanner. Then that fork also needs a `SLOPGUARD_TOKEN` with
`Contents: read`. Both are set together — a token alone does not change which
repository the workflow checks out.
