import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanContent, scanPath, actionable, protectedPathReason } from '../lib/scan.mjs';
import { detectEngines, isGameProject } from '../lib/project.mjs';
import { PATTERNS, CATEGORIES } from '../lib/patterns.mjs';

const keys = (filePath, content) => actionable(scanContent({ filePath, content })).map((f) => f.key);

/**
 * Commands do not have to run inside a git repository.
 *
 * GAME patterns key off engine API names, so they stay silent elsewhere on their
 * own. The category exists so they can be switched off in one line, and so the
 * engine-generated files they protect are discoverable.
 */
const unity = (body) => `using UnityEngine;\npublic class Oyuncu : MonoBehaviour {\n${body}\n}\n`;

// A protected path is a separate gate; scanPath only looks for pattern matches.

test('the GAME category is registered and has patterns', () => {
  assert.ok(CATEGORIES.GAME, 'kategori tanımlı olmalı');
  assert.ok(PATTERNS.filter((p) => p.id.startsWith('GAME')).length >= 7);
});

test('GAME patterns key off engine API names — silent in general code', () => {
  const genel = [
    'export function topla(a, b) { return a + b; }',
    'const sonuc = liste.Where(x => x.aktif).ToList();',
    'function update() { console.log("tik"); }',
  ].join('\n');
  assert.deepEqual(keys('genel.js', genel), [], 'oyun olmayan projede tetiklenmemeli');
});

// A protected path is a separate gate; scanPath only looks for pattern matches.

test('GAME-01 catches motion without deltaTime', () => {
  assert.ok(keys('P.cs', unity('  void Update() { transform.Translate(Vector3.forward * hiz); }'))
    .includes('game-01-framerate-dependent-motion'));
  assert.ok(keys('P.cs', unity('  void Update() { transform.position += yon * hiz; }'))
    .includes('game-01-framerate-dependent-motion'));
});

test('GAME-01 deltaTime varsa sessiz', () => {
  for (const body of [
    '  void Update() { transform.Translate(Vector3.forward * hiz * Time.deltaTime); }',
    '  void Update() { transform.position += yon * hiz * Time.deltaTime; }',
    '  void Update() { transform.position = hedef; }',
  ]) {
    assert.deepEqual(keys('P.cs', unity(body)).filter((k) => k.startsWith('game-01')), [], body);
  }
});

// A protected path is a separate gate; scanPath only looks for pattern matches.

test('GAME-02 catches a lookup inside Update', () => {
  for (const call of ['GameObject.Find("Oyuncu")', 'FindObjectOfType<Rigidbody>()',
                      'Camera.main.transform', 'GetComponent<Animator>()']) {
    assert.ok(keys('P.cs', unity(`  void Update() { var x = ${call}; }`)).includes('game-02-scene-lookup-per-frame'), call);
  }
});

test('GAME-02 allows lookups inside Awake and Start', () => {
  for (const method of ['Awake', 'Start', 'OnEnable']) {
    const found = keys('P.cs', unity(`  void ${method}() { govde = GetComponent<Rigidbody>(); }`));
    assert.deepEqual(found.filter((k) => k.startsWith('game-02')), [], method);
  }
});

// ── GAME-03 fizik ────────────────────────────────────────────────────────

test('GAME-03 catches physics inside Update', () => {
  assert.ok(keys('P.cs', unity('  void Update() { govde.AddForce(Vector3.up); }'))
    .includes('game-03-physics-in-update'));
  assert.ok(keys('P.cs', unity('  void Update() { govde.velocity = yeni; }'))
    .includes('game-03-physics-in-update'));
});

test('GAME-03 accepts physics inside FixedUpdate', () => {
  const found = keys('P.cs', unity('  void FixedUpdate() { govde.AddForce(Vector3.up); }'));
  assert.deepEqual(found.filter((k) => k.startsWith('game-03')), []);
});

// A protected path is a separate gate; scanPath only looks for pattern matches.

test('GAME-04 catches LINQ inside Update', () => {
  assert.ok(keys('P.cs', unity('  void Update() { var y = dusmanlar.Where(d => d.canli).ToList(); }'))
    .includes('game-04-hot-path-allocation'));
});

test('GAME-05 catches logging inside Update', () => {
  assert.ok(keys('P.cs', unity('  void Update() { Debug.Log("tik"); }'))
    .includes('game-05-logging-per-frame'));
});

test('GAME-04 and GAME-05 stay silent outside Update', () => {
  const body = '  void Baslat() { Debug.Log("hazir"); var y = liste.Where(x => x.a).ToList(); }';
  const found = keys('P.cs', unity(body));
  assert.deepEqual(found.filter((k) => k.startsWith('game-04') || k.startsWith('game-05')), []);
});

// ── GAME-06 istemcide ekonomi (tek block desen) ──────────────────────────

test('GAME-06 blocks currency and progression on the client', () => {
  for (const call of ['PlayerPrefs.SetInt("coins", 500)', 'PlayerPrefs.SetInt("player_gold", g)',
                      'PlayerPrefs.SetString("premium_unlock", "1")', 'PlayerPrefs.SetInt("player_score", s)']) {
    const found = actionable(scanContent({ filePath: 'K.cs', content: unity(`  void Kaydet() { ${call}; }`) }));
    assert.ok(found.some((f) => f.key === 'game-06-client-side-economy'), call);
    assert.equal(found.find((f) => f.key === 'game-06-client-side-economy').severity, 'block',
      'ekonomi bir güvenlik meselesi — tek block OYN deseni');
  }
});

test('GAME-06 does not block harmless preferences', () => {
  for (const call of ['PlayerPrefs.SetFloat("ses_seviyesi", v)', 'PlayerPrefs.SetInt("dil", 2)',
                      'PlayerPrefs.SetString("son_sahne", ad)']) {
    assert.deepEqual(keys('K.cs', unity(`  void Kaydet() { ${call}; }`)).filter((k) => k.startsWith('game-06')), [], call);
  }
});

// ── GAME-07 Godot ────────────────────────────────────────────────────────

test('GAME-07 catches a relative node path', () => {
  assert.ok(keys('oyuncu.gd', 'func _ready():\n\tvar p = get_node("../../Oyuncu")\n')
    .includes('game-07-fragile-node-path'));
});

test('GAME-07 stays silent on absolute and non-relative paths', () => {
  for (const line of ['var p = get_node("Silah")', 'var p = get_node("/root/Oyun")', '@onready var p = $Silah']) {
    assert.deepEqual(keys('o.gd', `func _ready():\n\t${line}\n`).filter((k) => k.startsWith('game-07')), [], line);
  }
});

test('.gd files are scanned', async () => {
  const { classify } = await import('../lib/scan.mjs');
  assert.equal(classify('oyuncu.gd'), 'code');
});

// A protected path is a separate gate; scanPath only looks for pattern matches.

test('GAME-08 protects engine-generated files', () => {
  const korumali = [
    ['Assets/Oyuncu.cs.meta', /GUID/],
    ['Library/ScriptAssemblies/x.dll', /Unity generated/],
    ['Content/Maps/Ana.umap', /engine asset/],
    ['Assets/Sahneler/Ana.unity', /engine asset/],
    ['sahneler/ana.tscn', /engine asset/],
    ['.godot/uid_cache.bin', /Godot generated/],
    ['Intermediate/Build/x.o', /Unreal generated/],
  ];
  for (const [path, expected] of korumali) {
    const why = protectedPathReason(path);
    assert.ok(why, `protected olmalı: ${path}`);
    assert.match(why, /GAME-08/, path);
    assert.match(why, expected, path);
  }
});

test('ordinary game source files are not protected', () => {
  for (const path of ['Assets/Scripts/Oyuncu.cs', 'src/oyun.gd', 'Source/Oyun/Player.cpp']) {
    assert.equal(protectedPathReason(path), null, path);
  }
});

test('protected engine paths do not trip the pre-edit path scan', () => {
  // A protected path is a separate gate; scanPath only looks for pattern matches.
  assert.deepEqual(scanPath({ filePath: 'Assets/Oyuncu.cs.meta' }).map((f) => f.key), []);
});

// ── Motor tespiti ───────────────────────────────────────────────────────

const roots = [];
after(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });
function makeRoot(build) {
  const root = mkdtempSync(join(tmpdir(), 'slopguard-oyun-'));
  roots.push(root);
  build(root);
  return root;
}

test('Unity, Godot and Unreal signatures are recognised', () => {
  const u = makeRoot((r) => { mkdirSync(join(r, 'Assets')); mkdirSync(join(r, 'ProjectSettings')); });
  assert.deepEqual(detectEngines(u), ['Unity']);

  const g = makeRoot((r) => writeFileSync(join(r, 'project.godot'), '[application]\n'));
  assert.deepEqual(detectEngines(g), ['Godot']);

  const ue = makeRoot((r) => writeFileSync(join(r, 'Oyun.uproject'), '{}'));
  assert.deepEqual(detectEngines(ue), ['Unreal']);
});

test('a non-game project yields no signature', () => {
  const web = makeRoot((r) => { mkdirSync(join(r, 'src')); writeFileSync(join(r, 'package.json'), '{}'); });
  assert.deepEqual(detectEngines(web), []);
  assert.equal(isGameProject(web), false);
});

test('Assets alone is not Unity — ProjectSettings is required too', () => {
  const yanlis = makeRoot((r) => mkdirSync(join(r, 'Assets')));
  assert.deepEqual(detectEngines(yanlis), [], 'tek imza yeterli olmamalı, yanlış pozitif üretirdi');
});

test('detection returns empty with no root or an unreadable one', () => {
  assert.deepEqual(detectEngines(null), []);
  assert.deepEqual(detectEngines('/kesinlikle/olmayan/yol'), []);
});

// A protected path is a separate gate; scanPath only looks for pattern matches.

test('game rules are injected only when an engine signature exists', async () => {
  const { makeWorkspace, pipe } = await import('./pipe.mjs');
  const ws = makeWorkspace();
  const ctx = () => pipe('hooks/session-start.mjs', {
    session_id: 'oyn', cwd: ws.repo, hook_event_name: 'SessionStart', source: 'startup',
  }, { cfgDir: ws.cfgDir }).json?.hookSpecificOutput?.additionalContext ?? '';

  const web = ctx();
  assert.doesNotMatch(web, /## Game development/, 'oyun olmayan projeye yüklenmemeli (AGENT-02)');

  mkdirSync(join(ws.repo, 'Assets'), { recursive: true });
  mkdirSync(join(ws.repo, 'ProjectSettings'), { recursive: true });
  const oyun = ctx();
  assert.match(oyun, /## Game development/);
  assert.match(oyun, /Engine detected: Unity\./);
  assert.ok(oyun.length > web.length, 'oyun projesinde bağlam genişlemeli');
  ws.cleanup();
});
