---
description: Create the SlopGuard configuration and register the status line
allowed-tools: Bash(node:*)
---

Run:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"`

This command never overwrites an existing file; it is safe to re-run after every update.

If any line in the output starts with `!`, tell the user what they need to do.
If the user already has their own `statusLine` entry, do not overwrite it — show
the line they could replace it with and leave the decision to them.

Setup also installs the liveness rule into `~/.claude/CLAUDE.md`, between
markers, leaving the rest of the file untouched. That rule is the only layer that
runs when the plugin is dead. `--skip-claude-md` opts out.

When it finishes, remind the user that a restart is required and suggest `/slop-doctor`.
