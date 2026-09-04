---
description: Bu repoya agent-agnostic slop korumasını kur (AGENTS.md, git hook, CI)
allowed-tools: Bash(node:*)
---

Çalıştır:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/repo-init.mjs"`

Kurulan dosyaların ne işe yaradığını kullanıcıya kısaca anlat:

- `AGENTS.md` — Cursor, Codex, Copilot ve Claude Code'un okuduğu ortak kural dosyası
- `.slopignore` — bu repoda taranmayacak yollar
- `.git/hooks/pre-commit` — yalnızca bu makinede çalışır, klonlanmaz
- `.github/workflows/slop-gate.yml` — asıl kapı; ekipteki herkesi kapsar

CI şablonundaki `OWNER` yer tutucusunu gerçek GitHub hesabıyla değiştirmesi
gerektiğini söyle. Bunu sen tahmin etme, sor.
