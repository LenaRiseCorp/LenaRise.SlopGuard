---
name: slop-config
description: LenaRise.SlopGuard ayarlarını değiştirmek için kullan — kullanıcı bir uyarının sürekli çıktığını, çok fazla bloklandığını, eşiğin dar geldiğini, bir paketin engellendiğini, test dosyalarına yazılamadığını söylediğinde ya da yeni desen eklemek, kendi kuralını yazmak, bir repoda korumayı kapatmak istediğinde. Ayrıca "prototip yapıyorum", "bu desen gürültülü", "şunu da yakalasın" gibi ifadelerde.
---

# LenaRise.SlopGuard yapılandırması

## Önce şunu bil

**Plugin dizinini asla düzenleme.** Güncelleme oradaki her şeyi siler.
Tüm düzenleme `~/.claude/lenarise-slopguard/` içine yapılır; bu dizine
güncelleme dokunmaz.

| Dosya | Ne için |
|---|---|
| `config.json` | kip, eşikler, kapatılan desenler, güvenilen paketler |
| `patterns.local.json` | senin eklediğin desenler |
| `rules.local.md` | serbest metin kuralların; her oturum başında enjekte edilir |
| `<repo>/.slopignore` | proje bazlı yol muafiyeti |

Oturum kipi (`/slop-mode`) hiçbir dosyaya yazmaz — yalnızca o oturumu etkiler.

## Niyet → eylem

| Kullanıcı ne der | Ne anlama gelir | Ne yap |
|---|---|---|
| "bu uyarı sürekli çıkıyor" | desen gürültülü | `config.json` → `disabled` listesine desen ID'si ekle |
| "çok fazla blokluyor" | sert kip ağır | Önce `/slop-status` ile hangi ID'lerin tetiklendiğini göster, sonra hedefli kapat. Tümünü gevşetme |
| "prototip yapıyorum" | geçici gevşetme | `/slop-mode explore` — kalıcı config'e dokunma |
| "test dosyalarına yazabilmeli" | TST kilidi engel | `config.json` → `allowTestWrites: true`. Gerekçesini sor ve `rules.local.md`'ye not düş |
| "şu paketi hep engelliyor" | paket kapısı takıldı | Paketin gerçekten var olduğunu doğrula, sonra `trustedPackages`'a ekle |
| "diff sınırı küçük" | eşik dar | `config.json` → `thresholds.maxDiffLines` |
| "şunu da yakalasın" | yeni desen | `patterns.local.json`'a ekle, **önce boru testiyle dene** |
| "kendi kuralımı ekle" | kişisel kural | `rules.local.md`'ye ekle, kısa tut |
| "bu repoda hiç çalışmasın" | proje muafiyeti | Repo kökünde `.slopignore` |
| "ne durumdayım" | görünürlük | `/slop-status` |
| "çubuk görünmüyor / yanlış" | görünürlük ayarı | `config.json` → `ui.statusLine`; kayıt sorunuysa `/slop-doctor` |

## Güvenlik kuralları

Bunlar tercih değil, kural:

1. **Bir deseni kapatırken neyi kaybettiğini söyle.** Örnek: "GUV-03'ü
   kapatırsan kaynak koda gömülen API anahtarları artık yakalanmaz."
2. **GUV kategorisini kapatmayı kendiliğinden önerme.** Kullanıcı açıkça
   isterse yap, ama riski yaz.
3. **Düzenlemeden önce yedekle**, sonra JSON'u doğrula:
   `cp config.json config.json.yedek && jq -e . config.json`
4. **En dar değişikliği yap.** Tek desen yeterken kategoriyi kapatma;
   kategori yeterken kipi değiştirme.
5. **Yeniden başlatma gerekip gerekmediğini söyle.** `config.json`,
   `patterns.local.json` ve `.slopignore` anında geçerli olur. `hooks.json`
   ve manifest değişiklikleri Claude Code'un yeniden başlatılmasını ister.
6. **Muafiyeti kendiliğinden önerme.** Önce düzeltmeyi dene. Satır içi
   muafiyet ancak desen gerçekten yanlış pozitifse ve kullanıcı onaylarsa
   yazılır — ID ve gerekçe zorunlu, ikisinden biri eksikse susturmaz.

## config.json şeması

<!-- ÜRETİLEN: config-şeması -->
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
<!-- /ÜRETİLEN: config-şeması -->

## patterns.local.json şeması

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

| Alan | Zorunlu | Not |
|---|---|---|
| `key` | evet | benzersiz; `disabled` listesinde bununla kapatılır |
| `id` | evet | taksonomi ID'si; mesajda bu görünür |
| `scope` | evet | `code` · `prose` · `path` · `command` |
| `match` | evet | JSON dizesi olarak regex — ters bölüler **iki kez** kaçışlanır |
| `severity` | hayır | `block` (varsayılan) veya `warn` |
| `flags` | hayır | varsayılan `g` |
| `detects` / `fix` | hayır | yazılması şiddetle önerilir; mesajda görünür |

`match` yazarken en sık hata kaçış katmanıdır. Yazdıktan sonra **mutlaka** dene:

```bash
node -e 'import("/YOL/lib/config.mjs").then(m=>{const r=m.loadConfig({});console.log(r.problems,r.config.localPatterns.map(p=>[p.key,String(p.match)]))})'
```

Sorun listesi boş değilse desen yüklenmemiştir. Sessizce bırakma.

## Desen kataloğu

<!-- ÜRETİLEN: desen-kataloğu -->
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
| SUR-08 | Temelsiz efor ve süre tahmini | `sur-08-effort-estimate` | metin dosyası | engeller | Ölçülemeyen süre tahmini. |
| TST-01 | Testi silmek veya zayıflatmak | `tst-01-skipped-test` | kaynak dosya | engeller | Atlanan test — kırmızıyı yeşile çevirmenin en kısa yolu. |
| TST-03 | Sahte implementasyon | `tst-03-fake-impl` | kaynak dosya | uyarır | Sahte implementasyon — imza var, gövde yok. |
| TST-04 | Totolojik test | `tst-04-tautological-assert` | kaynak dosya | engeller | Her koşulda geçen totolojik iddia — hiçbir şey doğrulamıyor. |
<!-- /ÜRETİLEN: desen-kataloğu -->

## Değişiklikten sonra

1. `jq -e . <dosya>` ile JSON'u doğrula.
2. `/slop-doctor` çalıştır — desen sayısı beklediğin gibi mi?
3. Değişikliğin ne yaptığını ve **neyi artık yakalamadığını** kullanıcıya özetle.
