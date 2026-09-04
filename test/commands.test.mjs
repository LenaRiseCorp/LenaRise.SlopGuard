import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestCommand, isCommitCommand, parseInstall, packageName, verifyPackages, writeTargets } from '../lib/commands.mjs';

test('test commands are recognised', () => {
  for (const c of ['npm test', 'npm run test', 'pnpm test', 'yarn test', 'node --test test/',
                   'npx vitest', 'pytest -q', 'go test ./...', 'cargo test', 'bundle exec rspec',
                   'dotnet test', 'make test', './gradlew build test']) {
    assert.ok(isTestCommand(c), c);
  }
});

test('non-test commands are not recognised', () => {
  for (const c of ['npm run build', 'git status', 'ls test/', 'echo test', 'npm install jest']) {
    assert.equal(isTestCommand(c), false, c);
  }
});

test('a commit command is recognised', () => {
  assert.ok(isCommitCommand('git commit -m "x"'));
  assert.ok(isCommitCommand('cd repo && git commit --amend'));
  assert.equal(isCommitCommand('git status'), false);
});

test('a package name is stripped of version, extras and comparators', () => {
  assert.equal(packageName('left-pad'), 'left-pad');
  assert.equal(packageName('left-pad@1.2.3'), 'left-pad');
  assert.equal(packageName('@scope/pkg'), '@scope/pkg');
  assert.equal(packageName('@scope/pkg@2.0.0'), '@scope/pkg');
  assert.equal(packageName('requests>=2.0'), 'requests');
  assert.equal(packageName('uvicorn[standard]'), 'uvicorn');
  assert.equal(packageName('"django"'), 'django');
});

test('an install command is parsed', () => {
  assert.deepEqual(parseInstall('npm install left-pad'), { registry: 'npm', packages: ['left-pad'] });
  assert.deepEqual(parseInstall('npm i -D vitest @types/node'), { registry: 'npm', packages: ['vitest', '@types/node'] });
  assert.deepEqual(parseInstall('pip install requests flask'), { registry: 'pypi', packages: ['requests', 'flask'] });
  assert.deepEqual(parseInstall('yarn add react'), { registry: 'npm', packages: ['react'] });
  assert.deepEqual(parseInstall('cargo add serde'), { registry: 'crates', packages: ['serde'] });
});

test('only the install segment of a chained command is read', () => {
  assert.deepEqual(parseInstall('cd frontend && npm install axios'), { registry: 'npm', packages: ['axios'] });
});

test('a local path or URL is not a package', () => {
  assert.deepEqual(parseInstall('npm install ./local-pkg').packages, []);
  assert.deepEqual(parseInstall('npm install https://example.com/p.tgz').packages, []);
});

test('a non-install command returns null', () => {
  assert.equal(parseInstall('npm run build'), null);
  assert.equal(parseInstall('git push'), null);
});

test('go get is parsed without a registry', () => {
  assert.equal(parseInstall('go get github.com/x/y').registry, null);
});

// verifyPackages is exercised without the network: the check function is injected.

test('it passes when all of them exist', async () => {
  const r = await verifyPackages(['react'], 'npm', { check: async () => 'exists' });
  assert.deepEqual(r, { ok: true, missing: [], unknown: [] });
});

test('a non-existent package is blocked — a slopsquatting surface', async () => {
  const r = await verifyPackages(['halusine-paket'], 'npm', { check: async () => 'missing' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['halusine-paket']);
});

test('an unverifiable package is blocked too — fail-closed', async () => {
  const r = await verifyPackages(['react'], 'npm', { check: async () => 'unknown' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.unknown, ['react']);
});

test('a trusted package is never asked about in the registry', async () => {
  let asked = 0;
  const r = await verifyPackages(['react', 'vue'], 'npm', {
    trusted: ['React'],
    check: async () => { asked++; return 'exists'; },
  });
  assert.equal(asked, 1, 'yalnızca güvenilmeyen sorulur; eşleşme büyük/küçük harf duyarsız');
  assert.equal(r.ok, true);
});

test('an install command is not counted as a test run', () => {
  for (const c of ['npm install jest', 'pip install pytest', 'yarn add vitest', 'echo "go test"']) {
    assert.equal(isTestCommand(c), false, c);
  }
});

test('an environment prefix does not hide a test command', () => {
  assert.ok(isTestCommand('CI=1 npm test'));
  assert.ok(isTestCommand('cd api && NODE_ENV=test pytest -q'));
});

test('a commit mentioned in text is not a command', () => {
  assert.equal(isCommitCommand('echo "do not forget to git commit"'), false);
  assert.ok(isCommitCommand('git -C repo commit -m "x"'));
});

test('the git subcommand is not fooled by flags', () => {
  assert.equal(isCommitCommand('git log --grep commit'), false, 'log commit değildir');
  assert.equal(isCommitCommand('git -C repo status'), false);
  assert.ok(isCommitCommand('git -c user.name=x commit -m "y"'));
});

// verifyPackages is exercised without the network: the check function is injected.

test('redirection targets are found', () => {
  assert.deepEqual(writeTargets('cat > src/x.js'), ['src/x.js']);
  assert.deepEqual(writeTargets("cat > src/x.js <<'EOF'"), ['src/x.js']);
  assert.deepEqual(writeTargets('echo hi >> log.txt'), ['log.txt']);
  assert.deepEqual(writeTargets('node x.mjs > a.txt 2> b.txt'), ['a.txt', 'b.txt']);
  assert.deepEqual(writeTargets('python3 - > out.json'), ['out.json']);
});

test('descriptor redirections and /dev targets are not files', () => {
  assert.deepEqual(writeTargets('npm test 2>&1 | grep ok'), []);
  assert.deepEqual(writeTargets('ls > /dev/null'), []);
  assert.deepEqual(writeTargets('cmd >&2'), []);
});

test('tee, sed -i, cp, mv and touch targets', () => {
  assert.deepEqual(writeTargets('cat a | tee -a out.log'), ['out.log']);
  assert.deepEqual(writeTargets("sed -i '' -e 's/a/b/' config.json"), ['config.json']);
  assert.deepEqual(writeTargets('cp template.js dest.js'), ['dest.js']);
  assert.deepEqual(writeTargets('mv old.js new.js'), ['new.js']);
  assert.deepEqual(writeTargets('touch a.js b.js'), ['a.js', 'b.js']);
});

test('commands that write nothing produce no targets', () => {
  for (const c of ['git status --porcelain', 'npm run build', 'ls -la', 'sed -e s/a/b/ x.js']) {
    assert.deepEqual(writeTargets(c), [], c);
  }
});
