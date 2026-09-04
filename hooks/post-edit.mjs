#!/usr/bin/env node
/**
 * PostToolUse: Edit|Write|MultiEdit → 8 kategori taraması.
 *
 * Ölçülmüş gerçek (docs/dogrulama-kaydi.md): PostToolUse bloğu modele iletilir
 * ama modeli durdurmaz — dosya zaten yazılmıştır ve model bloğu görmezden
 * gelip "bitti" diyebilir. Bu yüzden buradaki blok bir *düzeltme talebidir*,
 * kilit değil. Sert garanti şöyle kurulur: bulunan ihlaller oturum defterine
 * yazılır, stop-gate defter boşalmadan turu bitirtmez.
 */

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { runHook, editedPath, linesChanged } from '../lib/hook.mjs';
import { scanContent, actionable, classify } from '../lib/scan.mjs';
import { isPathIgnored } from '../lib/config.mjs';
import { recordWrite, recordViolations } from '../lib/session.mjs';
import { block, notify, formatFindings, formatCleanScan, fail } from '../lib/report.mjs';

runHook('post-edit', ({ payload, config, state, repoRoot }) => {
  const filePath = editedPath(payload);
  if (!filePath) return;

  const shown = repoRoot ? relative(repoRoot, filePath) : filePath;

  const { added, removed } = linesChanged(payload.tool_response, payload.tool_input);
  recordWrite(state, filePath, { added, removed, isCode: classify(filePath) === 'code' });

  if (isPathIgnored(config, filePath, repoRoot)) return;
  if (classify(filePath) === 'other') return;

  // Diskten okunur: MultiEdit ve ardışık düzenlemelerden sonra dosyanın
  // gerçek son hâli tool_input'tan yeniden kurulamaz.
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    const fallback = payload.tool_response?.content ?? payload.tool_input?.content;
    if (typeof fallback !== 'string') {
      fail('post-edit', `dosya okunamadı ve yedek içerik yok (${filePath}) — ${error.message}`);
      return;
    }
    content = fallback;
  }

  const findings = scanContent({ filePath: shown, content, config });
  const live = actionable(findings);
  recordViolations(state, filePath, findings, shown);

  if (live.length === 0) {
    if (config.ui.cleanScans === 'summary') notify(formatCleanScan(1));
    return;
  }

  const blocking = config.mode === 'strict' && live.some((f) => f.severity === 'block');
  const text = formatFindings(findings, {
    config,
    target: shown,
    action: blocking ? 'block' : 'warn',
  });

  if (blocking) {
    block(`${text}\n\n  Bu dosyayı düzelt. Düzeltilmeden tur bitirilemez — stop kapısı açık ihlali bekliyor.`);
  } else {
    notify(text);
  }
});
