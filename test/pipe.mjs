/**
 * Hook boru testi yardımcıları.
 *
 * Hook'lar gerçek stdin yüküyle, ayrı süreçte, izole bir yapılandırma diziniyle
 * çalıştırılır. Modülü içeri aktarıp fonksiyon çağırmak protokolü sınamazdı:
 * asıl sözleşme stdin JSON'u ve stdout JSON'u.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** İzole yapılandırma dizini + git repo iskeleti. */
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
 * Hook'u çalıştırır ve çıktısını ayrıştırır.
 * @returns {{code:number, stdout:string, stderr:string, json:object|null}}
 */
export function pipe(hookRelPath, payload, { cfgDir } = {}) {
  const script = join(ROOT, hookRelPath);
  let stdout = '', stderr = '', code = 0;
  try {
    stdout = execFileSync(process.execPath, [script], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, SLOPGUARD_CONFIG_DIR: cfgDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    code = error.status ?? 1;
    stdout = error.stdout ?? '';
    stderr = error.stderr ?? '';
  }
  let json = null;
  if (stdout.trim() !== '') {
    try { json = JSON.parse(stdout); } catch { json = null; }
  }
  return { code, stdout, stderr, json };
}

/** PostToolUse yükü — alan adları ölçülmüş şemaya uyar. */
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
