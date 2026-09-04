<!-- LenaRise.SlopGuard: canlılık kuralı — başlangıç -->
## LenaRise.SlopGuard canlılık kontrolü

Bu bölüm bilerek plugin'in dışında, `~/.claude/CLAUDE.md` içinde duruyor.

Mantık şu: hook'lar kayıtlı değilse hiçbir hook çalışmaz — "çalışıyor musun?"
diye soracak hook dahil. Yokluk, yok olan şeye sordurularak tespit edilemez.
Bu kural, güçlü katmanın yokluğunu tespit edebilen tek katman.

Oturumun başında bir kez, iki dosyaya bak:

```bash
cat ~/.claude/lenarise-slopguard/heartbeat.json 2>/dev/null
cat ~/.claude/lenarise-slopguard/config.json 2>/dev/null
```

**Damga tazeyse (bir günden yeni) hiçbir şey söyleme.** Çalışan koruma sessizdir.

Damga yoksa ya da bir günden eskiyse, `config.json` içindeki
`ui.livenessCheck` değerine göre davran:

| `ui.livenessCheck` | Ne yaparsın |
|---|---|
| `ask` (varsayılan) | Kullanıcıya söyle ve **cevabını bekle**: `/slop-doctor` ile teşhis mi, korumasız devam mı? |
| `warn` | Bir kez uyar, cevap bekleme, işe devam et |
| `off` | Hiçbir şey söyleme |

`config.json` okunamıyorsa `ask` varsay.

Kullanıcı korumasız devam derse **aynı oturumda bir daha sorma**. Tekrar eden
uyarı görmezden gelinir, ve görmezden gelinen uyarı da bir slop biçimidir.

Bu kontrolü sessizce atlama. Koruma olmaması kadar tehlikeli olan şey,
koruma olduğunu sanmaktır.
<!-- LenaRise.SlopGuard: canlılık kuralı — bitiş -->
