import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestCommand, isCommitCommand, parseInstall, packageName, verifyPackages } from '../lib/commands.mjs';

test('test komutları tanınır', () => {
  for (const c of ['npm test', 'npm run test', 'pnpm test', 'yarn test', 'node --test test/',
                   'npx vitest', 'pytest -q', 'go test ./...', 'cargo test', 'bundle exec rspec',
                   'dotnet test', 'make test', './gradlew build test']) {
    assert.ok(isTestCommand(c), c);
  }
});

test('test olmayan komutlar tanınmaz', () => {
  for (const c of ['npm run build', 'git status', 'ls test/', 'echo test', 'npm install jest']) {
    assert.equal(isTestCommand(c), false, c);
  }
});

test('commit komutu tanınır', () => {
  assert.ok(isCommitCommand('git commit -m "x"'));
  assert.ok(isCommitCommand('cd repo && git commit --amend'));
  assert.equal(isCommitCommand('git status'), false);
});

test('paket adı sürüm, extra ve karşılaştırıcıdan arındırılır', () => {
  assert.equal(packageName('left-pad'), 'left-pad');
  assert.equal(packageName('left-pad@1.2.3'), 'left-pad');
  assert.equal(packageName('@scope/pkg'), '@scope/pkg');
  assert.equal(packageName('@scope/pkg@2.0.0'), '@scope/pkg');
  assert.equal(packageName('requests>=2.0'), 'requests');
  assert.equal(packageName('uvicorn[standard]'), 'uvicorn');
  assert.equal(packageName('"django"'), 'django');
});

test('kurulum komutu ayrıştırılır', () => {
  assert.deepEqual(parseInstall('npm install left-pad'), { registry: 'npm', packages: ['left-pad'] });
  assert.deepEqual(parseInstall('npm i -D vitest @types/node'), { registry: 'npm', packages: ['vitest', '@types/node'] });
  assert.deepEqual(parseInstall('pip install requests flask'), { registry: 'pypi', packages: ['requests', 'flask'] });
  assert.deepEqual(parseInstall('yarn add react'), { registry: 'npm', packages: ['react'] });
  assert.deepEqual(parseInstall('cargo add serde'), { registry: 'crates', packages: ['serde'] });
});

test('zincirli komutta yalnızca kurulum segmenti okunur', () => {
  assert.deepEqual(parseInstall('cd frontend && npm install axios'), { registry: 'npm', packages: ['axios'] });
});

test('yerel yol ve URL paket sayılmaz', () => {
  assert.deepEqual(parseInstall('npm install ./local-pkg').packages, []);
  assert.deepEqual(parseInstall('npm install https://example.com/p.tgz').packages, []);
});

test('kurulum olmayan komut null döner', () => {
  assert.equal(parseInstall('npm run build'), null);
  assert.equal(parseInstall('git push'), null);
});

test('go get kayıt defteri olmadan ayrıştırılır', () => {
  assert.equal(parseInstall('go get github.com/x/y').registry, null);
});

// verifyPackages ağ olmadan sınanır: kontrol fonksiyonu enjekte edilir.

test('hepsi varsa geçer', async () => {
  const r = await verifyPackages(['react'], 'npm', { check: async () => 'exists' });
  assert.deepEqual(r, { ok: true, missing: [], unknown: [] });
});

test('var olmayan paket engellenir — slopsquatting yüzeyi', async () => {
  const r = await verifyPackages(['halusine-paket'], 'npm', { check: async () => 'missing' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['halusine-paket']);
});

test('doğrulanamayan paket de engellenir — fail-closed', async () => {
  const r = await verifyPackages(['react'], 'npm', { check: async () => 'unknown' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.unknown, ['react']);
});

test('güvenilen paket kayıt defterine hiç sorulmaz', async () => {
  let asked = 0;
  const r = await verifyPackages(['react', 'vue'], 'npm', {
    trusted: ['React'],
    check: async () => { asked++; return 'exists'; },
  });
  assert.equal(asked, 1, 'yalnızca güvenilmeyen sorulur; eşleşme büyük/küçük harf duyarsız');
  assert.equal(r.ok, true);
});

test('kurulum komutu test komutu sayılmaz — TST-05 tuzağı', () => {
  for (const c of ['npm install jest', 'pip install pytest', 'yarn add vitest', 'echo "go test"']) {
    assert.equal(isTestCommand(c), false, c);
  }
});

test('ortam değişkeni öneki test komutunu gizlemez', () => {
  assert.ok(isTestCommand('CI=1 npm test'));
  assert.ok(isTestCommand('cd api && NODE_ENV=test pytest -q'));
});

test('metin içindeki commit komut sayılmaz', () => {
  assert.equal(isCommitCommand('echo "git commit yapmayı unutma"'), false);
  assert.ok(isCommitCommand('git -C repo commit -m "x"'));
});

test('git alt komutu bayraklara aldanmaz', () => {
  assert.equal(isCommitCommand('git log --grep commit'), false, 'log commit değildir');
  assert.equal(isCommitCommand('git -C repo status'), false);
  assert.ok(isCommitCommand('git -c user.name=x commit -m "y"'));
});
