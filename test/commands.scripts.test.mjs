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

test('status oturum kimliğini kalp atışından bulur', () => {
  beat('oturum-a');
  session('oturum-a', { turns: 7, linesWritten: 120, linesRead: 30, blocked: 2, filesWritten: { 'a.js': 1 } });
  const r = run('scripts/status.mjs');
  assert.match(r.stdout, /oturum oturum-a/);
  assert.match(r.stdout, /7 tur/);
  assert.match(r.stdout, /2 engellenen slop/);
  assert.doesNotMatch(r.stdout, /kesin değil/, 'kalp atışı kesin kaynaktır');
});

test('status açık ihlalleri ve doğrulama borcunu ayrı gösterir', () => {
  beat('oturum-b');
  session('oturum-b', { turns: 3, linesWritten: 40, violations: { 'src/a.js': [{ id: 'KOD-05', line: 12, title: 'Hata bastırma', shown: 'src/a.js' }] } });
  const r = run('scripts/status.mjs');
  assert.match(r.stdout, /Açık ihlaller/);
  assert.match(r.stdout, /KOD-05 {2}src\/a\.js:12/);
  assert.match(r.stdout, /bu turda test çalışmadı \(TST-05\)/);
});

test('status eşik aşımını işaretler', () => {
  beat('oturum-c');
  session('oturum-c', { turns: 2, linesWritten: 900, linesRead: 10, linesSinceCommit: 700 });
  const r = run('scripts/status.mjs');
  assert.match(r.stdout, /kavrayış borcu eşiğin üstünde/);
  assert.match(r.stdout, /eşiğin üstünde \(AGT-06\)/);
});

test('kayıt yoksa status uydurmaz', () => {
  const bos = mkdtempSync(join(tmpdir(), 'slopguard-bos-'));
  const r = run('scripts/status.mjs', [], { SLOPGUARD_CONFIG_DIR: bos });
  assert.match(r.stdout, /kayıt bulunamadı/);
  assert.match(r.stdout, /slop-doctor/);
  rmSync(bos, { recursive: true, force: true });
});

// ── /slop-mode ──────────────────────────────────────────────────────────

test('mode yalnızca oturuma yazar, config.json a dokunmaz', () => {
  beat('oturum-d');
  session('oturum-d', { turns: 1 });
  writeFileSync(join(cfg, 'config.json'), JSON.stringify({ mode: 'strict' }));
  const r = run('scripts/mode.mjs', ['explore']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /yalnızca bu oturum/);
  assert.equal(JSON.parse(readFileSync(join(cfg, `session-oturum-d.json`), 'utf8')).modeOverride, 'explore');
  assert.equal(JSON.parse(readFileSync(join(cfg, 'config.json'), 'utf8')).mode, 'strict', 'kalıcı kip değişmemeli');
  rmSync(join(cfg, 'config.json'), { force: true });
});

test('mode keşif kipinin neyi gevşetmediğini söyler', () => {
  beat('oturum-e'); session('oturum-e', { turns: 1 });
  const r = run('scripts/mode.mjs', ['explore']);
  assert.match(r.stdout, /Geri dönüşsüz komutlar ve korumalı yollar bu kipte de engellenir/);
});

test('geçersiz kip reddedilir ve kullanım gösterilir', () => {
  const r = run('scripts/mode.mjs', ['kapali']);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /Kullanım: \/slop-mode strict\|explore/);
});

// ── /slop-setup ─────────────────────────────────────────────────────────

test('setup dosyaları oluşturur ve ikinci çalıştırmada ezmez', () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-setup-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-setuphome-'));
  const first = run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  assert.match(first.stdout, /config\.json oluşturuldu/);
  assert.match(first.stdout, /statusLine kaydedildi/);

  const conf = JSON.parse(readFileSync(join(c, 'config.json'), 'utf8'));
  assert.equal(conf.mode, 'strict');
  assert.equal(conf.thresholds.maxDiffLines, 400);

  const second = run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  assert.match(second.stdout, /config\.json zaten var, dokunulmadı/);
  assert.match(second.stdout, /statusLine güncel/, 'kendi girdisini yabancı sanmamalı');
  rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
});

test('setup ürettiği örnek desen gerçekten derlenir ve eşleşir', async () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-ornek-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-ornekhome-'));
  run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  const out = execFileSync(process.execPath, ['-e', `
    import('${join(ROOT, 'lib/config.mjs')}').then(m => {
      const { config, problems } = m.loadConfig({});
      process.stdout.write(JSON.stringify({
        problems, matched: config.localPatterns[0].match.test('TODO (acil) bunu düzelt'),
      }));
    });`], { encoding: 'utf8', env: { ...process.env, SLOPGUARD_CONFIG_DIR: c } });
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed.problems, [], 'örnek desen sorunsuz yüklenmeli');
  assert.equal(parsed.matched, true, 'kullanıcının göreceği ilk örnek çalışmalı');
  rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
});

test('setup kullanıcının kendi statusLine girdisini ezmez', () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-sl-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-slhome-'));
  mkdirSync(join(h, '.claude'), { recursive: true });
  writeFileSync(join(h, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command: 'my-own-bar' } }));
  const r = run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  assert.match(r.stdout, /başka bir komuta ayarlı, dokunulmadı/);
  assert.equal(JSON.parse(readFileSync(join(h, '.claude/settings.json'), 'utf8')).statusLine.command, 'my-own-bar');
  rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
});

// ── /slop-repo-init ─────────────────────────────────────────────────────

test('repo-init dosyaları kurar ve var olanı ezmez', () => {
  const repo = mkdtempSync(join(tmpdir(), 'slopguard-ri-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const r = run('scripts/repo-init.mjs', [], {}, repo);
  assert.match(r.stdout, /AGENTS\.md/);
  assert.match(r.stdout, /\.slopignore/);
  assert.match(r.stdout, /pre-commit/);
  assert.ok(existsSync(join(repo, 'AGENTS.md')));
  assert.ok(existsSync(join(repo, '.github/workflows/slop-gate.yml')));
  assert.ok(existsSync(join(repo, '.git/hooks/pre-commit')));

  const agents = readFileSync(join(repo, 'AGENTS.md'), 'utf8');
  assert.match(agents, /# AGENTS\.md/);
  assert.match(agents, /## Güvenlik \(GUV\)/, 'kural setinden türetilmeli');

  writeFileSync(join(repo, 'AGENTS.md'), 'elle yazılmış');
  run('scripts/repo-init.mjs', [], {}, repo);
  assert.equal(readFileSync(join(repo, 'AGENTS.md'), 'utf8'), 'elle yazılmış', 'ikinci çalıştırma ezmemeli');
  rmSync(repo, { recursive: true, force: true });
});

test('repo-init git deposu olmayan yerde açıkça reddeder', () => {
  const plain = mkdtempSync(join(tmpdir(), 'slopguard-plain-'));
  const r = run('scripts/repo-init.mjs', [], {}, plain);
  assert.equal(r.code, 1);
  assert.match(r.stdout, /git init/);
  rmSync(plain, { recursive: true, force: true });
});

// ── /slop-doctor ────────────────────────────────────────────────────────

test('doctor tüm hook boru testlerini geçirir', () => {
  const r = run('scripts/doctor.mjs');
  const probeLines = r.stdout.split('\n').filter((l) => /\.mjs —/.test(l));
  assert.ok(probeLines.length >= 7, `beklenen en az 7 boru testi, gelen ${probeLines.length}`);
  const failed = probeLines.filter((l) => l.includes('❌'));
  assert.deepEqual(failed, [], 'hiçbir hook boru testi başarısız olmamalı');
});

test('doctor probe u yan etkisiz çalıştırır', () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-doc-'));
  run('scripts/doctor.mjs', [], { SLOPGUARD_CONFIG_DIR: c });
  const leftovers = readdirSync(c).filter((f) => f.startsWith('session-') || f === 'heartbeat.json');
  assert.deepEqual(leftovers, [], 'teşhis kendi kalp atışını damgalayıp canlı görüntüsü üretmemeli');
  rmSync(c, { recursive: true, force: true });
});

test('doctor eksik kurulumu sorun olarak bildirir', () => {
  const c = mkdtempSync(join(tmpdir(), 'slopguard-doc2-'));
  const r = run('scripts/doctor.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: c });
  assert.equal(r.code, 1);
  assert.match(r.stdout, /kalp atışı damgası yok/);
  assert.match(r.stdout, /Sonuç: \d+ sorun bulundu/);
  rmSync(c, { recursive: true, force: true });
});

test('setup sürümlü cache yolu değil, sabit başlatıcı kaydeder', () => {
  // Kurulum provasında ölçüldü: cache yolu sürüm numarası içeriyor ve her
  // güncelleme statusLine'ı sessizce kırıyordu. Koruma var sanılırken bozuk
  // olması, bu aracın engellemek için var olduğu durumun kendisi.
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

test('başlatıcı kurulu sürüm yokken sessiz kalmaz', () => {
  const h = mkdtempSync(join(tmpdir(), 'slopguard-yok-'));
  const out = execFileSync(process.execPath, [join(ROOT, 'templates/statusline-launcher.mjs')], {
    input: '{}', encoding: 'utf8', env: { ...process.env, HOME: h }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  assert.match(out, /kurulu değil/, 'kaldırılmış plugin çubuktan görünmeli');
  rmSync(h, { recursive: true, force: true });
});

test('başlatıcı en yüksek sürüme devreder', () => {
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

test('eski sürümlü statusLine girdisi başlatıcıya taşınır', () => {
  // Erken sürümler settings.json'a sürümlü cache yolu yazıyordu. O girdi
  // "bizim" olduğu için dokunulmadan bırakılırsa çubuk her güncellemede
  // kırık kalırdı — kurulum provasında görüldü.
  const c = mkdtempSync(join(tmpdir(), 'slopguard-tasima-'));
  const h = mkdtempSync(join(tmpdir(), 'slopguard-tasimahome-'));
  mkdirSync(join(h, '.claude'), { recursive: true });
  const eski = 'node "/x/.claude/plugins/cache/lenarise-slopguard/lenarise-slopguard/0.1.1/bin/statusline.mjs"';
  writeFileSync(join(h, '.claude/settings.json'), JSON.stringify({ statusLine: { type: 'command', command: eski } }));

  const r = run('scripts/setup.mjs', [], { SLOPGUARD_CONFIG_DIR: c, HOME: h });
  assert.match(r.stdout, /sürümsüz başlatıcıya taşındı/);
  const cmd = JSON.parse(readFileSync(join(h, '.claude/settings.json'), 'utf8')).statusLine.command;
  assert.match(cmd, /statusline-launcher\.mjs/);
  assert.doesNotMatch(cmd, /plugins\/cache/);
  rmSync(c, { recursive: true, force: true }); rmSync(h, { recursive: true, force: true });
});

test('doctor başlatıcıyı tanır ve sürümlü yolu sorun sayar', () => {
  // setup ve doctor aynı ölçütü kullanmalı; ayrı ayrı yazılınca biri
  // diğerinin yazdığı girdiyi yabancı sandı.
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
    /✅ statusLine kayıtlı \(sürümden bağımsız/);
  assert.match(mk('node "/h/.claude/plugins/cache/lenarise-slopguard/lenarise-slopguard/0.1.1/bin/statusline.mjs"'),
    /sürümlü cache yoluna ayarlı/);
  assert.match(mk('my-own-bar'), /başka bir komuta ayarlı/);
});
