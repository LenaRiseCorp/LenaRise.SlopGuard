/**
 * Project type detection.
 *
 * Its only consumer right now is the game rule set: GAME rule text is injected
 * only in a game project. The reason is our own taxonomy — loading rules that
 * will never apply into every session is too much context (AGENT-02), and a long
 * rule set stops being read.
 *
 * The patterns do not need the same condition: GAME patterns key off engine API
 * names (transform.Translate, PlayerPrefs, get_node), so they stay silent in
 * non-game projects on their own. Detection gates the text injection, not the scan.
 */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Signatures looked for at the root. Any one of them is sufficient. */
const SIGNATURES = [
  { engine: 'Unity', test: (root) => existsSync(join(root, 'Assets')) && existsSync(join(root, 'ProjectSettings')) },
  { engine: 'Godot', test: (root) => existsSync(join(root, 'project.godot')) },
  { engine: 'Unreal', test: (root) => hasExtension(root, '.uproject') },
];

function hasExtension(root, ext) {
  try {
    return readdirSync(root).some((name) => name.endsWith(ext));
  } catch {
    // An unreadable root means detection cannot run. That is an absence of
    // information, not an error: the caller reads the empty list as "not a game
    // project" and injects no rules.
    return false;
  }
}

/**
 * Engines detected at the root. Empty when no root is given or it cannot be read.
 * @returns {string[]} for example ['Unity']
 */
export function detectEngines(root) {
  if (!root) return [];
  return SIGNATURES.filter((s) => {
    try {
      return s.test(root);
    } catch {
      return false;
    }
  }).map((s) => s.engine);
}

export function isGameProject(root) {
  return detectEngines(root).length > 0;
}
