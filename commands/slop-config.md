---
description: Change SlopGuard settings (thresholds, disabled patterns, trusted packages)
argument-hint: "[what you want to change]"
allowed-tools: Bash(node:*), Read, Edit, Write
---

The user's request: $ARGUMENTS

Use the `slop-config` skill. It carries the full schema, the intent-to-action
mapping and the safety rules.

Show the current state before changing anything:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs"`
