import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isWebProject, isGameProject } from '../lib/project.mjs';
import { classify } from '../lib/scan.mjs';
import { SCOPES, EXTENSIONS_BY_SCOPE } from '../lib/patterns.mjs';

/**
 * Detection gates rule text injection, not the scan. These tests hold that
 * boundary: a web project is recognised, a Python service is not, and an
 * unreadable or malformed package.json is read as an absence of evidence
 * rather than as a crash.
 */

function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'slopguard-project-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

test('web detection: a framework dependency is enough', () => {
  const dir = fixture({ 'package.json': JSON.stringify({ dependencies: { react: '^18.0.0' } }) });
  assert.equal(isWebProject(dir), true);
  rmSync(dir, { recursive: true, force: true });
});

test('web detection: a devDependency counts too', () => {
  const dir = fixture({ 'package.json': JSON.stringify({ devDependencies: { svelte: '^4.0.0' } }) });
  assert.equal(isWebProject(dir), true);
  rmSync(dir, { recursive: true, force: true });
});

test('web detection: a root marker file is enough without package.json', () => {
  const dir = fixture({ 'index.html': '<!doctype html>' });
  assert.equal(isWebProject(dir), true);
  rmSync(dir, { recursive: true, force: true });
});

test('web detection: tailwind config counts', () => {
  const dir = fixture({ 'tailwind.config.js': 'export default {}' });
  assert.equal(isWebProject(dir), true);
  rmSync(dir, { recursive: true, force: true });
});

test('web detection: a backend project is not a web project', () => {
  const dir = fixture({ 'package.json': JSON.stringify({ dependencies: { express: '^4.0.0' } }), 'app.py': 'x = 1' });
  assert.equal(isWebProject(dir), false);
  assert.equal(isGameProject(dir), false);
  rmSync(dir, { recursive: true, force: true });
});

test('web detection: malformed package.json is an absence of evidence, not a throw', () => {
  const dir = fixture({ 'package.json': '{ not json' });
  assert.equal(isWebProject(dir), false);
  rmSync(dir, { recursive: true, force: true });
});

test('web detection: no root given is false', () => {
  assert.equal(isWebProject(''), false);
  assert.equal(isWebProject(undefined), false);
});

// ── File classification ───────────────────────────────────────────────────

test('classify: stylesheets and markup are their own classes, not code', () => {
  assert.equal(classify('src/app.css'), 'style');
  assert.equal(classify('src/theme.scss'), 'style');
  assert.equal(classify('src/legacy.less'), 'style');
  assert.equal(classify('public/index.html'), 'markup');
  assert.equal(classify('src/App.tsx'), 'code');
  assert.equal(classify('README.md'), 'prose');
  assert.equal(classify('logo.png'), 'other');
});

test('classify: an unknown extension is still not scanned', () => {
  assert.equal(classify('a.bin'), 'other');
  assert.equal(classify('noextension'), 'other');
});

test('scope list is the single source: every content scope has an extension list', () => {
  for (const scope of Object.keys(EXTENSIONS_BY_SCOPE)) {
    assert.ok(SCOPES.includes(scope), `${scope} missing from SCOPES`);
    assert.ok(EXTENSIONS_BY_SCOPE[scope].length > 0, `${scope} has no extensions`);
  }
  assert.deepEqual(SCOPES.slice(-2), ['path', 'command'], 'the two file-less scopes stay last');
});
