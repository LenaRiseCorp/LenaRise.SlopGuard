---
description: Change this session's mode (strict or explore)
argument-hint: "strict|explore"
allowed-tools: Bash(node:*)
---

Run:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/mode.mjs" $ARGUMENTS`

A mode change affects only this session; the persistent configuration does not
change. If the user wants a permanent relaxation, say so explicitly and use
`/slop-config`.

Also say what explore mode does *not* relax: irreversible commands (rm -rf,
DROP TABLE, force push), protected paths (.env, lockfiles, CI) and unverified
package installs are blocked in every mode.
