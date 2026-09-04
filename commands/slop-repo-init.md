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

If the scanner repository is private, tell the user the CI job needs a read token;
the workflow has a commented line showing where it goes.
