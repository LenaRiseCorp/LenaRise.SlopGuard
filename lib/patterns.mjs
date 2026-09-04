
/**
 * Desen defteri — TEK KAYNAK.
 *
 * Hook'lar, /slop-check, semgrep şablonu ve README bu dosyadan türer; hiçbiri
 * kendi kopyasını tutmaz (KOD-01). Bir deseni değiştirmek için tek yer burasıdır.
 *
 * Taksonomi docs/ai-slop-rehberi.html içindeki 62 kanonik ID'dir. Her ID'nin
 * mekanik karşılığı yoktur — INS kategorisi tamamen insan katmanında ölçülür,
 * bazı ID'ler yalnızca kural metniyle taşınır. Karşılığı olmayan bir ID'yi
 * uydurma regex'e bağlamak, yakalıyormuş gibi görünüp yakalamamak olurdu.
 */

/** Kategori kodu → görünen ad ve hangi katmanda zorlandığı. */
export const CATEGORIES = {
  KOD: { name: 'Kod kalitesi',       layer: 'makine', enforcement: 'güçlü' },
  MTK: { name: 'Mantık ve doğruluk', layer: 'makine', enforcement: 'kısmî' },
  TST: { name: 'Test ve doğrulama',  layer: 'makine', enforcement: 'en güçlü' },
  GUV: { name: 'Güvenlik',           layer: 'makine', enforcement: 'güçlü' },
  AGT: { name: 'Agent operasyonu',   layer: 'makine', enforcement: 'güçlü' },
  SUR: { name: 'Süreç ve ekip',      layer: 'makine', enforcement: 'orta' },
  DOK: { name: 'Kod dışı çıktı',     layer: 'makine', enforcement: 'orta' },
  INS: { name: 'İnsan tarafı',       layer: 'koç',    enforcement: 'ölçüm + uyarı' },
};

/** 62 kanonik ID. Kaynak: docs/ai-slop-rehberi.html. */
export const TAXONOMY = [
  ['KOD-01', 'Kopyala-yapıştır çoğalması'],
  ['KOD-02', 'Aşırı soyutlama ve şişkinlik'],
  ['KOD-03', 'Ölü kod birikimi'],
  ['KOD-04', 'Guard-and-Go: silmek yerine sarmalamak'],
  ['KOD-05', 'Hata bastırma ve sessiz başarısızlık'],
  ['KOD-06', 'Gömülü sabitler ve sihirli sayılar'],
  ['KOD-07', 'Mimari sapma ve stil tutarsızlığı'],
  ['KOD-08', 'Mevcut çözümün yeniden icadı'],
  ['KOD-09', 'Yorumların ve bağlamın sessizce silinmesi'],
  ['MTK-01', 'Halüsine API, fonksiyon ve parametre'],
  ['MTK-02', 'Var olmayan paket önerisi'],
  ['MTK-03', 'İş kuralı sapması'],
  ['MTK-04', 'Varsayım yayılması'],
  ['MTK-05', 'Zincirleme hata'],
  ['MTK-06', 'Durum (state) yönetimi hataları'],
  ['MTK-07', 'Şema ve veri hataları'],
  ['MTK-08', 'Arayüz ve uzamsal talimat uyumsuzluğu'],
  ['MTK-09', 'Sessiz kapsam kayması'],
  ['TST-01', 'Testi silmek veya zayıflatmak'],
  ['TST-02', 'Ödül avcılığı (reward hacking)'],
  ['TST-03', 'Sahte implementasyon'],
  ['TST-04', 'Totolojik test'],
  ['TST-05', 'Çalıştırmadan bitti demek'],
  ['TST-06', 'Yalnızca mutlu yol testi'],
  ['TST-07', 'Mock un gerçek entegrasyonun yerine geçmesi'],
  ['GUV-01', 'Güvensiz varsayılanı seçmek'],
  ['GUV-02', 'Slopsquatting: hayalî paketin ele geçirilmesi'],
  ['GUV-03', 'Gömülü sırlar ve uydurma kimlik bilgileri'],
  ['GUV-04', 'Eksik yetkilendirme ve rol ayrımı'],
  ['GUV-05', 'Girdi doğrulama eksikliği'],
  ['GUV-06', 'Prompt injection: veriyi talimat sanmak'],
  ['GUV-07', 'İteratif güvenlik erozyonu'],
  ['GUV-08', 'Korumasız altyapı ve veri saklama'],
  ['AGT-01', 'Bağlam çürümesi (context rot)'],
  ['AGT-02', 'Yetersiz veya aşırı bağlam'],
  ['AGT-03', 'Onaylayıcılık (sycophancy)'],
  ['AGT-04', 'Durdurma koşulu vermemek'],
  ['AGT-05', 'Gereğinden fazla yetki'],
  ['AGT-06', 'Kontrol noktası olmadan çalışmak'],
  ['AGT-07', 'Paralel agent çakışması'],
  ['AGT-08', 'Kısır döngüler'],
  ['AGT-09', 'Talimatın sessizce ihlali'],
  ['SUR-01', 'Gözden geçirilmemiş PR göndermek'],
  ['SUR-02', 'Gözden geçirilemez boyutta diffler'],
  ['SUR-03', 'Review darboğazı'],
  ['SUR-04', 'Kalite kapılarının hacim altında ezilmesi'],
  ['SUR-05', 'Slop hata ve güvenlik raporları'],
  ['SUR-06', 'Yükü aşağı akışa yıkmak'],
  ['SUR-07', 'Sahte ilerleme raporlaması'],
  ['SUR-08', 'Temelsiz efor ve süre tahmini'],
  ['DOK-01', 'Şişkin, buzzword dolu doküman'],
  ['DOK-02', 'Kodu yansıtmayan yorum satırı'],
  ['DOK-03', 'İçi boş commit mesajı ve PR açıklaması'],
  ['DOK-04', 'Emoji ve başlık enflasyonu'],
  ['DOK-05', 'Uydurma issue ve açık raporu'],
  ['DOK-06', 'Üretilmiş changelog ve sürüm notu'],
  ['DOK-07', 'Doküman-kod ayrışması'],
  ['INS-01', 'Kavrayış borcu'],
  ['INS-02', 'Verimlilik illüzyonu'],
  ['INS-03', 'Beceri erozyonu'],
  ['INS-04', 'Aşırı güven'],
  ['INS-05', 'Kalıcı junior tuzağı'],
  ['INS-06', 'Sahiplik kaybı'],
].map(([id, title]) => ({ id, category: id.slice(0, 3), title }));

/**
 * SUR-08 taksonomide yoktu; rehber SUR-07 de bitiyor. Bu proje onu ekliyor:
 * "2 saat sürer" doğrulanamayan, hoşa gittiği için üretilen bir çıktıdır ve
 * yanlış olduğunu keşfetme maliyeti ona göre plan yapana kalır.
 */
export const NEW_IDS = ['SUR-08'];

const byId = new Map(TAXONOMY.map((t) => [t.id, t]));

/** Bir ID nin kanonik başlığı. Bilinmeyen ID sessizce geçmez — çağıran hata alır. */
export function titleOf(id) {
  const t = byId.get(id);
  if (!t) throw new Error(`patterns: taksonomide olmayan ID: ${id}`);
  return t.title;
}

/** prose desenleri yalnızca bu uzantılarda çalışır. */
export const PROSE_EXTENSIONS = ['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc'];

/** code desenleri bu uzantılarda çalışır. Liste dışı uzantı taranmaz — sessizce değil, bilerek. */
export const CODE_EXTENSIONS = [
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.cs',
  '.php', '.c', '.h', '.cc', '.cpp', '.hpp', '.scala', '.sh', '.bash', '.zsh',
  '.sql', '.vue', '.svelte',
];

/** Test dosyası sayılan yollar — TST kilidi bunları kullanır. */
export const TEST_PATH_PATTERNS = [
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /(^|\/)spec\//,
  /\.test\.[A-Za-z]+$/i,
  /\.spec\.[A-Za-z]+$/i,
  /(^|\/)test_[^/]+\.py$/,
  /[^/]+_test\.(?:py|go|rb)$/,
  /(^|\/)conftest\.py$/,
];

/** Yazılması varsayılan olarak yasak yollar — kaza eseri değil, bilerek dokunulur. */
export const PROTECTED_PATH_PATTERNS = [
  { re: /(^|\/)\.env(?:\.|$)/,               why: 'ortam sırları' },
  { re: /(^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|poetry\.lock|Cargo\.lock|Gemfile\.lock|uv\.lock)$/, why: 'bağımlılık kilidi' },
  { re: /(^|\/)\.github\/workflows\//,        why: 'CI yapılandırması' },
  { re: /(^|\/)\.git\//,                      why: 'git iç dizini' },
  { re: /(^|\/)(?:\.npmrc|\.pypirc|\.netrc)$/, why: 'paket deposu kimlik bilgisi' },
  { re: /(^|\/)id_(?:rsa|ed25519|ecdsa)$/,    why: 'özel anahtar' },
];

/**
 * Mekanik desenler.
 *
 * scope:
 *   code    — kaynak dosya içeriği
 *   prose   — markdown/metin içeriği; eşleştirmeden önce kod blokları ve backtick
 *             ayıklanır, çünkü bir buzzword ü backtick içinde anmak onu kullanmak değildir
 *   path    — dosya yolu (yazmadan önce)
 *   command — kabuk komutu (çalıştırmadan önce)
 *
 * severity:
 *   block   — sert kipte durdurur, keşif kipinde uyarır
 *   warn    — her kipte yalnızca uyarır
 */
export const PATTERNS = [
  {
    key: 'kod-04-guard-and-go', id: 'KOD-04', scope: 'code', severity: 'warn',
    match: /\bif\s*\(\s*(?:false|0)\s*\)|\bif\s+False\s*:/g,
    detects: 'Ölü dala alınmış kod — silmek yerine sarmalanmış.',
    fix: 'Kodu sil. Geri lazım olursa git geçmişinde duruyor.',
  },
  {
    key: 'kod-05-empty-catch', id: 'KOD-05', scope: 'code', severity: 'block',
    match: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g,
    detects: 'Boş catch gövdesi — hata yakalanıp yutuluyor.',
    fix: 'Hatayı logla, yeniden fırlat ya da açıkça ele al.',
  },
  {
    key: 'kod-05-comment-only-catch', id: 'KOD-05', scope: 'code', severity: 'block',
    // Yorumdan ibaret gövde de boş gövdedir: hata yine yutuluyor, üstelik
    // "bilerek yaptım" görüntüsüyle. Gerekçe yorumu hatayı ele almaz.
    match: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\s*|\/\*(?:[^*]|\*(?!\/)){0,400}\*\/\s*)+\}/g,
    detects: 'Yalnızca yorum içeren catch gövdesi — hata yine yutuluyor.',
    fix: 'Hatayı logla ya da yeniden fırlat. Gerekçe yorumu ele alma yerine geçmez.',
  },
  {
    key: 'kod-05-except-pass', id: 'KOD-05', scope: 'code', severity: 'block',
    match: /^[ \t]*except\b[^\n:]*:[ \t]*(?:\n[ \t]+)?pass[ \t]*$/gm,
    detects: 'except: pass — istisna sessizce yutuluyor.',
    fix: 'Hatayı logla ya da yeniden fırlat.',
  },
  {
    key: 'kod-05-catch-noop', id: 'KOD-05', scope: 'code', severity: 'block',
    match: /\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{\s*\}\s*\)/g,
    detects: 'Boş .catch() — reddedilen promise sessizce yutuluyor.',
    fix: 'Hatayı logla ya da yukarı taşı.',
  },
  {
    key: 'kod-01-versioned-filename', id: 'KOD-01', scope: 'path', severity: 'block',
    match: /(^|\/)[^/]*[._-](?:v\d+|new|old|copy|backup|final)\.[A-Za-z0-9]+$/i,
    detects: 'Sürüm ekli dosya adı — eskisinin yanına yenisi yazılıyor.',
    fix: 'Mevcut dosyayı düzenle. Sürümleme git in işi.',
  },
  {
    key: 'tst-04-tautological-assert', id: 'TST-04', scope: 'code', severity: 'block',
    match: /\bassert\s+True\b|\bassert\s*\(\s*(?:true|True|1)\s*\)|expect\(\s*true\s*\)\s*\.\s*toBe\(\s*true\s*\)|assert\.ok\(\s*true\s*\)/g,
    detects: 'Her koşulda geçen totolojik iddia — hiçbir şey doğrulamıyor.',
    fix: 'Gerçek davranışı iddia et ya da testi sil.',
  },
  {
    key: 'tst-01-skipped-test', id: 'TST-01', scope: 'code', severity: 'block',
    match: /\b(?:it|test|describe|context)\s*\.\s*skip\s*\(|\bx(?:it|describe)\s*\(|@pytest\.mark\.skip|\bt\.Skip\(/g,
    detects: 'Atlanan test — kırmızıyı yeşile çevirmenin en kısa yolu.',
    fix: 'Testi düzelt ya da neden atlandığını gerekçesiyle yaz.',
  },
  {
    key: 'tst-03-fake-impl', id: 'TST-03', scope: 'code', severity: 'warn',
    match: /\braise\s+NotImplementedError\b|throw\s+new\s+\w*Error\(\s*['"`]Not implemented/gi,
    detects: 'Sahte implementasyon — imza var, gövde yok.',
    fix: 'Gövdeyi yaz ya da fonksiyonu henüz ekleme.',
  },
  {
    key: 'guv-03-inline-secret', id: 'GUV-03', scope: 'code', severity: 'block',
    // Ad kalıbı iki biçimde gelir: tek kelime (password) ve bileşik
    // (secret_key, access-token). İkincisi ilk sürümde kaçıyordu.
    match: /\b(?:(?:api|access|secret|auth|private|encryption|refresh)[_-]?(?:key|token|secret)|api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][A-Za-z0-9_\-./+]{16,}['"]/gi,
    detects: 'Kaynak koda gömülü sır.',
    fix: 'Ortam değişkenine taşı; değer sızdıysa döndür.',
  },
  {
    key: 'guv-03-aws-key', id: 'GUV-03', scope: 'code', severity: 'block',
    match: /\bAKIA[0-9A-Z]{16}\b/g,
    detects: 'AWS erişim anahtarı kimliği.',
    fix: 'Anahtarı hemen iptal et ve ortam değişkenine taşı.',
  },
  {
    key: 'guv-03-private-key', id: 'GUV-03', scope: 'code', severity: 'block',
    match: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g,
    detects: 'Gömülü özel anahtar.',
    fix: 'Anahtarı dosyadan çıkar, gizli depoya taşı, döndür.',
  },
  {
    key: 'guv-05-sql-concat', id: 'GUV-05', scope: 'code', severity: 'block',
    match: /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^\n;'"]{0,120}['"]\s*(?:\+|\.|%)\s*[A-Za-z_$]/gi,
    detects: 'SQL sorgusunun dize birleştirmeyle kurulması — enjeksiyon yüzeyi.',
    fix: 'Parametreli sorgu kullan.',
  },
  {
    key: 'guv-05-sql-fstring', id: 'GUV-05', scope: 'code', severity: 'block',
    match: /f['"][^'"\n]*\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^'"\n]*\{/gi,
    detects: 'f-string ile kurulan SQL — enjeksiyon yüzeyi.',
    fix: 'Parametreli sorgu kullan.',
  },
  {
    key: 'guv-01-eval', id: 'GUV-01', scope: 'code', severity: 'block',
    match: /(?<![.\w])eval\s*\(|(?<![.\w])exec\s*\(\s*[A-Za-z_$][\w$]*\s*[,)]/g,
    detects: 'Dinamik kod yürütme.',
    fix: 'Veriyi ayrıştır, yürütme. JSON için JSON.parse kullan.',
  },
  {
    key: 'agt-05-rm-recursive-force', id: 'AGT-05', scope: 'command', severity: 'block',
    match: /\brm\b(?=[^\n;|&]*(?:-[A-Za-z]*r[A-Za-z]*f|-[A-Za-z]*f[A-Za-z]*r|--recursive[^\n;|&]*--force|--force[^\n;|&]*--recursive))/g,
    detects: 'Özyinelemeli zorlamalı silme — geri dönüşü yok.',
    fix: 'Silinecek yolu tek tek adlandır ya da çöpe taşı.',
  },
  {
    key: 'agt-05-git-force-push', id: 'AGT-05', scope: 'command', severity: 'block',
    match: /\bgit\s+push\b[^\n;|&]*(?:--force(?!-with-lease)|(?:^|\s)-f(?=\s|$))/g,
    detects: 'Zorlamalı push — başkasının işini siler.',
    fix: '--force-with-lease kullan, ya da rebase yerine merge et.',
  },
  {
    key: 'agt-05-git-reset-hard', id: 'AGT-05', scope: 'command', severity: 'block',
    match: /\bgit\s+reset\s+--hard\b/g,
    detects: 'Commit edilmemiş çalışma sert sıfırlanıyor.',
    fix: 'Önce git stash ile yedekle.',
  },
  {
    key: 'agt-05-chmod-777', id: 'AGT-05', scope: 'command', severity: 'block',
    match: /\bchmod\s+(?:-R\s+)?0?777\b/g,
    detects: 'Herkese yazma izni.',
    fix: 'Gereken en dar izni ver (örn. 640 / 750).',
  },
  {
    key: 'agt-05-sql-destructive', id: 'AGT-05', scope: 'command', severity: 'block',
    match: /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/gi,
    detects: 'Yıkıcı şema komutu.',
    fix: 'Migration olarak yaz, gözden geçirilsin.',
  },
  {
    key: 'agt-05-delete-without-where', id: 'AGT-05', scope: 'command', severity: 'block',
    match: /\bDELETE\s+FROM\s+[\w."`]+\s*(?:;|$)/gi,
    detects: 'WHERE siz DELETE — tablonun tamamını siler.',
    fix: 'WHERE koşulu ekle.',
  },
  {
    key: 'dok-04-emoji-heading', id: 'DOK-04', scope: 'prose', severity: 'warn',
    match: /^#{1,6}\s+\p{Extended_Pictographic}/gmu,
    detects: 'Emoji ile başlayan başlık.',
    fix: 'Başlığı kelimeyle yaz.',
  },
  {
    key: 'dok-01-buzzword', id: 'DOK-01', scope: 'prose', severity: 'warn',
    match: /\b(?:robust and flexible|seamlessly|cutting[- ]edge|state[- ]of[- ]the[- ]art|leverage the power|güçlü ve esnek|sorunsuzca entegre)\b/gi,
    detects: 'İçerik taşımayan pazarlama dili.',
    fix: 'Ne yaptığını somut yaz.',
  },
  {
    key: 'sur-08-effort-estimate', id: 'SUR-08', scope: 'prose', severity: 'block',
    // İki yönlü: işaret önce gelebilir ("tahminen 3 gün"), fiil sonda olabilir
    // ("3 gün sürer"). Birim listesinde dakika/saniye yok — efor tahminleri
    // saat/gün/hafta cinsindendir; dakika genelde ölçülmüş makine zamanıdır.
    match: /\b(?:tahmin\w*|yaklaşık|ETA|estimated?|estimates?|roughly|about)\b[^\n]{0,40}\b\d+[-–]?\d*\s*(?:saat|gün|hafta|ay\b|hours?|days?|weeks?|months?)|\b\d+[-–]?\d*\s*(?:saat|gün|hafta|hours?|days?|weeks?)\b[^\n]{0,25}\b(?:sürer|sürecek|sürüyor|alır|alacak|alıyor|takes|will take)\b/gi,
    detects: 'Ölçülemeyen süre tahmini.',
    fix: 'Kapsamı dosya, adım ve bilinmeyen sayısıyla ifade et.',
  },
  {
    key: 'mtk-02-package-install', id: 'MTK-02', scope: 'command', severity: 'block',
    gate: 'package-verification',
    match: /\b(?:npm\s+(?:i|install|add)|yarn\s+add|pnpm\s+(?:add|install)|bun\s+add|pip3?\s+install|uv\s+add|cargo\s+add|go\s+get)\s+(?![-.])/g,
    detects: 'Paket kurulumu — adı doğrulanmadan kurulursa slopsquatting yüzeyi (GUV-02).',
    fix: 'Paketin gerçekten var olduğunu ve adının doğru yazıldığını doğrula; güvendiklerini config.json trustedPackages listesine ekle.',
  },
  {
    key: 'dok-03-empty-commit-msg', id: 'DOK-03', scope: 'command', severity: 'warn',
    match: /\bgit\s+commit\b[^\n]*?-m\s*(['"])(?:update|fix|improve|changes?|wip|stuff|misc)(?:\s+(?:code|issues|stuff|things|bug))?\.?\1/gi,
    detects: 'İçi boş commit mesajı — neyin neden değiştiğini söylemiyor.',
    fix: 'Neyin neden değiştiğini yaz; gövdede gerekçeyi ver.',
  },
];

/** Belirli bir kapsamdaki desenler. */
export function patternsFor(scope) {
  return PATTERNS.filter((p) => p.scope === scope);
}

export const PATTERN_COUNT = PATTERNS.length;
