/**
 * Satır içi muafiyet politikası — katı kip.
 *
 * Regex taraması yanlış pozitif üretir; bu gizlenmiyor, planın "Bilinen sınırlar"
 * maddesi. Muafiyet mekanizması bu yüzden var. Ama aynı mekanizma aracın en
 * kırılgan yeri: fazla gevşek olursa lastik damgaya döner ve tarayıcı var olmakla
 * olmamak arasında fark bırakmaz.
 *
 * Bu yüzden üç koşul birden aranır:
 *   1. Yönerge, bulgunun satırında ya da tam üstündeki satırda olmalı
 *   2. Hangi deseni susturduğunu adlandırmalı (key, ID ya da kategori)
 *   3. Gerekçe yazmalı — gerekçesiz muafiyet muafiyet değildir, sessizliktir
 *
 * Tanınan biçim:
 *   // slop-guard-ignore KOD-05: üçüncü parti SDK burada throw ediyor
 *   #  slop-guard-ignore GUV-03: test fixture, gerçek anahtar değil
 *
 * Koşulları sağlamayan yönerge bulguyu susturmaz — ve sessizce de düşmez:
 * neden reddedildiği bulguya iliştirilir, kullanıcı yazdığı satırın işe
 * yaramadığını görür.
 */

/** Bir satırdaki muafiyet yönergesini ayrıştırır; yoksa null. */
export function parseDirective(line) {
  const text = String(line ?? '');
  if (!text.includes('slop-guard-ignore')) return null;
  const m = /slop-guard-ignore(?:-file)?(?:[ \t]+([A-Za-z]{3}-\d{2}|[A-Za-z]{3}|[a-z0-9][a-z0-9-]*))?[ \t]*(?::[ \t]*(.*))?$/
    .exec(text);
  if (!m) return { target: null, reason: '', hasReason: false };
  const reason = (m[2] ?? '').trim();
  return { target: m[1] ?? null, reason, hasReason: reason.length > 0 };
}

/** Yönerge bu bulguyu hedefliyor mu? Hedefsiz yönerge hiçbir şeyi hedeflemez. */
export function directiveMatches(directive, finding) {
  if (!directive?.target) return false;
  const t = directive.target.toLowerCase();
  return t === finding.key.toLowerCase()
      || t === finding.id.toLowerCase()
      || t === finding.category.toLowerCase();
}

/** Reddedilme gerekçesinin insan okunur karşılığı. */
export const REJECTION_REASONS = {
  'hedef-yok': 'muafiyet hangi deseni susturduğunu adlandırmıyor',
  'gerekce-yok': 'muafiyetin gerekçesi yazılmamış',
  'baska-hedef': 'muafiyet başka bir deseni hedefliyor',
};

/**
 * Bulgu için geçerli muafiyeti arar.
 *
 * Dönüş:
 *   null                                     — ilgili satırlarda yönerge yok
 *   { ok: true,  reason, target, atLine }    — muafiyet geçerli, bulgu susar
 *   { ok: false, rejected, atLine }          — yönerge var ama koşulu sağlamıyor
 */
export function suppressionFor(finding, lines) {
  if (!Array.isArray(lines) || !Number.isInteger(finding?.line) || finding.line < 1) return null;

  // Bulgunun kendi satırı, sonra bir üstü. Daha uzağa bakılmaz.
  const candidates = [finding.line, finding.line - 1];
  let rejection = null;

  for (const lineNo of candidates) {
    const directive = parseDirective(lines[lineNo - 1]);
    if (!directive) continue;
    if (!directive.target) {
      rejection ??= { ok: false, rejected: 'hedef-yok', atLine: lineNo };
      continue;
    }
    if (!directiveMatches(directive, finding)) {
      rejection ??= { ok: false, rejected: 'baska-hedef', atLine: lineNo };
      continue;
    }
    if (!directive.hasReason) {
      rejection ??= { ok: false, rejected: 'gerekce-yok', atLine: lineNo };
      continue;
    }
    return { ok: true, reason: directive.reason, target: directive.target, atLine: lineNo };
  }
  return rejection;
}
