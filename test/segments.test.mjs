import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandSegments, isCommitCommand, isTestCommand, writeTargets } from '../lib/commands.mjs';

/**
 * Multi-line Bash blocks.
 *
 * The first version split only on `&&`, `||`, `;` and `|`. A `git commit` or
 * `npm test` on the second line of a multi-line block was never recognised;
 * commits were not recorded in the session ledger, the verification stamp was
 * never set, and the stop gate counted finished work as unfinished. Found while
 * developing the tool, when the gate stopped its own author.
 */

const COK_SATIR = ['git add -A', 'git commit -q -m "iş"', 'git push -q origin main'].join('\n');

test('a newline is a segment separator', () => {
  assert.equal(commandSegments(COK_SATIR).length, 3);
  assert.deepEqual(commandSegments('npm run build\nnpm test'), ['npm run build', 'npm test']);
});

test('a commit that is not on the first line is recognised', () => {
  assert.ok(isCommitCommand(COK_SATIR));
  assert.ok(isCommitCommand('npm test\ngit commit -m "yeşil"'));
});

test('a test command that is not on the first line is recognised', () => {
  assert.ok(isTestCommand('npm run docs > /dev/null\nnpm test'));
  assert.ok(isTestCommand('cd api\npytest -q'));
});

test('a heredoc body produces no segment', () => {
  const commit = ['git add -A', "git commit -F - <<'MSGEOF'", 'a git commit example inside the message',
                  'the words npm test appear here too', 'MSGEOF'].join('\n');
  assert.ok(isCommitCommand(commit), 'the real commit must be recognised');
  assert.equal(isTestCommand(commit), false, 'text in the message body must not count as a test');
});

test('a command that only appears in a body does not trigger', () => {
  const yaz = ['cat > not.md <<EOF', 'do not forget to git commit', 'run npm test', 'EOF'].join('\n');
  assert.equal(isCommitCommand(yaz), false);
  assert.equal(isTestCommand(yaz), false);
});

test('write targets are found in a multi-line block', () => {
  const blok = ['mkdir -p src', 'cat > src/a.js <<EOF', 'code', 'EOF', 'cp src/a.js src/b.js'].join('\n');
  const hedefler = writeTargets(blok);
  assert.ok(hedefler.includes('src/a.js'), JSON.stringify(hedefler));
  assert.ok(hedefler.includes('src/b.js'), JSON.stringify(hedefler));
});

test('an environment prefix is stripped on every line', () => {
  assert.ok(isTestCommand('echo hazir\nCI=1 NODE_ENV=test npm test'));
});

test('blank lines produce no segments', () => {
  assert.deepEqual(commandSegments('npm test\n\n\ngit status'), ['npm test', 'git status']);
});
