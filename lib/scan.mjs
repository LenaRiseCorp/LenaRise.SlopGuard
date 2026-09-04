/**
 * Eşleştirme motoru.
 *
 * patterns.mjs veriyi tutar, bu dosya onu içeriğe uygular. Ayrım kasıtlı:
 * gen-docs.mjs desen defterini motoru yüklemeden okuyabilsin diye.
 *
 * Üç giriş noktası vardır ve hepsi aynı bulgu (finding) şeklini döndürür:
 *   scanContent  — dosya içeriği   (post-edit)
 *   scanPath     — dosya yolu      (pre-edit)
 *   scanCommand  — kabuk komutu    (pre-bash)
 */

import {
  PATTERNS, CATEGORIES, titleOf,
  PROSE_EXTENSIONS, CODE_EXTENSIONS,
  TEST_PATH_PATTERNS, PROTECTED_PATH_PATTERNS,
} from './patterns.mjs';

/** Uzantıya göre dosya sınıfı. Bilinmeyen uzantı taranmaz — sessizce değil, bilerek. */
export function classify(filePath) {
  const lower = String(filePath || '').toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot === -1 ? '' : lower.slice(dot);
  if (PROSE_EXTENSIONS.includes(ext)) return 'prose';
  if (CODE_EXTENSIONS.includes(ext)) return 'code';
  return 'other';
}

export function isTestPath(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  return TEST_PATH_PATTERNS.some((re) => re.test(p));
}

/** Korumalı yolsa gerekçesini döndürür, değilse null. */
export function protectedPathReason(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  const hit = PROTECTED_PATH_PATTERNS.find((entry) => entry.re.test(p));
  return hit ? hit.why : null;
}

/**
 * Markdown kod bloklarını ve satır içi backtick'leri aynı uzunlukta boşlukla
 * değiştirir; satır sonları korunur, böylece satır ve sütun numaraları kayar değil.
 *
 * Neden: prose desenleri bir ifadeyi *kullanmayı* yakalar, *anmayı* değil.
 * Desen kataloğunda `seamlessly` yazan bir README, o kelimeyi kullanmıyor.
 */
export function stripCodeSpans(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return String(text)
    .replace(/^```[\s\S]*?^```/gm, blank)   // çitli blok
    .replace(/^~~~[\s\S]*?^~~~/gm, blank)   // alternatif çit
    .replace(/`[^`\n]*`/g, blank)           // satır içi kod
    .replace(/^(?: {4}|\t)[^\n]*$/gm, blank); // girintili blok
}

/** Karakter indeksinden 1 tabanlı satır ve sütun. */
export function positionAt(text, index) {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const column = index - (before.lastIndexOf('\n') + 1) + 1;
  return { line, column };
}

function excerptAt(text, index, length) {
  const start = text.lastIndexOf('\n', index) + 1;
  let end = text.indexOf('\n', index + length);
  if (end === -1) end = text.length;
  const raw = text.slice(start, end).trim();
  return raw.length > 160 ? raw.slice(0, 157) + '...' : raw;
}

function makeFinding(pattern, { line, column, excerpt, target }) {
  return {
    key: pattern.key,
    id: pattern.id,
    category: pattern.id.slice(0, 3),
    categoryName: CATEGORIES[pattern.id.slice(0, 3)].name,
    title: titleOf(pattern.id),
    severity: pattern.severity,
    gate: pattern.gate ?? null,
    detects: pattern.detects,
    fix: pattern.fix,
    scope: pattern.scope,
    line, column, excerpt, target,
    suppression: null,          // geçerli muafiyet varsa doldurulur
    suppressionRejected: null,  // yönerge yazılmış ama koşulu sağlamıyorsa doldurulur
  };
}

/**
 * Satır içi muafiyet.
 *
 * `.slopignore` yol bazlı muafiyeti taşır; bu ise tek bir bulguyu susturur.
 * Politikanın kendisi ignore.mjs içinde tanımlıdır — motor onu yalnızca
 * uygular, kuralını koymaz.
 */
import { suppressionFor } from './ignore.mjs';

/**
 * Etkin desenleri süzer. Devre dışı bırakma üç düzeyde çalışır:
 * kategori ("GUV"), taksonomi ID'si ("GUV-03"), tekil desen ("guv-03-aws-key").
 */
export function activePatterns(scope, config = {}) {
  const disabled = new Set((config.disabled ?? []).map((d) => String(d).toLowerCase()));
  return PATTERNS.filter((p) => {
    if (p.scope !== scope) return false;
    return !(
      disabled.has(p.key.toLowerCase()) ||
      disabled.has(p.id.toLowerCase()) ||
      disabled.has(p.id.slice(0, 3).toLowerCase())
    );
  });
}

/** Dosya içeriğini tarar. Sınıfı 'other' olan dosya taranmaz. */
export function scanContent({ filePath, content, config = {} }) {
  const kind = classify(filePath);
  if (kind === 'other') return [];

  const text = String(content ?? '');
  const haystack = kind === 'prose' ? stripCodeSpans(text) : text;
  const lines = text.split('\n');
  const findings = [];

  for (const pattern of activePatterns(kind, config)) {
    const re = new RegExp(pattern.match.source, pattern.match.flags.includes('g')
      ? pattern.match.flags
      : pattern.match.flags + 'g');
    let m;
    while ((m = re.exec(haystack)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      const { line, column } = positionAt(haystack, m.index);
      const finding = makeFinding(pattern, {
        line, column,
        excerpt: excerptAt(text, m.index, m[0].length),
        target: filePath,
      });
      const s = suppressionFor(finding, lines);
      finding.suppression = s?.ok ? s : null;
      finding.suppressionRejected = s && !s.ok ? s : null;
      findings.push(finding);
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Dosya yolunu tarar (yazma gerçekleşmeden önce). */
export function scanPath({ filePath, config = {} }) {
  const target = String(filePath || '').replace(/\\/g, '/');
  const findings = [];
  for (const pattern of activePatterns('path', config)) {
    const re = new RegExp(pattern.match.source, pattern.match.flags.replace('g', ''));
    if (re.test(target)) {
      findings.push(makeFinding(pattern, { line: 0, column: 0, excerpt: target, target }));
    }
  }
  return findings;
}

/** Kabuk komutunu tarar (çalıştırılmadan önce). */
export function scanCommand({ command, config = {} }) {
  const text = String(command ?? '');
  const findings = [];
  for (const pattern of activePatterns('command', config)) {
    const re = new RegExp(pattern.match.source, pattern.match.flags.includes('g')
      ? pattern.match.flags
      : pattern.match.flags + 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      const { line, column } = positionAt(text, m.index);
      findings.push(makeFinding(pattern, {
        line, column,
        excerpt: excerptAt(text, m.index, m[0].length),
        target: 'komut',
      }));
    }
  }
  return findings;
}

/**
 * Bir dosya listesini tarar. selfscan, pre-commit ve CI aynı motoru kullansın diye
 * burada; üç ayrı yerde üç ayrı yürüyüş yazmak kendi KOD-01 kuralımızı ihlal ederdi.
 *
 * @param {object} opts
 * @param {string[]} opts.files      taranacak yollar (repoRoot'a göreli)
 * @param {(rel:string)=>string|null} opts.read  içerik okuyucu; null dönerse dosya atlanır
 * @param {object} [opts.config]
 * @param {(rel:string)=>boolean} [opts.skip]    true dönen yol hiç taranmaz
 */
export function scanFiles({ files, read, config = {}, skip }) {
  const results = [];
  let scanned = 0;
  let suppressedCount = 0;
  let skipped = 0;

  for (const rel of files) {
    if (skip?.(rel)) { skipped++; continue; }
    const pathFindings = scanPath({ filePath: rel, config });
    const content = read(rel);
    const contentFindings = content === null ? [] : scanContent({ filePath: rel, content, config });
    scanned++;
    suppressedCount += suppressed(contentFindings).length;
    const live = [...actionable(pathFindings), ...actionable(contentFindings)];
    if (live.length > 0) results.push([rel, live]);
  }

  const total = results.reduce((n, [, f]) => n + f.length, 0);
  return { results, scanned, skipped, suppressed: suppressedCount, total };
}

/** Susturulmamış — yani gerçekten işlem gerektiren bulgular. */
export function actionable(findings) {
  return findings.filter((f) => !f.suppression);
}

/** Muafiyetle susturulmuş bulgular. Sayılır ve oturum özetinde raporlanır. */
export function suppressed(findings) {
  return findings.filter((f) => f.suppression);
}
