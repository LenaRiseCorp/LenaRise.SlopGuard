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
import { notify } from '../lib/report.mjs';

runHook('user-prompt', ({ config, state }) => {
  recordTurn(state);
  const warnings = evaluate(state, config);
  if (warnings.length > 0) notify(formatWarnings(warnings));
});
