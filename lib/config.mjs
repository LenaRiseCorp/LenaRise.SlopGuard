/**
 * Configuration loading and merging.
 *
 * Merge order — each layer overrides the one before it:
 *   1. plugin defaults (this file)
 *   2. ~/.claude/lenarise-slopguard/config.json
 *   3. ~/.claude/lenarise-slopguard/patterns.local.json   (adds patterns)
 *   4. <repo>/.slopignore                                  (path exemptions)
 *   5. session mode                                        (/slop-mode explore)
 *
 * The mechanism lives in the plugin cache and changes on update; the
 * configuration lives in the user's home directory and is never overwritten.
 * This file only reads — it never writes to a user file under any condition.
 *
 * Errors are not swallowed: malformed JSON, an invalid pattern, an unreadable
 * file — each lands in `problems`, and the caller surfaces it on stderr or in
 * the status line. Falling back to defaults silently would produce the same
 * outcome as having no protection while appearing to have some.
 */

import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, relative, sep } from 'node:path';

export const CONFIG_DIR = process.env.SLOPGUARD_CONFIG_DIR
  ?? join(homedir(), '.claude', 'lenarise-slopguard');

export const paths = {
  dir: CONFIG_DIR,
  config: join(CONFIG_DIR, 'config.json'),
  localPatterns: join(CONFIG_DIR, 'patterns.local.json'),
  localRules: join(CONFIG_DIR, 'rules.local.md'),
  heartbeat: join(CONFIG_DIR, 'heartbeat.json'),
  session: (id) => join(CONFIG_DIR, `session-${String(id).replace(/[^\w-]/g, '_')}.json`),
};

/** Defaults. This object is frozen; every load works on a copy. */
export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,               // set to false deliberately by the user — the bar then reads "off"
  mode: 'strict',              // strict | explore
  disabled: [],                // category, taxonomy id or pattern key
  trustedPackages: [],         // packages exempt from the LOGIC-02 gate
  allowTestWrites: false,      // the TEST lock
  thresholds: Object.freeze({
    maxDiffLines: 400,         // PROC-02: stop-gate diff threshold
    contextTurns: 40,          // AGENT-01: turn counter
    contextUsedPercent: 75,    // AGENT-01: context fill ratio, measured by the status line
    comprehensionGap: 500,     // HUMAN-01: lines written minus lines read
    uncommittedLines: 300,     // AGENT-06: lines accumulated since the last commit
    consecutiveFixes: 3,       // LOGIC-05: consecutive patches to the same file
    packageCheckTimeoutMs: 2500, // SEC-02: registry lookup; exceeding it fails closed
    maxStopBlocks: 2,          // AGENT-08: how often the same reason may block
  }),
  ui: Object.freeze({
    statusLine: 'compact',     // compact | minimal | off
    cleanScans: 'silent',      // silent | summary
    heartbeat: true,           // one-line confirmation on the first turn
    livenessCheck: 'ask',      // ask | warn | off
    chatStatus: 0,             // 0 = off; N = a status row in chat every N turns
  }),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Reads JSON. Failure is carried in the return value, never thrown away. */
export function readJsonFile(path) {
  if (!existsSync(path)) return { ok: true, value: null, missing: true };
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    return { ok: false, value: null, error: `could not be read: ${error.message}` };
  }
  try {
    return { ok: true, value: JSON.parse(raw), missing: false };
  } catch (error) {
    return { ok: false, value: null, error: `is not valid JSON: ${error.message}` };
  }
}

const VALID = {
  mode: ['strict', 'explore'],
  'ui.statusLine': ['compact', 'minimal', 'off'],
  'ui.cleanScans': ['silent', 'summary'],
  'ui.livenessCheck': ['ask', 'warn', 'off'],
};

function checkEnum(problems, path, value) {
  const allowed = VALID[path];
  if (!allowed || value === undefined) return true;
  if (allowed.includes(value)) return true;
  problems.push(`config.json → ${path}: "${value}" is not valid (${allowed.join(' | ')}); using the default`);
  return false;
}

/** Compiles patterns.local.json entries. An invalid entry is skipped and reported. */
export function compileLocalPatterns(raw, problems) {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : raw.patterns;
  if (!Array.isArray(list)) {
    problems.push('patterns.local.json: expected an array or { "patterns": [...] }');
    return [];
  }
  const out = [];
  list.forEach((entry, i) => {
    const where = `patterns.local.json[${i}]`;
    for (const field of ['key', 'id', 'scope', 'match']) {
      if (!entry?.[field]) { problems.push(`${where}: missing "${field}"`); return; }
    }
    if (!['code', 'prose', 'path', 'command'].includes(entry.scope)) {
      problems.push(`${where}: scope "${entry.scope}" is not valid`); return;
    }
    let match;
    try {
      match = new RegExp(entry.match, entry.flags ?? 'g');
    } catch (error) {
      problems.push(`${where}: regex did not compile — ${error.message}`); return;
    }
    out.push({
      key: String(entry.key),
      id: String(entry.id),
      scope: entry.scope,
      severity: entry.severity === 'warn' ? 'warn' : 'block',
      match,
      detects: entry.detects ?? 'User-defined pattern.',
      fix: entry.fix ?? 'Ask whoever defined this pattern in patterns.local.json.',
      local: true,
    });
  });
  return out;
}

/** Turns `.slopignore` lines into path matchers. Gitignore-like, deliberately simple. */
export function parseSlopignore(text) {
  return String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((line) => ({ source: line, re: globToRegExp(line) }));
}

/** Small glob → RegExp. `**` crosses directory boundaries, `*` does not. Not reason enough for a dependency. */
export function globToRegExp(glob) {
  let out = '';
  const g = glob.replace(/^\.\//, '');
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { out += '.*'; i++; if (g[i + 1] === '/') i++; }
      else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  // Naming a directory covers everything beneath it.
  return new RegExp(`^${out}(?:/.*)?$`);
}

/** Is the path exempted by `.slopignore`? */
export function isPathIgnored(config, filePath, repoRoot) {
  const rules = config.ignoreRules ?? [];
  if (rules.length === 0) return false;
  const root = repoRoot ?? config.repoRoot;
  let rel = String(filePath ?? '');
  if (root) {
    const r = relative(resolve(root), resolve(rel));
    if (!r.startsWith('..')) rel = r;
  }
  rel = rel.split(sep).join('/').replace(/^\.\//, '');
  return rules.some((rule) => rule.re.test(rel));
}

/**
 * Loads the full configuration.
 *
 * @param {object} opts
 * @param {string} [opts.repoRoot]     directory to look for `.slopignore` in
 * @param {string} [opts.sessionMode]  session mode override (/slop-mode)
 * @returns {{config: object, problems: string[], sources: string[]}}
 */
export function loadConfig({ repoRoot, sessionMode } = {}) {
  const problems = [];
  const sources = ['defaults'];
  const config = clone(DEFAULT_CONFIG);

  const file = readJsonFile(paths.config);
  if (!file.ok) {
    problems.push(`config.json ${file.error}; continuing with defaults`);
  } else if (file.value) {
    sources.push(paths.config);
    const u = file.value;
    if (checkEnum(problems, 'mode', u.mode) && u.mode) config.mode = u.mode;
    if (Array.isArray(u.disabled)) config.disabled = u.disabled.map(String);
    else if (u.disabled !== undefined) problems.push('config.json → disabled: expected an array');
    if (Array.isArray(u.trustedPackages)) config.trustedPackages = u.trustedPackages.map(String);
    else if (u.trustedPackages !== undefined) problems.push('config.json → trustedPackages: expected an array');
    if (typeof u.allowTestWrites === 'boolean') config.allowTestWrites = u.allowTestWrites;
    if (typeof u.enabled === 'boolean') config.enabled = u.enabled;
    for (const [k, v] of Object.entries(u.thresholds ?? {})) {
      if (Number.isFinite(v)) config.thresholds[k] = v;
      else problems.push(`config.json → thresholds.${k}: expected a number`);
    }
    for (const [k, v] of Object.entries(u.ui ?? {})) {
      if (k === 'chatStatus') {
        // Numeric field; the enum check would let anything through.
        if (Number.isInteger(v) && v >= 0) config.ui.chatStatus = v;
        else problems.push(`config.json → ui.chatStatus: expected 0 or a positive integer ("${v}")`);
        continue;
      }
      if (checkEnum(problems, `ui.${k}`, v)) config.ui[k] = v;
    }
  }

  const local = readJsonFile(paths.localPatterns);
  if (!local.ok) problems.push(`patterns.local.json ${local.error}; user patterns were not loaded`);
  config.localPatterns = local.ok && local.value ? compileLocalPatterns(local.value, problems) : [];
  if (config.localPatterns.length > 0) sources.push(paths.localPatterns);

  config.ignoreRules = [];
  config.repoRoot = repoRoot ?? null;
  if (repoRoot) {
    const ignorePath = join(repoRoot, '.slopignore');
    if (existsSync(ignorePath)) {
      try {
        config.ignoreRules = parseSlopignore(readFileSync(ignorePath, 'utf8'));
        sources.push(ignorePath);
      } catch (error) {
        problems.push(`.slopignore could not be read: ${error.message}`);
      }
    }
  }

  if (sessionMode) {
    if (VALID.mode.includes(sessionMode)) { config.mode = sessionMode; sources.push('session mode'); }
    else problems.push(`session mode "${sessionMode}" is not valid; ignored`);
  }

  return { config, problems, sources };
}

/**
 * What a finding does, given the mode.
 *
 * Explore mode relaxes style rules, not irreversibility: block-severity patterns
 * in `command` scope (rm -rf, DROP TABLE, force push, unverified packages) block
 * in every mode. Writing an empty catch while prototyping is tolerated; dropping
 * the database is not.
 */
export function actionFor(finding, config) {
  if (finding.severity !== 'block') return 'warn';
  if (finding.scope === 'command') return 'block';
  return config.mode === 'explore' ? 'warn' : 'block';
}
