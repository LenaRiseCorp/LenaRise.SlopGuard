# My own rules

This file is injected into the model's context at the start of every session.
Keep it short: a long rule set does not get read, and excess context is itself a
category in our taxonomy (AGENT-02).

A plugin update never touches this file.

Examples — change them to suit you, delete what does not apply:

- Dates are ISO 8601 everywhere.
- Ask before adding a new dependency.
- Comments in English, variable names in English.
- No database schema change without a migration file.
- This project uses `logger`, not `console.log`.
