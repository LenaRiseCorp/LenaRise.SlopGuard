---
description: Diagnose the SlopGuard installation and offer fixes
allowed-tools: Bash(node:*)
---

Run:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"`

Show the output to the user. If there is any ❌ line:

1. Apply the fix on its `→` line, or offer to apply it.
2. If the fix changes a file on the user's machine, ask first.
3. Do not wave any ❌ line away as "probably unimportant" — a diagnostic tool
   that rounds uncertainty towards optimism is worse than no diagnosis.

If the heartbeat is missing or stale, the most likely cause is that Claude Code
was not restarted after installation. Tell the user; you cannot restart it yourself.
