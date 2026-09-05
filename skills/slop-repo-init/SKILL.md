---
name: slop-repo-init
description: Use this to install agent-agnostic slop protection into a repository — when the user says "protect this repo", "set it up for the team", "add it to CI", "create AGENTS.md", "install a pre-commit hook", or wants the protection to cover agents other than Claude Code.
---

# Repository layer setup

## Why this is a separate layer

Claude Code hooks only cover Claude Code. If Cursor, Codex, Copilot or a human is
also working in the same repository, hooks do not see them. A git hook and CI do.

## Run

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/repo-init.mjs"
```

`AGENTS.md` and `.slopignore` are written once and never touched again. The
pre-commit hook and the CI workflow are ours to keep current: an older copy of
ours is refreshed, and a file that is not ours is reported as left alone — tell
the user and offer to merge.

## What gets installed

| File | Covers | Note |
|---|---|---|
| `AGENTS.md` | every agent | Generated from the rule set; hand edits drift from the source |
| `.slopignore` | this repository | Paths that are not scanned |
| `.git/hooks/pre-commit` | this machine only | Not cloned; not enough for a team |
| `.github/workflows/slop-gate.yml` | the whole team | **This is the real gate** |

## After installation

1. The scanner repository is public: the CI job works with no secret and no
   setup. Do not recommend creating a token — a privileged token that nothing
   needs is a cost, not a precaution.

   The single exception is a private fork of the scanner. That needs **both**
   `SLOPGUARD_REPO` (a variable naming the fork) and `SLOPGUARD_TOKEN` (a token
   with `Contents: read` on it); a token on its own authenticates the checkout
   but does not change which repository is checked out. Give the user the
   commands; never create or handle the token yourself.
2. Point out that the git hook is not cloned. `core.hooksPath` with an in-repo
   directory can make it work for everyone; offer that.
3. Review the `.slopignore` defaults — entries such as `vendor` and `dist` may not
   suit the project. For a game project, uncomment the engine build directories.
4. Run the first scan and show how many findings the repository currently has:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs"`.
   In an existing repository that number can be high; do not insist on fixing
   everything at once — agree on priorities with the user.
