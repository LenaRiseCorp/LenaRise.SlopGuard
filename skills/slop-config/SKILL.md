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
Bu bölüm `npm run docs` ile `lib/config.mjs` içindeki varsayılanlardan üretilir.
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
Bu bölüm `npm run docs` ile `lib/patterns.mjs` içindeki desen defterinden üretilir.
<!-- /ÜRETİLEN: desen-kataloğu -->

## Değişiklikten sonra

1. `jq -e . <dosya>` ile JSON'u doğrula.
2. `/slop-doctor` çalıştır — desen sayısı beklediğin gibi mi?
3. Değişikliğin ne yaptığını ve **neyi artık yakalamadığını** kullanıcıya özetle.
