#!/usr/bin/env node
/**
 * UserPromptSubmit → tur sayacı ve koç uyarıları.
 *
 * İki iş yapar. Birincisi görünür: eşikler aşıldıysa kullanıcıya uyarı gider.
 * İkincisi görünmez ama daha önemli: bu hook her kullanıcı mesajında tetiklendiği
 * için kalp atışını bu oturumun kimliğiyle damgalar — durum çubuğunun "kayıt
 * kanıtı" bu damgadır. Ölçüldü: statusLine ile hook aynı session_id'yi görüyor,
 * yani damgadaki kimlik çubuğunkiyle karşılaştırılabilir.
 *
 * Uyarılar systemMessage ile gider: kullanıcıya bilgi, modele talimat değil.
 */

import { runHook } from '../lib/hook.mjs';
import { recordTurn } from '../lib/session.mjs';
import { evaluate, formatWarnings } from '../lib/coach.mjs';
import { notify, statusMetrics, BRAND } from '../lib/report.mjs';
import { PATTERN_COUNT } from '../lib/patterns.mjs';

runHook('user-prompt', ({ config, state }) => {
  const turn = recordTurn(state);
  const messages = [];

  // Oturum başı tek satır onay (ui.heartbeat). İlk turda çıkar, çünkü kayıt
  // kanıtı ancak ilk mesajda oluşur — oturum açılışında "etkin" demek
  // kanıtlanmamışı iddia etmek olurdu.
  if (config.ui.heartbeat && turn === 1) {
    const mode = config.mode === 'explore' ? 'keşif' : 'sert';
    messages.push(`etkin — ${mode} kip · ${PATTERN_COUNT} desen`);
  }

  // Periyodik durum satırı (ui.chatStatus). Desktop uygulamasının Code
  // sekmesi statusLine render etmiyor (ölçüldü), yani orada ölçümleri pasif
  // görmenin tek yolu bu. Varsayılan kapalı: sormadan gelen tekrarlı satır
  // gürültüdür ve görmezden gelinen uyarı da bir slop biçimi (AGT-09).
  const every = config.ui.chatStatus;
  if (Number.isInteger(every) && every > 0 && turn % every === 0) {
    messages.push(statusMetrics(state, config).join(' · '));
  }

  for (const warning of evaluate(state, config)) messages.push(warning.message);

  if (messages.length > 0) {
    notify(formatWarnings(messages.map((message) => ({ message }))));
  }
});
