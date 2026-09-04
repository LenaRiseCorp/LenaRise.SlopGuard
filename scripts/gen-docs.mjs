#!/usr/bin/env node
/**
 * Doküman üreteci.
 *
 * README, CLAUDE.md, semgrep şablonu, varsayılan yapılandırma ve skill'in şema
 * bölümleri buradan üretilir. Elle senkron tutulmazlar çünkü doküman-kod
 * ayrışması (DOK-07) bu projenin kendi kategorilerinden biri ve kendi kuralına
 * uymayan bir araç kendi savunusunu çürütür.
 *
 * `--check` ile çalıştırıldığında hiçbir şey yazmaz; üretilen çıktı diskteki
 * hâlle aynı değilse 1 ile çıkar. CI kapısı budur.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATTERNS, TAXONOMY, CATEGORIES, PATTERN_COUNT, NEW_IDS, PROSE_EXTENSIONS, CODE_EXTENSIONS, titleOf } from '../lib/patterns.mjs';
import { DEFAULT_CONFIG } from '../lib/config.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const written = [];
const stale = [];

function emit(rel, content) {
  const file = join(ROOT, rel);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === content) return;
  if (CHECK) { stale.push(rel); return; }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  written.push(rel);
}

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version;
// Kurulum adresi package.json'dan okunur; iki yerde tutmak ilk yeniden
// adlandırmada ayrışırdı (DOK-07).
const SLUG = (PKG.repository?.url ?? '').replace(/^.*github\.com\//, '').replace(/\.git$/, '') || 'OWNER/REPO';
const SCOPE_LABEL = { code: 'kaynak dosya', prose: 'metin dosyası', path: 'dosya yolu', command: 'kabuk komutu' };

// ── Ortak tablolar ───────────────────────────────────────────────────────

function patternCatalogue() {
  // Kanonik başlık sütunu bilerek var: gözlemde bir AI, DOK-01'i kapatırken
  // kullanıcıya "başlığa emoji koyma" dedi — o DOK-04. Kapatılan şeyin ne
  // olduğunu yanlış söylemek, "neyi kaybettiğini söyle" kuralını pratikte
  // çökertiyor. ID → kanonik ad eşlemesi tek yerde ve açık olmalı.
  const rows = ['| ID | Kanonik ad | Desen anahtarı | Kapsam | Sertlik | Ne yakalar |', '|---|---|---|---|---|---|'];
  for (const p of [...PATTERNS].sort((a, b) => a.id.localeCompare(b.id) || a.key.localeCompare(b.key))) {
    rows.push(`| ${p.id} | ${titleOf(p.id)} | \`${p.key}\` | ${SCOPE_LABEL[p.scope]} | ${p.severity === 'block' ? 'engeller' : 'uyarır'} | ${p.detects} |`);
  }
  return rows.join('\n');
}

function taxonomyTable() {
  const rows = ['| Kategori | ID sayısı | Mekanik desen | Zorlama |', '|---|---|---|---|'];
  for (const [code, meta] of Object.entries(CATEGORIES)) {
    const ids = TAXONOMY.filter((t) => t.category === code).length;
    const mech = PATTERNS.filter((p) => p.id.startsWith(code)).length;
    rows.push(`| **${code}** ${meta.name} | ${ids} | ${mech === 0 ? 'yok — koç katmanı' : mech} | ${meta.enforcement} |`);
  }
  return rows.join('\n');
}

function configSchema() {
  const t = DEFAULT_CONFIG.thresholds;
  const notes = {
    maxDiffLines: 'Stop kapısı: son commit\'ten beri değişen satır eşiği (SUR-02)',
    contextTurns: 'Koç uyarısı: oturum tur eşiği (AGT-01)',
    contextUsedPercent: 'Bağlam doluluk oranı eşiği; durum çubuğu ölçer (AGT-01)',
    comprehensionGap: 'Koç uyarısı: yazılan eksi okunan satır farkı (INS-01)',
    uncommittedLines: 'Koç uyarısı: commit\'siz biriken satır (AGT-06)',
    consecutiveFixes: 'Koç uyarısı: aynı dosyaya ardışık düzeltme (MTK-05)',
    packageCheckTimeoutMs: 'Paket kayıt defteri sorgusu; aşılırsa engeller (GUV-02)',
    maxStopBlocks: 'Aynı gerekçeyle en fazla kaç kez bloklanır (AGT-08)',
  };
  const rows = ['| Alan | Varsayılan | Ne yapar |', '|---|---|---|'];
  rows.push(`| \`enabled\` | \`${DEFAULT_CONFIG.enabled}\` | \`false\` yapılırsa tüm koruma durur, çubuk "kapalı" gösterir |`);
  rows.push(`| \`mode\` | \`"${DEFAULT_CONFIG.mode}"\` | \`strict\` engeller, \`explore\` yalnızca uyarır (geri dönüşsüz komutlar hariç) |`);
  rows.push('| `disabled` | `[]` | Kategori (`GUV`), taksonomi ID (`GUV-03`) ya da desen anahtarı |');
  rows.push('| `trustedPackages` | `[]` | Kayıt defterine sorulmadan geçen paket adları |');
  rows.push(`| \`allowTestWrites\` | \`${DEFAULT_CONFIG.allowTestWrites}\` | \`true\` yapılırsa test dosyalarına yazma kilidi açılır (TST-01) |`);
  for (const [k, v] of Object.entries(t)) rows.push(`| \`thresholds.${k}\` | \`${v}\` | ${notes[k] ?? ''} |`);
  const ui = {
    statusLine: '`compact` · `minimal` · `off`',
    cleanScans: '`silent` · `summary` — temiz taramada bildirim',
    heartbeat: 'oturum başı tek satır onay',
    livenessCheck: '`ask` · `warn` · `off` — plugin yanıt vermediğinde davranış',
    chatStatus: '`0` kapalı; `N` her N turda bir sohbete durum satırı. Durum çubuğunun görünmediği ortamlar için',
  };
  for (const [k, v] of Object.entries(DEFAULT_CONFIG.ui)) {
    rows.push(`| \`ui.${k}\` | \`${JSON.stringify(v)}\` | ${ui[k] ?? ''} |`);
  }
  return rows.join('\n');
}

// ── Üretilen dosyalar ────────────────────────────────────────────────────

emit('templates/config.default.json', JSON.stringify({
  enabled: DEFAULT_CONFIG.enabled,
  mode: DEFAULT_CONFIG.mode,
  disabled: [],
  trustedPackages: [],
  allowTestWrites: DEFAULT_CONFIG.allowTestWrites,
  thresholds: { ...DEFAULT_CONFIG.thresholds },
  ui: { ...DEFAULT_CONFIG.ui },
}, null, 2) + '\n');

emit('templates/patterns.local.example.json', JSON.stringify({
  patterns: [
    {
      key: 'ornek-todo-acil', id: 'KOD-03', scope: 'code', severity: 'warn',
      match: 'TODO\\s*\\(acil\\)', flags: 'gi',
      detects: 'Acil işaretli TODO — sahibi ve tarihi yok.',
      fix: 'Ya şimdi yap ya da issue aç ve numarasını yaz.',
    },
    {
      key: 'ornek-yasak-import', id: 'KOD-07', scope: 'code', severity: 'block',
      match: "from ['\"]lodash['\"]", flags: 'g',
      detects: 'Bu projede lodash kullanılmıyor.',
      fix: 'Yerleşik dizi ve nesne yöntemlerini kullan.',
    },
  ],
}, null, 2) + '\n');

const semgrepRules = PATTERNS
  .filter((p) => p.scope === 'code' || p.scope === 'prose')
  .map((p) => {
    const insensitive = p.match.flags.includes('i') ? '(?i)' : '';
    const exts = (p.scope === 'prose' ? PROSE_EXTENSIONS : CODE_EXTENSIONS).map((e) => `      - "*${e}"`).join('\n');
    return `  - id: slopguard-${p.key}
    languages: [generic]
    severity: ${p.severity === 'block' ? 'ERROR' : 'WARNING'}
    message: >-
      ${p.id} ${p.detects} Düzelt: ${p.fix}
    paths:
      include:
${exts}
    patterns:
      - pattern-regex: ${JSON.stringify(insensitive + p.match.source)}`;
  }).join('\n');

emit('templates/semgrep-slop.yml',
`# LenaRise.SlopGuard — semgrep kuralları
#
# ÜRETİLEN DOSYA. Elle düzenleme; kaynağı lib/patterns.mjs.
# Yeniden üretmek için: npm run docs
#
# Bu dosya Claude Code'dan bağımsız çalışır: semgrep'i olan her CI kullanabilir.
# Kapsam bilerek dar — yol ve komut kapsamındaki desenler (test dosyası kilidi,
# yıkıcı komutlar, paket doğrulama) statik tarayıcıya çevrilemez, onlar hook
# ve git katmanında kalır.

rules:
${semgrepRules}
`);

// ── README ───────────────────────────────────────────────────────────────

emit('README.md',
`# LenaRise.SlopGuard

ÜRETİLEN DOSYA. Elle düzenleme; kaynağı \`lib/patterns.mjs\`, \`lib/config.mjs\` ve
\`scripts/gen-docs.mjs\`. Yeniden üretmek için \`npm run docs\`.

Agentic geliştirmede üretilen çıktının kalitesini ve güvenliğini koruyan bir
Claude Code plugin'i. Kural metni niyeti taşır, hook sınırı koyar: modelin
atlayamayacağı yerde durur.

Sürüm ${VERSION} · ${PATTERN_COUNT} mekanik desen · ${TAXONOMY.length} taksonomi girdisi · sıfır runtime bağımlılığı.

## Ne yapar

Üç katman, üç hedef kitle.

1. **Makine katmanı** — Claude Code hook'ları. Model bunları atlayamaz;
   harness çalıştırır.
2. **İnsan katmanı** — sohbete gelen ölçüm tabanlı uyarılar. Bloklamaz, uyarır.
3. **Repo katmanı** — git hook'u ve CI. Kodu hangi agent yazarsa yazsın çalışır.

${taxonomyTable()}

### Hook davranışı

| Hook | Olay | Davranış |
|---|---|---|
| \`session-start\` | SessionStart | Kural seti ve yetenek indeksini modele enjekte eder |
| \`user-prompt\` | UserPromptSubmit | Tur sayacı, koç uyarıları, kalp atışı damgası |
| \`pre-edit\` | PreToolUse Edit/Write | Test dosyası ve korumalı yol → **deny** |
| \`post-edit\` | PostToolUse Edit/Write | Desen bulursa **block** ve ihlali deftere yazar |
| \`pre-bash\` | PreToolUse Bash | Yıkıcı komut → **deny**; doğrulanmamış paket → **deny**; korumalı yola yönlendirme → **deny** |
| \`post-bash\` | PostToolUse Bash | Test ve commit damgası; kabuk üzerinden yazılan dosyaları tarar |
| \`stop-gate\` | Stop | Açık ihlal, doğrulanmamış kod ya da aşırı diff → **block** |
| \`session-end\` | SessionEnd | Ölçüm tabanlı oturum özeti |

Sert durdurma garantisi \`pre-edit\` ve \`stop-gate\`'tedir. \`post-edit\`'in bloğu
modele iletilir ama modeli durdurmaz — bu ölçüldü, \`docs/dogrulama-kaydi.md\`.
Bu yüzden \`post-edit\` bulduğu ihlali oturum defterine yazar ve kilit
\`stop-gate\`'te kurulur.

## Kurulum

\`\`\`bash
claude plugin marketplace add ${SLUG}
claude plugin install lenarise-slopguard@lenarise-slopguard -y
\`\`\`

Ardından \`/slop-setup\` ve Claude Code'u yeniden başlat. Doğrulamak için
\`/slop-doctor\`.

\`/slop-setup\` şunları yapar ve **var olan hiçbir dosyayı ezmez**: yapılandırma
dosyalarını yalnızca yoksa oluşturur, durum çubuğunu kaydeder ve sessiz ölüm
koruması kuralını \`~/.claude/CLAUDE.md\` dosyasına ekler. Kural işaretçiler
arasına yazılır; dosyanın geri kalanına dokunulmaz ve blok silinerek temiz
kaldırılabilir. İstemiyorsan: \`/slop-setup --skip-claude-md\`.

Bu kural neden otomatik: plugin öldüğünde çalışan tek katman odur — hook'lar
kayıtlı değilse "çalışıyor musun?" diye soracak hook da yoktur. Ayrıca durum
çubuğu her ortamda görünmez (desktop uygulamasının Code sekmesi statusLine
render etmiyor), yani bazı kullanıcılar için sessiz ölümü yakalayan başka
mekanizma kalmaz.

| İş | Komut |
|---|---|
| Güncelle | \`claude plugin update lenarise-slopguard@lenarise-slopguard\` |
| Geçici kapat | \`claude plugin disable lenarise-slopguard\` — yapılandırma korunur |
| Kaldır | \`claude plugin uninstall lenarise-slopguard\` |

Güncelleme \`~/.claude/lenarise-slopguard/\` içindeki hiçbir dosyaya dokunmaz.

## Oturumda ne olur

\`\`\`
oturum açılır
  └─ session-start: kural seti + yetenek indeksi   → durum: HAZIR
sen yazarsın
  └─ user-prompt: tur++ , kalp atışı damgası        → durum: CANLI
      └─ eşik aşıldıysa sohbete uyarı
Claude dosya yazmak ister
  ├─ pre-edit  → test dosyası / .env / lockfile ise DENY
  └─ post-edit → desen bulunursa BLOCK, ihlal deftere yazılır
Claude komut çalıştırmak ister
  ├─ pre-bash  → rm -rf / DROP TABLE / force push ise DENY
  ├─ pre-bash  → paket kayıt defterinde yoksa DENY
  └─ post-bash → test ya da commit ise damga
Claude bitirmek ister
  └─ stop-gate → açık ihlal veya doğrulanmamış kod varsa BLOCK
oturum kapanır
  └─ session-end: N tur · M dosya · K satır · J engellenen slop
\`\`\`

## Yapılandırma referansı

Bütün düzenleme \`~/.claude/lenarise-slopguard/\` içinde yapılır. Plugin
dizinini düzenleme: güncelleme siler.

| Dosya | İçerik |
|---|---|
| \`config.json\` | kip, eşikler, kapatılan desenler, güvenilen paketler, görünürlük |
| \`patterns.local.json\` | kendi desenlerin |
| \`rules.local.md\` | serbest metin kuralların; her oturum başında enjekte edilir |
| \`<repo>/.slopignore\` | proje bazlı yol muafiyeti |

Birleştirme sırası: plugin varsayılanları → \`config.json\` → \`patterns.local.json\`
→ repo \`.slopignore\` → oturum kipi.

### config.json

${configSchema()}

### patterns.local.json

\`\`\`json
{
  "patterns": [
    {
      "key": "benzersiz-kisa-ad",
      "id": "KOD-03",
      "scope": "code",
      "severity": "warn",
      "match": "TODO\\\\s*\\\\(acil\\\\)",
      "flags": "gi",
      "detects": "Ne yakaladığı, tek cümle.",
      "fix": "Ne yapılması gerektiği, tek cümle."
    }
  ]
}
\`\`\`

\`scope\` değerleri: \`code\` (kaynak dosya) · \`prose\` (metin dosyası) ·
\`path\` (dosya yolu) · \`command\` (kabuk komutu). \`match\` bir JSON dizesidir,
yani ters bölüler iki kez kaçışlanır. Yazdıktan sonra \`/slop-doctor\` ile
desen sayısının arttığını doğrula.

### Desen kataloğu

${patternCatalogue()}

Devre dışı bırakma üç düzeyde çalışır: kategori (\`GUV\`), taksonomi ID'si
(\`GUV-03\`) ya da tekil desen anahtarı (\`guv-03-aws-key\`).

${NEW_IDS.length > 0 ? `\`${NEW_IDS.join('`, `')}\` kaynak taksonomide yoktu; bu proje ekledi.` : ''}

### Satır içi muafiyet

\`\`\`js
// slop-guard-ignore KOD-05: üçüncü parti SDK burada throw ediyor
\`\`\`

Üç koşul birden aranır: yönerge bulgunun satırında ya da tam üstünde olacak,
hangi deseni susturduğunu adlandıracak, gerekçe yazacak. Biri eksikse
susturmaz ve neden reddedildiği bulguya iliştirilir. Kullanılan muafiyetler
sayılır ve oturum özetinde raporlanır.

### Komutlar

| Komut | Ne yapar |
|---|---|
| \`/slop-setup\` | Yapılandırmayı oluşturur, durum çubuğunu kaydeder. Var olanı ezmez |
| \`/slop-status\` | Oturum sayaçları **ve** canlı tarama; hook kaydına güvenmez |
| \`/slop-check [yol]\` | Talep üzerine tarama |
| \`/slop-doctor\` | Kurulum teşhisi; her satır ✅ ya da ❌ |
| \`/slop-config\` | Ayarları değiştirir |
| \`/slop-mode strict\\|explore\` | Oturum kipi; kalıcı yapılandırmaya dokunmaz |
| \`/slop-repo-init\` | Repoya agent-agnostic koruma kurar |

### Durum çubuğu

\`canlı\` demek için iki ayrı kanıt gerekir: kalp atışı damgasının bu oturumun
kimliğini taşıması (kayıt) ve \`pre-edit\`'in sentetik yüke doğru cevap vermesi
(çalışabilirlik). Belirsizlik \`canlı\` diye yuvarlanmaz.

| Gösterim | Anlamı |
|---|---|
| \`SlopGuard hazır\` | Kurulu ve cevap veriyor, ama bu oturumda henüz tetiklenmedi |
| \`SlopGuard canlı · …\` | İki kanıt da var |
| \`SlopGuard ⚠️ kayıtsız\` | Mesaj atıldı ama hook tetiklenmedi |
| \`SlopGuard ⚠️ bozuk\` | Script probe'a cevap vermiyor |
| \`SlopGuard kapalı\` | \`enabled: false\` |

## AI için: kullanıcıya nasıl yardım edersin

Bu bölüm herhangi bir oturumdaki AI'ın okuyup işlem yapabilmesi için.

### Niyet → eylem

| Kullanıcı ne der | Ne anlama gelir | Ne yap |
|---|---|---|
| "bu uyarı sürekli çıkıyor" | desen gürültülü | \`config.json\` → \`disabled\` listesine ID ekle |
| "çok fazla blokluyor" | sert kip ağır | Önce hangi ID'ler tetikleniyor göster, sonra hedefli kapat |
| "prototip yapıyorum" | geçici gevşetme | \`/slop-mode explore\` — kalıcı config'e dokunma |
| "test dosyalarına yazabilmeli" | TST kilidi engel | \`allowTestWrites: true\`; gerekçesini sor |
| "şu paketi hep engelliyor" | paket kapısı | Paketi doğrula, sonra \`trustedPackages\`'a ekle |
| "diff sınırı küçük" | eşik dar | \`thresholds.maxDiffLines\` |
| "şunu da yakalasın" | yeni desen | \`patterns.local.json\`; önce dene |
| "kendi kuralımı ekle" | kişisel kural | \`rules.local.md\`, kısa tut |
| "bu repoda hiç çalışmasın" | proje muafiyeti | Repo kökünde \`.slopignore\` |
| "ne durumdayım" | görünürlük | \`/slop-status\` |

### Güvenli ve güvensiz düzenlemeler

| Güvenli | Güvensiz |
|---|---|
| \`~/.claude/lenarise-slopguard/\` altındaki dosyalar | Plugin cache'i — güncelleme siler |
| Tek desen ya da tek ID kapatmak | Kategori kapatmak, özellikle GUV |
| \`/slop-mode explore\` (oturumluk) | \`config.json\` → \`mode: "explore"\` (kalıcı) |
| Eşiği ölçüye dayanarak değiştirmek | Eşiği "rahatsız ediyor" diye kaldırmak |
| Gerekçeli satır içi muafiyet | \`.slopignore\`'a geniş glob yazmak |

Bir deseni kapatırken **neyi kaybettiğini söyle**. GUV kapatmayı kendiliğinden
önerme; kullanıcı açıkça isterse yap ve riski yaz.

### Düzenleme sonrası doğrulama

\`\`\`bash
jq -e . ~/.claude/lenarise-slopguard/config.json      # JSON geçerli mi
\`\`\`

Sonra \`/slop-doctor\` çalıştır ve desen sayısının beklediğin gibi olduğunu
doğrula. \`config.json\`, \`patterns.local.json\` ve \`.slopignore\` anında geçerli
olur; \`hooks.json\` ve manifest değişiklikleri yeniden başlatma ister.

## Sorun giderme

| Belirti | Muhtemel sebep | Ne yap |
|---|---|---|
| Çubuk \`⚠️ kayıtsız\` | Hook kaydolmamış | Claude Code'u yeniden başlat, sonra \`/slop-doctor\` |
| Çubuk \`⚠️ bozuk\` | \`node\` yolu ya da dosya izni | \`/slop-doctor\` ❌ satırlarını izle |
| Çubuk hiç yok | \`statusLine\` kayıtlı değil | \`/slop-setup\` |
| Hiçbir şey engellenmiyor | Plugin devre dışı ya da \`enabled: false\` | \`claude plugin list\`, sonra \`/slop-doctor\` |
| Testi olmayan repoda kilitleniyor | Kod yazıldı, test yok, kapı bekliyor | \`allowTestWrites: true\` ya da \`/slop-mode explore\` |
| Paket kurulumu hep engelleniyor | Ağ yok; kapı fail-closed | Paketi doğrula, \`trustedPackages\`'a ekle |
| \`plugin update\` "not found" diyor | Komut marketplace nitelikli ad ister | \`claude plugin update lenarise-slopguard@lenarise-slopguard\` |
| Kurulumdan sonra hiçbir şey olmuyor | Hook'lar oturum başında yüklenir | Claude Code'u yeniden başlat |

## Bilinen sınırlar

Gizlenmiyor:

- Regex taraması yanlış pozitif üretir. Kaçış yolu gerekçeli satır içi muafiyet.
- Guard-and-Go (KOD-04) regex'le tam yakalanamaz; sezgisel.
- Repo geneli duplikasyon (KOD-01) tek dosyaya bakan tarayıcıda görünmez; CI katmanında jscpd.
- İş mantığı hataları (MTK) mekanik olarak yakalanamaz; yalnızca kural metniyle taşınır.
- \`post-edit\` bloğu modeli durdurmaz; garanti \`stop-gate\`'te.
- Bash üzerinden yazma **kısmen** kapsanır. Hedefi komutun kendisinde açıkça
  görünen biçimler ayrıştırılır — \`>\`, \`>>\`, \`tee\`, \`sed -i\`, \`cp\`, \`mv\`,
  \`touch\` — ve bu dosyalar hem korumalı yol kilidinden geçer hem içerikleri
  taranır. Hedefi komuttan okunamayan yazmalar (\`make\`, \`npm run build\`, keyfi
  script'ler) görünmez. \`/slop-check\`, \`/slop-status\`, pre-commit hook'u ve CI
  canlı tarama yaptığı için o boşluğu kapatır.
- Paket doğrulaması ağ ister ve zaman aşımında engelleyerek kapanır.

## Kaldırma

\`\`\`bash
claude plugin uninstall lenarise-slopguard
claude plugin marketplace remove lenarise-slopguard
\`\`\`

\`~/.claude/settings.json\` içindeki \`statusLine\` girdisini ve
\`~/.claude/lenarise-slopguard/\` dizinini elle sil. \`/slop-setup\` yedek
bıraktıysa \`settings.json.slopguard-yedek\` dosyası oradadır.
`);

// ── CLAUDE.md — bu repoda çalışan agent'a ────────────────────────────────

emit('CLAUDE.md',
`# LenaRise.SlopGuard deposunda çalışırken

ÜRETİLEN DOSYA. Elle düzenleme; kaynağı \`scripts/gen-docs.mjs\`.

Bu depo bir slop koruma aracıdır. Slop'a karşı bir araç, kendi kurallarını
ihlal ederek yazılamaz — buradaki maddeler temenni değil, bağlayıcı.

## Bağlayıcı taahhütler

| Taahhüt | Kategori |
|---|---|
| Sıfır runtime bağımlılığı — yalnızca Node stdlib | GUV-02 |
| Desen tanımı tek kaynakta (\`lib/patterns.mjs\`); hook, skill, semgrep ve README ondan türer | KOD-01 |
| Doküman koddan üretilir (\`npm run docs\`), elle senkron tutulmaz | DOK-07 |
| Boş \`catch\` yok — hata \`stderr\`'e yazılır, sessizce yutulmaz | KOD-05 |
| Hook testleri gerçek stdin yüküyle çalışır; test gevşetilerek geçilmez | TST-01 · TST-02 |
| "Çalışıyor" denmeden önce komut çıktısı gösterilir | TST-05 |
| Başlıklarda emoji yok, buzzword yok | DOK-04 · DOK-01 |
| Süre tahmini verilmez; kapsam dosya, adım ve bilinmeyen sayısıyla ifade edilir | SUR-08 |
| Her adımda commit; tek dev commit yok | AGT-06 · SUR-02 |
| Kendi kendini tarama: kaynak kendi tarayıcısından geçer | tümü |

Son madde en sertidir: kendi tarayıcımız kendi kodumuzu reddediyorsa ya desen
yanlıştır ya kod. İkisinden biri düzeltilir, **muafiyet yazılmaz**. Kural iki
yönlü işler — takılması gerekirken takılmıyorsa desen genişletilir.

## Değişiklikten önce

\`\`\`bash
npm test          # ${PATTERN_COUNT} desen, boru testleri dahil
npm run selfscan  # kendi kaynağımız kendi tarayıcımızdan
npm run docs      # üretilen dokümanı tazele
\`\`\`

\`npm run docs -- --check\` üretilen dosya bayatsa 1 ile çıkar; CI kapısı budur.

## Mimarinin dayandığı ölçümler

Bu depodaki tasarım kararları tahmine değil ölçüme dayanır. Hepsi
\`docs/dogrulama-kaydi.md\` içinde, tekrar çalıştırılabilir biçimde:

- Hook'lar bypass permissions kipinde çalışır; \`PreToolUse\` deny aracı
  gerçekten durdurur, \`Stop\` block turu bitirtmez.
- \`PostToolUse\` block modele iletilir ama modeli durdurmaz. Sert garanti
  bu yüzden \`stop-gate\`'tedir.
- \`PostToolUse\` başarısız Bash komutunda hiç tetiklenmez; \`tool_response\`
  çıkış kodu taşımaz. "Test geçti" bilgisi tetiklenmenin varlığından gelir.
- \`statusLine\` stdin'de \`session_id\` alır ve bu hook'ların gördüğüyle aynıdır.
- \`process.exit()\` bekleyen stdout yazmasını beklemez; boru tamponunu aşan
  çıktı kesilir. Hook'lar \`exitWhenFlushed()\` kullanır.

Yeni bir platform davranışına dayanacaksan önce ölç, sonra yaz. Ölçtüğünü
\`docs/dogrulama-kaydi.md\`'ye ekle.

## Dizin haritası

| Yol | İçerik |
|---|---|
| \`lib/patterns.mjs\` | Desen defteri — tek kaynak |
| \`lib/scan.mjs\` · \`lib/ignore.mjs\` | Eşleştirme motoru ve muafiyet politikası |
| \`lib/config.mjs\` · \`lib/session.mjs\` · \`lib/coach.mjs\` | Yapılandırma, oturum durumu, eşikler |
| \`lib/hook.mjs\` · \`lib/report.mjs\` · \`lib/heartbeat.mjs\` | Hook koşucusu, çıktı sözleşmesi, canlılık |
| \`hooks/\` | Sekiz hook + \`hooks.json\` |
| \`bin/statusline.mjs\` | Durum çubuğu; plugin ölse bile çalışır |
| \`scripts/\` | Komut script'leri, tarayıcı CLI'ları, doküman üreteci |
| \`test/\` | ${'`node --test`'}; boru testleri gerçek süreçte çalışır |
`);

// ── skill içindeki üretilen bölümler ─────────────────────────────────────

const skillFile = join(ROOT, 'skills/slop-config/SKILL.md');
if (existsSync(skillFile)) {
  let skill = readFileSync(skillFile, 'utf8');
  const inject = (name, body) => {
    const re = new RegExp(`(<!-- ÜRETİLEN: ${name} -->)[\\s\\S]*?(<!-- /ÜRETİLEN: ${name} -->)`);
    if (!re.test(skill)) {
      process.stderr.write(`gen-docs: SKILL.md içinde "${name}" işaretçisi yok\n`);
      return;
    }
    skill = skill.replace(re, `$1\n${body}\n$2`);
  };
  inject('config-şeması', configSchema());
  inject('desen-kataloğu', patternCatalogue());
  emit('skills/slop-config/SKILL.md', skill);
}

// ── Sonuç ────────────────────────────────────────────────────────────────

if (CHECK) {
  if (stale.length === 0) {
    process.stdout.write('Üretilen doküman güncel.\n');
    process.exit(0);
  }
  process.stdout.write(`Üretilen doküman bayat (${stale.length}):\n`);
  for (const rel of stale) process.stdout.write(`  ${rel}\n`);
  process.stdout.write('\nTazelemek için: npm run docs\n');
  process.exit(1);
}

process.stdout.write(written.length === 0
  ? 'Doküman zaten güncel.\n'
  : `${written.length} dosya üretildi:\n${written.map((r) => `  ${r}`).join('\n')}\n`);
