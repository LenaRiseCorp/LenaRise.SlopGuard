---
name: slop-check
description: Kod veya doküman kalitesini slop desenlerine karşı incelemek için kullan — kullanıcı "şunu kontrol et", "bu kod temiz mi", "merge öncesi bak", "review yap" dediğinde ya da bir değişikliği göndermeden önce doğrulamak istediğinde.
---

# Talep üzerine slop taraması

## Çalıştır

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" [yol...]
```

Yol verilmezse çalışma ağacındaki değişmiş dosyalar taranır.

## Bulguları nasıl ele alırsın

1. **Önce düzelt.** Her bulgunun `Düzelt:` satırı ne yapılacağını söyler.
2. **Muafiyeti kendiliğinden önerme.** Muafiyet ancak desen gerçekten yanlış
   pozitifse ve kullanıcı onaylarsa yazılır:
   `// slop-guard-ignore KOD-05: üçüncü parti SDK burada throw ediyor`
   ID ve gerekçe zorunlu; biri eksikse susturmaz.
3. **Sayıyı abartma.** "Temiz" demeden önce çıktıyı gerçekten oku.

## Taramanın yakalayamadıkları

Bunları elle kontrol et; araç bunları bilmiyormuş gibi davranma:

- **KOD-04 Guard-and-Go** — silinmesi gereken kodun `if (false)` dışında
  bir koşula sarılması regex'le güvenilir yakalanmaz.
- **KOD-01 repo geneli duplikasyon** — tarayıcı tek dosyaya bakar; aynı
  mantığın üç dosyada tekrarı ancak jscpd ile (CI katmanı) görünür.
- **MTK iş mantığı** — halüsine API, yanlış iş kuralı, sessiz kapsam kayması.
  Bunların mekanik karşılığı yok; kod okunmadan bilinmez.
- **TST-06 mutlu yol** — testin var olması yeterli değil; hata yolunu
  kapsıyor mu diye bak.

## Kapsamlı inceleme isteniyorsa

Tarayıcı bulgularını listele, sonra yukarıdaki dört başlığı elle değerlendir
ve hangisine baktığını açıkça söyle. Bakmadığın şey için "temiz" deme.
