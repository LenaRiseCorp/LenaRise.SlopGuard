import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandSegments, isCommitCommand, isTestCommand, writeTargets } from '../lib/commands.mjs';

/**
 * Çok satırlı Bash blokları.
 *
 * İlk sürüm yalnızca `&&`, `||`, `;` ve `|` üzerinden bölüyordu. Çok satırlı
 * bir bloğun ikinci satırındaki `git commit` ya da `npm test` hiç tanınmıyordu;
 * commit'ler oturum defterine işlenmiyor, doğrulama damgası atılmıyor ve Stop
 * kapısı yapılmış işi yapılmamış sayıyordu. Aracın kendi geliştirilmesinde,
 * kapı yazarını durdurduğunda ortaya çıktı.
 */

const COK_SATIR = ['git add -A', 'git commit -q -m "iş"', 'git push -q origin main'].join('\n');

test('satır sonu segment ayırıcısıdır', () => {
  assert.equal(commandSegments(COK_SATIR).length, 3);
  assert.deepEqual(commandSegments('npm run build\nnpm test'), ['npm run build', 'npm test']);
});

test('ilk satır olmayan commit tanınır', () => {
  assert.ok(isCommitCommand(COK_SATIR));
  assert.ok(isCommitCommand('npm test\ngit commit -m "yeşil"'));
});

test('ilk satır olmayan test komutu tanınır', () => {
  assert.ok(isTestCommand('npm run docs > /dev/null\nnpm test'));
  assert.ok(isTestCommand('cd api\npytest -q'));
});

test('heredoc gövdesi segment üretmez — mesaj komut değildir', () => {
  const commit = ['git add -A', "git commit -F - <<'MSGEOF'", 'git commit örneği mesajın içinde',
                  'npm test yazısı da burada', 'MSGEOF'].join('\n');
  assert.ok(isCommitCommand(commit), 'gerçek commit tanınmalı');
  assert.equal(isTestCommand(commit), false, 'mesaj gövdesindeki metin test sayılmamalı');
});

test('yalnızca gövdede geçen komut tetiklemez', () => {
  const yaz = ['cat > not.md <<EOF', 'git commit yapmayı unutma', 'npm test çalıştır', 'EOF'].join('\n');
  assert.equal(isCommitCommand(yaz), false);
  assert.equal(isTestCommand(yaz), false);
});

test('çok satırlı blokta yazma hedefleri bulunur', () => {
  const blok = ['mkdir -p src', 'cat > src/a.js <<EOF', 'kod', 'EOF', 'cp src/a.js src/b.js'].join('\n');
  const hedefler = writeTargets(blok);
  assert.ok(hedefler.includes('src/a.js'), JSON.stringify(hedefler));
  assert.ok(hedefler.includes('src/b.js'), JSON.stringify(hedefler));
});

test('ortam değişkeni öneki her satırda ayıklanır', () => {
  assert.ok(isTestCommand('echo hazir\nCI=1 NODE_ENV=test npm test'));
});

test('boş satırlar segment üretmez', () => {
  assert.deepEqual(commandSegments('npm test\n\n\ngit status'), ['npm test', 'git status']);
});
