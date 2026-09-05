## What changes, and why

<!-- What the reader cannot get from the diff: the reason. -->

## Gates

Run these and paste the output. "It should pass" is not an answer (TEST-05).

- [ ] `npm test`
- [ ] `npm run selfscan` — the source through its own scanner
- [ ] `npm run docs -- --check` — generated files are current

```
<!-- output here -->
```

## If this adds or changes a pattern

- [ ] The taxonomy entry exists in `lib/patterns.mjs`
- [ ] A test asserts it matches what it should
- [ ] A test asserts it stays silent on what it should not — a pattern without a
      false-positive test will be reverted the first time it misfires
- [ ] `npm run docs` was run; the README and semgrep template moved with it

## Checks

- [ ] No new runtime dependency (Node stdlib only)
- [ ] I have signed the CLA
