import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanCommand, stripHeredocs } from '../lib/scan.mjs';
import { parseInstall, writeTargets } from '../lib/commands.mjs';

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

/**
 * The same distinction, in the package gate.
 *
 * parseInstall used to read the raw command and split it by itself, without the
 * heredoc stripping and the newline split commandSegments already had. Writing a
 * file whose sample text contained an install line was therefore denied as an
 * unverified install, and the reported package names were fragments of the
 * surrounding code. A false positive that denies a PreToolUse call blocks real
 * work, which is the most expensive kind this project can produce.
 */

const INSTALL = ['npm', 'install', 'sol-pad'].join(' ');

test('an install line inside a heredoc body is not an install', () => {
  const command = ["cat > note.md <<'EOF'", `Docs say to run ${INSTALL} first.`, 'EOF'].join('\n');
  assert.equal(parseInstall(command), null);
});

test('the surrounding code is never read as a package name', () => {
  const command = [
    "python3 - <<'PY'",
    `s = "postBash('${INSTALL}', 'case')"`,
    "open(p, 'w').write(s)",
    'PY',
  ].join('\n');
  assert.equal(parseInstall(command), null, 'the body writes a file; it installs nothing');
});

test('an install on a later line of a multi-line block is still found', () => {
  const parsed = parseInstall(['cd api', INSTALL].join('\n'));
  assert.deepEqual(parsed.packages, ['sol-pad'], 'a newline separates commands');
});

test('a real install alongside a heredoc is still found', () => {
  const command = ["cat > x <<'EOF'", 'harmless', 'EOF', INSTALL].join('\n');
  assert.deepEqual(parseInstall(command).packages, ['sol-pad']);
});

test('the chained form keeps returning only its own segment', () => {
  const parsed = parseInstall(`cd api && ${INSTALL}`);
  assert.deepEqual(parsed.packages, ['sol-pad'], 'cd and api are not packages');
});

// writeTargets read the whole command too, and had the same gap.

test('a redirection shown as an example is not a write target', () => {
  const command = ["cat > note.md <<'EOF'", 'Example: printf x > .env', 'EOF'].join('\n');
  assert.deepEqual(writeTargets(command), ['note.md'],
    '.env is quoted in the document, not written by the command');
});

test('the redirection that opens the heredoc is still a write target', () => {
  const command = ["cat > src/index.js <<'EOF'", 'const a = 1;', 'EOF'].join('\n');
  assert.deepEqual(writeTargets(command), ['src/index.js']);
});

test('a redirection after the heredoc closes is still a write target', () => {
  const command = ["cat > a.txt <<'EOF'", 'body', 'EOF', 'printf x > b.txt'].join('\n');
  assert.deepEqual(writeTargets(command).sort(), ['a.txt', 'b.txt']);
});
