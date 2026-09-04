import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDirective, suppressionFor } from '../lib/ignore.mjs';
import { scanContent, actionable, suppressed } from '../lib/scan.mjs';

const scan = (content) => scanContent({ filePath: 'a.js', content });

test('geçerli muafiyet: aynı satırda, ID adlandırılmış, gerekçeli', () => {
  const src = 'try { sdk.close() } catch (e) {} // slop-guard-ignore KOD-05: SDK burada throw ediyor';
  const all = scan(src);
  assert.equal(all.length, 1);
  assert.equal(actionable(all).length, 0, 'bulgu susmalıydı');
  assert.equal(suppressed(all).length, 1);
  assert.equal(suppressed(all)[0].suppression.reason, 'SDK burada throw ediyor');
});

test('geçerli muafiyet: bir üst satırda', () => {
  const src = '// slop-guard-ignore KOD-05: üçüncü parti sözleşmesi\ntry { a() } catch (e) {}';
  assert.equal(actionable(scan(src)).length, 0);
});

test('geçerli muafiyet: taksonomi ID yerine desen key ile', () => {
  const src = '// slop-guard-ignore kod-05-empty-catch: gerekçe var\ntry { a() } catch (e) {}';
  assert.equal(actionable(scan(src)).length, 0);
});

test('geçerli muafiyet: kategori adıyla', () => {
  const src = '// slop-guard-ignore KOD: gerekçe var\ntry { a() } catch (e) {}';
  assert.equal(actionable(scan(src)).length, 0);
});

// ── Üç reddetme yolu: yönerge var ama susturmuyor ────────────────────────

test('reddedilir: ID adlandırılmamış', () => {
  const src = '// slop-guard-ignore: gürültü yapıyor\ntry { a() } catch (e) {}';
  const all = scan(src);
  assert.equal(actionable(all).length, 1, 'hedefsiz muafiyet susturmamalı');
  assert.equal(all[0].suppressionRejected.rejected, 'hedef-yok');
});

test('reddedilir: gerekçe yazılmamış', () => {
  const src = '// slop-guard-ignore KOD-05\ntry { a() } catch (e) {}';
  const all = scan(src);
  assert.equal(actionable(all).length, 1, 'gerekçesiz muafiyet susturmamalı');
  assert.equal(all[0].suppressionRejected.rejected, 'gerekce-yok');
});

test('reddedilir: başka deseni hedefliyor', () => {
  const src = '// slop-guard-ignore GUV-03: sır değil bu\ntry { a() } catch (e) {}';
  const all = scan(src);
  assert.equal(actionable(all).length, 1);
  assert.equal(all[0].suppressionRejected.rejected, 'baska-hedef');
});

test('kapsam dar: iki satır yukarıdaki muafiyet erişmez', () => {
  const src = '// slop-guard-ignore KOD-05: uzakta\n\ntry { a() } catch (e) {}';
  assert.equal(actionable(scan(src)).length, 1);
});

test('bir muafiyet yalnızca kendi bulgusunu susturur', () => {
  const src = [
    '// slop-guard-ignore KOD-05: sadece bu',
    'try { a() } catch (e) {}',
    'const k = "AKIAIOSFODNN7EXAMPLE"',
  ].join('\n');
  const all = scan(src);
  assert.equal(suppressed(all).length, 1);
  assert.deepEqual(actionable(all).map((f) => f.key), ['guv-03-aws-key']);
});

// ── Ayrıştırıcı ──────────────────────────────────────────────────────────

test('parseDirective biçimleri', () => {
  assert.equal(parseDirective('kod satırı'), null);
  assert.deepEqual(parseDirective('# slop-guard-ignore GUV-03: fixture'), { target: 'GUV-03', reason: 'fixture', hasReason: true });
  assert.deepEqual(parseDirective('// slop-guard-ignore: sebep'), { target: null, reason: 'sebep', hasReason: true });
  assert.equal(parseDirective('// slop-guard-ignore KOD-05').hasReason, false);
});

test('yol ve komut bulgularında satır içi muafiyet aranmaz', () => {
  const f = { line: 0, key: 'x', id: 'KOD-01', category: 'KOD' };
  assert.equal(suppressionFor(f, ['// slop-guard-ignore KOD-01: sebep']), null);
});
