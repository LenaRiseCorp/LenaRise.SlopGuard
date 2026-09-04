import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanCommand, stripHeredocs } from '../lib/scan.mjs';

/**
 * A heredoc body is not scanned in command scope.
 *
 * This distinction surfaced while developing the tool: a commit message that
 * *referred* to a destructive command was mistaken for one and blocked. The body
 * is data; if it is written to a file, that file goes through the post-bash
 * content scan, so nothing is lost.
 */

const DESTRUCTIVE = ['rm', '-rf', '/veri'].join(' ');
const keys = (command) => scanCommand({ command }).map((f) => f.key);

test('a destructive phrase in a heredoc body is not a command', () => {
  const command = [
    "git commit -F - <<'EOF'",
    `Mesajda ${DESTRUCTIVE} geçiyor ama çalıştırılmıyor.`,
    'DROP TABLE users da öyle.',
    'EOF',
  ].join('\n');
  assert.deepEqual(keys(command), []);
});

test('a destructive command outside a heredoc is still caught', () => {
  const command = [DESTRUCTIVE, "cat > x <<'EOF'", 'zararsız', 'EOF'].join('\n');
  assert.ok(keys(command).includes('agent-05-rm-recursive-force'));
});

test('scanning resumes after the heredoc closes', () => {
  const command = ["cat > x <<'EOF'", `${DESTRUCTIVE}-icerde`, 'EOF', `${DESTRUCTIVE}-disarda`].join('\n');
  const found = scanCommand({ command });
  assert.equal(found.length, 1, 'only the one outside the body should be caught');
  assert.match(found[0].excerpt, /disarda/);
});

test('unquoted and dash-prefixed delimiters are recognised too', () => {
  for (const opener of ['<<EOF', "<<-'EOF'", '<<"EOF"']) {
    const command = ['cat > x ' + opener, DESTRUCTIVE, 'EOF'].join('\n');
    assert.deepEqual(keys(command), [], opener);
  }
});

test('a different delimiter name does not close the body early', () => {
  const command = ["cat > x <<'PY'", DESTRUCTIVE, 'EOF', DESTRUCTIVE, 'PY'].join('\n');
  assert.deepEqual(keys(command), [], 'the body must run to the PY line');
});

test('stripHeredocs preserves line count and numbering', () => {
  const command = ["cat > x <<'EOF'", 'bir', 'iki', 'EOF', DESTRUCTIVE].join('\n');
  assert.equal(stripHeredocs(command).split('\n').length, command.split('\n').length);
  assert.equal(scanCommand({ command })[0].line, 5, 'the line number must not shift');
});

test('commands without a heredoc are unaffected', () => {
  assert.deepEqual(stripHeredocs('npm test'), 'npm test');
  assert.ok(keys('git push --force origin main').includes('agent-05-git-force-push'));
});
