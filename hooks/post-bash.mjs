#!/usr/bin/env node
/**
 * PostToolUse: Bash → doğrulama ve commit damgası.
 *
 * Neden ayrı bir hook: PostToolUse başarısız Bash komutunda hiç tetiklenmiyor
 * (ölçüldü, docs/dogrulama-kaydi.md). Bu yüzden buraya gelmiş olmak, komutun
 * başarıyla bittiğinin kanıtı. Test damgasını komut öncesinde atmak,
 * çalışmamış hatta çökmüş bir testi "geçti" saymak olurdu — engellemeye
 * çalıştığımız şeyin ta kendisi (TST-05).
 *
 * Asimetri bilerek: tetiklenme başarıyı kanıtlar, tetiklenmeme başarısızlığı
 * kanıtlamaz. Damga yoksa "doğrulanmadı" denir, "başarısız" denmez.
 */

import { runHook } from '../lib/hook.mjs';
import { isTestCommand, isCommitCommand } from '../lib/commands.mjs';
import { recordTestRun, recordCommit } from '../lib/session.mjs';

runHook('post-bash', ({ payload, state }) => {
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') return;
  if (isTestCommand(command)) recordTestRun(state);
  if (isCommitCommand(command)) recordCommit(state);
});
