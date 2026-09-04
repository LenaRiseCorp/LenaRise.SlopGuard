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

Tell the user to replace the `OWNER` placeholder in the CI template with the real
GitHub account. Do not guess it — ask.
