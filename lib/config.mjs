/**
 * Yapılandırma yükleme ve birleştirme.
 *
 * Birleştirme sırası — sonraki öncekini ezer:
 *   1. plugin varsayılanları (bu dosya)
 *   2. ~/.claude/lenarise-slopguard/config.json
 *   3. ~/.claude/lenarise-slopguard/patterns.local.json   (desen ekler)
 *   4. <repo>/.slopignore                                  (yol muafiyeti)
 *   5. oturum kipi                                         (/slop-mode explore)
 *
 * Mekanizma plugin cache'inde yaşar ve güncellemede değişir; yapılandırma
 * kullanıcının ev dizininde yaşar ve asla ezilmez. Bu dosya yalnızca okur —
 * hiçbir koşulda kullanıcı dosyasına yazmaz.
 *
 * Hata yutulmaz: bozuk JSON, geçersiz desen, okunamayan dosya — hepsi
 * `problems` dizisine düşer ve çağıran onu stderr'e ya da durum çubuğuna
 * taşır. Sessizce varsayılana dönmek, koruma olduğunu sanmakla aynı şey olurdu.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, relative, sep } from 'node:path';

export const CONFIG_DIR = process.env.SLOPGUARD_CONFIG_DIR
  ?? join(homedir(), '.claude', 'lenarise-slopguard');

export const paths = {
  dir: CONFIG_DIR,
  config: join(CONFIG_DIR, 'config.json'),
  localPatterns: join(CONFIG_DIR, 'patterns.local.json'),
  localRules: join(CONFIG_DIR, 'rules.local.md'),
  heartbeat: join(CONFIG_DIR, 'heartbeat.json'),
  session: (id) => join(CONFIG_DIR, `session-${String(id).replace(/[^\w-]/g, '_')}.json`),
};

/** Varsayılanlar. Bu nesne değiştirilmez; her yükleme kopyasıyla çalışır. */
export const DEFAULT_CONFIG = Object.freeze({
  mode: 'strict',              // strict | explore
  disabled: [],                // kategori, taksonomi ID ya da desen key
  trustedPackages: [],         // MTK-02 kapısından muaf paketler
  allowTestWrites: false,      // TST kilidi
  thresholds: Object.freeze({
    maxDiffLines: 400,         // SUR-02: Stop kapısı diff eşiği
    contextTurns: 40,          // AGT-01: tur sayacı
    contextUsedPercent: 75,    // AGT-01: bağlam doluluk oranı (statusLine ölçer)
    comprehensionGap: 500,     // INS-01: yazılan − okunan satır farkı
    uncommittedLines: 300,     // AGT-06: son commit'ten beri değişen satır
    consecutiveFixes: 3,       // MTK-05: aynı dosyaya ardışık düzeltme
    packageCheckTimeoutMs: 2500, // GUV-02: kayıt defteri sorgusu; aşılırsa fail-closed
    maxStopBlocks: 2,          // AGT-08: aynı gerekçeyle en fazla kaç kez bloklanır
  }),
  ui: Object.freeze({
    statusLine: 'compact',     // compact | minimal | off
    cleanScans: 'silent',      // silent | summary
    heartbeat: true,
    livenessCheck: 'ask',      // ask | warn | off
  }),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** JSON okur. Başarısızlık dönüş değerinde taşınır, atılmaz. */
export function readJsonFile(path) {
  if (!existsSync(path)) return { ok: true, value: null, missing: true };
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    return { ok: false, value: null, error: `okunamadı: ${error.message}` };
  }
  try {
    return { ok: true, value: JSON.parse(raw), missing: false };
  } catch (error) {
    return { ok: false, value: null, error: `geçersiz JSON: ${error.message}` };
  }
}

const VALID = {
  mode: ['strict', 'explore'],
  'ui.statusLine': ['compact', 'minimal', 'off'],
  'ui.cleanScans': ['silent', 'summary'],
  'ui.livenessCheck': ['ask', 'warn', 'off'],
};

function checkEnum(problems, path, value) {
  const allowed = VALID[path];
  if (!allowed || value === undefined) return true;
  if (allowed.includes(value)) return true;
  problems.push(`config.json → ${path}: "${value}" geçersiz (${allowed.join(' | ')}); varsayılan kullanılıyor`);
  return false;
}

/** Kullanıcının patterns.local.json girdilerini derler. Geçersiz girdi atlanır ve raporlanır. */
export function compileLocalPatterns(raw, problems) {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : raw.patterns;
  if (!Array.isArray(list)) {
    problems.push('patterns.local.json: dizi ya da { "patterns": [...] } bekleniyordu');
    return [];
  }
  const out = [];
  list.forEach((entry, i) => {
    const where = `patterns.local.json[${i}]`;
    for (const field of ['key', 'id', 'scope', 'match']) {
      if (!entry?.[field]) { problems.push(`${where}: "${field}" alanı eksik`); return; }
    }
    if (!['code', 'prose', 'path', 'command'].includes(entry.scope)) {
      problems.push(`${where}: scope "${entry.scope}" geçersiz`); return;
    }
    let match;
    try {
      match = new RegExp(entry.match, entry.flags ?? 'g');
    } catch (error) {
      problems.push(`${where}: regex derlenemedi — ${error.message}`); return;
    }
    out.push({
      key: String(entry.key),
      id: String(entry.id),
      scope: entry.scope,
      severity: entry.severity === 'warn' ? 'warn' : 'block',
      match,
      detects: entry.detects ?? 'Kullanıcı deseni.',
      fix: entry.fix ?? 'Deseni patterns.local.json içinde tanımlayan kişiye sor.',
      local: true,
    });
  });
  return out;
}

/** `.slopignore` satırlarını yol eşleştiricilere çevirir. gitignore benzeri, basit. */
export function parseSlopignore(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((line) => ({ source: line, re: globToRegExp(line) }));
}

/** Küçük glob → RegExp. `**` dizin sınırlarını aşar, `*` aşmaz. Bağımlılık eklemek için yeterli sebep değil. */
export function globToRegExp(glob) {
  let out = '';
  const g = glob.replace(/^\.\//, '');
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { out += '.*'; i++; if (g[i + 1] === '/') i++; }
      else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  // Dizin adı verildiyse altındaki her şey kapsanır.
  return new RegExp(`^${out}(?:/.*)?$`);
}

/** Yol `.slopignore` tarafından muaf tutulmuş mu? */
export function isPathIgnored(config, filePath, repoRoot) {
  const rules = config.ignoreRules ?? [];
  if (rules.length === 0) return false;
  const root = repoRoot ?? config.repoRoot;
  let rel = String(filePath ?? '');
  if (root) {
    const r = relative(resolve(root), resolve(rel));
    if (!r.startsWith('..')) rel = r;
  }
  rel = rel.split(sep).join('/').replace(/^\.\//, '');
  return rules.some((rule) => rule.re.test(rel));
}

/**
 * Tam yapılandırmayı yükler.
 *
 * @param {object} opts
 * @param {string} [opts.repoRoot]     `.slopignore` aranacak dizin
 * @param {string} [opts.sessionMode]  oturum kipi ezmesi (/slop-mode)
 * @returns {{config: object, problems: string[], sources: string[]}}
 */
export function loadConfig({ repoRoot, sessionMode } = {}) {
  const problems = [];
  const sources = ['varsayılan'];
  const config = clone(DEFAULT_CONFIG);

  const file = readJsonFile(paths.config);
  if (!file.ok) {
    problems.push(`config.json ${file.error}; varsayılanlarla devam ediliyor`);
  } else if (file.value) {
    sources.push(paths.config);
    const u = file.value;
    if (checkEnum(problems, 'mode', u.mode) && u.mode) config.mode = u.mode;
    if (Array.isArray(u.disabled)) config.disabled = u.disabled.map(String);
    else if (u.disabled !== undefined) problems.push('config.json → disabled: dizi bekleniyordu');
    if (Array.isArray(u.trustedPackages)) config.trustedPackages = u.trustedPackages.map(String);
    else if (u.trustedPackages !== undefined) problems.push('config.json → trustedPackages: dizi bekleniyordu');
    if (typeof u.allowTestWrites === 'boolean') config.allowTestWrites = u.allowTestWrites;
    for (const [k, v] of Object.entries(u.thresholds ?? {})) {
      if (Number.isFinite(v)) config.thresholds[k] = v;
      else problems.push(`config.json → thresholds.${k}: sayı bekleniyordu`);
    }
    for (const [k, v] of Object.entries(u.ui ?? {})) {
      if (checkEnum(problems, `ui.${k}`, v)) config.ui[k] = v;
    }
  }

  const local = readJsonFile(paths.localPatterns);
  if (!local.ok) problems.push(`patterns.local.json ${local.error}; kullanıcı desenleri yüklenmedi`);
  config.localPatterns = local.ok && local.value ? compileLocalPatterns(local.value, problems) : [];
  if (config.localPatterns.length > 0) sources.push(paths.localPatterns);

  config.ignoreRules = [];
  config.repoRoot = repoRoot ?? null;
  if (repoRoot) {
    const ignorePath = join(repoRoot, '.slopignore');
    if (existsSync(ignorePath)) {
      try {
        config.ignoreRules = parseSlopignore(readFileSync(ignorePath, 'utf8'));
        sources.push(ignorePath);
      } catch (error) {
        problems.push(`.slopignore okunamadı: ${error.message}`);
      }
    }
  }

  if (sessionMode) {
    if (VALID.mode.includes(sessionMode)) { config.mode = sessionMode; sources.push('oturum kipi'); }
    else problems.push(`oturum kipi "${sessionMode}" geçersiz; yok sayıldı`);
  }

  return { config, problems, sources };
}

/**
 * Bulgunun kipe göre eylemi.
 *
 * Keşif kipi üslup kurallarını gevşetir, geri dönüşsüzlüğü değil: `command`
 * kapsamındaki block desenleri (rm -rf, DROP TABLE, force push, doğrulanmamış
 * paket) her kipte bloklar. Prototip yaparken boş catch yazmana göz yumulur,
 * veritabanını düşürmene yumulmaz.
 */
export function actionFor(finding, config) {
  if (finding.severity !== 'block') return 'warn';
  if (finding.scope === 'command') return 'block';
  return config.mode === 'explore' ? 'warn' : 'block';
}
