# Doğrulama kaydı

PLAN.md'deki "Doğrulama" maddelerinin **fiilen** sınanmış sonuçları. Tahmin değil, ölçüm.
Her satır çalıştırılabilir bir komuta ve gözlenen bir çıktıya dayanır.

Ortam: Claude Code 2.1.241 · Node v22.14.0 · darwin 25.6.0

---

## D5 — Hook'lar bypass permissions modunda çalışıyor mu

**Sonuç: Evet.** Koruma hook katmanında kalabilir; permission katmanına kaydırmaya gerek yok.

Düzenek: geçici dizinde `--settings` ile probe hook'ları kaydedildi, `claude -p` başsız
oturumda çalıştırıldı, hook'un stdin'de aldığı yük dosyaya döküldü.

| Sınanan | Komut | Gözlenen |
|---|---|---|
| Hook tetikleniyor mu | `claude -p … --permission-mode bypassPermissions` | SessionStart · UserPromptSubmit · PreToolUse · PostToolUse · Stop hepsi tetiklendi |
| Hook modu görüyor mu | PreToolUse yükü | `permission_mode: "bypassPermissions"` alanı mevcut |
| `permissionDecision: "deny"` | Bash aracına deny döndürüldü | Komut **yürütülmedi**; PostToolUse hiç tetiklenmedi; model "denied" raporladı |
| `--dangerously-skip-permissions` | Aynı test, gerçek bayrakla | Aynı sonuç |
| Stop `decision: "block"` | Stop hook'u ilk çağrıda blokladı | Model durdurulamadı, `num_turns` 2→3; ikinci çağrıda `stop_hook_active: true` |

### Ölçülen nüans — planın düzeltilmesi gereken yeri

`PostToolUse` + `decision: "block"` tetikleniyor ve blok sebebi transcript'e
`hook_blocking_error` eki olarak **teslim ediliyor**:

```json
{ "attachment": { "type": "hook_blocking_error", "hookName": "PostToolUse:Write",
    "hookEvent": "PostToolUse",
    "blockingError": { "blockingError": "…sebep…", "command": "…" } } }
```

Ancak iki şey doğru değil:

1. Yazma **zaten gerçekleşmiştir** — PostToolUse adı üstünde araçtan sonra çalışır.
   Dosya diskte durur; blok yalnızca modele "bunu düzelt" der.
2. Model bloğu **görmezden gelebilir**. Testte model bloğu aldı ve yine de "Done" deyip bitirdi.

Sonuç: sert durdurma garantisi yalnızca **`PreToolUse deny`** ve **`Stop block`**'tadır.
`post-edit` bir *düzeltme talebi*, kilit değil. Garanti şöyle kurulur: `post-edit` bulduğu
ihlali oturum durumuna **açık ihlal** olarak yazar; `stop-gate` açık ihlal varken turu
bitirmez. Kilit `Stop` katmanındadır.

## D13 — statusLine stdin'de `session_id` alıyor mu

**Sonuç: Evet.** Planın yedek "artan sayaç" yöntemine gerek yok.

`-p` başsız modda statusLine **hiç çağrılmaz**; ölçüm için gerçek TTY gerekti
(`expect` ile pty altında etkileşimli oturum).

Alınan yükün tam şeması:

```json
{ "session_id": "…", "transcript_path": "…", "cwd": "…",
  "model": { "id": "…", "display_name": "…" },
  "workspace": { "current_dir": "…", "project_dir": "…", "added_dirs": [] },
  "version": "2.1.241", "output_style": { "name": "default" },
  "cost": { "total_cost_usd": 0, "total_duration_ms": 0, "total_api_duration_ms": 0,
            "total_lines_added": 0, "total_lines_removed": 0 },
  "context_window": { "total_input_tokens": 0, "total_output_tokens": 0,
                      "context_window_size": 200000, "current_usage": null,
                      "used_percentage": null, "remaining_percentage": null },
  "exceeds_200k_tokens": false, "fast_mode": false, "thinking": { "enabled": true },
  "rate_limits": { "five_hour": {…}, "seven_day": {…} } }
```

### Kayıt kanıtı doğrulandı

Tek bir canlı oturumda SessionStart hook'u, UserPromptSubmit hook'u ve statusLine
**birebir aynı** `session_id`'yi gördü. Damgadaki `sessionId` ile statusLine'ın
`session_id`'sini karşılaştırmak geçerli bir kayıt kanıtıdır.

### Plana yansıyan iki kazanç

- `+420/-80` sayacı elle tutulmayacak: `cost.total_lines_added` / `total_lines_removed` hazır geliyor.
- Bağlam çürümesi (AGT-01) tur sayacı yerine `context_window.used_percentage` ile ölçülebilir —
  tur sayısı bir vekil, doluluk oranı doğrudan ölçüdür.

### Ölçülen sınır

statusLine **sürekli değil, olay tetiklemeli** yenilenir: ~30 saniyelik oturumda 2 çağrı.
`bozuk` durumu anında değil, bir sonraki olayda görünür. Çubuk bunu iddia etmemeli.

---

## Ek ölçümler — hook şemaları

Adım 2 ve 3 sırasında ölçülenler. Hepsi `claude -p` ile, gerçek hook kaydıyla.

### PostToolUse `tool_response` şeması araca göre değişir

`Write` / `Edit` için:

```json
{ "type": "create", "filePath": "…", "content": "…",
  "structuredPatch": [], "originalFile": null, "userModified": false }
```

`structuredPatch` gerçek diff'i taşır: her hunk `lines` dizisinde `+`/`-` önekli
satırlar. Satır sayacı buradan beslenir; şema beklenmedik gelirse sayaç sıfır
kalır ve uydurma sayı üretilmez.

`Bash` için:

```json
{ "stdout": "…", "stderr": "", "interrupted": false,
  "isImage": false, "noOutputExpected": false }
```

**Çıkış kodu yok.** Komutun geçip geçmediği yanıttan okunamaz.

### PostToolUse başarısız Bash komutunda tetiklenmiyor

Üç ölçüm bunu gösterdi:

| Komut | Matcher | Sonuç |
|---|---|---|
| `echo tamam` (çıkış 0) | `"Bash"` | Tetiklendi |
| `echo merhaba` (çıkış 0) | `""` | Tetiklendi |
| `false` (çıkış 1) | `"Bash"` | **Tetiklenmedi** |
| `ls /olmayan-dizin` (çıkış ≠ 0) | `"Bash"` | **Tetiklenmedi** |

Matcher `"Bash"` sorunsuz çalışıyor; ilk ıskalamalar komutun başarısız
olmasındandı.

**Tasarıma etkisi.** Çıkış kodu alanı olmamasına rağmen "test çalıştı ve geçti"
dürüstçe bilinebiliyor: PostToolUse'un tetiklenmesinin kendisi komutun
başarıyla bittiğinin kanıtı. `post-bash.mjs` bu yüzden var — test damgasını
komut *öncesinde* atmak, çalışmamış hatta başarısız olmuş bir testi "çalıştı"
saymak olurdu ve tam olarak engellemeye çalıştığımız şey budur (TST-05).

**Asimetri korunmalı:** tetiklenme ⇒ başarı. Tetiklenmeme ⇏ başarısızlık —
komut başarısız olmuş, hook kayıtsız kalmış ya da araç reddedilmiş olabilir.
Stop kapısı bu belirsizliği "doğrulanmadı" yönünde okur, "geçti" yönünde değil.

## D4 — Canlı tetikleme (uçtan uca)

`hooks/hooks.json` içindeki `${CLAUDE_PLUGIN_ROOT}` gerçek yola çevrilip
`--settings` ile yüklendi — plugin yükleyicisinin yaptığının aynısı, ama
kullanıcının kurulumuna dokunmadan. Boş bir git repo'sunda tek prompt:
önce bir test dosyası, sonra boş `catch` içeren bir kaynak dosyası yazması istendi.

| Beklenen | Gözlenen |
|---|---|
| Test dosyası reddedilsin | Dosya hiç oluşmadı; `pre-edit` deny |
| Boş catch yakalansın | `post-edit` blokladı, oturumda `blocked: 1` |
| Model düzeltsin | Dosyanın son hâli `catch (e) { throw e; }`; ihlal defteri boşaldı |
| Stop kapısı doğrulama istesin | Üç kez blokladı, tavanda geçirdi (AGT-08 koruması) |
| Çıkış yolları kullanıcıya iletilsin | Model `/slop-mode explore` ve `allowTestWrites` seçeneklerini sundu |
| Çubuk doğru okusun | `SlopGuard canlı · sert · 1 engellendi · tur 1/40 · +3/-0 · test yok` |

### Gözlenen gerçek kısıt

Testi olmayan bir repoda sert kip, agent'ı sıkışık bir yere sokuyor: test
dosyası yazamaz (TST kilidi), test çalıştıramaz (altyapı yok), dolayısıyla
Stop kapısı TST-05 borcuyla bloklar. Kilitlenme yaşanmıyor çünkü AGT-08 tavanı
üçüncü denemede kapıyı açıyor ve model iki belgeli çıkış yolunu kullanıcıya
iletiyor. Yine de bu, tasarımın bilinen bir sürtünme noktası: yeni ve testsiz
bir repoda ilk iş `allowTestWrites` ya da keşif kipi kararını vermektir.

## Paket kapısı — gerçek kayıt defterleriyle

Birim testler ağ katmanını taklit ediyor; bu ölçüm gerçek sorguyla yapıldı.

| Komut | Sonuç | Süre |
|---|---|---|
| `npm install react` | izin verildi (çıktı yok) | ~0,26 sn |
| `npm install sol-hayali-paket-xyz123-lenarise` | **deny** — "npm kayıt defterinde YOK" | — |
| `pip install requests` | izin verildi | — |
| `pip install bu-paket-kesinlikle-yok-lenarise-123` | **deny** — "pypi kayıt defterinde YOK" | — |

## Modelin kendi reddi kapıyı sınamıyor

Canlı oturumda `npm install <uydurma-ad>` ve `git push --force` istendiğinde
model her ikisini de **kendiliğinden reddetti** ve araç çağrısını hiç yapmadı;
hook'lar sıraya gelmedi. Sonuç istenen yönde ama kapının kanıtı değil.

Bu, katmanlı tasarımın neden gerekli olduğunun somut örneği: modelin kendi
muhakemesi çoğu zaman doğru çalışır, ama ona dayanan bir koruma modelin
muhakemesinin bozulduğu günde de sessizce yok olur. Kapıların kanıtı bu yüzden
boru testlerinde ve doğrudan ölçümde aranır, modelin nazik davranmasında değil.

---

## Kurulum provası ve kuruluma bağlı doğrulamalar

Gerçek kurulum yolundan yapıldı: `LenaRiseCorp/LenaRise.SlopGuard` (private repo).

### D3 — Kurulum provası

| Sınanan | Sonuç |
|---|---|
| Private repo `marketplace add` ile eklenebiliyor mu | Evet — SSH yoksa HTTPS'e düşüyor, kullanıcının git kimliğiyle klonluyor |
| `pixel-agents` hook'ları korunuyor mu | **Evet, 14/14 yerinde** |
| `settings.json`'a başka ne ekleniyor | Yalnızca üç alan: `statusLine`, `enabledPlugins`, `extraKnownMarketplaces`. Diğer her şey birebir aynı |

**Kurulumun ortaya çıkardığı hata:** `plugin.json` içinde `"hooks": "./hooks/hooks.json"`
yazıyordu. Claude Code o dosyayı zaten otomatik yüklüyor; açıkça bildirmek
`Duplicate hooks file detected` hatası veriyor ve **plugin hiç yüklenmiyor**.

`claude plugin validate --strict` bunu yakalamadı: doğrulama şemayı kontrol
ediyor, yüklemeyi simüle etmiyor. Planın "Kurulum provası" maddesinin varlık
sebebi tam olarak bu.

### D8 — Güncelleme dayanıklılığı

`config.json` özelleştirildi (`disabled`, `trustedPackages`, eşik), `rules.local.md`
yazıldı, sonra `plugin update` ve `plugin disable` çalıştırıldı.

| Dosya | Güncelleme sonrası | Devre dışı bırakma sonrası |
|---|---|---|
| `config.json` | değişmedi (sha256 aynı) | korundu |
| `patterns.local.json` | değişmedi | korundu |
| `rules.local.md` | değişmedi | korundu |

**Not:** `claude plugin update lenarise-slopguard` "Plugin not found" veriyor;
komut marketplace nitelikli adı istiyor:
`claude plugin update lenarise-slopguard@lenarise-slopguard`. README'nin sorun
giderme tablosuna eklendi.

**Güncellemenin ortaya çıkardığı hata:** `/slop-setup`, `settings.json`'a
sürümlü cache yolu yazıyordu
(`.../lenarise-slopguard/0.1.1/bin/statusline.mjs`). Her `plugin update` o yolu
geçersiz kılıyor, yani çubuk sessizce kırılıyor — koruma var sanılırken bozuk
olması, bu aracın engellemek için var olduğu durumun ta kendisi.

Çözüm: kullanıcının yapılandırma dizininde yaşayan sürümden bağımsız bir
başlatıcı. Plugin güncellemesi ona dokunmuyor; tek işi en yeni kurulu sürümü
bulup devretmek, kurulu sürüm yoksa çubuğa "kurulu değil" yazmak.

İkinci tur düzeltme gerekti: başlatıcı yazılıyordu ama `settings.json`'daki
eski girdi "bizim" sayılıp dokunulmadan bırakılıyordu. Ayrım netleştirildi —
girdi bizimse ve eskiyse taşınır, başkasınınsa dokunulmaz.

### D9 — README yetenek testi (kullanıcının asıl şartı)

Temiz bağlamlı bir oturumda tek cümle: *"LenaRise.SlopGuard'da DOK-01 desenini kapat."*

| Sınanan | İlk deneme | Katalog düzeltmesinden sonra |
|---|---|---|
| Doğru dosyayı düzenledi mi | Evet — `~/.claude/lenarise-slopguard/config.json` | Evet |
| Plugin cache'ine dokundu mu | Hayır | Hayır |
| Ne kaybedildiğini doğru söyledi mi | **Hayır** — DOK-01'i "başlığa emoji koyma" sandı, o DOK-04 | **Evet** — "pazarlama dili", ve hâlâ etkin DOK desenlerini doğru saydı |

İlk denemenin başarısızlığı gerçek bir belge hatasını gösterdi: desen
kataloğunda taksonominin **kanonik adı** yoktu, yalnızca "ne yakalar" vardı.
README'nin "bir deseni kapatırken neyi kaybettiğini söyle" kuralı, kaybedilen
şey yanlış söylenirse pratikte çöker. Kataloga kanonik ad sütunu eklendi ve
kural setinde DOK maddelerinin ID karşılıkları yazıldı.

### D10 — Sessiz ölüm testi

Plugin `claude plugin disable` ile kasten devre dışı bırakıldı.

| Senaryo | Çubuk ne diyor |
|---|---|
| Devre dışı, kullanıcı mesaj atmamış | `SlopGuard hazır` — "canlı" demiyor, "kayıtsız" da demiyor |
| Devre dışı, kullanıcı mesaj atmış | `SlopGuard ⚠️ kayıtsız · son damga 37 sn önce` |
| Etkin, gerçek oturum | `SlopGuard canlı · sert · 0 engellendi · tur 1/40 · +0/-0 · test yok` |
| Plugin tamamen kaldırılmış | `SlopGuard ⚠️ kurulu değil` (başlatıcı söylüyor) |

İlk satır kasıtlı: mesaj atılmadan kayıt kanıtlanamaz, o yüzden "kayıtsız"
iddiası da edilmiyor. Belirsizliği iki yöne de yuvarlamamak tasarımın gereği.
