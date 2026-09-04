---
name: slop-repo-init
description: Bir repoya agent-agnostic slop koruması kurmak için kullan — kullanıcı "bu repoyu koru", "ekip için kur", "CI'ya ekle", "AGENTS.md oluştur", "pre-commit hook kur" dediğinde ya da korumanın Claude Code dışındaki agent'ları da kapsamasını istediğinde.
---

# Repo katmanı kurulumu

## Neden ayrı bir katman

Claude Code hook'ları yalnızca Claude Code'u kapsar. Aynı repoda Cursor,
Codex, Copilot ya da insan çalışıyorsa onları hook'lar görmez. Git hook'u
ve CI herkesi görür.

## Çalıştır

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/repo-init.mjs"
```

Var olan dosyalar ezilmez. Ezilmediği bildirilen bir dosya varsa kullanıcıya
söyle ve birleştirmeyi teklif et.

## Kurulan dosyalar

| Dosya | Kapsam | Not |
|---|---|---|
| `AGENTS.md` | tüm agent'lar | Kural setinden üretilir; elle düzenlenirse kaynakla ayrışır |
| `.slopignore` | bu repo | Taranmayacak yollar |
| `.git/hooks/pre-commit` | yalnızca bu makine | Klonlanmaz; ekip için yeterli değil |
| `.github/workflows/slop-gate.yml` | ekibin tamamı | **Asıl kapı budur** |

## Kurulumdan sonra

1. CI şablonundaki `OWNER` yer tutucusunu gerçek GitHub hesabıyla değiştir.
   Tahmin etme, kullanıcıya sor.
2. Git hook'unun klonlanmadığını söyle. Ekipteki herkesin çalıştırması için
   `core.hooksPath` ile repo içi bir dizin kullanılabilir; bunu teklif et.
3. `.slopignore` varsayılanını gözden geçir — `vendor` ve `dist` gibi
   girdiler projeye uymayabilir.
4. İlk taramayı çalıştır ve mevcut repoda kaç bulgu olduğunu göster:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/check.mjs"`.
   Var olan bir repoda bu sayı yüksek çıkabilir; hepsini bir seferde
   düzeltmeyi dayatma, kullanıcıyla öncelik belirle.
