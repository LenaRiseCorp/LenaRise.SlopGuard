import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, TAXONOMY, PATTERN_COUNT, titleOf } from '../lib/patterns.mjs';
import { scanContent, scanPath, scanCommand, actionable, stripCodeSpans, classify } from '../lib/scan.mjs';

const ids = (fs) => fs.map((f) => f.key);

test('taxonomy integrity: every pattern id is in the canonical list', () => {
  for (const p of PATTERNS) assert.ok(titleOf(p.id), `${p.key} → ${p.id}`);
  assert.equal(TAXONOMY.length, 71, '62 canonical + PROC-08 + 8 GAME');
});

test('pattern schema: every pattern has detects, fix and a valid severity', () => {
  for (const p of PATTERNS) {
    assert.ok(p.detects?.length > 0, `${p.key}: detects missing`);
    assert.ok(p.fix?.length > 0, `${p.key}: fix missing`);
    assert.ok(['block', 'warn'].includes(p.severity), `${p.key}: severity`);
    assert.ok(['code', 'prose', 'path', 'command'].includes(p.scope), `${p.key}: scope`);
  }
  assert.equal(PATTERN_COUNT, PATTERNS.length);
});

// ── Positive matches: every block pattern must catch a real payload ────────

const CODE_CASES = [
  ['code-05-empty-catch',    'a.js', 'try { risky() } catch (e) {}'],
  ['code-05-except-pass',    'a.py', 'try:\n    risky()\nexcept ValueError:\n    pass'],
  ['code-05-catch-noop',     'a.js', 'fetch(u).catch(() => {})'],
  ['code-04-guard-and-go',   'a.js', 'if (false) { legacyPath() }'],
  ['test-04-tautological-assert', 'a.py', 'def test_x():\n    assert True'],
  ['test-01-skipped-test',   'a.js', 'it.skip("broken", () => {})'],
  ['test-03-fake-impl',      'a.py', 'def parse():\n    raise NotImplementedError'],
  ['sec-03-aws-key',         'a.js', 'const k = "AKIAIOSFODNN7EXAMPLE"'],
  ['sec-03-private-key',     'a.js', '-----BEGIN RSA PRIVATE KEY-----'],
  ['sec-01-eval',            'a.js', 'const out = eval(userInput)'],
  ['sec-05-sql-fstring',     'a.py', 'q = f"SELECT * FROM users WHERE id={uid}"'],
];

for (const [key, file, body] of CODE_CASES) {
  test(`catches: ${key}`, () => {
    const found = actionable(scanContent({ filePath: file, content: body }));
    assert.ok(ids(found).includes(key), `expected ${key}, got: ${ids(found).join(',') || 'nothing'}`);
  });
}

test('catches: sec-03-inline-secret', () => {
  const body = 'const config = { api_key: "sk_live_abcdefghijklmnop0123" }';
  const found = actionable(scanContent({ filePath: 'a.js', content: body }));
  assert.ok(ids(found).includes('sec-03-inline-secret'), ids(found).join(','));
});

const COMMAND_CASES = [
  ['agent-05-rm-recursive-force',  'rm -rf /var/data'],
  ['agent-05-rm-recursive-force',  'rm -fr build'],
  ['agent-05-git-force-push',      'git push --force origin main'],
  ['agent-05-git-reset-hard',      'git reset --hard HEAD~3'],
  ['agent-05-chmod-777',           'chmod -R 777 /srv'],
  ['agent-05-sql-destructive',     'psql -c "DROP TABLE users"'],
  ['agent-05-delete-without-where', 'psql -c "DELETE FROM sessions;"'],
  ['logic-02-package-install',     'npm install left-pad'],
  ['logic-02-package-install',     'pip install requests'],
  ['doc-03-empty-commit-msg',      'git commit -m "fix stuff"'],
];

for (const [key, command] of COMMAND_CASES) {
  test(`command catches: ${key} — ${command}`, () => {
    const found = scanCommand({ command });
    assert.ok(ids(found).includes(key), `expected ${key}, got: ${ids(found).join(',') || 'nothing'}`);
  });
}

test('path catches: version-suffixed filename', () => {
  assert.ok(ids(scanPath({ filePath: 'src/parser_v2.ts' })).includes('code-01-versioned-filename'));
  assert.ok(ids(scanPath({ filePath: 'src/utils.old.js' })).includes('code-01-versioned-filename'));
});

// ── False positive control: clean content must produce nothing ────────────

const CLEAN_CODE = `
export function parseAmount(raw) {
  try {
    return Number.parseFloat(raw);
  } catch (error) {
    logger.warn('parseAmount failed', { raw, error });
    throw error;
  }
}

async function load(url) {
  const res = await fetch(url).catch((error) => {
    logger.error('request failed', error);
    throw error;
  });
  return res.json();
}

const query = 'SELECT id, name FROM users WHERE tenant = $1';
`;

test('no false positives: correctly written code passes clean', () => {
  const found = actionable(scanContent({ filePath: 'clean.js', content: CLEAN_CODE }));
  assert.deepEqual(ids(found), [], `unexpected findings: ${JSON.stringify(found.map((f) => [f.key, f.line]))}`);
});

const CLEAN_COMMANDS = [
  'rm build/artifact.tgz',
  'git push origin main',
  'git push --force-with-lease origin feature',
  'chmod 640 config.yml',
  'psql -c "DELETE FROM sessions WHERE expired_at < now()"',
  'npm run test',
  'git commit -m "parseAmount silently returned 0 on NaN input; it now throws"',
];

for (const command of CLEAN_COMMANDS) {
  test(`clean command passes: ${command}`, () => {
    assert.deepEqual(scanCommand({ command }).map((f) => f.key), []);
  });
}

test('an unknown extension is not scanned', () => {
  assert.equal(classify('data.bin'), 'other');
  assert.deepEqual(scanContent({ filePath: 'data.bin', content: 'try{}catch(e){}' }), []);
});

// ── Prose scope: mentioning versus using ─────────────────────────────────

test('prose: a buzzword in plain text is caught', () => {
  const found = actionable(scanContent({ filePath: 'README.md', content: 'This tool works seamlessly.' }));
  assert.ok(ids(found).includes('doc-01-buzzword'));
});

test('prose: a buzzword inside backticks is not caught — mentioning is not using', () => {
  const doc = 'The pattern catches the word `seamlessly`.\n\n```\nrobust and flexible\n```\n';
  const found = actionable(scanContent({ filePath: 'README.md', content: doc }));
  assert.deepEqual(ids(found), [], JSON.stringify(found.map((f) => [f.key, f.line])));
});

test('prose: an emoji heading is caught, an emoji in the body is not', () => {
  const found = actionable(scanContent({ filePath: 'd.md', content: '# 🚀 Getting started\n\nAn emoji 🚀 in the body is fine.\n' }));
  assert.equal(ids(found).filter((k) => k === 'doc-04-emoji-heading').length, 1);
});

test('prose: an unfounded time estimate is caught', () => {
  const found = actionable(scanContent({ filePath: 'p.md', content: 'This work takes about 3 days.\n' }));
  assert.ok(ids(found).includes('proc-08-effort-estimate'));
});

test('prose patterns do not run on source files', () => {
  const found = actionable(scanContent({ filePath: 'a.js', content: 'const s = "seamlessly";' }));
  assert.deepEqual(ids(found), []);
});

test('stripCodeSpans does not shift line numbers', () => {
  const src = 'one\n```\nstripped\n```\nseamlessly\n';
  const stripped = stripCodeSpans(src);
  assert.equal(stripped.split('\n').length, src.split('\n').length);
  const found = actionable(scanContent({ filePath: 'x.md', content: src }));
  assert.equal(found[0].line, 5);
});

// ── Disabling works at three levels ──────────────────────────────────────

test('disabled: a single pattern key', () => {
  const found = actionable(scanContent({ filePath: 'a.js', content: 'try{}catch(e){}', config: { disabled: ['code-05-empty-catch'] } }));
  assert.deepEqual(ids(found), []);
});

test('disabled: a taxonomy id', () => {
  const body = 'try { a() } catch (e) {}\nfetch(u).catch(() => {})';
  assert.deepEqual(ids(actionable(scanContent({ filePath: 'a.js', content: body, config: { disabled: ['CODE-05'] } }))), []);
});

test('disabled: a whole category', () => {
  const body = 'const k = "AKIAIOSFODNN7EXAMPLE"\nconst x = eval(y)';
  assert.deepEqual(ids(actionable(scanContent({ filePath: 'a.js', content: body, config: { disabled: ['SEC'] } }))), []);
});

test('line and column are reported correctly', () => {
  const body = 'line one\nline two\ntry { x() } catch (e) {}\n';
  const [f] = actionable(scanContent({ filePath: 'a.js', content: body }));
  assert.equal(f.line, 3);
  assert.equal(f.excerpt, 'try { x() } catch (e) {}');
});

test('proc-08 also catches the trailing-verb form', () => {
  const found = actionable(scanContent({ filePath: 'p.md', content: 'Estimated 3 days of work.\n' }));
  assert.ok(ids(found).includes('proc-08-effort-estimate'));
});

test('proc-08 does not mistake measured machine time for an estimate', () => {
  for (const line of ['The tests take 2 minutes.', 'We respond within 48 hours.', 'This file was written 3 days ago.']) {
    const found = actionable(scanContent({ filePath: 'p.md', content: line + '\n' }));
    assert.deepEqual(ids(found), [], line);
  }
});

test('a comment-only catch counts as an empty catch', () => {
  for (const body of ['try{a()}catch{ /* unimportant */ }', 'try{a()}catch (e) {\n  // ignored\n}']) {
    const found = actionable(scanContent({ filePath: 'a.js', content: body }));
    assert.ok(ids(found).includes('code-05-comment-only-catch'), body);
  }
});

test('a catch that genuinely handles the error is not caught', () => {
  const body = 'try{a()}catch (e) {\n  // a network error is expected here\n  logger.warn(e);\n}';
  assert.deepEqual(ids(actionable(scanContent({ filePath: 'a.js', content: body }))), []);
});

test('embedded secrets: compound names are caught too', () => {
  const cases = [
    'const secret_key = "abcdefghijklmnopqrst"',
    'access_token: "abcdefghijklmnopqrst"',
    'private-key = "abcdefghijklmnopqrst"',
    'refresh_token="abcdefghijklmnopqrst"',
    'password = "abcdefghijklmnopqrst"',
  ];
  for (const body of cases) {
    const found = actionable(scanContent({ filePath: 'a.js', content: body }));
    assert.ok(ids(found).includes('sec-03-inline-secret'), body);
  }
});

test('embedded secrets: long strings that are not secrets are left alone', () => {
  const cases = [
    'const description = "a fairly long description string here"',
    'const tokenizer = buildTokenizer(options)',
    'const clientName = "abcdefghijklmnopqrst"',
    'const secretsManager = new SecretsManager()',
  ];
  for (const body of cases) {
    assert.deepEqual(ids(actionable(scanContent({ filePath: 'a.js', content: body }))), [], body);
  }
});
