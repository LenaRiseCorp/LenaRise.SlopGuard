---
description: SlopGuard ayarlarını değiştir (eşik, kapatılan desen, güvenilen paket)
argument-hint: "[ne yapmak istediğin]"
allowed-tools: Bash(node:*), Read, Edit, Write
---

Kullanıcının isteği: $ARGUMENTS

`slop-config` skill'ini kullan. Skill tam şemayı, niyet → eylem eşlemesini ve
güvenlik kurallarını taşır.

Değişiklikten önce mevcut durumu göster:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/status.mjs"`
