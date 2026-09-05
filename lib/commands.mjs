/**
 * Understanding shell commands: is this a test run, a commit, a package install?
 *
 * Package verification lives here because slopsquatting (SEC-02) is precisely a
 * command problem: the model invents a package name, the command runs, and
 * someone has already claimed that name. Confirming the name exists BEFORE the
 * install is the only effective defence.
 *
 * Because it needs the network, the policy is fail-closed: a package that cannot
 * be verified is blocked. The escape hatch for offline work is
 * config.json → trustedPackages.
 */

import { request } from 'node:https';
import { stripHeredocs } from './scan.mjs';

/**
 * Test runner commands — every one anchored to the START of a segment.
 *
 * Anchoring is required: "jest" also appears inside `npm install jest`, but that
 * is an install, not a run. An unanchored pattern would count the install as a
 * test run and make an unverified turn look verified — exactly what we are
 * trying to prevent (TEST-05).
 */
export const TEST_COMMAND_PATTERNS = [
  /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b/,
  /^node\s+--test\b/,
  /^(?:npx\s+)?(?:jest|vitest|mocha|ava)\b/,
  /^(?:npx\s+)?playwright\s+test\b/,
  /^(?:npx\s+)?cypress\s+run\b/,
  /^(?:pytest|tox)\b/,
  /^python3?\s+-m\s+(?:pytest|unittest)\b/,
  /^go\s+test\b/,
  /^cargo\s+test\b/,
  /^(?:bundle\s+exec\s+)?rspec\b/,
  /^(?:\.?\/?vendor\/bin\/)?phpunit\b/,
  /^dotnet\s+test\b/,
  /^(?:mvn|gradle|\.?\/?gradlew)\s+(?:\S+\s+)*test\b/,
  /^make\s+(?:test|check)\b/,
];

/**
 * Splits a command into segments and drops the leading environment assignments
 * (`CI=1 npm test`) from each. Classification runs from the start of a segment.
 *
 * A newline is a separator too. The first version split only on `&&`, `||`, `;`
 * and `|`, so a `git commit` or `npm test` on the second line of a multi-line
 * block was never recognised. The consequence was silent and expensive: commits
 * were not recorded in the session ledger, the verification stamp was never set,
 * and the stop gate therefore counted finished work as unfinished. Found while
 * developing the tool, when the gate stopped its own author.
 *
 * Heredoc bodies are stripped first: a line inside a commit message is not a
 * command. Same distinction as in scanCommand — the body is data, not shell code.
 */
export function commandSegments(command) {
  return stripHeredocs(String(command ?? ''))
    .split(/&&|\|\||;|\||\n/)
    .map((part) => part.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, ''))
    .filter((part) => part.length > 0);
}

export function isTestCommand(command) {
  return commandSegments(command).some((seg) => TEST_COMMAND_PATTERNS.some((re) => re.test(seg)));
}

/** git's value-taking global flags — their values must be skipped when finding the subcommand. */
const GIT_VALUE_FLAGS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

/**
 * The git subcommand in a segment. `git -C repo commit` → "commit".
 * Skips flags and their values, and looks at the first non-flag word so that
 * `git log --grep commit` is not mistaken for a commit.
 */
export function gitSubcommand(segment) {
  const tokens = String(segment ?? '').trim().split(/\s+/);
  if (tokens[0] !== 'git') return null;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (GIT_VALUE_FLAGS.has(token)) { i++; continue; }
    if (token.startsWith('-')) continue;
    return token;
  }
  return null;
}

export function isCommitCommand(command) {
  return commandSegments(command).some((seg) => gitSubcommand(seg) === 'commit');
}

/** Package manager → which registry to look the name up in. */
const MANAGERS = [
  { re: /\b(?:npm|pnpm)\s+(?:i|install|add)\b/,  registry: 'npm' },
  { re: /\b(?:yarn|bun)\s+add\b/,                registry: 'npm' },
  { re: /\bpip3?\s+install\b/,                   registry: 'pypi' },
  { re: /\buv\s+(?:pip\s+install|add)\b/,        registry: 'pypi' },
  { re: /\bcargo\s+add\b/,                       registry: 'crates' },
  { re: /\bgo\s+get\b/,                          registry: null },
];

const SUBCOMMANDS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'pip', 'pip3', 'uv', 'cargo', 'go',
  'i', 'install', 'add', 'get', 'pip-install']);

/** Extracts the bare name from a package specifier: version, extras and comparators are dropped. */
export function packageName(token) {
  let name = String(token).trim().replace(/^['"]|['"]$/g, '');
  if (name.startsWith('@')) {
    const at = name.indexOf('@', 1);
    if (at !== -1) name = name.slice(0, at);
  } else {
    name = name.split('@')[0];
  }
  name = name.split(/[<>=!~[;]/)[0];
  return name.trim();
}

/**
 * Parses an install command.
 * @returns {{registry: string|null, packages: string[]}|null}
 */
export function parseInstall(command) {
  const text = String(command ?? '');
  const manager = MANAGERS.find((m) => m.re.test(text));
  if (!manager) return null;

  // Take only the matching segment, so words earlier in a chain such as
  // `cd x && npm install foo` are not mistaken for package names.
  const segment = text.split(/&&|\|\||;|\|/).find((part) => manager.re.test(part)) ?? text;

  const tokens = segment.trim().split(/\s+/);
  const packages = [];
  for (const token of tokens) {
    if (token.startsWith('-')) continue;                 // flag
    if (SUBCOMMANDS.has(token)) continue;                // manager or subcommand
    if (/[/\\]/.test(token) && !token.startsWith('@')) continue;  // local path or go module
    if (/^https?:/.test(token)) continue;                // direct URL
    const name = packageName(token);
    if (name) packages.push(name);
  }
  return { registry: manager.registry, packages: [...new Set(packages)] };
}

const REGISTRY_URLS = {
  npm: (name) => `https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`,
  pypi: (name) => `https://pypi.org/pypi/${encodeURIComponent(name)}/json`,
  crates: (name) => `https://crates.io/api/v1/crates/${encodeURIComponent(name)}`,
};

/**
 * Checks whether the package exists in the registry.
 * @returns {Promise<'exists'|'missing'|'unknown'>} 'unknown' means network failure or timeout
 */
export function checkRegistry(name, registry, { timeoutMs = 2500 } = {}) {
  const build = REGISTRY_URLS[registry];
  if (!build) return Promise.resolve('unknown');
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const req = request(build(name), { method: 'GET', headers: { 'user-agent': 'lenarise-slopguard' } }, (res) => {
      res.resume();
      if (res.statusCode === 200) done('exists');
      else if (res.statusCode === 404) done('missing');
      else done('unknown');
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); done('unknown'); });
    req.on('error', () => done('unknown'));
    req.end();
  });
}

/**
 * Verifies the packages about to be installed.
 *
 * Fail-closed: neither 'missing' nor 'unknown' passes. A package that does not
 * exist is a slopsquatting surface; a package that could not be verified has not
 * been verified. Telling the two apart is the user's call, and the message says
 * which one it was.
 */
export async function verifyPackages(packages, registry, { trusted = [], timeoutMs = 2500, check = checkRegistry } = {}) {
  const trustedSet = new Set(trusted.map((p) => String(p).toLowerCase()));
  const missing = [];
  const unknown = [];
  for (const name of packages) {
    if (trustedSet.has(name.toLowerCase())) continue;
    const verdict = await check(name, registry, { timeoutMs });
    if (verdict === 'missing') missing.push(name);
    else if (verdict === 'unknown') unknown.push(name);
  }
  return { ok: missing.length === 0 && unknown.length === 0, missing, unknown };
}

/**
 * Files a command writes to.
 *
 * Why this is needed: hooks only see tool calls. Writes such as `cat > x.js`,
 * `python -c ... > x.js` and `sed -i` go through the Bash matcher, and only the
 * command itself was scanned there — never the content written. A source file
 * written through Bash therefore skipped pattern scanning entirely.
 *
 * The scope is deliberately narrow. Knowing what an arbitrary shell command
 * writes is impossible in general (`make`, `npm run build`, custom scripts);
 * only shapes whose target is visible in the command itself are parsed here.
 * Everything caught is real, but not everything is caught — the limit is stated
 * in the README.
 */

const NOT_A_FILE = /^(?:\/dev\/|\/proc\/)|^-$|^\d+$/;

/** Interpreters that take a program on the command line. */
const INLINE_CODE_RUNNERS = new Set(['python', 'python3', 'node', 'ruby', 'perl', 'php']);

/** Words that mean the inline program writes rather than only reads. */
const WRITE_INTENT = /\b(?:writeFileSync|appendFileSync|createWriteStream|write|writelines|unlink|rmtree|remove|rename|replace|mkdir|dump|save|truncate)\b|['"][wa]\+?b?['"]/;

/**
 * Paths named by a one-liner passed to an interpreter with -c or -e.
 *
 * `python3 -c "open('.github/workflows/ci.yml','w').write(x)"` writes to a
 * protected path, and the path is in plain sight — it simply is not a shell
 * redirection, so the redirection parser above never saw it. Measured: that
 * command passed the gate while the identical `sh -c` form was refused.
 *
 * Only one-liners that show write intent are read for paths. A program that
 * merely opens a file to read it is not a write, and treating it as one would
 * block reading a lockfile through python — a false positive with no upside.
 * The intent test is coarse on purpose: it decides whether to look, not what
 * the program does.
 */
export function inlineCodeTargets(command) {
  const text = String(command ?? '');
  const tokens = tokenize(text);
  if (!tokens.some((t, i) => (t === '-c' || t === '-e')
    && INLINE_CODE_RUNNERS.has(String(tokens[i - 1] ?? '').split('/').pop()))) return [];
  const out = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (tokens[i] !== '-c' && tokens[i] !== '-e') continue;
    const body = tokens[i + 1];
    if (!WRITE_INTENT.test(body)) continue;
    // A path-shaped literal: quoted, and carrying a separator or an extension.
    for (const m of body.matchAll(/['"`]([^'"`\n]{2,200})['"`]/g)) {
      const value = m[1];
      if (/[/\\]/.test(value) || /\.[A-Za-z0-9]{1,8}$/.test(value)) out.push(value);
    }
  }
  return out;
}

/** Splits into shell words, preserving whitespace inside quotes. */
function tokenize(segment) {
  const out = [];
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(segment)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function cleanTarget(raw, sink) {
  if (typeof raw !== 'string') return;
  const path = raw.replace(/^['"]|['"]$/g, '').trim();
  if (!path || NOT_A_FILE.test(path)) return;
  sink.add(path);
}

export function writeTargets(command) {
  const text = String(command ?? '');
  const targets = new Set();

  // 1. Redirections: > and >>. An `&` after `>` is rejected so descriptor
  //    redirections such as `>&2` and `2>&1` stay out.
  for (const m of text.matchAll(/(?:^|[\s;&|])\d*>>?\s*(?!&)('[^']*'|"[^"]*"|[^\s;&|<>]+)/g)) {
    cleanTarget(m[1], targets);
  }

  for (const segment of commandSegments(text)) {
    const tokens = tokenize(segment);
    if (tokens.length === 0) continue;
    const cmd = tokens[0].split('/').pop();
    const rest = tokens.slice(1);

    if (cmd === 'tee') {
      for (const t of rest) { if (!t.startsWith('-')) cleanTarget(t, targets); }
    } else if (cmd === 'sed' && rest.some((t) => t === '-i' || t.startsWith('-i'))) {
      // sed -i 's/a/b/' file  → the last non-flag word is the target
      const tail = rest.filter((t) => !t.startsWith('-'));
      cleanTarget(tail[tail.length - 1], targets);
    } else if (cmd === 'cp' || cmd === 'mv' || cmd === 'install') {
      const tail = rest.filter((t) => !t.startsWith('-'));
      if (tail.length >= 2) cleanTarget(tail[tail.length - 1], targets);
    } else if (cmd === 'touch') {
      for (const t of rest) { if (!t.startsWith('-')) cleanTarget(t, targets); }
    }
  }

  // Read from the whole command, not per segment: commandSegments splits on ';'
  // without regard for quoting, and `python3 -c "import os; os.unlink(p)"` would
  // lose the half that names the file.
  for (const t of inlineCodeTargets(text)) cleanTarget(t, targets);

  return [...targets];
}
