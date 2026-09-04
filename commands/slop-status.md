---
description: Show this session's SlopGuard measurements
allowed-tools: Bash(node:*)
---

Run this and show the output to the user as it is:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs"`

Do not overstate the numbers. Before saying "everything is fine", read the open
violations and verification lines; if those are populated, it is not fine.
