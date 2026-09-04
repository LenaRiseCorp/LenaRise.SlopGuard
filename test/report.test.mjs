import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deny, block, notify, inject, fail, summarize, formatFindings, formatFinding, formatCleanScan } from '../lib/report.mjs';
import { scanContent, scanCommand } from '../lib/scan.mjs';

/** stdout'u yakalar, yazılan tek JSON nesnesini döndürür. */
function capture(fn) {
  const original = process.stdout.write;
  let buf = '';
  process.stdout.write = (chunk) => { buf += chunk; return true; };
  try { fn(); } finally { process.stdout.write = original; }
  return buf === '' ? null : JSON.parse(buf);
}

function captureStderr(fn) {
  const original = process.stderr.write;
  let buf = '';
  process.stderr.write = (chunk) => { buf += chunk; return true; };
  try { fn(); } finally { process.stderr.write = original; }
  return buf;
}

// Şemalar docs/dogrulama-kaydi.md'de fiilen sınandı; testler sözleşmeyi kilitliyor.

test('deny şeması PreToolUse sözleşmesine uyar', () => {
  const out = capture(() => deny('test dosyası korumalı'));
  assert.deepEqual(out, {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'test dosyası korumalı',
    },
  });
});

test('block şeması PostToolUse ve Stop sözleşmesine uyar', () => {
  assert.deepEqual(capture(() => block('KOD-05 satır 3')), { decision: 'block', reason: 'KOD-05 satır 3' });
});

test('notify kullanıcı kanalına systemMessage yazar', () => {
  assert.deepEqual(capture(() => notify('oturum uzadı')), { systemMessage: 'oturum uzadı' });
});

test('inject modele additionalContext enjekte eder', () => {
  assert.deepEqual(capture(() => inject('SessionStart', 'kural seti')), {
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'kural seti' },
  });
});

test('fail stderr yazar ve stdout kirletmez — hata sessizce yutulmaz', () => {
  let stdout = null;
  const err = captureStderr(() => { stdout = capture(() => fail('post-edit', new Error('disk dolu'))); });
  assert.equal(stdout, null, 'stdout boş kalmalı, yoksa hook protokolü bozulur');
  assert.match(err, /LenaRise\.SlopGuard \[post-edit\] hata: Error: disk dolu/);
});

test('fail Error olmayan değeri de yutmaz', () => {
  assert.match(captureStderr(() => fail('pre-bash', 'düz metin hata')), /düz metin hata/);
});

// ── Sayım ve biçimlendirme ───────────────────────────────────────────────

const findings = scanContent({
  filePath: 'a.js',
  content: [
    'try { a() } catch (e) {}',
    'const k = "AKIAIOSFODNN7EXAMPLE"',
    '// slop-guard-ignore KOD-04: bilerek ölü dal, migration bitince silinecek',
    'if (false) { legacy() }',
  ].join('\n'),
});

test('summarize sert kipte blokları sayar', () => {
  const s = summarize(findings, { mode: 'strict' });
  assert.equal(s.blocked, 2, 'boş catch + AWS anahtarı');
  assert.equal(s.suppressed, 1, 'muaf tutulan guard-and-go');
  assert.equal(s.warned, 0);
});

test('summarize keşif kipinde hiçbir şeyi bloklamaz', () => {
  const s = summarize(findings, { mode: 'explore' });
  assert.equal(s.blocked, 0);
  assert.equal(s.warned, 2);
});

test('formatFindings susturulmuş bulguyu listeye almaz ama sayısını söyler', () => {
  const text = formatFindings(findings, { config: { mode: 'strict' }, target: 'a.js' });
  assert.match(text, /2 desen engellendi \(sert kip\)/);
  assert.match(text, /KOD-05/);
  assert.match(text, /GUV-03/);
  assert.doesNotMatch(text, /KOD-04/, 'susturulan bulgu listelenmemeli');
  assert.match(text, /1 bulgu satır içi muafiyetle susturuldu/);
});

test('formatFindings temiz listede boş dize döner', () => {
  assert.equal(formatFindings([], { config: {} }), '');
});

test('formatFinding düzeltme önerisini ve alıntıyı taşır', () => {
  const [f] = scanContent({ filePath: 'a.js', content: 'try { a() } catch (e) {}' });
  const text = formatFinding(f);
  assert.match(text, /satır 1/);
  assert.match(text, /Hata bastırma/);
  assert.match(text, /> try \{ a\(\) \} catch \(e\) \{\}/);
  assert.match(text, /Düzelt: Hatayı logla/);
});

test('formatFinding geçersiz muafiyeti kullanıcıya söyler', () => {
  const [f] = scanContent({ filePath: 'a.js', content: '// slop-guard-ignore KOD-05\ntry { a() } catch (e) {}' });
  assert.match(formatFinding(f), /muafiyeti geçersiz — gerekçe yazılmamış/);
});

test('komut bulgusu satır yerine "komut" der', () => {
  const [f] = scanCommand({ command: 'rm -rf /tmp/x' });
  assert.match(formatFinding(f), /AGT-05 {2}komut/);
});

test('temiz tarama satırı', () => {
  assert.equal(formatCleanScan(4), 'LenaRise.SlopGuard: 4 dosya tarandı · temiz');
});
