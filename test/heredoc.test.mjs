import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanCommand, stripHeredocs } from '../lib/scan.mjs';

/**
 * Heredoc gövdesi komut kapsamında taranmaz.
 *
 * Bu ayrım aracın kendi geliştirilmesinde ortaya çıktı: yıkıcı bir komuttan
 * *söz eden* commit mesajı, yıkıcı komut sanılıp engellendi. Gövde veridir;
 * dosyaya yazılıyorsa post-bash içerik taramasından geçer, yani kapsam kaybı yok.
 */

const DESTRUCTIVE = ['rm', '-rf', '/veri'].join(' ');
const keys = (command) => scanCommand({ command }).map((f) => f.key);

test('heredoc gövdesindeki yıkıcı ifade komut sayılmaz', () => {
  const command = [
    "git commit -F - <<'EOF'",
    `Mesajda ${DESTRUCTIVE} geçiyor ama çalıştırılmıyor.`,
    'DROP TABLE users da öyle.',
    'EOF',
  ].join('\n');
  assert.deepEqual(keys(command), []);
});

test('heredoc dışındaki yıkıcı komut yakalanmaya devam eder', () => {
  const command = [DESTRUCTIVE, "cat > x <<'EOF'", 'zararsız', 'EOF'].join('\n');
  assert.ok(keys(command).includes('agt-05-rm-recursive-force'));
});

test('heredoc kapanışından sonrası tekrar taranır', () => {
  const command = ["cat > x <<'EOF'", `${DESTRUCTIVE}-icerde`, 'EOF', `${DESTRUCTIVE}-disarda`].join('\n');
  const found = scanCommand({ command });
  assert.equal(found.length, 1, 'yalnızca gövde dışındaki yakalanmalı');
  assert.match(found[0].excerpt, /disarda/);
});

test('tırnaksız ve tire ekli sınırlayıcılar da tanınır', () => {
  for (const opener of ['<<EOF', "<<-'EOF'", '<<"EOF"']) {
    const command = ['cat > x ' + opener, DESTRUCTIVE, 'EOF'].join('\n');
    assert.deepEqual(keys(command), [], opener);
  }
});

test('farklı sınırlayıcı adı gövdeyi erken kapatmaz', () => {
  const command = ["cat > x <<'PY'", DESTRUCTIVE, 'EOF', DESTRUCTIVE, 'PY'].join('\n');
  assert.deepEqual(keys(command), [], 'gövde PY satırına kadar sürmeli');
});

test('stripHeredocs satır sayısını ve numaralarını korur', () => {
  const command = ["cat > x <<'EOF'", 'bir', 'iki', 'EOF', DESTRUCTIVE].join('\n');
  assert.equal(stripHeredocs(command).split('\n').length, command.split('\n').length);
  assert.equal(scanCommand({ command })[0].line, 5, 'satır numarası kaymamalı');
});

test('heredoc olmayan komutlar etkilenmez', () => {
  assert.deepEqual(stripHeredocs('npm test'), 'npm test');
  assert.ok(keys('git push --force origin main').includes('agt-05-git-force-push'));
});
