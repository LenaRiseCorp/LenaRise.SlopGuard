# LenaRise.SlopGuard deposunda çalışırken

ÜRETİLEN DOSYA. Elle düzenleme; kaynağı `scripts/gen-docs.mjs`.

Bu depo bir slop koruma aracıdır. Slop'a karşı bir araç, kendi kurallarını
ihlal ederek yazılamaz — buradaki maddeler temenni değil, bağlayıcı.

## Bağlayıcı taahhütler

| Taahhüt | Kategori |
|---|---|
| Sıfır runtime bağımlılığı — yalnızca Node stdlib | GUV-02 |
| Desen tanımı tek kaynakta (`lib/patterns.mjs`); hook, skill, semgrep ve README ondan türer | KOD-01 |
| Doküman koddan üretilir (`npm run docs`), elle senkron tutulmaz | DOK-07 |
| Boş `catch` yok — hata `stderr`'e yazılır, sessizce yutulmaz | KOD-05 |
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

```bash
npm test          # 33 desen, boru testleri dahil
npm run selfscan  # kendi kaynağımız kendi tarayıcımızdan
npm run docs      # üretilen dokümanı tazele
```

`npm run docs -- --check` üretilen dosya bayatsa 1 ile çıkar; CI kapısı budur.

## Mimarinin dayandığı ölçümler

Bu depodaki tasarım kararları tahmine değil ölçüme dayanır. Hepsi
`docs/dogrulama-kaydi.md` içinde, tekrar çalıştırılabilir biçimde:

- Hook'lar bypass permissions kipinde çalışır; `PreToolUse` deny aracı
  gerçekten durdurur, `Stop` block turu bitirtmez.
- `PostToolUse` block modele iletilir ama modeli durdurmaz. Sert garanti
  bu yüzden `stop-gate`'tedir.
- `PostToolUse` başarısız Bash komutunda hiç tetiklenmez; `tool_response`
  çıkış kodu taşımaz. "Test geçti" bilgisi tetiklenmenin varlığından gelir.
- `statusLine` stdin'de `session_id` alır ve bu hook'ların gördüğüyle aynıdır.
- `process.exit()` bekleyen stdout yazmasını beklemez; boru tamponunu aşan
  çıktı kesilir. Hook'lar `exitWhenFlushed()` kullanır.

Yeni bir platform davranışına dayanacaksan önce ölç, sonra yaz. Ölçtüğünü
`docs/dogrulama-kaydi.md`'ye ekle.

## Dizin haritası

| Yol | İçerik |
|---|---|
| `lib/patterns.mjs` | Desen defteri — tek kaynak |
| `lib/scan.mjs` · `lib/ignore.mjs` | Eşleştirme motoru ve muafiyet politikası |
| `lib/config.mjs` · `lib/session.mjs` · `lib/coach.mjs` | Yapılandırma, oturum durumu, eşikler |
| `lib/hook.mjs` · `lib/report.mjs` · `lib/heartbeat.mjs` | Hook koşucusu, çıktı sözleşmesi, canlılık |
| `hooks/` | Sekiz hook + `hooks.json` |
| `bin/statusline.mjs` | Durum çubuğu; plugin ölse bile çalışır |
| `scripts/` | Komut script'leri, tarayıcı CLI'ları, doküman üreteci |
| `test/` | `node --test`; boru testleri gerçek süreçte çalışır |
