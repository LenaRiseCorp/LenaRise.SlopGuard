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

import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { runHook } from '../lib/hook.mjs';
import { isTestCommand, isCommitCommand, writeTargets } from '../lib/commands.mjs';
import { recordTestRun, recordCommit, recordViolations, recordWrite } from '../lib/session.mjs';
import { scanContent, actionable, classify } from '../lib/scan.mjs';
import { isPathIgnored } from '../lib/config.mjs';
import { block, notify, formatFindings, fail, BRAND } from '../lib/report.mjs';

runHook('post-bash', ({ payload, config, state, repoRoot }) => {
  const command = payload?.tool_input?.command;
  if (typeof command !== 'string') return;
  if (isTestCommand(command)) recordTestRun(state);
  if (isCommitCommand(command)) recordCommit(state);

  // Kabuk üzerinden yazılan dosyaların içeriği taranır. post-edit bunları
  // hiç görmüyordu; komut Bash matcher'ından geçiyor ve orada yalnızca
  // komutun kendisi taranıyordu, yazılan içerik değil.
  //
  // Bu hook yalnızca komut başarıyla bittiğinde tetiklenir (ölçüldü), yani
  // buraya gelmişse dosya gerçekten yazılmıştır.
  const all = [];
  for (const target of writeTargets(command)) {
    const absolute = resolve(payload.cwd ?? process.cwd(), target);
    if (isPathIgnored(config, absolute, repoRoot)) continue;
    if (classify(absolute) === 'other') continue;
    if (!existsSync(absolute)) continue;

    const shown = repoRoot ? relative(repoRoot, absolute) : target;
    let content;
    try {
      content = readFileSync(absolute, 'utf8');
    } catch (error) {
      fail('post-bash', `yazılan dosya okunamadı (${shown}) — ${error.message}`);
      continue;
    }

    const findings = scanContent({ filePath: shown, content, config });
    recordWrite(state, absolute, { added: content.split('\n').length, isCode: classify(absolute) === 'code' });
    recordViolations(state, absolute, findings, shown);
    all.push([shown, findings]);
  }

  const live = all.flatMap(([, f]) => actionable(f));
  if (live.length === 0) return;

  const blocking = config.mode === 'strict' && live.some((f) => f.severity === 'block');
  const text = all
    .filter(([, f]) => actionable(f).length > 0)
    .map(([shown, f]) => formatFindings(f, { config, target: shown, action: blocking ? 'block' : 'warn' }))
    .join('\n\n');

  if (blocking) {
    block(`${text}\n\n  Kabuk üzerinden yazıldı ama tarama atlanmaz. Düzelt — `
      + `stop kapısı açık ihlali bekliyor.`);
  } else {
    notify(`${BRAND}\n\n${text}`);
  }
});
