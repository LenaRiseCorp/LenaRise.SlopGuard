#!/usr/bin/env node
/** /slop-status — bu oturumun ölçümleri. */

import { loadConfig } from '../lib/config.mjs';
import { loadSession, openViolations, sessionSummary } from '../lib/session.mjs';
import { read as readHeartbeat, ageSeconds, formatAge } from '../lib/heartbeat.mjs';
import { PATTERN_COUNT } from '../lib/patterns.mjs';
import { currentSessionId } from './current-session.mjs';
import { BRAND } from '../lib/report.mjs';

const out = [];
const { id, source, confident } = currentSessionId();

if (!id) {
  out.push(`${BRAND}: bu oturuma ait kayıt bulunamadı (${source}).`);
  out.push('Hook hiç tetiklenmemiş olabilir — /slop-doctor teşhis eder.');
  process.stdout.write(out.join('\n') + '\n');
  process.exit(0);
}

const { config } = loadConfig({ repoRoot: process.cwd() });
const state = loadSession(id);
const beat = readHeartbeat();

out.push(`${BRAND} — oturum ${id}`);
if (!confident) out.push(`  (kimlik ${source} üzerinden bulundu; kesin değil)`);
out.push('');
out.push(`  Kip           ${config.mode}${state.modeOverride ? ' (oturum ezmesi)' : ''}${config.enabled ? '' : ' · PLUGIN KAPALI'}`);
out.push(`  Desenler      ${PATTERN_COUNT} yerleşik + ${config.localPatterns.length} kullanıcı${config.disabled.length ? ` · kapalı: ${config.disabled.join(', ')}` : ''}`);
out.push(`  Kalp atışı    ${beat ? formatAge(ageSeconds(beat)) : 'yok'}`);
out.push('');
out.push(`  Ölçüm         ${sessionSummary(state)}`);
out.push(`  Okunan satır  ${state.linesRead}${state.linesWritten - state.linesRead >= config.thresholds.comprehensionGap ? '  ← kavrayış borcu eşiğin üstünde (INS-01)' : ''}`);
out.push(`  Commit borcu  ${state.linesSinceCommit} satır${state.linesSinceCommit > config.thresholds.uncommittedLines ? '  ← eşiğin üstünde (AGT-06)' : ''}`);
out.push(`  Doğrulama     ${state.testRunAt ? `test ${formatAge(Math.round((Date.now() - state.testRunAt) / 1000))}` : 'bu turda test çalışmadı (TST-05)'}`);

const open = openViolations(state);
if (open.length > 0) {
  out.push('');
  out.push(`  Açık ihlaller (stop kapısı bunları bekliyor):`);
  for (const v of open) out.push(`    ${v.id}  ${v.file}:${v.line}  ${v.title}`);
}

const cats = Object.entries(state.byCategory ?? {});
if (cats.length > 0) {
  out.push('');
  out.push(`  Kategoriye göre: ${cats.map(([c, n]) => `${c}=${n}`).join(' · ')}`);
}

if (state.warned.length > 0) {
  out.push('');
  out.push(`  Gösterilen uyarılar: ${state.warned.join(', ')}`);
}

process.stdout.write(out.join('\n') + '\n');
