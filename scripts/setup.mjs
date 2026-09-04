#!/usr/bin/env node
/**
 * /slop-setup — yapılandırmayı iskeletler ve durum çubuğunu kaydeder.
 *
 * İki katı kural:
 *   1. Var olan hiçbir dosya ezilmez. Her güncellemeden sonra güvenle
 *      tekrar çalıştırılabilir olması bu kurala bağlı.
 *   2. settings.json değiştirilmeden önce yedeklenir ve kullanıcının kendi
 *      statusLine girdisi varsa ona dokunulmaz — üstüne yazmak, kullanıcının
 *      yapılandırmasını sessizce ele geçirmek olurdu.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, paths, readJsonFile } from '../lib/config.mjs';
import { BRAND } from '../lib/report.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETTINGS = join(homedir(), '.claude', 'settings.json');
const LAUNCHER = join(paths.dir, 'statusline-launcher.mjs');
const STATUSLINE_CMD = `node "${LAUNCHER}"`;

const out = [];
const done = (t) => out.push(`  + ${t}`);
const kept = (t) => out.push(`  = ${t}`);
const warn = (t) => out.push(`  ! ${t}`);

/** Yalnızca yoksa yazar. Dönüş: yazıldı mı. */
function writeIfAbsent(file, content, label) {
  if (existsSync(file)) { kept(`${label} zaten var, dokunulmadı`); return false; }
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    done(`${label} oluşturuldu: ${file}`);
    return true;
  } catch (error) {
    warn(`${label} yazılamadı — ${error.message}`);
    return false;
  }
}

out.push(`${BRAND} kurulumu`, '');

// 1. Yapılandırma dosyaları — varsayılanlar koddan türetiliyor, elle yazılmıyor.
const defaults = {
  enabled: DEFAULT_CONFIG.enabled,
  mode: DEFAULT_CONFIG.mode,
  disabled: [],
  trustedPackages: [],
  allowTestWrites: DEFAULT_CONFIG.allowTestWrites,
  thresholds: { ...DEFAULT_CONFIG.thresholds },
  ui: { ...DEFAULT_CONFIG.ui },
};
writeIfAbsent(paths.config, JSON.stringify(defaults, null, 2) + '\n', 'config.json');

writeIfAbsent(paths.localPatterns, JSON.stringify({
  patterns: [
    {
      key: 'ornek-todo-acil',
      id: 'KOD-03',
      scope: 'code',
      severity: 'warn',
      // String.raw: bu desen JS → JSON → RegExp olmak üzere üç kez kaçış
      // katmanından geçiyor. Elle sayılan ters bölüler burada sessizce
      // bozulur; ham dize kullanmak o hatayı imkânsız kılıyor.
      match: String.raw`TODO\s*\(acil\)`,
      flags: 'gi',
      detects: 'Acil işaretli TODO — sahibi ve tarihi yok.',
      fix: 'Ya şimdi yap ya da issue aç ve numarasını yaz.',
    },
  ],
}, null, 2) + '\n', 'patterns.local.json (örnek)');

const rulesTemplate = join(ROOT, 'templates', 'rules.local.md');
if (existsSync(rulesTemplate)) {
  if (existsSync(paths.localRules)) kept('rules.local.md zaten var, dokunulmadı');
  else {
    try {
      mkdirSync(dirname(paths.localRules), { recursive: true });
      copyFileSync(rulesTemplate, paths.localRules);
      done(`rules.local.md oluşturuldu: ${paths.localRules}`);
    } catch (error) {
      warn(`rules.local.md yazılamadı — ${error.message}`);
    }
  }
} else {
  warn('rules.local.md şablonu bulunamadı');
}

// 2. Sürümden bağımsız başlatıcı.
// settings.json'a sürümlü cache yolu yazmak, her güncellemede çubuğu
// sessizce kırardı — kurulum provasında ölçüldü.
const launcherTemplate = join(ROOT, 'templates', 'statusline-launcher.mjs');
try {
  mkdirSync(dirname(LAUNCHER), { recursive: true });
  const fresh = readFileSync(launcherTemplate, 'utf8');
  const current = existsSync(LAUNCHER) ? readFileSync(LAUNCHER, 'utf8') : null;
  if (current === fresh) kept('statusline-launcher.mjs güncel');
  else { writeFileSync(LAUNCHER, fresh); done(`statusline-launcher.mjs ${current ? 'tazelendi' : 'oluşturuldu'}`); }
} catch (error) {
  warn(`başlatıcı yazılamadı — ${error.message}`);
}

// 3. statusLine kaydı.
out.push('');
const settings = readJsonFile(SETTINGS);
if (!settings.ok) {
  warn(`settings.json okunamadı (${settings.error}); statusLine kaydedilmedi`);
  warn('Dosyayı düzelt, sonra /slop-setup tekrar çalıştır.');
} else {
  const current = settings.value ?? {};
  const existing = current.statusLine?.command ?? '';
  // Küçük/büyük harfe duyarsız: gerçek yol "LenaRise.SlopGuard" biçiminde
  // olabiliyor ve duyarlı karşılaştırma kendi girdimizi yabancı sanıyordu.
  const mark = existing.toLowerCase();
  const isOurs = mark.includes('statusline') && mark.includes('slopguard');

  if (isOurs && existing === STATUSLINE_CMD) {
    kept('statusLine güncel');
  } else if (existing && !isOurs) {
    // Başkasının girdisi: dokunulmaz. Üstüne yazmak kullanıcının
    // yapılandırmasını sessizce ele geçirmek olurdu.
    warn('statusLine başka bir komuta ayarlı, dokunulmadı:');
    warn(`  ${existing}`);
    warn('Bizimkini istiyorsan bu satırla değiştir:');
    warn(`  ${STATUSLINE_CMD}`);
  } else {
    // Ya boş ya da bizim eski girdimiz. Eski girdi taşınmalı: erken sürümler
    // sürümlü cache yolu yazıyordu ve o yol her güncellemede geçersiz oluyor.
    try {
      if (existsSync(SETTINGS)) {
        copyFileSync(SETTINGS, `${SETTINGS}.slopguard-yedek`);
        done(`settings.json yedeklendi: ${SETTINGS}.slopguard-yedek`);
      }
      mkdirSync(dirname(SETTINGS), { recursive: true });
      current.statusLine = { type: 'command', command: STATUSLINE_CMD };
      writeFileSync(SETTINGS, JSON.stringify(current, null, 2) + '\n');
      done(isOurs ? 'statusLine sürümsüz başlatıcıya taşındı' : 'statusLine kaydedildi');
    } catch (error) {
      warn(`settings.json yazılamadı — ${error.message}`);
    }
  }
}

// 4. Canlılık kuralı — sessiz ölüm koruması.
//
// Otomatik ekleniyor çünkü bu kural, plugin öldüğünde çalışan TEK katman:
// hook'lar kayıtlı değilse "çalışıyor musun?" diye soracak hook da yoktur.
// Üstelik durum çubuğu her ortamda görünmüyor (desktop uygulamasının Code
// sekmesi statusLine render etmiyor — ölçüldü), yani bazı kullanıcılar için
// sessiz ölümü yakalayan başka hiçbir mekanizma yok.
//
// Güvenli olmasının sebebi işaretçiler: yalnızca kendi bloğumuz yazılıyor,
// dosyanın geri kalanına dokunulmuyor, ve blok silinerek temiz kaldırılıyor.
// --skip-claude-md ile atlanabilir.
out.push('');
const claudeMd = join(homedir(), '.claude', 'CLAUDE.md');
const BASLANGIC = '<!-- LenaRise.SlopGuard: canlılık kuralı — başlangıç -->';
const BITIS = '<!-- LenaRise.SlopGuard: canlılık kuralı — bitiş -->';

if (process.argv.includes('--skip-claude-md')) {
  kept('canlılık kuralı atlandı (--skip-claude-md)');
} else {
  const snippetFile = join(ROOT, 'templates', 'claude-md-snippet.md');
  let snippet = null;
  try {
    snippet = readFileSync(snippetFile, 'utf8').trim();
  } catch (error) {
    warn(`canlılık kuralı şablonu okunamadı — ${error.message}`);
  }

  if (snippet) {
    try {
      const existing = existsSync(claudeMd) ? readFileSync(claudeMd, 'utf8') : null;
      const start = existing?.indexOf(BASLANGIC) ?? -1;
      const end = existing?.indexOf(BITIS) ?? -1;

      if (existing !== null && start !== -1 && end !== -1) {
        const current = existing.slice(start, end + BITIS.length);
        if (current === snippet) {
          kept('~/.claude/CLAUDE.md canlılık kuralı güncel');
        } else {
          copyFileSync(claudeMd, `${claudeMd}.slopguard-yedek`);
          writeFileSync(claudeMd, existing.slice(0, start) + snippet + existing.slice(end + BITIS.length));
          done('~/.claude/CLAUDE.md canlılık kuralı tazelendi (yalnızca işaretli blok)');
        }
      } else {
        mkdirSync(dirname(claudeMd), { recursive: true });
        if (existing !== null) {
          copyFileSync(claudeMd, `${claudeMd}.slopguard-yedek`);
          writeFileSync(claudeMd, `${existing.trimEnd()}\n\n${snippet}\n`);
          done('~/.claude/CLAUDE.md sonuna canlılık kuralı eklendi');
        } else {
          writeFileSync(claudeMd, `${snippet}\n`);
          done(`~/.claude/CLAUDE.md oluşturuldu ve canlılık kuralı eklendi`);
        }
        out.push('     Kaldırmak için iki işaretçi arasındaki bloğu sil; gerisi senin.');
      }
    } catch (error) {
      warn(`~/.claude/CLAUDE.md yazılamadı — ${error.message}`);
      warn(`Elle eklemek istersen: ${snippetFile}`);
    }
  }
}

out.push('');
out.push('  Hook değişiklikleri için Claude Code yeniden başlatılmalı.');
out.push('  Kurulumu doğrulamak için: /slop-doctor');

process.stdout.write(out.join('\n') + '\n');
