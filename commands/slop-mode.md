---
description: Bu oturumun kipini değiştir (strict veya explore)
argument-hint: "strict|explore"
allowed-tools: Bash(node:*)
---

Çalıştır:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/mode.mjs" $ARGUMENTS`

Kip değişikliği yalnızca bu oturumu etkiler; kalıcı yapılandırma değişmez.
Kullanıcı kalıcı gevşetme isterse bunu ayrıca söyle ve `/slop-config` kullan.

Keşif kipinin neyi gevşetmediğini de söyle: geri dönüşsüz komutlar
(rm -rf, DROP TABLE, force push), korumalı yollar (.env, lockfile, CI) ve
doğrulanmamış paket kurulumları her kipte engellenir.
