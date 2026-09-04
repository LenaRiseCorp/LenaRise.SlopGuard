# LenaRise.SlopGuard

ÜRETİLEN DOSYA. Elle düzenleme; kaynağı `lib/patterns.mjs`, `lib/config.mjs` ve
`scripts/gen-docs.mjs`. Yeniden üretmek için `npm run docs`.

Agentic geliştirmede üretilen çıktının kalitesini ve güvenliğini koruyan bir
Claude Code plugin'i. Kural metni niyeti taşır, hook sınırı koyar: modelin
atlayamayacağı yerde durur.

Sürüm 0.3.1 · 33 mekanik desen · 71 taksonomi girdisi · sıfır runtime bağımlılığı.

## Ne yapar

Üç katman, üç hedef kitle.

1. **Makine katmanı** — Claude Code hook'ları. Model bunları atlayamaz;
   harness çalıştırır.
2. **İnsan katmanı** — sohbete gelen ölçüm tabanlı uyarılar. Bloklamaz, uyarır.
3. **Repo katmanı** — git hook'u ve CI. Kodu hangi agent yazarsa yazsın çalışır.

| Kategori | ID sayısı | Mekanik desen | Zorlama |
|---|---|---|---|
| **KOD** Kod kalitesi | 9 | 6 | güçlü |
| **MTK** Mantık ve doğruluk | 9 | 1 | kısmî |
| **TST** Test ve doğrulama | 7 | 3 | en güçlü |
| **GUV** Güvenlik | 8 | 6 | güçlü |
| **AGT** Agent operasyonu | 9 | 6 | güçlü |
| **SUR** Süreç ve ekip | 8 | 1 | orta |
| **DOK** Kod dışı çıktı | 7 | 3 | orta |
| **INS** İnsan tarafı | 6 | yok — koç katmanı | ölçüm + uyarı |
| **OYN** Oyun geliştirme | 8 | 7 | alan bazlı |

### Hook davranışı

| Hook | Olay | Davranış |
|---|---|---|
| `session-start` | SessionStart | Kural seti ve yetenek indeksini modele enjekte eder |
| `user-prompt` | UserPromptSubmit | Tur sayacı, koç uyarıları, kalp atışı damgası |
| `pre-edit` | PreToolUse Edit/Write | Test dosyası ve korumalı yol → **deny** |
| `post-edit` | PostToolUse Edit/Write | Desen bulursa **block** ve ihlali deftere yazar |
| `pre-bash` | PreToolUse Bash | Yıkıcı komut → **deny**; doğrulanmamış paket → **deny**; korumalı yola yönlendirme → **deny** |
| `post-bash` | PostToolUse Bash | Test ve commit damgası; kabuk üzerinden yazılan dosyaları tarar |
| `stop-gate` | Stop | Açık ihlal, doğrulanmamış kod ya da aşırı diff → **block** |
| `session-end` | SessionEnd | Ölçüm tabanlı oturum özeti |

Sert durdurma garantisi `pre-edit` ve `stop-gate`'tedir. `post-edit`'in bloğu
modele iletilir ama modeli durdurmaz — bu ölçüldü, `docs/dogrulama-kaydi.md`.
Bu yüzden `post-edit` bulduğu ihlali oturum defterine yazar ve kilit
`stop-gate`'te kurulur.

## Kurulum

```bash
claude plugin marketplace add LenaRiseCorp/LenaRise.SlopGuard
claude plugin install lenarise-slopguard@lenarise-slopguard -y
```

Ardından `/slop-setup` ve Claude Code'u yeniden başlat. Doğrulamak için
`/slop-doctor`.

`/slop-setup` şunları yapar ve **var olan hiçbir dosyayı ezmez**: yapılandırma
dosyalarını yalnızca yoksa oluşturur, durum çubuğunu kaydeder ve sessiz ölüm
koruması kuralını `~/.claude/CLAUDE.md` dosyasına ekler. Kural işaretçiler
arasına yazılır; dosyanın geri kalanına dokunulmaz ve blok silinerek temiz
kaldırılabilir. İstemiyorsan: `/slop-setup --skip-claude-md`.

Bu kural neden otomatik: plugin öldüğünde çalışan tek katman odur — hook'lar
kayıtlı değilse "çalışıyor musun?" diye soracak hook da yoktur. Ayrıca durum
çubuğu her ortamda görünmez (desktop uygulamasının Code sekmesi statusLine
render etmiyor), yani bazı kullanıcılar için sessiz ölümü yakalayan başka
mekanizma kalmaz.

| İş | Komut |
|---|---|
| Güncelle | `claude plugin update lenarise-slopguard@lenarise-slopguard` |
| Geçici kapat | `claude plugin disable lenarise-slopguard` — yapılandırma korunur |
| Kaldır | `claude plugin uninstall lenarise-slopguard` |

Güncelleme `~/.claude/lenarise-slopguard/` içindeki hiçbir dosyaya dokunmaz.

## Oturumda ne olur

```
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
```

## Yapılandırma referansı

Bütün düzenleme `~/.claude/lenarise-slopguard/` içinde yapılır. Plugin
dizinini düzenleme: güncelleme siler.

| Dosya | İçerik |
|---|---|
| `config.json` | kip, eşikler, kapatılan desenler, güvenilen paketler, görünürlük |
| `patterns.local.json` | kendi desenlerin |
| `rules.local.md` | serbest metin kuralların; her oturum başında enjekte edilir |
| `<repo>/.slopignore` | proje bazlı yol muafiyeti |

Birleştirme sırası: plugin varsayılanları → `config.json` → `patterns.local.json`
→ repo `.slopignore` → oturum kipi.

### config.json

| Alan | Varsayılan | Ne yapar |
|---|---|---|
| `enabled` | `true` | `false` yapılırsa tüm koruma durur, çubuk "kapalı" gösterir |
| `mode` | `"strict"` | `strict` engeller, `explore` yalnızca uyarır (geri dönüşsüz komutlar hariç) |
| `disabled` | `[]` | Kategori (`GUV`), taksonomi ID (`GUV-03`) ya da desen anahtarı |
| `trustedPackages` | `[]` | Kayıt defterine sorulmadan geçen paket adları |
| `allowTestWrites` | `false` | `true` yapılırsa test dosyalarına yazma kilidi açılır (TST-01) |
| `thresholds.maxDiffLines` | `400` | Stop kapısı: son commit'ten beri değişen satır eşiği (SUR-02) |
| `thresholds.contextTurns` | `40` | Koç uyarısı: oturum tur eşiği (AGT-01) |
| `thresholds.contextUsedPercent` | `75` | Bağlam doluluk oranı eşiği; durum çubuğu ölçer (AGT-01) |
| `thresholds.comprehensionGap` | `500` | Koç uyarısı: yazılan eksi okunan satır farkı (INS-01) |
| `thresholds.uncommittedLines` | `300` | Koç uyarısı: commit'siz biriken satır (AGT-06) |
| `thresholds.consecutiveFixes` | `3` | Koç uyarısı: aynı dosyaya ardışık düzeltme (MTK-05) |
| `thresholds.packageCheckTimeoutMs` | `2500` | Paket kayıt defteri sorgusu; aşılırsa engeller (GUV-02) |
| `thresholds.maxStopBlocks` | `2` | Aynı gerekçeyle en fazla kaç kez bloklanır (AGT-08) |
| `ui.statusLine` | `"compact"` | `compact` · `minimal` · `off` |
| `ui.cleanScans` | `"silent"` | `silent` · `summary` — temiz taramada bildirim |
| `ui.heartbeat` | `true` | oturum başı tek satır onay |
| `ui.livenessCheck` | `"ask"` | `ask` · `warn` · `off` — plugin yanıt vermediğinde davranış |
| `ui.chatStatus` | `0` | `0` kapalı; `N` her N turda bir sohbete durum satırı. Durum çubuğunun görünmediği ortamlar için |

### patterns.local.json

```json
{
  "patterns": [
    {
      "key": "benzersiz-kisa-ad",
      "id": "KOD-03",
      "scope": "code",
      "severity": "warn",
      "match": "TODO\\s*\\(acil\\)",
      "flags": "gi",
      "detects": "Ne yakaladığı, tek cümle.",
      "fix": "Ne yapılması gerektiği, tek cümle."
    }
  ]
}
```

`scope` değerleri: `code` (kaynak dosya) · `prose` (metin dosyası) ·
`path` (dosya yolu) · `command` (kabuk komutu). `match` bir JSON dizesidir,
yani ters bölüler iki kez kaçışlanır. Yazdıktan sonra `/slop-doctor` ile
desen sayısının arttığını doğrula.

### Desen kataloğu

| ID | Kanonik ad | Desen anahtarı | Kapsam | Sertlik | Ne yakalar |
|---|---|---|---|---|---|
| AGT-05 | Gereğinden fazla yetki | `agt-05-chmod-777` | kabuk komutu | engeller | Herkese yazma izni. |
| AGT-05 | Gereğinden fazla yetki | `agt-05-delete-without-where` | kabuk komutu | engeller | WHERE siz DELETE — tablonun tamamını siler. |
| AGT-05 | Gereğinden fazla yetki | `agt-05-git-force-push` | kabuk komutu | engeller | Zorlamalı push — başkasının işini siler. |
| AGT-05 | Gereğinden fazla yetki | `agt-05-git-reset-hard` | kabuk komutu | engeller | Commit edilmemiş çalışma sert sıfırlanıyor. |
| AGT-05 | Gereğinden fazla yetki | `agt-05-rm-recursive-force` | kabuk komutu | engeller | Özyinelemeli zorlamalı silme — geri dönüşü yok. |
| AGT-05 | Gereğinden fazla yetki | `agt-05-sql-destructive` | kabuk komutu | engeller | Yıkıcı şema komutu. |
| DOK-01 | Şişkin, buzzword dolu doküman | `dok-01-buzzword` | metin dosyası | uyarır | İçerik taşımayan pazarlama dili. |
| DOK-03 | İçi boş commit mesajı ve PR açıklaması | `dok-03-empty-commit-msg` | kabuk komutu | uyarır | İçi boş commit mesajı — neyin neden değiştiğini söylemiyor. |
| DOK-04 | Emoji ve başlık enflasyonu | `dok-04-emoji-heading` | metin dosyası | uyarır | Emoji ile başlayan başlık. |
| GUV-01 | Güvensiz varsayılanı seçmek | `guv-01-eval` | kaynak dosya | engeller | Dinamik kod yürütme. |
| GUV-03 | Gömülü sırlar ve uydurma kimlik bilgileri | `guv-03-aws-key` | kaynak dosya | engeller | AWS erişim anahtarı kimliği. |
| GUV-03 | Gömülü sırlar ve uydurma kimlik bilgileri | `guv-03-inline-secret` | kaynak dosya | engeller | Kaynak koda gömülü sır. |
| GUV-03 | Gömülü sırlar ve uydurma kimlik bilgileri | `guv-03-private-key` | kaynak dosya | engeller | Gömülü özel anahtar. |
| GUV-05 | Girdi doğrulama eksikliği | `guv-05-sql-concat` | kaynak dosya | engeller | SQL sorgusunun dize birleştirmeyle kurulması — enjeksiyon yüzeyi. |
| GUV-05 | Girdi doğrulama eksikliği | `guv-05-sql-fstring` | kaynak dosya | engeller | f-string ile kurulan SQL — enjeksiyon yüzeyi. |
| KOD-01 | Kopyala-yapıştır çoğalması | `kod-01-versioned-filename` | dosya yolu | engeller | Sürüm ekli dosya adı — eskisinin yanına yenisi yazılıyor. |
| KOD-04 | Guard-and-Go: silmek yerine sarmalamak | `kod-04-guard-and-go` | kaynak dosya | uyarır | Ölü dala alınmış kod — silmek yerine sarmalanmış. |
| KOD-05 | Hata bastırma ve sessiz başarısızlık | `kod-05-catch-noop` | kaynak dosya | engeller | Boş .catch() — reddedilen promise sessizce yutuluyor. |
| KOD-05 | Hata bastırma ve sessiz başarısızlık | `kod-05-comment-only-catch` | kaynak dosya | engeller | Yalnızca yorum içeren catch gövdesi — hata yine yutuluyor. |
| KOD-05 | Hata bastırma ve sessiz başarısızlık | `kod-05-empty-catch` | kaynak dosya | engeller | Boş catch gövdesi — hata yakalanıp yutuluyor. |
| KOD-05 | Hata bastırma ve sessiz başarısızlık | `kod-05-except-pass` | kaynak dosya | engeller | except: pass — istisna sessizce yutuluyor. |
| MTK-02 | Var olmayan paket önerisi | `mtk-02-package-install` | kabuk komutu | engeller | Paket kurulumu — adı doğrulanmadan kurulursa slopsquatting yüzeyi (GUV-02). |
| OYN-01 | Kare hızına bağlı hareket | `oyn-01-framerate-bagimli-hareket` | kaynak dosya | uyarır | Hareket kare hızına bağlı — Time.deltaTime ile ölçeklenmemiş. |
| OYN-02 | Her karede sahne araması | `oyn-02-her-karede-sahne-aramasi` | kaynak dosya | uyarır | Kare döngüsünde sahne araması ya da bileşen çözümlemesi. |
| OYN-03 | Fiziğin kare döngüsünde yürütülmesi | `oyn-03-fizik-update-icinde` | kaynak dosya | uyarır | Fizik çağrısı Update içinde — fizik adımıyla senkron değil. |
| OYN-04 | Sıcak yolda bellek tahsisi | `oyn-04-sicak-yolda-tahsis` | kaynak dosya | uyarır | Kare döngüsünde LINQ — her karede çöp üretir, takılma yaratır. |
| OYN-05 | Her karede günlük yazımı | `oyn-05-her-karede-gunluk` | kaynak dosya | uyarır | Her karede günlük yazımı — editörde kare süresini gözle görülür düşürür. |
| OYN-06 | İstemcide tutulan ekonomi ve ilerleme | `oyn-06-istemcide-ekonomi` | kaynak dosya | engeller | Ekonomi ya da ilerleme değeri istemcide saklanıyor (GUV-04). |
| OYN-07 | Kırılgan sahne ağacı yolu | `oyn-07-kirilgan-dugum-yolu` | kaynak dosya | uyarır | Göreli sahne ağacı yolu — düğüm taşınınca sessizce kopar. |
| SUR-08 | Temelsiz efor ve süre tahmini | `sur-08-effort-estimate` | metin dosyası | engeller | Ölçülemeyen süre tahmini. |
| TST-01 | Testi silmek veya zayıflatmak | `tst-01-skipped-test` | kaynak dosya | engeller | Atlanan test — kırmızıyı yeşile çevirmenin en kısa yolu. |
| TST-03 | Sahte implementasyon | `tst-03-fake-impl` | kaynak dosya | uyarır | Sahte implementasyon — imza var, gövde yok. |
| TST-04 | Totolojik test | `tst-04-tautological-assert` | kaynak dosya | engeller | Her koşulda geçen totolojik iddia — hiçbir şey doğrulamıyor. |

Devre dışı bırakma üç düzeyde çalışır: kategori (`GUV`), taksonomi ID'si
(`GUV-03`) ya da tekil desen anahtarı (`guv-03-aws-key`).

`SUR-08`, `OYN-01`, `OYN-02`, `OYN-03`, `OYN-04`, `OYN-05`, `OYN-06`, `OYN-07`, `OYN-08` kaynak taksonomide yoktu; bu proje ekledi.

### Oyun geliştirme (OYN)

OYN desenleri motor API adlarına dayanır (`transform.Translate`, `PlayerPrefs`,
`get_node`), bu yüzden oyun olmayan projelerde kendiliğinden sessiz kalır.
Yine de tek satırla kapatılabilir: `disabled: ["OYN"]`.

Sertlikleri bilerek `uyarır`: sıcak yol tespiti sezgiseldir ve yeni bir alanda
blokla başlamak aracın ilk izlenimini yanlış pozitifle kurmak olurdu. Tek
istisna **OYN-06** — istemcide tutulan para ve ilerleme bir güvenlik meselesi,
oyuncu `PlayerPrefs` içeriğini düzenleyebilir.

**Motor üretimi dosyalar korumalıdır** ve bu koruma kipten bağımsızdır:
`.meta`, `.uasset`, `.umap`, `.unity`, `.prefab`, `.tscn`, `Library/`,
`.godot/`, `Intermediate/`, `Saved/`. Elle düzenlenen bir `.meta` sahnedeki
tüm referansları koparır ve bozulma commit'ten çok sonra fark edilir. Bu
dizinler tarama yürüyüşünde de atlanır — Unity'nin `Library` dizini yüz
binlerce dosya içerebilir.

**Oyun kural metni yalnızca oyun projelerinde yüklenir.** `session-start` kökte
motor imzası arar (Unity için `Assets/` + `ProjectSettings/`, Godot için
`project.godot`, Unreal için `*.uproject`) ve bulamazsa hiç enjekte etmez;
kullanılmayacak kuralı her oturuma yüklemek aşırı bağlam olurdu (AGT-02).
Desenler bu koşula bağlı değil, yalnızca metin.

### Satır içi muafiyet

```js
// slop-guard-ignore KOD-05: üçüncü parti SDK burada throw ediyor
```

Üç koşul birden aranır: yönerge bulgunun satırında ya da tam üstünde olacak,
hangi deseni susturduğunu adlandıracak, gerekçe yazacak. Biri eksikse
susturmaz ve neden reddedildiği bulguya iliştirilir. Kullanılan muafiyetler
sayılır ve oturum özetinde raporlanır.

### Komutlar

| Komut | Ne yapar |
|---|---|
| `/slop-setup` | Yapılandırmayı oluşturur, durum çubuğunu kaydeder. Var olanı ezmez |
| `/slop-status` | Oturum sayaçları **ve** canlı tarama; hook kaydına güvenmez |
| `/slop-check [yol]` | Talep üzerine tarama; git deposu gerektirmez |
| `/slop-doctor` | Kurulum teşhisi; her satır ✅ ya da ❌ |
| `/slop-config` | Ayarları değiştirir |
| `/slop-mode strict\|explore` | Oturum kipi; kalıcı yapılandırmaya dokunmaz |
| `/slop-repo-init` | Repoya agent-agnostic koruma kurar |

#### Nerede çalıştırılır

`/slop-check` ve `/slop-status` bir git deposu içinde olmak zorunda değil.
Tarama kaynağı bulunduğun yere göre seçilir:

| Bulunduğun yer | Taranan |
|---|---|
| Git deposu | Değişmiş dosyalar; hiç değişiklik yoksa izlenen dosyaların tamamı |
| Sıradan klasör | Dosya sistemi yürünür — altındaki tüm depolar ve gevşek dosyalar dahil |

Klasör kipinde `node_modules`, `dist`, `build`, `.venv`, `__pycache__` ve
benzeri gürültü dizinlerine hiç girilmez. İç içe her `.slopignore` yalnızca
kendi alt ağacında geçerlidir; kardeş depolar birbirinin muafiyetinden
etkilenmez.

Böylece birden çok proje barındıran bir üst dizinde tek çağrıyla tarama
yapılabilir; her depoya tek tek girmek gerekmez.

### Durum çubuğu

`canlı` demek için iki ayrı kanıt gerekir: kalp atışı damgasının bu oturumun
kimliğini taşıması (kayıt) ve `pre-edit`'in sentetik yüke doğru cevap vermesi
(çalışabilirlik). Belirsizlik `canlı` diye yuvarlanmaz.

| Gösterim | Anlamı |
|---|---|
| `SlopGuard hazır` | Kurulu ve cevap veriyor, ama bu oturumda henüz tetiklenmedi |
| `SlopGuard canlı · …` | İki kanıt da var |
| `SlopGuard ⚠️ kayıtsız` | Mesaj atıldı ama hook tetiklenmedi |
| `SlopGuard ⚠️ bozuk` | Script probe'a cevap vermiyor |
| `SlopGuard kapalı` | `enabled: false` |

## AI için: kullanıcıya nasıl yardım edersin

Bu bölüm herhangi bir oturumdaki AI'ın okuyup işlem yapabilmesi için.

### Niyet → eylem

| Kullanıcı ne der | Ne anlama gelir | Ne yap |
|---|---|---|
| "bu uyarı sürekli çıkıyor" | desen gürültülü | `config.json` → `disabled` listesine ID ekle |
| "çok fazla blokluyor" | sert kip ağır | Önce hangi ID'ler tetikleniyor göster, sonra hedefli kapat |
| "prototip yapıyorum" | geçici gevşetme | `/slop-mode explore` — kalıcı config'e dokunma |
| "test dosyalarına yazabilmeli" | TST kilidi engel | `allowTestWrites: true`; gerekçesini sor |
| "şu paketi hep engelliyor" | paket kapısı | Paketi doğrula, sonra `trustedPackages`'a ekle |
| "diff sınırı küçük" | eşik dar | `thresholds.maxDiffLines` |
| "şunu da yakalasın" | yeni desen | `patterns.local.json`; önce dene |
| "kendi kuralımı ekle" | kişisel kural | `rules.local.md`, kısa tut |
| "bu repoda hiç çalışmasın" | proje muafiyeti | Repo kökünde `.slopignore` |
| "ne durumdayım" | görünürlük | `/slop-status` |

### Güvenli ve güvensiz düzenlemeler

| Güvenli | Güvensiz |
|---|---|
| `~/.claude/lenarise-slopguard/` altındaki dosyalar | Plugin cache'i — güncelleme siler |
| Tek desen ya da tek ID kapatmak | Kategori kapatmak, özellikle GUV |
| `/slop-mode explore` (oturumluk) | `config.json` → `mode: "explore"` (kalıcı) |
| Eşiği ölçüye dayanarak değiştirmek | Eşiği "rahatsız ediyor" diye kaldırmak |
| Gerekçeli satır içi muafiyet | `.slopignore`'a geniş glob yazmak |

Bir deseni kapatırken **neyi kaybettiğini söyle**. GUV kapatmayı kendiliğinden
önerme; kullanıcı açıkça isterse yap ve riski yaz.

### Düzenleme sonrası doğrulama

```bash
jq -e . ~/.claude/lenarise-slopguard/config.json      # JSON geçerli mi
```

Sonra `/slop-doctor` çalıştır ve desen sayısının beklediğin gibi olduğunu
doğrula. `config.json`, `patterns.local.json` ve `.slopignore` anında geçerli
olur; `hooks.json` ve manifest değişiklikleri yeniden başlatma ister.

## Sorun giderme

| Belirti | Muhtemel sebep | Ne yap |
|---|---|---|
| Çubuk `⚠️ kayıtsız` | Hook kaydolmamış | Claude Code'u yeniden başlat, sonra `/slop-doctor` |
| Çubuk `⚠️ bozuk` | `node` yolu ya da dosya izni | `/slop-doctor` ❌ satırlarını izle |
| Çubuk hiç yok | `statusLine` kayıtlı değil | `/slop-setup` |
| Hiçbir şey engellenmiyor | Plugin devre dışı ya da `enabled: false` | `claude plugin list`, sonra `/slop-doctor` |
| Testi olmayan repoda kilitleniyor | Kod yazıldı, test yok, kapı bekliyor | `allowTestWrites: true` ya da `/slop-mode explore` |
| Paket kurulumu hep engelleniyor | Ağ yok; kapı fail-closed | Paketi doğrula, `trustedPackages`'a ekle |
| `plugin update` "not found" diyor | Komut marketplace nitelikli ad ister | `claude plugin update lenarise-slopguard@lenarise-slopguard` |
| Kurulumdan sonra hiçbir şey olmuyor | Hook'lar oturum başında yüklenir | Claude Code'u yeniden başlat |

## Bilinen sınırlar

Gizlenmiyor:

- Regex taraması yanlış pozitif üretir. Kaçış yolu gerekçeli satır içi muafiyet.
- Guard-and-Go (KOD-04) regex'le tam yakalanamaz; sezgisel.
- Repo geneli duplikasyon (KOD-01) tek dosyaya bakan tarayıcıda görünmez; CI katmanında jscpd.
- İş mantığı hataları (MTK) mekanik olarak yakalanamaz; yalnızca kural metniyle taşınır.
- `post-edit` bloğu modeli durdurmaz; garanti `stop-gate`'te.
- Bash üzerinden yazma **kısmen** kapsanır. Hedefi komutun kendisinde açıkça
  görünen biçimler ayrıştırılır — `>`, `>>`, `tee`, `sed -i`, `cp`, `mv`,
  `touch` — ve bu dosyalar hem korumalı yol kilidinden geçer hem içerikleri
  taranır. Hedefi komuttan okunamayan yazmalar (`make`, `npm run build`, keyfi
  script'ler) görünmez. `/slop-check`, `/slop-status`, pre-commit hook'u ve CI
  canlı tarama yaptığı için o boşluğu kapatır.
- Paket doğrulaması ağ ister ve zaman aşımında engelleyerek kapanır.

## Kaldırma

```bash
claude plugin uninstall lenarise-slopguard
claude plugin marketplace remove lenarise-slopguard
```

`~/.claude/settings.json` içindeki `statusLine` girdisini ve
`~/.claude/lenarise-slopguard/` dizinini elle sil. `/slop-setup` yedek
bıraktıysa `settings.json.slopguard-yedek` dosyası oradadır.
