---
description: SlopGuard yapılandırmasını oluştur ve durum çubuğunu kaydet
allowed-tools: Bash(node:*)
---

Çalıştır:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"`

Bu komut var olan hiçbir dosyayı ezmez; her güncellemeden sonra güvenle
tekrar çalıştırılabilir.

Çıktıda `!` ile başlayan satır varsa kullanıcıya ne yapması gerektiğini söyle.
Kullanıcının kendi `statusLine` girdisi varsa üzerine yazma — hangi satırla
değiştirebileceğini göster, kararı ona bırak.

Son adımda `~/.claude/CLAUDE.md` için canlılık kuralı önerilir. Bu kural
plugin hiç çalışmadığında bile durumun fark edilmesini sağlar. Kullanıcı
isterse şablonu oku ve dosyaya ekle — ama önce sor, CLAUDE.md onun dosyası.

Bitince yeniden başlatma gerektiğini hatırlat ve `/slop-doctor` öner.
