---
description: SlopGuard kurulumunu teşhis et ve sorunları düzeltmeyi öner
allowed-tools: Bash(node:*)
---

Çalıştır:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs"`

Çıktıyı kullanıcıya göster. ❌ satırı varsa:

1. Her birinin `→` satırındaki düzeltmeyi uygula ya da uygulamayı teklif et.
2. Düzeltme kullanıcının makinesinde bir dosya değiştirecekse önce sor.
3. Hiçbir ❌ satırını "muhtemelen önemsizdir" diye geçme — teşhis aracının
   belirsizliği iyimserliğe yuvarlaması, teşhis olmamasından kötüdür.

Kalp atışı yoksa ya da bayatsa en olası sebep kurulumdan sonra Claude Code'un
yeniden başlatılmamış olmasıdır. Bunu kullanıcıya söyle; yeniden başlatmayı
sen yapamazsın.
