import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInsideRepo } from '../lib/hook.mjs';

/**
 * Which writes count as uncommitted work.
 *
 * PROC-02 and AGENT-06 both mean "there is no point left to roll back to". That
 * is a statement about version control, so a path outside the repository cannot
 * contribute to it: the warning would be unanswerable.
 */

test('isInsideRepo tells a repository file from anything else', () => {
  assert.equal(isInsideRepo('/work/proj/src/a.js', '/work/proj'), true);
  assert.equal(isInsideRepo('/tmp/probe.mjs', '/work/proj'), false, 'outside the tree');
  assert.equal(isInsideRepo('/work/proj', '/work/proj'), false, 'the root itself is not a file in it');
  assert.equal(isInsideRepo('/work/project-other/a.js', '/work/proj'), false,
    'a sibling whose name starts the same must not be swallowed by a prefix test');
  assert.equal(isInsideRepo('/work/proj/a.js', null), false, 'with no repository nothing is committable');
  assert.equal(isInsideRepo(null, '/work/proj'), false);
});
