---
name: slop-check
description: Use this to review code or documentation for slop patterns — when the user says "check this", "is this code clean", "look before I merge", "review this", or wants a change verified before sending it.
---

# Slop scan on demand

## Run

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" [path...]
```

With no path, the changed files in the working tree are scanned. A git repository
is not required — in a plain folder the filesystem is walked, so a parent
directory holding several projects works too.

## How to handle findings

1. **Fix first.** Every finding's `Fix:` line says what to do.
2. **Do not propose a waiver on your own initiative.** A waiver is written only
   when the pattern really is a false positive and the user agrees:
   `// slop-guard-ignore CODE-05: third-party SDK throws here`
   The id and the reason are both required; without either it silences nothing.
3. **Do not overstate the result.** Read the output before saying "clean".

## What the scan cannot catch

Check these by hand; do not act as though the tool covers them:

- **CODE-04 guard-and-go** — code that should be deleted being wrapped in a
  condition other than `if (false)` is not reliably caught by regex.
- **CODE-01 repository-wide duplication** — the scanner looks at one file; the
  same logic repeated across three files only shows up through jscpd in CI.
- **LOGIC — business logic** — hallucinated APIs, wrong business rules, silent
  scope drift. These have no mechanical counterpart and cannot be known without
  reading the code.
- **TEST-06 happy path** — a test existing is not enough; check whether it covers
  the error path.

## If a thorough review is requested

List the scanner findings, then assess the four headings above by hand and say
explicitly which ones you looked at. Do not call something clean that you did not examine.
