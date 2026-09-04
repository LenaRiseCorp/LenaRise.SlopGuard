/**
 * Bulguların biçimlendirilmesi ve hook çıktı sözleşmesi.
 *
 * Buradaki şemalar tahmin değil: hepsi bu makinede, bu Claude Code sürümünde
 * fiilen sınandı. Ölçümler docs/dogrulama-kaydi.md içinde.
 *
 *   PreToolUse   → hookSpecificOutput.permissionDecision: deny  (aracı gerçekten durdurur)
 *   PostToolUse  → decision: "block"  (blok sebebi modele iletilir, ama araç zaten çalışmıştır)
 *   Stop         → decision: "block"  (turu bitirtmez; stop_hook_active ile döngü koruması)
 *   systemMessage→ kullanıcıya notice olarak görünür, modele gitmez
 *   additionalContext → SessionStart'ta modelin bağlamına enjekte edilir
 *
 * Sert durdurma garantisi yalnızca PreToolUse deny ve Stop block'tadır.
 * post-edit bir düzeltme talebidir; kilit stop-gate'tedir.
 */

const BRAND = 'LenaRise.SlopGuard';

/** Tek JSON satırı yazar ve çıkar. Hook protokolü stdout'ta tek nesne bekler. */
export function emit(payload) {
  process.stdout.write(JSON.stringify(payload));
}

/** Sessiz onay: çıktı yok, çıkış 0. Temiz tarama böyle görünür. */
export function allow() {
  // Bilerek boş: Claude Code çıktısız ve sıfır çıkışlı hook'u "karışma" sayar.
}

export function deny(reason, { hookEventName = 'PreToolUse' } = {}) {
  emit({ hookSpecificOutput: { hookEventName, permissionDecision: 'deny', permissionDecisionReason: reason } });
}

export function ask(reason, { hookEventName = 'PreToolUse' } = {}) {
  emit({ hookSpecificOutput: { hookEventName, permissionDecision: 'ask', permissionDecisionReason: reason } });
}

/** PostToolUse ve Stop için blok. */
export function block(reason) {
  emit({ decision: 'block', reason });
}

/** Kullanıcıya görünen uyarı. Modele gitmez — Katman 2 bunun üstüne kurulu. */
export function notify(message, extra = {}) {
  emit({ systemMessage: message, ...extra });
}

/** Modelin bağlamına metin enjekte eder. */
export function inject(hookEventName, additionalContext) {
  emit({ hookSpecificOutput: { hookEventName, additionalContext } });
}

/**
 * Hata bildirimi — asla sessiz.
 *
 * Hook kendi hatası yüzünden bloklamaz: kendi bug'ımızın kullanıcının işini
 * durdurması kabul edilemez. Ama hata görünmez de olmaz; stderr'e yazılır ve
 * çağıran bunu kalp atışına "bozuk" olarak işler, durum çubuğu da öyle gösterir.
 */
export function fail(where, error) {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${BRAND} [${where}] hata: ${detail}\n`);
}

/** Bulguları kategorilere göre sayar. */
export function summarize(findings, config = {}) {
  const strict = config.mode !== 'explore';
  const live = findings.filter((f) => !f.suppression);
  return {
    total: findings.length,
    blocked: strict ? live.filter((f) => f.severity === 'block').length : 0,
    warned: strict ? live.filter((f) => f.severity === 'warn').length : live.length,
    suppressed: findings.filter((f) => f.suppression).length,
    rejectedDirectives: findings.filter((f) => f.suppressionRejected).length,
  };
}

function locate(finding) {
  if (finding.scope === 'command') return 'komut';
  if (finding.scope === 'path') return 'dosya adı';
  return `satır ${finding.line}`;
}

/** Tek bulgunun okunur gösterimi. Hem insan hem model bunu okur. */
export function formatFinding(finding) {
  const lines = [
    `  ${finding.id}  ${locate(finding)}  ${finding.title}`,
    `        ${finding.detects}`,
  ];
  if (finding.excerpt) lines.push(`        > ${finding.excerpt}`);
  lines.push(`        Düzelt: ${finding.fix}`);
  if (finding.suppressionRejected) {
    lines.push(`        Not: satır ${finding.suppressionRejected.atLine} muafiyeti geçersiz — ${REJECTION_TEXT[finding.suppressionRejected.rejected]}`);
  }
  return lines.join('\n');
}

const REJECTION_TEXT = {
  'hedef-yok': 'hangi deseni susturduğu yazılmamış (örn. slop-guard-ignore KOD-05: sebep)',
  'gerekce-yok': 'gerekçe yazılmamış; gerekçesiz muafiyet kabul edilmiyor',
  'baska-hedef': 'başka bir deseni hedefliyor',
};

/**
 * Bulgu listesini hook mesajına çevirir.
 * `target` dosya yolu ya da komut; başlıkta gösterilir.
 */
export function formatFindings(findings, { config = {}, target, action = 'block' } = {}) {
  const live = findings.filter((f) => !f.suppression);
  if (live.length === 0) return '';
  const mode = config.mode === 'explore' ? 'keşif kipi' : 'sert kip';
  const verb = action === 'block' ? 'engellendi' : 'uyarı';
  const head = `${BRAND} — ${live.length} desen ${verb} (${mode})${target ? `\n  ${target}` : ''}`;
  const body = live.map(formatFinding).join('\n\n');
  const sup = findings.filter((f) => f.suppression).length;
  const tail = sup > 0 ? `\n\n  (${sup} bulgu satır içi muafiyetle susturuldu)` : '';
  return `${head}\n\n${body}${tail}`;
}

/** Temiz tarama satırı — `cleanScans: "summary"` kipinde kullanılır. */
export function formatCleanScan(fileCount) {
  return `${BRAND}: ${fileCount} dosya tarandı · temiz`;
}

export { BRAND };
