/**
 * Project type detection.
 *
 * Its consumers are the domain rule sets: GAME rule text is injected only in a
 * game project, UI rule text only in a web project. The reason is our own taxonomy — loading rules that
 * will never apply into every session is too much context (AGENT-02), and a long
 * rule set stops being read.
 *
 * The patterns do not need the same condition: GAME patterns key off engine API
 * names (transform.Translate, PlayerPrefs, get_node), so they stay silent in
 * non-game projects on their own. Detection gates the text injection, not the scan.
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
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

/**
 * Frontend frameworks whose presence in package.json makes a project a web
 * project. The list is deliberately short: it names what actually renders an
 * interface, not everything that can serve HTTP.
 */
const WEB_DEPENDENCIES = [
  'react', 'react-dom', 'vue', 'svelte', 'next', 'nuxt',
  'astro', '@angular/core', 'solid-js', 'preact', 'remix',
];

/** Root files that mark a web project on their own. */
const WEB_FILES = [/^tailwind\.config\.[cm]?[jt]s$/, /^index\.html$/, /^postcss\.config\.[cm]?[jt]s$/];

function dependencyNames(root) {
  const file = join(root, 'package.json');
  if (!existsSync(file)) return [];
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  } catch (error) {
    // A package.json that does not parse is not evidence either way. Detection
    // reports "not a web project"; it does not guess, and it does not throw.
    process.stderr.write(`[slopguard] project: package.json could not be read — ${error.message}\n`);
    return [];
  }
}

/**
 * True when the root looks like a project that renders an interface.
 *
 * Like detectEngines, this gates rule text injection only. UI and A11Y patterns
 * key off web tokens (className, backdrop-blur, a stylesheet extension), so they
 * stay silent in other projects without being asked to.
 */
export function isWebProject(root) {
  if (!root) return false;
  const deps = dependencyNames(root);
  if (deps.some((name) => WEB_DEPENDENCIES.includes(name))) return true;
  try {
    return readdirSync(root).some((name) => WEB_FILES.some((re) => re.test(name)));
  } catch {
    // Unreadable root: an absence of information, read as "not a web project".
    return false;
  }
}
