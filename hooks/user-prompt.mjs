#!/usr/bin/env node
/**
 * UserPromptSubmit → turn counter and coach warnings.
 *
 * Two jobs. The visible one: warn the user when a threshold is crossed. The
 * invisible but more important one: because this hook fires on every user
 * message, it stamps the heartbeat with this session's id — that stamp is the
 * status line's registration proof. Measured: the status line and the hooks see
 * the same session_id, so the id in the stamp can be compared against the bar's.
 *
 * Warnings go out via systemMessage: information for the user, not instructions
 * for the model.
 */

import { runHook } from '../lib/hook.mjs';
import { recordTurn } from '../lib/session.mjs';
import { evaluate, formatWarnings } from '../lib/coach.mjs';
import { notify, statusMetrics, BRAND } from '../lib/report.mjs';
import { PATTERN_COUNT } from '../lib/patterns.mjs';

runHook('user-prompt', ({ config, state }) => {
  const turn = recordTurn(state);
  const messages = [];

  // The one-line start-of-session confirmation (ui.heartbeat). It appears on the
  // first turn, not at session open: registration is only proved by the first
  // message, and claiming "active" at open would assert something unproven.
  if (config.ui.heartbeat && turn === 1) {
    const mode = config.mode === 'explore' ? 'explore' : 'strict';
    messages.push(`active — ${mode} mode · ${PATTERN_COUNT} patterns`);
  }

  // The periodic chat status row (ui.chatStatus). The desktop app's Code tab does
  // not render statusLine (measured), so this is the only way to see the numbers
  // passively there. Off by default: an unrequested repeating row is noise, and
  // an ignored warning is a form of slop itself (AGENT-09).
  const every = config.ui.chatStatus;
  if (Number.isInteger(every) && every > 0 && turn % every === 0) {
    messages.push(statusMetrics(state, config).join(' · '));
  }

  for (const warning of evaluate(state, config)) messages.push(warning.message);

  if (messages.length > 0) {
    notify(formatWarnings(messages.map((message) => ({ message }))));
  }
  void BRAND;
});
