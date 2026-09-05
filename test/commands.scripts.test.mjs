import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './pipe.mjs';

const cfg = mkdtempSync(join(tmpdir(), 'slopguard-cmd-'));
const home = mkdtempSync(join(tmpdir(), 'slopguard-home-'));
after(() => { rmSync(cfg, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); });

function run(script, args = [], env = {}, cwd = ROOT) {
  try {
    return { code: 0, stdout: execFileSync(process.execPath, [join(ROOT, script), ...args], {
      cwd, encoding: 'utf8', env: { ...process.env, SLOPGUARD_CONFIG_DIR: cfg, ...env }, stdio: ['pipe', 'pipe', 'pipe'],
    }) };
  } catch (error) {
    return { code: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

const beat = (sessionId) => writeFileSync(join(cfg, 'heartbeat.json'),
  JSON.stringify({ ts: Date.now(), version: '0.1.0', patterns: 26, mode: 'strict', sessionId, event: 'UserPromptSubmit' }));
const session = (id, patch) => writeFileSync(join(cfg, `session-${id}.json`),
  JSON.stringify({ version: 1, sessionId: id, ...patch }));

// ── /slop-status ────────────────────────────────────────────────────────

test('status resolves the session id from the heartbeat', () => {
  beat('session-a');
  session('session-a', { turns: 7, linesWritten: 120, linesRead: 30, blocked: 2, filesWritten: { 'a.js': 1 } });
  const r = run('scripts/status.mjs');
  assert.match(r.stdout, /session session-a/);
  assert.match(r.stdout, /7 tur/);
  assert.match(r.stdout, /2 slop blocked/);
  assert.doesNotMatch(r.stdout, /kesin değil/, 'the heartbeat is the definitive source');
});

test('status shows open violations and verification debt separately', () => {
  beat('session-b');
  session('session-b', { turns: 3, linesWritten: 40, violations: { 'src/a.js': [{ id: 'CODE-05', line: 12, title: 'Hata bastırma', shown: 'src/a.js' }] } });
  const r = run('scripts/status.mjs');
  assert.match(r.stdout, /Open violations/);
  assert.match(r.stdout, /CODE-05 {2}src\/a\.js:12/);
  assert.match(r.stdout, /no tests ran this turn \(TEST-05\)/);
});

test('status flags a crossed threshold', () => {
  beat('session-c');
  session('session-c', { turns: 2, linesWritten: 900, linesRead: 10, linesSinceCommit: 700 });
  const r = run('scripts/status.mjs');
  assert.match(r.stdout, /comprehension debt above threshold/);
  assert.match(r.stdout, /above threshold \(AGENT-06\)/);
});

test('with no record, status does not invent one', () => {
  const bos = mkdtempSync(join(tmpdir(), 'slopguard-bos-'));
  const r = run('scripts/status.mjs', [], { SLOPGUARD_CONFIG_DIR: bos });
  assert.match(r.stdout, /no record found/);
  assert.match(r.stdout, /slop-doctor/);
  rmSync(bos, { recursive: true, force: true });
});

// ── /slop-mode ──────────────────────────────────────────────────────────

test('mode writes only to the session, never to config.json', () => {
  beat('session-d');
  session('session-d', { turns: 1 });
  writeFileSync(join(cfg, 'config.json'), JSON.stringify({ mode: 'strict' }));
  const r = run('scripts/mode.mjs', ['explore']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /for this session only/);
  assert.equal(JSON.parse(readFileSync(join(cfg, `session-session-d.json`), 'utf8')).modeOverride, 'explore');
  assert.equal(JSON.parse(readFileSync(join(cfg, 'config.json'), 'utf8')).mode, 'strict', 'the persistent mode must not change');
  rmSync(join(cfg, 'config.json'), { force: true });
});

test('mode says what explore does not relax', () => {
  beat('session-e'); session('session-e', { turns: 1 });
  const r = run('scripts/mode.mjs', ['explore']);
  assert.match(r.stdout, /Irreversible commands and protected paths are still blocked in this mode/);
});

test('an invalid mode is refused and usage is shown', () => {
  const r = run('scripts/mode.mjs', ['kapali']);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Usage: \/slop-mode strict\|explore/);
});

// ── /slop-setup ─────────────────────────────────────────────────────────

test('setup creates the files and does not overwrite on a second run', () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-setup-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-setuphome-'));
  const first = run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  assert.match(first.stdout, /config\.json created/);
  assert.match(first.stdout, /statusLine registered/);

  const conf = JSON.parse(readFileSync(join(c, 'config.json'), 'utf8'));
  assert.equal(conf.mode, 'strict');
  assert.equal(conf.thresholds.maxDiffLines, 400);

  const second = run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  assert.match(second.stdout, /config\.json already exists, left alone/);
  assert.match(second.stdout, /statusLine is current/, 'it must not mistake its own entry for a stranger');
  rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
});

test('the example pattern setup writes really compiles and matches', async () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-ornek-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-ornekhome-'));
  run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  const out = execFileSync(process.execPath, ['-e', `
    import('${join(ROOT, 'lib/config.mjs')}').then(m => {
      const { config, problems } = m.loadConfig({});
      process.stdout.write(JSON.stringify({
        problems, matched: config.localPatterns[0].match.test('TODO (urgent) fix this'),
      }));
    });`], { encoding: 'utf8', env: { ...process.env, SLOPGUARD_CONFIG_DIR: c } });
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed.problems, [], 'the example pattern must load without problems');
  assert.equal(parsed.matched, true, 'the first example the user sees must work');
  rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
});

test('setup does not overwrite an existing statusLine entry', () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-sl-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-slhome-'));
  mkdirSync(join(h, '.claude'), { recursive: true });
  writeFileSync(join(h, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'my-own-bar' } }));
  const r = run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  assert.match(r.stdout, /points at a different command, left alone/);
  assert.equal(JSON.parse(readFileSync(join(h, '.claude/settings.json'), 'utf8')).statusLine.command, 'my-own-bar');
  rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
});

// ── /slop-repo-init ─────────────────────────────────────────────────────

test('repo-init installs the files and does not overwrite existing ones', () => {
  const repo = mkdtempSync(join(tmpdir(), 'slopguard-ri-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const r = run('scripts/repo-init.mjs', [], {}, repo);
  assert.match(r.stdout, /AGENTS\.md/);
  assert.match(r.stdout, /\.slopignore/);
  assert.match(r.stdout, /pre-commit/);
  assert.ok(existsSync(join(repo, 'AGENTS.md')));
  assert.ok(existsSync(join(repo, '.git/hooks/pre-commit')));
  assert.equal(existsSync(join(repo, '.github/workflows/slop-gate.yml')), false,
    'CI is opt-in; the default install must not spend a repository CI minutes');

  const agents = readFileSync(join(repo, 'AGENTS.md'), 'utf8');
  assert.match(agents, /# AGENTS\.md/);
  assert.match(agents, /## Security \(SEC\)/, 'must derive from the rule set');

  writeFileSync(join(repo, 'AGENTS.md'), 'hand written');
  run('scripts/repo-init.mjs', [], {}, repo);
  assert.equal(readFileSync(join(repo, 'AGENTS.md'), 'utf8'), 'hand written', 'the second run must not overwrite');
  rmSync(repo, { recursive: true, force: true });
});

test('repo-init refuses clearly outside a git repository', () => {
  const plain = mkdtempSync(join(tmpdir(), 'slopguard-plain-'));
  const r = run('scripts/repo-init.mjs', [], {}, plain);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /git init/);
  rmSync(plain, { recursive: true, force: true });
});

// ── /slop-doctor ────────────────────────────────────────────────────────

test('doctor passes every hook pipe test', () => {
  const r = run('scripts/doctor.mjs');
  const probeLines = r.stdout.split('\n').filter((l) => /\.mjs —/.test(l));
  assert.ok(probeLines.length >= 7, `expected at least 7 pipe tests, got ${probeLines.length}`);
  const failed = probeLines.filter((l) => l.includes('❌'));
  assert.deepEqual(failed, [], 'no hook pipe test may fail');
});

test('doctor runs the probe without side effects', () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-doc-'));
  run('scripts/doctor.mjs', [], { SLOPGUARD_CONFIG_DIR: c });
  const leftovers = readdirSync(c).filter((f) => f.startsWith('session-') || f === 'heartbeat.json');
  assert.deepEqual(leftovers, [], 'the diagnosis must not stamp its own heartbeat and fake liveness');
  rmSync(c, { recursive: true, force: true });
});

test('doctor reports an incomplete installation as a problem', () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-doc2-'));
  const r = run('scripts/doctor.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: c });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /no heartbeat stamp/);
  assert.match(r.stdout, /Result: \d+ problem/);
  rmSync(c, { recursive: true, force: true });
});

test('setup registers a fixed launcher, not a versioned cache path', () => {
  // setup and doctor must share one recognition test.
  // setup and doctor must share one recognition test.
  // setup and doctor must share one recognition test.
  const c = mkdtempSync(join(tmpdir(), 'slopguard-launcher-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-launcherhome-'));
  run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });

  const settings = JSON.parse(readFileSync(join(h, '.claude/settings.json'), 'utf8'));
  const cmd = settings.statusLine.command;
  assert.match(cmd, /statusline-launcher\.mjs/);
  assert.doesNotMatch(cmd, /plugins\/cache/, 'sürümlü cache yolu yazılmamalı');
  assert.doesNotMatch(cmd, /\d+\.\d+\.\d+/, 'yolda sürüm numarası olmamalı');
  assert.ok(existsSync(join(c, 'statusline-launcher.mjs')));
  rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
});

test('the launcher does not stay silent when no version is installed', () => {
  const h = mkdtempSync(join(tmpdir(), 'slopguard-yok-'));
  const out = execFileSync(process.execPath, [join(ROOT, 'templates/statusline-launcher.mjs')], {
    input: '{}', encoding: 'utf8', env: { ...process.env, HOME: h }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.match(out, /not installed/, 'a removed plugin must be visible on the bar');
  rmSync(h, { recursive: true, force: true });
});

test('the launcher forwards to the highest installed version', () => {
  const h = mkdtempSync(join(tmpdir(), 'slopguard-cok-'));
  const base = join(h, '.claude/plugins/cache/lenarise-slopguard/lenarise-slopguard');
  for (const v of ['0.1.2', '0.1.10', '0.1.9']) {
    mkdirSync(join(base, v, 'bin'), { recursive: true });
    writeFileSync(join(base, v, 'bin/statusline.mjs'), `process.stdout.write('SÜRÜM ${v}');\n`);
  }
  const out = execFileSync(process.execPath, [join(ROOT, 'templates/statusline-launcher.mjs')], {
    input: '{}', encoding: 'utf8', env: { ...process.env, HOME: h }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.match(out, /SÜRÜM 0\.1\.10/, 'sayısal sıralama: 0.1.10 > 0.1.9');
  rmSync(h, { recursive: true, force: true });
});

test('an older versioned statusLine entry is migrated to the launcher', () => {
  // setup and doctor must share one recognition test.
  // setup and doctor must share one recognition test.
  // setup and doctor must share one recognition test.
  const c = mkdtempSync(join(tmpdir(), 'slopguard-tasima-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-tasimahome-'));
  mkdirSync(join(h, '.claude'), { recursive: true });
  const eski = 'node "/x/.claude/plugins/cache/lenarise-slopguard/lenarise-slopguard/0.1.1/bin/statusline.mjs"';
  writeFileSync(join(h, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command: eski } }));

  const r = run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  assert.match(r.stdout, /moved to the version-independent launcher/);
  const cmd = JSON.parse(readFileSync(join(h, '.claude/settings.json'), 'utf8')).statusLine.command;
  assert.match(cmd, /statusline-launcher\.mjs/);
  assert.doesNotMatch(cmd, /plugins\/cache/);
  rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
});

test('doctor recognises the launcher and flags a versioned path', () => {
  // setup and doctor must share one recognition test.
  // setup and doctor must share one recognition test.
  const mk = (cmd) => {
    const c = mkdtempSync(join(tmpdir(), 'slopguard-dsl-'));
    const h = mkdtempSync(join(tmpdir(), 'slopguard-dslhome-'));
    mkdirSync(join(h, '.claude'), { recursive: true });
    writeFileSync(join(h, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command: cmd } }));
    const out = run('scripts/doctor.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h }).stdout;
    rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
    return out;
  };
  assert.match(mk('node "/h/.claude/lenarise-slopguard/statusline-launcher.mjs"'),
    /✅ statusLine is registered \(version-independent/);
  assert.match(mk('node "/h/.claude/plugins/cache/lenarise-slopguard/lenarise-slopguard/0.1.1/bin/statusline.mjs"'),
    /versioned cache path/);
  assert.match(mk('my-own-bar'), /points at a different command/);
});

// setup and doctor must share one recognition test.

const START = '<!-- LenaRise.SlopGuard: liveness rule — start -->';
const END = '<!-- LenaRise.SlopGuard: liveness rule — end -->';

function setupHome(claudeMdContent) {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-cm-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-cmhome-'));
  if (claudeMdContent !== undefined) {
    mkdirSync(join(h, '.claude'), { recursive: true });
    writeFileSync(join(h, '.claude/CLAUDE.md'), claudeMdContent);
  }
  return { c, h, md: () => readFileSync(join(h, '.claude/CLAUDE.md'), 'utf8'),
    run: (args = []) => run('scripts/setup.mjs', args, { SLOPGUARD_CONFIG_DIR: c, HOME: h }),
    clean: () => { rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true }); } };
}

test('CLAUDE.md is created with the rule when it does not exist', () => {
  const w = setupHome();
  assert.match(w.run().stdout, /CLAUDE\.md created with the liveness rule/);
  assert.ok(w.md().includes(START) && w.md().includes(END));
  assert.match(w.md(), /heartbeat\.json/);
  w.clean();
});

test('an existing CLAUDE.md is preserved and the rule is appended', () => {
  const w = setupHome('# My rules\n\nDates are ISO 8601.\n');
  assert.match(w.run().stdout, /liveness rule appended/);
  const md = w.md();
  assert.match(md, /# My rules/, 'the user content must be preserved');
  assert.match(md, /Dates are ISO 8601/);
  assert.ok(md.indexOf('# My rules') < md.indexOf(START));
  w.clean();
});

test('a second run does not add it again', () => {
  const w = setupHome('# My rules\n');
  w.run();
  const ilk = w.md();
  assert.match(w.run().stdout, /liveness rule is current/);
  assert.equal(w.md(), ilk, 'the file must not change at all');
  assert.equal(w.md().split(START).length - 1, 1, 'the block must appear exactly once');
  w.clean();
});

test('refreshing an old block leaves the user text untouched', () => {
  const w = setupHome(`# Text above\n\n${START}\nOLD CONTENT\n${END}\n\n# Text below\n`);
  assert.match(w.run().stdout, /refreshed \(only the marked block\)/);
  const md = w.md();
  assert.match(md, /# Text above/);
  assert.match(md, /# Text below/);
  assert.doesNotMatch(md, /OLD CONTENT/);
  assert.match(md, /ui\.livenessCheck/);
  w.clean();
});

test('--skip-claude-md opts out', () => {
  const w = setupHome('# Do not touch\n');
  assert.match(w.run(['--skip-claude-md']).stdout, /skipped/);
  assert.equal(w.md(), '# Do not touch\n');
  w.clean();
});

test('deleting the block removes it cleanly', () => {
  const w = setupHome('# Permanent\n');
  w.run();
  const md = w.md();
  const clean = md.slice(0, md.indexOf(START)) + md.slice(md.indexOf(END) + END.length);
  assert.match(clean.trim(), /^# Permanent$/, 'removing the block must leave only the user text');
  w.clean();
});

// setup and doctor must share one recognition test.

function statusRepo(sessionPatch, uiConfig) {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-st-'));
  const repo = mkdtempSync(join(tmpdir(), 'slopguard-strepo-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  writeFileSync(join(c, 'heartbeat.json'), JSON.stringify({ ts: Date.now(), sessionId: 'canli', patterns: 26 }));
  writeFileSync(join(c, `session-canli.json`), JSON.stringify({ version: 1, sessionId: 'canli', ...sessionPatch }));
  if (uiConfig) writeFileSync(join(c, 'config.json'), JSON.stringify({ ui: uiConfig }));
  return { c, repo,
    run: () => run('scripts/status.mjs', [], { SLOPGUARD_CONFIG_DIR: c }, repo).stdout,
    clean: () => { rmSync(c, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }); } };
}

test('status always answers regardless of ui.chatStatus', () => {
  for (const ui of [{ chatStatus: 0 }, { chatStatus: 2 }, undefined]) {
    const w = statusRepo({ turns: 3 }, ui);
    const out = w.run();
    assert.match(out, /session canli/, `chatStatus=${JSON.stringify(ui)}`);
    assert.match(out, /Live scan/);
    w.clean();
  }
});

test('the live scan finds the truth independently of the hook record', () => {
  const w = statusRepo({ turns: 5, filesWritten: { 'x.js': 1 } });
  // setup and doctor must share one recognition test.
  writeFileSync(join(w.repo, 'dirty.js'), 'try{ a() }catch(e){}\n');
  const out = w.run();
  assert.match(out, /Live scan.*1 finding/);
  assert.match(out, /dirty\.js/);
  assert.match(out, /CODE-05 {2}line 1/);
  w.clean();
});

test('the live scan says so plainly when it is clean', () => {
  const w = statusRepo({ turns: 2, filesWritten: { 'a.js': 1 } });
  writeFileSync(join(w.repo, 'clean.js'), 'export const a = 1;\n');
  assert.match(w.run(), /Live scan.*· clean/);
  w.clean();
});

test('when the hook record is empty the reason is given', () => {
  const w = statusRepo({ turns: 9, filesWritten: {} });
  const out = w.run();
  assert.match(out, /no file writes were recorded/);
  assert.match(out, /written through Bash/);
  assert.match(out, /post-edit only listens to the Edit and Write tools/);
  w.clean();
});

test('no note appears when the hook record is populated', () => {
  const w = statusRepo({ turns: 9, filesWritten: { 'a.js': 2 } });
  assert.doesNotMatch(w.run(), /no file writes were recorded/);
  w.clean();
});

test('the session counters are labelled as coming from hooks', () => {
  const w = statusRepo({ turns: 4, filesWritten: { 'a.js': 1 } });
  assert.match(w.run(), /Measured .*\(from hook records\)/);
  w.clean();
});
