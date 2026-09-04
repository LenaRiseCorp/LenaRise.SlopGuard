/**
 * Oturum durumu.
 *
 * ~/.claude/lenarise-slopguard/session-<id>.json içinde tutulur. İki tüketicisi var:
 *   - koç katmanı (Katman 2): eşikleri ölçer, uyarıyı oturumda bir kez gösterir
 *   - stop-gate: açık ihlal ve doğrulama durumunu okur
 *
 * Açık ihlal defteri neden burada: post-edit'in bloğu modeli durdurmuyor
 * (ölçüldü, docs/dogrulama-kaydi.md). Sert garanti Stop katmanında kuruluyor —
 * post-edit bulduğunu buraya yazar, stop-gate defteri boş değilse turu bitirtmez.
 *
 * İhlal defteri dosya bazlı ve her taramada o dosyanın girdisi tamamen
 * değiştirilir. Böylece düzeltilen ihlal kendiliğinden düşer; ayrı bir
 * "çözüldü" işaretine ve onu unutma riskine gerek kalmaz.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { paths } from './config.mjs';
import { fail } from './report.mjs';

export const SESSION_VERSION = 1;

export function emptySession(sessionId) {
  return {
    version: SESSION_VERSION,
    sessionId: String(sessionId ?? 'bilinmeyen'),
    startedAt: Date.now(),
    updatedAt: Date.now(),
    turns: 0,
    linesWritten: 0,
    linesRead: 0,
    linesSinceCommit: 0,
    filesWritten: {},          // yol → yazma sayısı
    lastEditedFile: null,
    consecutiveEdits: 0,       // aynı dosyaya ardışık düzenleme (MTK-05)
    blocked: 0,                // engellenen slop
    suppressions: 0,           // kullanılan satır içi muafiyet
    byCategory: {},            // kategori → bulgu sayısı
    violations: {},            // yol → [{key, id, line, title}]
    testRunAt: null,
    commitAt: null,
    warned: [],                // gösterilen koç uyarıları — bir kez kuralı
    decisions: {},             // örn. { unprotected: true }
    modeOverride: null,
  };
}

/** Oturumu okur. Dosya yoksa ya da bozuksa yeni oturum döner — ama sessizce değil. */
export function loadSession(sessionId) {
  const file = paths.session(sessionId);
  if (!existsSync(file)) return emptySession(sessionId);
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed?.version !== SESSION_VERSION) {
      return { ...emptySession(sessionId), ...parsed, version: SESSION_VERSION };
    }
    return { ...emptySession(sessionId), ...parsed };
  } catch (error) {
    fail('session', `oturum dosyası okunamadı (${file}); sıfırdan başlatılıyor — ${error.message}`);
    return emptySession(sessionId);
  }
}

/**
 * Oturumu yazar. Geçici dosya + rename ile atomik:
 * aynı anda tetiklenen iki hook yarı yazılmış JSON bırakamaz.
 */
export function saveSession(state) {
  const file = paths.session(state.sessionId);
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    state.updatedAt = Date.now();
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, file);
    return true;
  } catch (error) {
    fail('session', `oturum yazılamadı (${file}) — ${error.message}`);
    if (existsSync(tmp)) {
      try { unlinkSync(tmp); } catch (cleanupError) { fail('session', `geçici dosya silinemedi — ${cleanupError.message}`); }
    }
    return false;
  }
}

/** Oku → değiştir → yaz. Mutator'ın dönüş değeri çağırana geçer. */
export function updateSession(sessionId, mutator) {
  const state = loadSession(sessionId);
  const result = mutator(state);
  saveSession(state);
  return result;
}

// ── Kayıt yardımcıları ───────────────────────────────────────────────────

/** Bir turu kaydeder. UserPromptSubmit'te çağrılır. */
export function recordTurn(state) {
  state.turns += 1;
  return state.turns;
}

/** Dosya yazımını kaydeder; aynı dosyaya ardışık düzenlemeyi sayar (MTK-05). */
export function recordWrite(state, filePath, { added = 0, removed = 0 } = {}) {
  state.filesWritten[filePath] = (state.filesWritten[filePath] ?? 0) + 1;
  state.linesWritten += added;
  state.linesSinceCommit += added + removed;
  if (state.lastEditedFile === filePath) state.consecutiveEdits += 1;
  else { state.lastEditedFile = filePath; state.consecutiveEdits = 1; }
  return state.consecutiveEdits;
}

/** Okunan satırları kaydeder — kavrayış borcu ölçümü (INS-01). */
export function recordRead(state, lineCount) {
  state.linesRead += Math.max(0, Number(lineCount) || 0);
}

/**
 * Bir dosyanın ihlal defterini tazeler.
 * Boş dizi geçmek o dosyayı defterden düşürür — düzeltme böyle tanınır.
 */
export function recordViolations(state, filePath, findings) {
  const live = findings.filter((f) => !f.suppression);
  if (live.length === 0) delete state.violations[filePath];
  else state.violations[filePath] = live.map((f) => ({ key: f.key, id: f.id, line: f.line, title: f.title }));

  state.blocked += live.filter((f) => f.severity === 'block').length;
  state.suppressions += findings.filter((f) => f.suppression).length;
  for (const f of live) state.byCategory[f.category] = (state.byCategory[f.category] ?? 0) + 1;
  return live.length;
}

/** Defterde duran tüm açık ihlaller, düz liste. */
export function openViolations(state) {
  return Object.entries(state.violations ?? {}).flatMap(([file, items]) =>
    items.map((item) => ({ file, ...item })));
}

export function recordTestRun(state) { state.testRunAt = Date.now(); }

export function recordCommit(state) {
  state.commitAt = Date.now();
  state.linesSinceCommit = 0;
  state.testRunAt = null;   // yeni commit, yeni doğrulama gerekir
}

/** Bir uyarı bu oturumda gösterildi mi? Gösterilmediyse işaretler ve true döner. */
export function claimWarning(state, signal) {
  if (state.warned.includes(signal)) return false;
  state.warned.push(signal);
  return true;
}

/** Oturum sonu özeti — öz-beyan yerine ölçüm (INS-02). */
export function sessionSummary(state) {
  const files = Object.keys(state.filesWritten).length;
  const parts = [
    `${state.turns} tur`,
    `${files} dosya`,
    `${state.linesWritten} satır yazıldı`,
    `${state.blocked} engellenen slop`,
  ];
  if (state.suppressions > 0) parts.push(`${state.suppressions} muafiyet kullanıldı`);
  const open = openViolations(state).length;
  if (open > 0) parts.push(`${open} açık ihlal`);
  return parts.join(' · ');
}
