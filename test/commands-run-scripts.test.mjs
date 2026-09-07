import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isTestCommand } from '../lib/commands.mjs';

const dir = mkdtempSync(join(tmpdir(), 'slopguard-scripts-'));
after(() => rmSync(dir, { recursive: true, force: true }));

const pkg = (scripts) => writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts }));

// `npm run verify` is opaque from the outside: the name says nothing about what
// runs. Recognising the name would be a guess that goes wrong in the dangerous
// direction — a repository whose `verify` only lints would get a green stamp for
// tests that never ran. Reading the script body is evidence instead of a guess.

test('a run script that runs tests counts as a test run', () => {
  pkg({ verify: 'npm test && npm run selfscan' });
  assert.ok(isTestCommand('npm run verify', { cwd: dir }));
});

test('a run script that does not run tests does not', () => {
  pkg({ verify: 'eslint . && npm run docs -- --check' });
  assert.equal(isTestCommand('npm run verify', { cwd: dir }), false,
    'the name is identical; only the body differs');
});

test('resolution follows a script that calls another script', () => {
  pkg({ ci: 'npm run verify', verify: 'vitest run' });
  assert.ok(isTestCommand('npm run ci', { cwd: dir }));
});

test('a script that calls itself terminates', () => {
  pkg({ loop: 'npm run loop' });
  assert.equal(isTestCommand('npm run loop', { cwd: dir }), false);
});

test('without a cwd nothing is resolved and the old answer stands', () => {
  pkg({ verify: 'npm test' });
  assert.equal(isTestCommand('npm run verify'), false,
    'no directory means no evidence, and no evidence means no stamp');
});

test('a missing package.json is not an error', () => {
  const empty = mkdtempSync(join(tmpdir(), 'slopguard-nopkg-'));
  assert.equal(isTestCommand('npm run verify', { cwd: empty }), false);
  rmSync(empty, { recursive: true, force: true });
});

test('malformed package.json does not crash the caller', () => {
  const broken = mkdtempSync(join(tmpdir(), 'slopguard-broken-'));
  writeFileSync(join(broken, 'package.json'), '{ not json');
  assert.equal(isTestCommand('npm run verify', { cwd: broken }), false);
  rmSync(broken, { recursive: true, force: true });
});

test('the direct patterns still answer without a cwd', () => {
  assert.ok(isTestCommand('npm test'));
  assert.equal(isTestCommand('npm run build'), false);
});

test('pnpm, yarn and bun resolve the same way', () => {
  pkg({ verify: 'node --test test/' });
  for (const runner of ['pnpm run verify', 'yarn run verify', 'bun run verify']) {
    assert.ok(isTestCommand(runner, { cwd: dir }), runner);
  }
});
