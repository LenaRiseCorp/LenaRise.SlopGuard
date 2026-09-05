# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository
(Security -> Report a vulnerability), or write to info@lenarise.com.

Do not open a public issue for a vulnerability. Do not open a pull request that
fixes one before it has been reported — the diff is the disclosure.

Include what you can: the affected version, the steps, and what an attacker
gains. A proof of concept helps and is not required.

## What is in scope

This tool reads source files, parses shell commands and queries package
registries. The interesting failure modes are:

- A pattern or waiver that can be made to pass content it should block. The
  scanner is a gate; a bypass is a vulnerability, not a false negative.
- Command parsing that misreads a destructive command as harmless —
  `stripHeredocs`, `commandSegments` and `writeTargets` are the surfaces.
- The protected-path lock being escaped, so a write reaches `.git/`, a lockfile
  or an engine-generated file.
- Package verification returning "exists" for a name that does not exist in the
  registry. It fails closed by design; a way to make it fail open matters.
- Anything that causes the plugin to execute content taken from a scanned file.

## What is not in scope

- False positives. Those are bugs — open a normal issue.
- Findings that need write access to the machine already.
- The deliberate fixtures in `test/`. They contain fake keys and destructive
  strings on purpose, and are never scanned at runtime.

## Response

A report is acknowledged and triaged. If it is valid, a fix and a release
follow, and the report is credited unless you ask otherwise. No bounty is
offered.
