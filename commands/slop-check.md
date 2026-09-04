---
description: Dosyaları veya değişiklikleri slop desenlerine karşı tara
argument-hint: "[yol...]"
allowed-tools: Bash(node:*)
---

Çalıştır:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs" $ARGUMENTS`

Bulgu varsa her birini kullanıcıya göster ve düzeltmeyi teklif et.
Muafiyet yazmayı **kendiliğinden önerme**: önce düzeltmeyi dene. Muafiyet
ancak desen gerçekten yanlış pozitifse ve kullanıcı onaylarsa yazılır,
gerekçesiyle birlikte.

Tarayıcı Guard-and-Go (KOD-04) ve repo geneli duplikasyonu (KOD-01) tam
yakalayamaz. Kullanıcı kapsamlı inceleme isterse bunları elle de kontrol et.
