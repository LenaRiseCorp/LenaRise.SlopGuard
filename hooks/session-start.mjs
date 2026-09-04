#!/usr/bin/env node
/**
 * SessionStart → injects the rule set and the capability index.
 *
 * Measured: additionalContext really does enter the model's context
 * (docs/verification-log.md). This layer carries the *intent* of the rules; the
 * boundary is set by the hooks. The two must stay separate: in the Replit case
 * the instruction was given in capitals, repeatedly, and was still violated.
 *
 * Size is deliberate. Loading the whole README into every session would be
 * AGENT-02 (too much context) itself; only the rule set, the capability index
 * and the user's own rules go in.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook } from '../lib/hook.mjs';
import { paths } from '../lib/config.mjs';
import { PATTERN_COUNT, CATEGORIES } from '../lib/patterns.mjs';
import { inject, capabilityIndex, fail } from '../lib/report.mjs';
import { detectEngines } from '../lib/project.mjs';

const RULES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules');
const BASE_RULES = join(RULES_DIR, 'base-rules.md');
const GAME_RULES = join(RULES_DIR, 'game-rules.md');
const LOCAL_RULES_MAX = 8000;

function readIfPresent(file, label) {
  if (!existsSync(file)) return null;
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    fail('session-start', `${label} could not be read (${file}) — ${error.message}`);
    return null;
  }
}

runHook('session-start', ({ config, repoRoot }) => {
  if (!config.enabled) return;

  const sections = [];

  const base = readIfPresent(BASE_RULES, 'rule set');
  if (base) sections.push(base.trim());
  else fail('session-start', 'rule set not found; only the capability index will be injected');

  // Game rules only when an engine signature is present. Loading rules that will
  // never apply into every session is too much context (AGENT-02), and a long
  // rule set stops being read.
  const engines = detectEngines(repoRoot);
  if (engines.length > 0) {
    const game = readIfPresent(GAME_RULES, 'game rules');
    if (game) sections.push(`${game.trim()}\n\nEngine detected: ${engines.join(', ')}.`);
    else fail('session-start', 'game rules not found; GAME patterns remain active regardless');
  }

  let local = readIfPresent(paths.localRules, 'rules.local.md');
  if (local && local.trim().length > 0) {
    if (local.length > LOCAL_RULES_MAX) {
      local = `${local.slice(0, LOCAL_RULES_MAX)}\n\n[rules.local.md was truncated: the first ${LOCAL_RULES_MAX} of ${local.length} characters were used. Keep it short — a long rule set does not get read.]`;
    }
    sections.push(`## The user's own rules\n\n${local.trim()}`);
  }

  sections.push(capabilityIndex(config, {
    patternCount: PATTERN_COUNT,
    categories: Object.keys(CATEGORIES).length,
    configDir: paths.dir,
  }));

  inject('SessionStart', sections.join('\n\n---\n\n'));
});
