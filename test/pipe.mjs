/**
 * Hook pipe-test helpers.
 *
 * Hooks are run with real stdin payloads, in a separate process, against an
 * isolated configuration directory. Importing the module and calling a function
 * would not exercise the protocol: the actual contract is the stdin JSON and the
 * stdout JSON.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** An isolated configuration directory plus a git repository skeleton. */
export function makeWorkspace() {
  const base = mkdtempSync(join(tmpdir(), 'slopguard-pipe-'));
  const cfgDir = join(base, 'cfg');
  const repo = join(base, 'repo');
  mkdirSync(cfgDir, { recursive: true });
  mkdirSync(join(repo, '.git'), { recursive: true });
  return {
    base, cfgDir, repo,
    file(rel, content) {
      const full = join(repo, rel);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
      return full;
    },
    config(obj) { writeFileSync(join(cfgDir, 'config.json'), JSON.stringify(obj)); },
    cleanup() { rmSync(base, { recursive: true, force: true }); },
  };
}

/**
 * Runs a hook and parses its output.
 *
 * spawnSync is used rather than execFileSync because it returns stderr on a
 * successful exit too. With execFileSync, stderr was only visible on the error
 * path, so "errors are not swallowed" could not be asserted on a normal run.
 *
 * @returns {{code:number, stdout:string, stderr:string, json:object|null}}
 */
export function pipe(hookRelPath, payload, { cfgDir } = {}) {
  const script = join(ROOT, hookRelPath);
  // spawnSync, unlike execFileSync, returns stderr on a successful exit too.
  // With execFileSync stderr was only visible on the error path, so the
  // "errors are not swallowed" assertions could not run on a normal execution.
  // (note)
  // (note)
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, SLOPGUARD_CONFIG_DIR: cfgDir },
  });
  const stdout = result.stdout ?? '';
  let json = null;
  if (stdout.trim() !== '') {
    try { json = JSON.parse(stdout); } catch { json = null; }
  }
  return { code: result.status ?? 0, stdout, stderr: result.stderr ?? '', json };
}

/** A PostToolUse payload; the field names follow the measured schema. */
export function postToolUsePayload({ sessionId = 'test', cwd, filePath, toolName = 'Write', patch = [], content }) {
  return {
    session_id: sessionId,
    cwd,
    permission_mode: 'bypassPermissions',
    hook_event_name: 'PostToolUse',
    tool_name: toolName,
    tool_input: { file_path: filePath, ...(content === undefined ? {} : { content }) },
    tool_response: { type: 'create', filePath, structuredPatch: patch, ...(content === undefined ? {} : { content }) },
  };
}
