import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanContent, scanPath, actionable, protectedPathReason } from '../lib/scan.mjs';
import { detectEngines, isGameProject } from '../lib/project.mjs';
import { PATTERNS, CATEGORIES } from '../lib/patterns.mjs';

const keys = (filePath, content) => actionable(scanContent({ filePath, content })).map((f) => f.key);

/** Unity metodunu bir sınıf gövdesine sarar — desenler gerçek biçimi görsün. */
const unity = (body) => `using UnityEngine;\npublic class Oyuncu : MonoBehaviour {\n${body}\n}\n`;

// ── Kategori bütünlüğü ──────────────────────────────────────────────────

test('OYN kategorisi kayıtlı ve desenleri var', () => {
  assert.ok(CATEGORIES.OYN, 'kategori tanımlı olmalı');
  assert.ok(PATTERNS.filter((p) => p.id.startsWith('OYN')).length >= 7);
});

test('OYN desenleri motor API adlarına dayanır — genel kodda sessiz', () => {
  const genel = [
    'export function topla(a, b) { return a + b; }',
    'const sonuc = liste.Where(x => x.aktif).ToList();',
    'function update() { console.log("tik"); }',
  ].join('\n');
  assert.deepEqual(keys('genel.js', genel), [], 'oyun olmayan projede tetiklenmemeli');
});

// ── OYN-01 kare hızına bağlı hareket ────────────────────────────────────

test('OYN-01 deltaTime olmadan hareket yakalanır', () => {
  assert.ok(keys('P.cs', unity('  void Update() { transform.Translate(Vector3.forward * hiz); }'))
    .includes('oyn-01-framerate-bagimli-hareket'));
  assert.ok(keys('P.cs', unity('  void Update() { transform.position += yon * hiz; }'))
    .includes('oyn-01-framerate-bagimli-hareket'));
});

test('OYN-01 deltaTime varsa sessiz', () => {
  for (const body of [
    '  void Update() { transform.Translate(Vector3.forward * hiz * Time.deltaTime); }',
    '  void Update() { transform.position += yon * hiz * Time.deltaTime; }',
    '  void Update() { transform.position = hedef; }',
  ]) {
    assert.deepEqual(keys('P.cs', unity(body)).filter((k) => k.startsWith('oyn-01')), [], body);
  }
});

// ── OYN-02 sahne araması ────────────────────────────────────────────────

test('OYN-02 Update içindeki arama yakalanır', () => {
  for (const call of ['GameObject.Find("Oyuncu")', 'FindObjectOfType<Rigidbody>()',
                      'Camera.main.transform', 'GetComponent<Animator>()']) {
    assert.ok(keys('P.cs', unity(`  void Update() { var x = ${call}; }`)).includes('oyn-02-her-karede-sahne-aramasi'), call);
  }
});

test('OYN-02 Awake ve Start içindeki arama serbest', () => {
  for (const method of ['Awake', 'Start', 'OnEnable']) {
    const found = keys('P.cs', unity(`  void ${method}() { govde = GetComponent<Rigidbody>(); }`));
    assert.deepEqual(found.filter((k) => k.startsWith('oyn-02')), [], method);
  }
});

// ── OYN-03 fizik ────────────────────────────────────────────────────────

test('OYN-03 Update içindeki fizik yakalanır', () => {
  assert.ok(keys('P.cs', unity('  void Update() { govde.AddForce(Vector3.up); }'))
    .includes('oyn-03-fizik-update-icinde'));
  assert.ok(keys('P.cs', unity('  void Update() { govde.velocity = yeni; }'))
    .includes('oyn-03-fizik-update-icinde'));
});

test('OYN-03 FixedUpdate içindeki fizik doğru yerdedir', () => {
  const found = keys('P.cs', unity('  void FixedUpdate() { govde.AddForce(Vector3.up); }'));
  assert.deepEqual(found.filter((k) => k.startsWith('oyn-03')), []);
});

// ── OYN-04 ve OYN-05 sıcak yol ──────────────────────────────────────────

test('OYN-04 Update içindeki LINQ yakalanır', () => {
  assert.ok(keys('P.cs', unity('  void Update() { var y = dusmanlar.Where(d => d.canli).ToList(); }'))
    .includes('oyn-04-sicak-yolda-tahsis'));
});

test('OYN-05 Update içindeki günlük yakalanır', () => {
  assert.ok(keys('P.cs', unity('  void Update() { Debug.Log("tik"); }'))
    .includes('oyn-05-her-karede-gunluk'));
});

test('OYN-04 ve OYN-05 Update dışında sessiz', () => {
  const body = '  void Baslat() { Debug.Log("hazir"); var y = liste.Where(x => x.a).ToList(); }';
  const found = keys('P.cs', unity(body));
  assert.deepEqual(found.filter((k) => k.startsWith('oyn-04') || k.startsWith('oyn-05')), []);
});

// ── OYN-06 istemcide ekonomi (tek block desen) ──────────────────────────

test('OYN-06 istemcide para ve ilerleme engellenir', () => {
  for (const call of ['PlayerPrefs.SetInt("coins", 500)', 'PlayerPrefs.SetInt("player_gold", g)',
                      'PlayerPrefs.SetString("premium_unlock", "1")', 'PlayerPrefs.SetInt("skor", s)']) {
    const found = actionable(scanContent({ filePath: 'K.cs', content: unity(`  void Kaydet() { ${call}; }`) }));
    assert.ok(found.some((f) => f.key === 'oyn-06-istemcide-ekonomi'), call);
    assert.equal(found.find((f) => f.key === 'oyn-06-istemcide-ekonomi').severity, 'block',
      'ekonomi bir güvenlik meselesi — tek block OYN deseni');
  }
});

test('OYN-06 zararsız tercihleri engellemez', () => {
  for (const call of ['PlayerPrefs.SetFloat("ses_seviyesi", v)', 'PlayerPrefs.SetInt("dil", 2)',
                      'PlayerPrefs.SetString("son_sahne", ad)']) {
    assert.deepEqual(keys('K.cs', unity(`  void Kaydet() { ${call}; }`)).filter((k) => k.startsWith('oyn-06')), [], call);
  }
});

// ── OYN-07 Godot ────────────────────────────────────────────────────────

test('OYN-07 göreli düğüm yolu yakalanır', () => {
  assert.ok(keys('oyuncu.gd', 'func _ready():\n\tvar p = get_node("../../Oyuncu")\n')
    .includes('oyn-07-kirilgan-dugum-yolu'));
});

test('OYN-07 mutlak ve göreli olmayan yol sessiz', () => {
  for (const line of ['var p = get_node("Silah")', 'var p = get_node("/root/Oyun")', '@onready var p = $Silah']) {
    assert.deepEqual(keys('o.gd', `func _ready():\n\t${line}\n`).filter((k) => k.startsWith('oyn-07')), [], line);
  }
});

test('.gd dosyaları taranıyor', async () => {
  const { classify } = await import('../lib/scan.mjs');
  assert.equal(classify('oyuncu.gd'), 'code');
});

// ── OYN-08 motor üretimi dosyalar ───────────────────────────────────────

test('OYN-08 motor üretimi dosyalar korumalı', () => {
  const korumali = [
    ['Assets/Oyuncu.cs.meta', /GUID/],
    ['Library/ScriptAssemblies/x.dll', /Unity üretim/],
    ['Content/Maps/Ana.umap', /motor varlık/],
    ['Assets/Sahneler/Ana.unity', /motor varlık/],
    ['sahneler/ana.tscn', /motor varlık/],
    ['.godot/uid_cache.bin', /Godot üretim/],
    ['Intermediate/Build/x.o', /Unreal üretim/],
  ];
  for (const [path, expected] of korumali) {
    const why = protectedPathReason(path);
    assert.ok(why, `korumalı olmalı: ${path}`);
    assert.match(why, /OYN-08/, path);
    assert.match(why, expected, path);
  }
});

test('sıradan oyun kaynak dosyaları korumalı değil', () => {
  for (const path of ['Assets/Scripts/Oyuncu.cs', 'src/oyun.gd', 'Source/Oyun/Player.cpp']) {
    assert.equal(protectedPathReason(path), null, path);
  }
});

test('korumalı motor yolları pre-edit yol taramasına takılmaz', () => {
  // Korumalı yol ayrı bir kapı; scanPath yalnızca desen eşleşmesi arar.
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

test('Unity, Godot ve Unreal imzaları tanınır', () => {
  const u = makeRoot((r) => { mkdirSync(join(r, 'Assets')); mkdirSync(join(r, 'ProjectSettings')); });
  assert.deepEqual(detectEngines(u), ['Unity']);

  const g = makeRoot((r) => writeFileSync(join(r, 'project.godot'), '[application]\n'));
  assert.deepEqual(detectEngines(g), ['Godot']);

  const ue = makeRoot((r) => writeFileSync(join(r, 'Oyun.uproject'), '{}'));
  assert.deepEqual(detectEngines(ue), ['Unreal']);
});

test('oyun olmayan proje imza vermez', () => {
  const web = makeRoot((r) => { mkdirSync(join(r, 'src')); writeFileSync(join(r, 'package.json'), '{}'); });
  assert.deepEqual(detectEngines(web), []);
  assert.equal(isGameProject(web), false);
});

test('yalnızca Assets dizini Unity saymaz — ProjectSettings de gerekir', () => {
  const yanlis = makeRoot((r) => mkdirSync(join(r, 'Assets')));
  assert.deepEqual(detectEngines(yanlis), [], 'tek imza yeterli olmamalı, yanlış pozitif üretirdi');
});

test('kök verilmezse ya da okunamazsa tespit boş döner', () => {
  assert.deepEqual(detectEngines(null), []);
  assert.deepEqual(detectEngines('/kesinlikle/olmayan/yol'), []);
});

// ── Kural enjeksiyonu yalnızca oyun projesinde ──────────────────────────

test('oyun kuralları yalnızca motor imzası varsa enjekte edilir', async () => {
  const { makeWorkspace, pipe } = await import('./pipe.mjs');
  const ws = makeWorkspace();
  const ctx = () => pipe('hooks/session-start.mjs', {
    session_id: 'oyn', cwd: ws.repo, hook_event_name: 'SessionStart', source: 'startup',
  }, { cfgDir: ws.cfgDir }).json?.hookSpecificOutput?.additionalContext ?? '';

  const web = ctx();
  assert.doesNotMatch(web, /## Oyun geliştirme/, 'oyun olmayan projeye yüklenmemeli (AGT-02)');

  mkdirSync(join(ws.repo, 'Assets'), { recursive: true });
  mkdirSync(join(ws.repo, 'ProjectSettings'), { recursive: true });
  const oyun = ctx();
  assert.match(oyun, /## Oyun geliştirme/);
  assert.match(oyun, /Tespit edilen motor: Unity\./);
  assert.ok(oyun.length > web.length, 'oyun projesinde bağlam genişlemeli');
  ws.cleanup();
});
