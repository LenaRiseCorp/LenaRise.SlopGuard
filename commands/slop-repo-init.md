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
- `.github/workflows/slop-gate.yml` — the real gate; it covers the whole team

`AGENTS.md` and `.slopignore` are written once and then belong to the user. The
hook and the workflow are refreshed on every run when they are ours, and left
alone when they are not — say which happened.

While the scanner repository is private the CI job needs a `SLOPGUARD_TOKEN`
secret with `Contents: read` on it. Until that secret exists the Pattern scan job
fails on purpose; the failure prints the `gh secret set` command to run. Pass on
that command rather than creating a token yourself.
