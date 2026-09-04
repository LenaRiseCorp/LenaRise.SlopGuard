#!/usr/bin/env node
/**
 * PreToolUse: Bash → yıkıcı komut savunması ve paket doğrulama kapısı.
 *
 * Üç iş yapar ama tek çıktı üretir: hook protokolü stdout'ta tek JSON nesnesi
 * bekler, ikinci nesne yazmak protokolü bozar.
 *
 *   1. Yıkıcı komut   → deny (her kipte; keşif kipi bunu gevşetmez)
 *   2. Paket kurulumu → kayıt defterinde yoksa ya da doğrulanamazsa deny
 *   3. Uyarılar       → tek systemMessage'da birleşir, bloklamaz
 *
 * Paket kapısı fail-closed: 'yok' da 'bilinmiyor' da geçit vermez.
 * Doğrulanamayan paket doğrulanmamıştır; hangisi olduğunu mesaj söyler.
 */

import { runHook } from '../lib/hook.mjs';
import { resolve, relative } from 'node:path';
import { scanCommand, actionable, isTestPath, protectedPathReason } from '../lib/scan.mjs';
import { actionFor, isPathIgnored } from '../lib/config.mjs';
import { parseInstall, verifyPackages, isCommitCommand, writeTargets } from '../lib/commands.mjs';
import { activePatterns } from '../lib/scan.mjs';
import { verifyBeforeCommit } from '../lib/coach.mjs';
import { deny, notify, formatFindings, BRAND } from '../lib/report.mjs';

runHook('pre-bash', async ({ payload, config, state, repoRoot }) => {
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string' || command.trim() === '') return;

  // gate taşıyan desenlerin kendi politikası var; buradaki taramadan muaflar.
  const findings = actionable(scanCommand({ command, config })).filter((f) => !f.gate);
  const blocking = findings.filter((f) => actionFor(f, config) === 'block');

  if (blocking.length > 0) {
    deny(formatFindings(blocking, { config, target: command, action: 'block' }));
    return;
  }

  // Bash üzerinden yazma: `cat > .env`, `sed -i` gibi komutlar Edit/Write
  // araçlarını atlıyor ve pre-edit kilidine hiç uğramıyordu. Aynı politika
  // burada da uygulanıyor — yoksa kilit tek bir yönlendirme ile aşılabilirdi.
  for (const target of writeTargets(command)) {
    const absolute = resolve(payload.cwd ?? process.cwd(), target);
    if (isPathIgnored(config, absolute, repoRoot)) continue;
    const shown = repoRoot ? relative(repoRoot, absolute) : target;

    const why = protectedPathReason(shown);
    if (why) {
      deny(`${BRAND}: bu komut ${shown} dosyasına yazıyor ve o yol korumalı (${why}).\n`
        + `Agent bu dosyaya yazmamalı. Gerçekten gerekiyorsa kullanıcı elle düzenlesin, `
        + `ya da yolu repo kökündeki .slopignore dosyasına ekleyin.`);
      return;
    }
    if (isTestPath(shown) && !config.allowTestWrites) {
      deny(`${BRAND}: bu komut ${shown} dosyasına yazıyor ve o bir test dosyası (TST-01).\n`
        + `Kabuk üzerinden yazmak kilidi aşmaz. Testi değiştirmek yerine testi geçiren `
        + `kodu düzelt; test gerçekten değişmeliyse config.json içinde allowTestWrites: true yapın.`);
      return;
    }
  }

  // Paket kurulum kapısı.
  const gateOn = activePatterns('command', config).some((p) => p.gate === 'package-verification');
  const install = gateOn ? parseInstall(command) : null;
  if (install && install.registry && install.packages.length > 0) {
    const { ok, missing, unknown } = await verifyPackages(install.packages, install.registry, {
      trusted: config.trustedPackages,
      timeoutMs: config.thresholds.packageCheckTimeoutMs,
    });
    if (!ok) {
      const lines = [`${BRAND}: paket kurulumu doğrulanamadı (GUV-02 slopsquatting).`, ''];
      if (missing.length > 0) {
        lines.push(`  ${install.registry} kayıt defterinde YOK: ${missing.join(', ')}`);
        lines.push('  Var olmayan bir paket adı, o adı önceden kapmış birinin kodunu kurar.');
        lines.push('  Adın doğru yazıldığını ve paketin gerçekten var olduğunu kontrol et.');
      }
      if (unknown.length > 0) {
        if (missing.length > 0) lines.push('');
        lines.push(`  Doğrulanamadı (ağ yok ya da zaman aşımı): ${unknown.join(', ')}`);
        lines.push('  Doğrulanamayan paket doğrulanmamıştır; kapı bilerek kapalı kapanır.');
      }
      lines.push('', '  Paketin doğruluğundan eminsen config.json → trustedPackages listesine ekle.');
      deny(lines.join('\n'));
      return;
    }
  }

  // Bloklamayan uyarılar tek gövdede toplanır.
  const notices = findings
    .filter((f) => actionFor(f, config) === 'warn')
    .map((f) => `${f.id} ${f.detects} → ${f.fix}`);

  if (isCommitCommand(command)) {
    const warning = verifyBeforeCommit(state);
    if (warning) notices.push(warning.message);
  }

  if (notices.length > 0) {
    notify(`${BRAND}\n\n${notices.map((n) => `  · ${n}`).join('\n')}`);
  }
});
