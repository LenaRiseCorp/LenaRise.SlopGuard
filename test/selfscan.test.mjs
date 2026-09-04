import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The binding-commitment gate: the plugin runs its own source through its own
 * scanner. If this turns red then either the pattern is wrong or the code is —
 * one of the two gets fixed, and no waiver is written.
 */
test('the self-scan stays clean', () => {
  let out;
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/selfscan.mjs')], { encoding: 'utf8' });
  } catch (error) {
    assert.fail(`kendi kaynağımızda bulgu var:\n${error.stdout ?? error.message}`);
  }
  assert.match(out, /clean/);
});
