/**
 * Kabuk komutlarını anlama: test komutu mu, commit mi, paket kurulumu mu.
 *
 * Paket doğrulaması burada yaşıyor çünkü slopsquatting (GUV-02) tam olarak bir
 * komut sorunu: model var olmayan bir paket adı üretir, komut çalışır, o adı
 * birisi önceden kapmıştır. Adın gerçekten var olduğunu kurulumdan ÖNCE
 * doğrulamak tek etkili savunma.
 *
 * Ağ gerektiği için politika fail-closed: doğrulanamayan paket engellenir.
 * Çevrimdışı çalışan biri için kaçış yolu config.json → trustedPackages.
 */

import { request } from 'node:https';

/**
 * Test koşucusu komutları — hepsi segment BAŞINA sabitli.
 *
 * Sabitleme şart: `npm install jest` içinde de "jest" geçer ama o bir kurulum,
 * koşum değil. Sabitlenmemiş desen kurulumu test çalıştırması sayar ve
 * doğrulanmamış bir turu doğrulanmış gösterirdi — tam olarak engellemeye
 * çalıştığımız şey (TST-05).
 */
export const TEST_COMMAND_PATTERNS = [
  /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b/,
  /^node\s+--test\b/,
  /^(?:npx\s+)?(?:jest|vitest|mocha|ava)\b/,
  /^(?:npx\s+)?playwright\s+test\b/,
  /^(?:npx\s+)?cypress\s+run\b/,
  /^(?:pytest|tox)\b/,
  /^python3?\s+-m\s+(?:pytest|unittest)\b/,
  /^go\s+test\b/,
  /^cargo\s+test\b/,
  /^(?:bundle\s+exec\s+)?rspec\b/,
  /^(?:\.?\/?vendor\/bin\/)?phpunit\b/,
  /^dotnet\s+test\b/,
  /^(?:mvn|gradle|\.?\/?gradlew)\s+(?:\S+\s+)*test\b/,
  /^make\s+(?:test|check)\b/,
];

/**
 * Komutu segmentlere böler ve her segmentin başındaki ortam değişkeni
 * atamalarını (`CI=1 npm test`) atar. Sınıflandırma segment başından yapılır.
 */
export function commandSegments(command) {
  return String(command ?? '')
    .split(/&&|\|\||;|\|/)
    .map((part) => part.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, ''))
    .filter((part) => part.length > 0);
}

export function isTestCommand(command) {
  return commandSegments(command).some((seg) => TEST_COMMAND_PATTERNS.some((re) => re.test(seg)));
}

/** git'in değer alan global bayrakları — alt komutu bulurken değerlerini de atlamak gerekir. */
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

/**
 * Segmentin git alt komutu. `git -C repo commit` → "commit".
 * Bayrakları ve değerlerini atlar; `git log --grep commit` yanlışlıkla
 * commit sayılmasın diye ilk bayrak olmayan sözcüğe bakar.
 */
export function gitSubcommand(segment) {
  const tokens = String(segment ?? '').trim().split(/\s+/);
  if (tokens[0] !== 'git') return null;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (GIT_VALUE_FLAGS.has(token)) { i++; continue; }
    if (token.startsWith('-')) continue;
    return token;
  }
  return null;
}

export function isCommitCommand(command) {
  return commandSegments(command).some((seg) => gitSubcommand(seg) === 'commit');
}

/** Paket yöneticisi → hangi kayıt defterinde aranacağı. */
const MANAGERS = [
  { re: /\b(?:npm|pnpm)\s+(?:i|install|add)\b/,  registry: 'npm' },
  { re: /\b(?:yarn|bun)\s+add\b/,                registry: 'npm' },
  { re: /\bpip3?\s+install\b/,                   registry: 'pypi' },
  { re: /\buv\s+(?:pip\s+install|add)\b/,        registry: 'pypi' },
  { re: /\bcargo\s+add\b/,                       registry: 'crates' },
  { re: /\bgo\s+get\b/,                          registry: null },
];

const SUBCOMMANDS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'uv', 'cargo', 'go',
  'i', 'install', 'add', 'get', 'pip-install']);

/** Paket belirtecinden çıplak adı çıkarır: sürüm, extra ve karşılaştırıcı atılır. */
export function packageName(token) {
  let name = String(token).trim().replace(/^['"]|['"]$/g, '');
  if (name.startsWith('@')) {
    const at = name.indexOf('@', 1);
    if (at !== -1) name = name.slice(0, at);
  } else {
    name = name.split('@')[0];
  }
  name = name.split(/[<>=!~[;]/)[0];
  return name.trim();
}

/**
 * Kurulum komutunu ayrıştırır.
 * @returns {{registry: string|null, packages: string[]}|null}
 */
export function parseInstall(command) {
  const text = String(command ?? '');
  const manager = MANAGERS.find((m) => m.re.test(text));
  if (!manager) return null;

  // Yalnızca eşleşen segmenti al: `cd x && npm install foo` gibi zincirlerde
  // öncesindeki kelimeler paket sanılmasın.
  const segment = text.split(/&&|\|\||;|\|/).find((part) => manager.re.test(part)) ?? text;

  const tokens = segment.trim().split(/\s+/);
  const packages = [];
  for (const token of tokens) {
    if (token.startsWith('-')) continue;                 // bayrak
    if (SUBCOMMANDS.has(token)) continue;                // yönetici veya alt komut
    if (/[/\\]/.test(token) && !token.startsWith('@')) continue;  // yerel yol / go modülü
    if (/^https?:/.test(token)) continue;                // doğrudan URL
    const name = packageName(token);
    if (name) packages.push(name);
  }
  return { registry: manager.registry, packages: [...new Set(packages)] };
}

const REGISTRY_URLS = {
  npm: (name) => `https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`,
  pypi: (name) => `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
  crates: (name) => `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`,
};

/**
 * Paketin kayıt defterinde var olup olmadığına bakar.
 * @returns {Promise<'exists'|'missing'|'unknown'>} 'unknown' ağ/zaman aşımı demektir
 */
export function checkRegistry(name, registry, { timeoutMs = 2500 } = {}) {
  const build = REGISTRY_URLS[registry];
  if (!build) return Promise.resolve('unknown');
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const req = request(build(name), { method: 'GET', headers: { 'user-agent': 'lenarise-slopguard' } }, (res) => {
      res.resume();
      if (res.statusCode === 200) done('exists');
      else if (res.statusCode === 404) done('missing');
      else done('unknown');
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); done('unknown'); });
    req.on('error', () => done('unknown'));
    req.end();
  });
}

/**
 * Kurulacak paketleri doğrular.
 *
 * Fail-closed: 'missing' de 'unknown' da geçit vermez. Var olmayan paket
 * slopsquatting yüzeyidir; doğrulanamayan paket de doğrulanmamıştır — ikisini
 * ayırt etmek kullanıcıya düşer, ve mesaj hangisi olduğunu söyler.
 */
export async function verifyPackages(packages, registry, { trusted = [], timeoutMs = 2500, check = checkRegistry } = {}) {
  const trustedSet = new Set(trusted.map((p) => String(p).toLowerCase()));
  const missing = [];
  const unknown = [];
  for (const name of packages) {
    if (trustedSet.has(name.toLowerCase())) continue;
    const verdict = await check(name, registry, { timeoutMs });
    if (verdict === 'missing') missing.push(name);
    else if (verdict === 'unknown') unknown.push(name);
  }
  return { ok: missing.length === 0 && unknown.length === 0, missing, unknown };
}

/**
 * Komutun yazdığı dosyalar.
 *
 * Neden gerekli: hook'lar yalnızca araç çağrılarını görüyor. `cat > x.js`,
 * `python -c ... > x.js`, `sed -i` gibi yazmalar Bash matcher'ından geçiyor ve
 * orada yalnızca komutun kendisi taranıyordu — yazılan içerik değil. Yani
 * kaynak dosya Bash üzerinden yazılırsa desen taraması hiç çalışmıyordu.
 *
 * Kapsam bilerek dar tutuldu. Bir kabuk komutunun neye yazdığını genel olarak
 * bilmek imkânsız (`make`, `npm run build`, keyfi script'ler); burada yalnızca
 * hedefi komutun kendisinde açıkça görünen biçimler ayrıştırılıyor. Yakalanan
 * her şey gerçek, ama her şey yakalanmıyor — bu sınır README'de yazılı.
 */

const NOT_A_FILE = /^(?:\/dev\/|\/proc\/)|^-$|^\d+$/;

/** Kabuk sözcüklerine ayırır; tırnak içindeki boşluğu korur. */
function tokenize(segment) {
  const out = [];
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(segment)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function cleanTarget(raw, sink) {
  if (typeof raw !== 'string') return;
  const path = raw.replace(/^['"]|['"]$/g, '').trim();
  if (!path || NOT_A_FILE.test(path)) return;
  sink.add(path);
}

export function writeTargets(command) {
  const text = String(command ?? '');
  const targets = new Set();

  // 1. Yönlendirmeler: > ve >>. `>&2`, `2>&1` gibi tanıtıcı yönlendirmeleri
  //    dışarıda bırakmak için `>` sonrası `&` reddediliyor.
  for (const m of text.matchAll(/(?:^|[\s;&|])\d*>>?\s*(?!&)('[^']*'|"[^"]*"|[^\s;&|<>]+)/g)) {
    cleanTarget(m[1], targets);
  }

  for (const segment of commandSegments(text)) {
    const tokens = tokenize(segment);
    if (tokens.length === 0) continue;
    const cmd = tokens[0].split('/').pop();
    const rest = tokens.slice(1);

    if (cmd === 'tee') {
      for (const t of rest) { if (!t.startsWith('-')) cleanTarget(t, targets); }
    } else if (cmd === 'sed' && rest.some((t) => t === '-i' || t.startsWith('-i'))) {
      // sed -i 's/a/b/' dosya  → son bayrak olmayan sözcük hedeftir
      const tail = rest.filter((t) => !t.startsWith('-'));
      cleanTarget(tail[tail.length - 1], targets);
    } else if (cmd === 'cp' || cmd === 'mv' || cmd === 'install') {
      const tail = rest.filter((t) => !t.startsWith('-'));
      if (tail.length >= 2) cleanTarget(tail[tail.length - 1], targets);
    } else if (cmd === 'touch') {
      for (const t of rest) { if (!t.startsWith('-')) cleanTarget(t, targets); }
    }
  }

  return [...targets];
}
