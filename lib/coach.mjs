/**
 * Katman 2 — insan koçu.
 *
 * Bu katman sert kipte bile bloklamaz; uyarır. İnsan kararı bloklanacak bir şey
 * değildir. Her uyarı oturumda bir kez çıkar — tekrar eden uyarı görmezden
 * gelinir, ve görmezden gelinen uyarı da bir slop biçimidir.
 *
 * Uyarılar systemMessage ile kullanıcıya gider, modele değil: bunlar modele
 * verilecek talimat değil, insana verilecek bilgi.
 *
 * Ölçüm notu: bağlam çürümesi burada tur sayacıyla ölçülüyor, çünkü hook'lara
 * bağlam doluluk oranı gelmiyor. Gerçek oran statusLine'a geliyor
 * (context_window.used_percentage) — çubuk daha doğru ölçüyü gösterir, koç
 * ise elindeki vekili kullanır. Vekil olduğu gizlenmiyor.
 */

import { claimWarning } from './session.mjs';

/** Sinyal tanımları. Eşikler config.thresholds'tan gelir; burada yalnızca mantık var. */
const SIGNALS = [
  {
    id: 'baglam-curumesi',
    pattern: 'AGT-01',
    test: (s, t) => s.turns >= t.contextTurns,
    message: (s, t) => `Bu oturum ${s.turns} tura ulaştı (eşik ${t.contextTurns}). Yeni bir göreve yeni oturumla başla — uzun bağlamda talimat sessizce düşer (AGT-01).`,
  },
  {
    id: 'kavrayis-borcu',
    pattern: 'INS-01',
    test: (s, t) => s.linesWritten - s.linesRead >= t.comprehensionGap,
    message: (s) => `${s.linesWritten} satır üretildi, ${s.linesRead} satır okundu. Merge öncesi farkı kapat — anlamadığın kodun sahibi sensin (INS-01).`,
  },
  {
    id: 'commitsiz-ilerleme',
    pattern: 'AGT-06',
    test: (s, t) => s.linesSinceCommit >= t.uncommittedLines,
    message: (s, t) => `Son commit'ten beri ${s.linesSinceCommit} satır değişti (eşik ${t.uncommittedLines}). Geri dönebileceğin bir nokta kalmadı (AGT-06).`,
  },
  {
    id: 'zincirleme-duzeltme',
    pattern: 'MTK-05',
    test: (s, t) => s.consecutiveEdits >= t.consecutiveFixes,
    message: (s) => `${s.lastEditedFile} dosyasına ${s.consecutiveEdits} kez üst üste yama yapıldı. Yaklaşımı değiştirmek gerekebilir — zincirleme düzeltme kök nedeni gizler (MTK-05).`,
  },
];

/**
 * Eşikleri ölçer ve gösterilmesi gereken uyarıları döndürür.
 * `state` üzerinde "gösterildi" işareti bırakır; çağıran oturumu kaydetmelidir.
 */
export function evaluate(state, config) {
  const t = config?.thresholds ?? {};
  const out = [];
  for (const signal of SIGNALS) {
    if (!signal.test(state, t)) continue;
    if (!claimWarning(state, signal.id)) continue;
    out.push({ signal: signal.id, pattern: signal.pattern, message: signal.message(state, t) });
  }
  return out;
}

/**
 * Commit öncesi doğrulama uyarısı.
 * Bu sinyal "bir kez" kuralının dışında: her commit denemesinde sorulur, çünkü
 * her commit ayrı bir karardır (TST-05).
 */
export function verifyBeforeCommit(state) {
  if (state.testRunAt) return null;
  return {
    signal: 'dogrulanmamis-commit',
    pattern: 'TST-05',
    message: 'Bu turda test çalıştırılmadı. Commit ediliyor ama "çalışıyor" iddiası doğrulanmadı (TST-05).',
  };
}

/** Uyarıları tek bir systemMessage gövdesinde birleştirir. */
export function formatWarnings(warnings) {
  if (warnings.length === 0) return '';
  const head = warnings.length === 1 ? 'LenaRise.SlopGuard' : `LenaRise.SlopGuard — ${warnings.length} uyarı`;
  return `${head}\n\n${warnings.map((w) => `  · ${w.message}`).join('\n')}`;
}

export { SIGNALS };
