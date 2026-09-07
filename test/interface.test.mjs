import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, CATEGORIES, isInterfaceFile } from '../lib/patterns.mjs';
import { scanContent } from '../lib/scan.mjs';

/**
 * UI and A11Y — the interface categories.
 *
 * Two things are held here. The patterns catch what they claim, and they stay
 * silent on the correct form of the same construct: min-height against height,
 * outline-none with a focus ring against outline-none alone. The second half is
 * the one that decides whether the category is usable in a real project.
 */

const keys = (content, file) => scanContent({ filePath: file, content }).map((f) => f.key);

const CAUGHT = [
  ['ui-01-default-gradient-classes', 'a.tsx',  'className="bg-gradient-to-r from-blue-500 to-purple-600"'],
  ['ui-01-default-gradient-css',     'a.css',  '.hero { background: linear-gradient(90deg, #6366f1, #a855f7); }'],
  ['ui-02-glass-stacking',           'a.tsx',  '<nav className="backdrop-blur"/><div className="backdrop-blur"/><aside className="backdrop-blur"/>'],
  ['ui-02-glow-stacking',            'a.css',  '.a{box-shadow:0 0 20px #f0f;}.b{box-shadow:0 0 30px #0ff;}.c{box-shadow:0 0 40px #ff0;}'],
  ['ui-03-button-arrow-code',        'a.tsx',  '<button>Get started →</button>'],
  ['ui-03-background-grid',          'a.tsx',  'className="bg-grid-slate-100"'],
  ['ui-04-generic-icon-import',      'a.tsx',  "import { Sparkles, Zap } from 'lucide-react'"],
  ['ui-05-empty-anchor-code',        'a.jsx',  '<a href="#">Learn more</a>'],
  ['ui-05-empty-anchor-markup',      'a.html', '<a href="#">Learn more</a>'],
  ['ui-05-inert-button',             'a.tsx',  '<button className="btn">Save</button>'],
  ['ui-06-mono-heading',             'a.tsx',  '<h1 className="font-mono text-4xl">Title</h1>'],
  ['ui-06-uppercase-tracking',       'a.tsx',  'className="uppercase tracking-widest text-xs"'],
  ['ui-07-stock-illustration-code',  'a.tsx',  'src="https://undraw.co/hero.svg"'],
  ['a11y-01-outline-none-css',       'a.css',  'button { outline: none; }'],
  ['a11y-01-outline-none-class',     'a.tsx',  'className="outline-none rounded"'],
  ['a11y-03-hover-only-reveal',      'a.css',  '.menu:hover .sub { display: block; }'],
  ['a11y-04-zoom-disabled',          'a.html', '<meta name="viewport" content="width=device-width, user-scalable=no">'],
  ['a11y-05-root-overflow-hidden',   'a.css',  'body { overflow-x: hidden; }'],
  ['a11y-06-viewport-locked-css',    'a.css',  '.hero { height: 100vh; }'],
  ['a11y-06-viewport-locked-class',  'a.tsx',  '<section className="h-screen">'],
];

for (const [key, file, content] of CAUGHT) {
  test(`${key} catches: ${content.slice(0, 44)}`, () => {
    const found = keys(content, file);
    assert.ok(found.includes(key), `expected ${key}, got ${found.join(', ') || 'nothing'}`);
  });
}

const LEFT_ALONE = [
  ['a gradient inside one hue',        'a.tsx',  'className="from-blue-500 to-blue-700"'],
  ['a neutral gradient',               'a.css',  '.card { background: linear-gradient(180deg, #ffffff, #f3f4f6); }'],
  ['glass on a single surface',        'a.tsx',  '<nav className="backdrop-blur border-b"/>'],
  ['a focus ring, not a glow stack',   'a.css',  '.btn { box-shadow: 0 0 0 3px rgba(0,0,0,.2); }'],
  ['an anchor with a target',          'a.tsx',  '<a href="#pricing">Pricing</a>'],
  ['a wired button',                   'a.tsx',  '<button onClick={save}>Save</button>'],
  ['a submit button',                  'a.tsx',  '<button type="submit">Send</button>'],
  ['outline-none with a focus ring',   'a.tsx',  'className="outline-none focus-visible:ring-2"'],
  ['hover with a focus equivalent',    'a.css',  '.menu:hover .sub{display:block;}\n.menu:focus-within .sub{display:block;}'],
  ['a viewport tag that allows zoom',  'a.html', '<meta name="viewport" content="width=device-width, initial-scale=1">'],
  ['overflow hidden on a carousel',    'a.css',  '.carousel { overflow-x: hidden; }'],
  ['min-height, the correct form',     'a.css',  '.hero { min-height: 100vh; }'],
  ['min-h-screen, the correct class',  'a.tsx',  '<section className="min-h-screen">'],
  ['icons chosen for meaning',         'a.tsx',  "import { Search, Trash2 } from 'lucide-react'"],
];

for (const [label, file, content] of LEFT_ALONE) {
  test(`left alone: ${label}`, () => {
    const found = keys(content, file).filter((k) => k.startsWith('ui-') || k.startsWith('a11y-'));
    assert.deepEqual(found, [], `unexpected: ${found.join(', ')}`);
  });
}

test('interface patterns stay silent in a project that has no interface', () => {
  const python = 'def render():\n    return "h-screen"\n';
  assert.deepEqual(keys(python, 'a.py').filter((k) => k.startsWith('ui-') || k.startsWith('a11y-')), []);
});

test('both interface categories are domain-scoped and switchable in one word', () => {
  for (const code of ['UI', 'A11Y']) {
    assert.equal(CATEGORIES[code].enforcement, 'domain-scoped');
    assert.equal(CATEGORIES[code].layer, 'machine');
  }
  const disabled = { disabled: ['UI', 'A11Y'] };
  const found = scanContent({ filePath: 'a.tsx', content: '<a href="#">x</a>', config: disabled });
  assert.deepEqual(found.map((f) => f.key), []);
});

test('every interface pattern warns and carries a counter-list', () => {
  const entries = PATTERNS.filter((p) => p.id.startsWith('UI-') || p.id.startsWith('A11Y-'));
  assert.equal(entries.length, 22);
  for (const p of entries) {
    assert.equal(p.severity, 'warn', `${p.key}: a new pattern is measured before it blocks`);
    assert.ok(p.notFlagged?.length > 0, `${p.key}: no counter-examples`);
  }
});

test('isInterfaceFile covers stylesheets, markup and components', () => {
  for (const f of ['a.css', 'a.scss', 'a.html', 'a.tsx', 'a.jsx', 'a.vue', 'a.svelte']) {
    assert.equal(isInterfaceFile(f), true, f);
  }
  for (const f of ['a.py', 'a.md', 'a.go', 'a.mjs']) {
    assert.equal(isInterfaceFile(f), false, f);
  }
});
