# Contributing

GENERATED FILE. Do not edit; the source is `scripts/gen-docs.mjs`.

## Before the first pull request: the CLA

A first pull request cannot be merged until the Contributor License Agreement is
signed. A bot comments on the pull request with a link; agreeing there records
the signature against the GitHub account, once. The text is in
[CLA.md](CLA.md), and the reason it exists is in its opening paragraph.

## The three gates

Run these and paste the output into the pull request. A claim that they pass is
not the same as their output, and this project does not accept the first in
place of the second (TEST-05).

```bash
npm test                  # every pattern, hook pipe tests included
npm run selfscan          # this source through its own scanner
npm run docs -- --check   # exits 1 when a generated file is stale
```

Adding or changing a pattern? Run `npm run mutate` as well. It disables your
pattern and then widens it to match everything, running the suite each time. If
neither breaks a test, the pattern has no test watching it — and that is how a
block-severity SQL injection pattern sat in the registry with no coverage at all
until the check was written.

If `npm run docs -- --check` fails, run `npm run docs` and commit what changes.
Editing a generated file by hand is reverted on the next run.

## Adding or changing a pattern

Patterns live in one place, `lib/patterns.mjs`. Hooks, the semgrep template,
the skills and the README are all derived from it, so a pattern is added there
and nowhere else.

A pattern is accepted with three things, not one:

1. The taxonomy entry — id, category, scope, severity, and the fix line the user
   will read.
2. A test that it matches what it is meant to match.
3. A test that it stays **silent** on the code nearby that looks similar and is
   correct.

The third is not optional. A pattern without a false-positive test is reverted
the first time it misfires, and it will misfire — regex scanning of real code
always does. The proposal template asks for the negative example for this reason.

Then run `npm run docs`, which moves the README, the semgrep rules and the
skill text with it.

## What gets rejected

- A new runtime dependency. Node standard library only; this is not negotiable
  and it is the reason the scanner can be read in one sitting.
- A test weakened, skipped or deleted to make a change pass.
- A pattern with no negative test.
- A generated file edited by hand.
- A change that makes the scanner's own source fail `npm run selfscan`. If our
  scanner rejects our code, either the pattern is wrong or the code is — one of
  them gets fixed, and no waiver is written.

## Review

Every path has a code owner, and a merge needs that owner's approval. Pushing
straight to `main` is blocked for everyone, including maintainers.

Small pull requests are read; a diff over 400 lines is not (PROC-02). Splitting
a change into steps is worth more than sending it complete.

## The commitments this project holds itself to

A tool against slop cannot be written by breaking its own rules. These are
binding here, not aspirational:

| Commitment | Category |
|---|---|
| Zero runtime dependencies — Node stdlib only | SEC-02 |
| Pattern definitions in a single source (`lib/patterns.mjs`); hooks, skills, semgrep and the README derive from it | CODE-01 |
| Documentation generated from code (`npm run docs`), never synced by hand | DOC-07 |
| No empty `catch` — errors go to `stderr`, never swallowed | CODE-05 |
| Hook tests run with real stdin payloads; a test is never weakened to pass | TEST-01 · TEST-02 |
| The command output is shown before anything is called working | TEST-05 |
| No emoji in headings, no buzzwords | DOC-04 · DOC-01 |
| No time estimates; scope is expressed as files, steps and unknowns | PROC-08 |
| A commit at every step; no single enormous commit | AGENT-06 · PROC-02 |
| Self-scan: the source passes through its own scanner | all |

## Reporting rather than fixing

- A false positive is a normal issue, not a security report.
- A way to make the scanner pass content it should block **is** a security
  report — see [SECURITY.md](SECURITY.md), and do not open a public issue.
