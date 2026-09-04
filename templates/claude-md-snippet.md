<!-- LenaRise.SlopGuard: canlılık kuralı — başlangıç -->
## LenaRise.SlopGuard canlılık kontrolü

Bu bölüm bilerek plugin'in dışında, `~/.claude/CLAUDE.md` içinde duruyor.

Mantık şu: hook'lar kayıtlı değilse hiçbir hook çalışmaz — "çalışıyor musun?"
diye soracak hook dahil. Yokluk, yok olan şeye sordurularak tespit edilemez.
Bu kural, güçlü katmanın yokluğunu tespit edebilen tek katman.

Oturumun başında `~/.claude/lenarise-slopguard/heartbeat.json` dosyasına bak:

- Dosya yoksa ya da `ts` alanı bir günden eskiyse: kullanıcıya söyle ki
  LenaRise.SlopGuard yanıt vermiyor ve bu oturum korumasız çalışıyor. İki
  seçenek sun: `/slop-doctor` ile teşhis, ya da korumasız devam. Kullanıcı
  korumasız devam derse **aynı oturumda bir daha sorma** — tekrar eden uyarı
  görmezden gelinir, o da bir slop biçimidir.
- Damga tazeyse hiçbir şey söyleme. Çalışan koruma sessizdir.

Bu kontrolü sessizce atlama. Koruma olmaması kadar tehlikeli olan şey,
koruma olduğunu sanmaktır.
<!-- LenaRise.SlopGuard: canlılık kuralı — bitiş -->
