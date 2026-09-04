# Kendi kurallarım

Bu dosya her oturum başında modele enjekte edilir. Kısa tut: uzun kural seti
okunmaz, ve aşırı bağlam kendi taksonomimizde bir slop türü (AGT-02).

Plugin güncellemesi bu dosyaya asla dokunmaz.

Örnekler — kendine göre değiştir, işine yaramayanı sil:

- Tarih biçimi her yerde ISO 8601.
- Yeni bağımlılık eklemeden önce sor.
- Türkçe yorum yaz, değişken adları İngilizce.
- Veritabanı şeması değişikliği migration dosyası olmadan yapılmaz.
- Bu projede `console.log` yerine `logger` kullanılır.
