---
description: Scan files or changes for slop patterns
argument-hint: "[path...]"
allowed-tools: Bash(node:*)
---

Run:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" $ARGUMENTS`

If there are findings, show each one to the user and offer to fix it.
Do **not** propose a waiver on your own initiative: try the fix first. A waiver
is written only when the pattern really is a false positive and the user agrees,
and it must carry a reason.

The scanner cannot fully catch guard-and-go (CODE-04) or repository-wide
duplication (CODE-01). If the user wants a thorough review, check those by hand too.
