# Doğrulama kaydı

PLAN.md'deki "Doğrulama" maddelerinin **fiilen** sınanmış sonuçları. Tahmin değil, ölçüm.
Her satır çalıştırılabilir bir komuta ve gözlenen bir çıktıya dayanır.

Ortam: Claude Code 2.1.241 · Node v22.14.0 · darwin 25.6.0

---

## D5 — Hook'lar bypass permissions modunda çalışıyor mu

**Sonuç: Evet.** Koruma hook katmanında kalabilir; permission katmanına kaydırmaya gerek yok.

Düzenek: geçici dizinde `--settings` ile probe hook'ları kaydedildi, `claude -p` başsız
oturumda çalıştırıldı, hook'un stdin'de aldığı yük dosyaya döküldü.

| Sınanan | Komut | Gözlenen |
|---|---|---|
| Hook tetikleniyor mu | `claude -p … --permission-mode bypassPermissions` | SessionStart · UserPromptSubmit · PreToolUse · PostToolUse · Stop hepsi tetiklendi |
| Hook modu görüyor mu | PreToolUse yükü | `permission_mode: "bypassPermissions"` alanı mevcut |
| `permissionDecision: "deny"` | Bash aracına deny döndürüldü | Komut **yürütülmedi**; PostToolUse hiç tetiklenmedi; model "denied" raporladı |
| `--dangerously-skip-permissions` | Aynı test, gerçek bayrakla | Aynı sonuç |
| Stop `decision: "block"` | Stop hook'u ilk çağrıda blokladı | Model durdurulamadı, `num_turns` 2→3; ikinci çağrıda `stop_hook_active: true` |

### Ölçülen nüans — planın düzeltilmesi gereken yeri

`PostToolUse` + `decision: "block"` tetikleniyor ve blok sebebi transcript'e
`hook_blocking_error` eki olarak **teslim ediliyor**:

```json
{ "attachment": { "type": "hook_blocking_error", "hookName": "PostToolUse:Write",
    "hookEvent": "PostToolUse",
    "blockingError": { "blockingError": "…sebep…", "command": "…" } } }
```

Ancak iki şey doğru değil:

1. Yazma **zaten gerçekleşmiştir** — PostToolUse adı üstünde araçtan sonra çalışır.
   Dosya diskte durur; blok yalnızca modele "bunu düzelt" der.
2. Model bloğu **görmezden gelebilir**. Testte model bloğu aldı ve yine de "Done" deyip bitirdi.

Sonuç: sert durdurma garantisi yalnızca **`PreToolUse deny`** ve **`Stop block`**'tadır.
`post-edit` bir *düzeltme talebi*, kilit değil. Garanti şöyle kurulur: `post-edit` bulduğu
ihlali oturum durumuna **açık ihlal** olarak yazar; `stop-gate` açık ihlal varken turu
bitirmez. Kilit `Stop` katmanındadır.

## D13 — statusLine stdin'de `session_id` alıyor mu

**Sonuç: Evet.** Planın yedek "artan sayaç" yöntemine gerek yok.

`-p` başsız modda statusLine **hiç çağrılmaz**; ölçüm için gerçek TTY gerekti
(`expect` ile pty altında etkileşimli oturum).

Alınan yükün tam şeması:

```json
{ "session_id": "…", "transcript_path": "…", "cwd": "…",
  "model": { "id": "…", "display_name": "…" },
  "workspace": { "current_dir": "…", "project_dir": "…", "added_dirs": [] },
  "version": "2.1.241", "output_style": { "name": "default" },
  "cost": { "total_cost_usd": 0, "total_duration_ms": 0, "total_api_duration_ms": 0,
            "total_lines_added": 0, "total_lines_removed": 0 },
  "context_window": { "total_input_tokens": 0, "total_output_tokens": 0,
                      "context_window_size": 200000, "current_usage": null,
                      "used_percentage": null, "remaining_percentage": null },
  "exceeds_200k_tokens": false, "fast_mode": false, "thinking": { "enabled": true },
  "rate_limits": { "five_hour": {…}, "seven_day": {…} } }
```

### Kayıt kanıtı doğrulandı

Tek bir canlı oturumda SessionStart hook'u, UserPromptSubmit hook'u ve statusLine
**birebir aynı** `session_id`'yi gördü. Damgadaki `sessionId` ile statusLine'ın
`session_id`'sini karşılaştırmak geçerli bir kayıt kanıtıdır.

### Plana yansıyan iki kazanç

- `+420/-80` sayacı elle tutulmayacak: `cost.total_lines_added` / `total_lines_removed` hazır geliyor.
- Bağlam çürümesi (AGT-01) tur sayacı yerine `context_window.used_percentage` ile ölçülebilir —
  tur sayısı bir vekil, doluluk oranı doğrudan ölçüdür.

### Ölçülen sınır

statusLine **sürekli değil, olay tetiklemeli** yenilenir: ~30 saniyelik oturumda 2 çağrı.
`bozuk` durumu anında değil, bir sonraki olayda görünür. Çubuk bunu iddia etmemeli.
