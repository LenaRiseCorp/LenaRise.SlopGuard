import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Bağlayıcı taahhüt kapısı: plugin kendi kaynağını kendi tarayıcısından geçirir.
 * Bu test kırmızıya dönerse ya desen yanlıştır ya kod — ikisinden biri düzeltilir,
 * muafiyet yazılmaz.
 */
test('kendi kendini tarama temiz kalır', () => {
  let out;
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'scripts/selfscan.mjs')], { encoding: 'utf8' });
  } catch (error) {
    assert.fail(`kendi kaynağımızda bulgu var:\n${error.stdout ?? error.message}`);
  }
  assert.match(out, /temiz/);
});
