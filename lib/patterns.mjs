/**
 * Pattern registry — THE SINGLE SOURCE.
 *
 * Hooks, /slop-check, the semgrep template and the README all derive from this
 * file; none of them keeps its own copy (CODE-01). To change a pattern, this is
 * the only place to edit.
 *
 * The taxonomy holds the 62 canonical IDs from docs/ai-slop-guide.html plus the
 * IDs this project added. Not every ID has a mechanical counterpart — the HUMAN
 * category is measured entirely in the coach layer, and some IDs are carried by
 * rule text alone. Wiring an ID without a real signal to an invented regex would
 * look like detection while detecting nothing.
 *
 * Language policy: identifiers, titles and messages are English so that any
 * agent reads the same directives and the plugin works anywhere. Content
 * patterns (DOC-01, PROC-08) intentionally keep non-English alternatives — they
 * match prose, and prose is written in many languages.
 */

/** Category code → display name and the layer that enforces it. */
export const CATEGORIES = {
  CODE:  { name: 'Code quality',        layer: 'machine', enforcement: 'strong' },
  LOGIC: { name: 'Logic and accuracy',  layer: 'machine', enforcement: 'partial' },
  TEST:  { name: 'Testing',             layer: 'machine', enforcement: 'strongest' },
  SEC:   { name: 'Security',            layer: 'machine', enforcement: 'strong' },
  AGENT: { name: 'Agent operations',    layer: 'machine', enforcement: 'strong' },
  PROC:  { name: 'Process and team',    layer: 'machine', enforcement: 'moderate' },
  DOC:   { name: 'Non-code output',     layer: 'machine', enforcement: 'moderate' },
  HUMAN: { name: 'Human factors',       layer: 'coach',   enforcement: 'measure and warn' },
  GAME:  { name: 'Game development',    layer: 'machine', enforcement: 'domain-scoped' },
};

/** The taxonomy. Source: docs/ai-slop-guide.html, plus the IDs listed in NEW_IDS. */
export const TAXONOMY = [
  ['CODE-01', 'Copy-paste proliferation'],
  ['CODE-02', 'Over-abstraction and bloat'],
  ['CODE-03', 'Dead code accumulation'],
  ['CODE-04', 'Guard-and-go: wrapping instead of deleting'],
  ['CODE-05', 'Error suppression and silent failure'],
  ['CODE-06', 'Hardcoded constants and magic numbers'],
  ['CODE-07', 'Architectural drift and style inconsistency'],
  ['CODE-08', 'Reinventing an existing solution'],
  ['CODE-09', 'Silently deleting comments and context'],
  ['LOGIC-01', 'Hallucinated API, function or parameter'],
  ['LOGIC-02', 'Suggesting a package that does not exist'],
  ['LOGIC-03', 'Business rule drift'],
  ['LOGIC-04', 'Assumption propagation'],
  ['LOGIC-05', 'Cascading patches'],
  ['LOGIC-06', 'State management errors'],
  ['LOGIC-07', 'Schema and data errors'],
  ['LOGIC-08', 'Interface and spatial instruction mismatch'],
  ['LOGIC-09', 'Silent scope drift'],
  ['TEST-01', 'Deleting or weakening a test'],
  ['TEST-02', 'Reward hacking'],
  ['TEST-03', 'Fake implementation'],
  ['TEST-04', 'Tautological test'],
  ['TEST-05', 'Claiming done without running it'],
  ['TEST-06', 'Happy path only'],
  ['TEST-07', 'Mocks standing in for real integration'],
  ['SEC-01', 'Choosing the insecure default'],
  ['SEC-02', 'Slopsquatting: hijacking an imagined package'],
  ['SEC-03', 'Hardcoded secrets and fabricated credentials'],
  ['SEC-04', 'Missing authorization and role separation'],
  ['SEC-05', 'Missing input validation'],
  ['SEC-06', 'Prompt injection: mistaking data for instructions'],
  ['SEC-07', 'Iterative security erosion'],
  ['SEC-08', 'Unprotected infrastructure and data storage'],
  ['AGENT-01', 'Context rot'],
  ['AGENT-02', 'Too little or too much context'],
  ['AGENT-03', 'Sycophancy'],
  ['AGENT-04', 'No stopping condition'],
  ['AGENT-05', 'Excessive privilege'],
  ['AGENT-06', 'Working without checkpoints'],
  ['AGENT-07', 'Parallel agent collision'],
  ['AGENT-08', 'Unproductive loops'],
  ['AGENT-09', 'Silently violating an instruction'],
  ['PROC-01', 'Sending an unreviewed pull request'],
  ['PROC-02', 'Diffs too large to review'],
  ['PROC-03', 'Review bottleneck'],
  ['PROC-04', 'Quality gates buried under volume'],
  ['PROC-05', 'Slop bug and security reports'],
  ['PROC-06', 'Pushing the load downstream'],
  ['PROC-07', 'Fabricated progress reporting'],
  ['PROC-08', 'Unfounded effort and time estimates'],
  ['DOC-01', 'Bloated, buzzword-laden documentation'],
  ['DOC-02', 'Comments that do not match the code'],
  ['DOC-03', 'Empty commit messages and PR descriptions'],
  ['DOC-04', 'Emoji and heading inflation'],
  ['DOC-05', 'Fabricated issues and bug reports'],
  ['DOC-06', 'Generated changelogs and release notes'],
  ['DOC-07', 'Documentation drifting from code'],
  ['HUMAN-01', 'Comprehension debt'],
  ['HUMAN-02', 'Productivity illusion'],
  ['HUMAN-03', 'Skill erosion'],
  ['HUMAN-04', 'Overconfidence'],
  ['HUMAN-05', 'The permanent junior trap'],
  ['HUMAN-06', 'Loss of ownership'],
  ['GAME-01', 'Frame-rate dependent motion'],
  ['GAME-02', 'Scene lookup every frame'],
  ['GAME-03', 'Physics driven from the frame loop'],
  ['GAME-04', 'Allocation on the hot path'],
  ['GAME-05', 'Logging every frame'],
  ['GAME-06', 'Economy and progression held on the client'],
  ['GAME-07', 'Fragile scene tree path'],
  ['GAME-08', 'Hand-editing engine-generated files'],
].map(([id, title]) => ({ id, category: id.slice(0, id.lastIndexOf('-')), title }));

/**
 * IDs this project added; they are not in the source taxonomy.
 *
 * PROC-08: "it takes two hours" is unverifiable output produced because it is
 * pleasant to hear, and the cost of it being wrong falls on whoever planned
 * around it.
 *
 * GAME-*: a separate category rather than entries spread across the existing
 * ones. Game patterns key off engine API names, so they stay silent in other
 * projects anyway — but having a category makes them switchable in one line
 * (`disabled: ["GAME"]`) and discoverable. Their individual homes still exist:
 * GAME-06 is a SEC matter, GAME-01 and GAME-03 are LOGIC defects, GAME-02/04/05
 * are CODE problems. The category does not deny that; it names the domain,
 * because in a Unity project these failures all come from the same place.
 */
export const NEW_IDS = [
  'PROC-08',
  'GAME-01', 'GAME-02', 'GAME-03', 'GAME-04',
  'GAME-05', 'GAME-06', 'GAME-07', 'GAME-08',
];

/**
 * Category code carried by an ID.
 *
 * Codes are variable length (CODE, SEC, AGENT, HUMAN), so this splits on the
 * last separator rather than taking a fixed slice. The earlier three-character
 * assumption is exactly the kind of thing that breaks quietly when the codes
 * change, so it lives in one place now.
 */
export function categoryOf(id) {
  const cut = String(id).lastIndexOf('-');
  return cut === -1 ? String(id) : String(id).slice(0, cut);
}

const byId = new Map(TAXONOMY.map((t) => [t.id, t]));

/** Canonical title for an ID. An unknown ID does not pass silently — the caller throws. */
export function titleOf(id) {
  const t = byId.get(id);
  if (!t) throw new Error(`patterns: id not in taxonomy: ${id}`);
  return t.title;
}

/** `prose` patterns run only on these extensions. */
export const PROSE_EXTENSIONS = ['.md', '.mdx', '.markdown', '.txt', '.rst', '.adoc'];

/** `code` patterns run on these. An extension outside the list is not scanned — by choice, not by accident. */
export const CODE_EXTENSIONS = [
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.cs',
  '.php', '.c', '.h', '.cc', '.cpp', '.hpp', '.scala', '.sh', '.bash', '.zsh',
  '.sql', '.vue', '.svelte',
  '.gd',   // Godot
];

/** Paths counted as tests — the TEST lock uses these. */
export const TEST_PATH_PATTERNS = [
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /(^|\/)spec\//,
  /\.test\.[A-Za-z]+$/i,
  /\.spec\.[A-Za-z]+$/i,
  /(^|\/)test_[^/]+\.py$/,
  /[^/]+_test\.(?:py|go|rb)$/,
  /(^|\/)conftest\.py$/,
];

/** Paths writing is refused to by default — touched deliberately, never by accident. */
export const PROTECTED_PATH_PATTERNS = [
  { re: /(^|\/)\.env(?:\.|$)/,               why: 'environment secrets' },
  { re: /(^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|poetry\.lock|Cargo\.lock|Gemfile\.lock|uv\.lock)$/, why: 'dependency lockfile' },
  { re: /(^|\/)\.github\/workflows\//,        why: 'CI configuration' },
  { re: /(^|\/)\.git\//,                      why: 'git internals' },
  { re: /(^|\/)(?:\.npmrc|\.pypirc|\.netrc)$/, why: 'package registry credentials' },
  { re: /(^|\/)id_(?:rsa|ed25519|ecdsa)$/,    why: 'private key' },

  // Files game engines generate. Hand-editing them produces silent, expensive
  // breakage: change a GUID in a .meta file and Unity loses every reference to
  // that asset; .uasset and .umap are binary and are destroyed by a text write.
  // The engine writes these itself.
  { re: /\.meta$/,                            why: 'GAME-08 · Unity asset GUID — editing it breaks every scene reference' },
  { re: /(^|\/)(?:Library|Temp|Obj|Logs|UserSettings)\//i, why: 'GAME-08 · Unity generated directory' },
  { re: /(^|\/)ProjectSettings\/ProjectVersion\.txt$/, why: 'GAME-08 · Unity version stamp' },
  { re: /(^|\/)\.godot\//,                    why: 'GAME-08 · Godot generated directory' },
  { re: /\.(?:uasset|umap|unity|prefab|asset|tscn|tres|blend|fbx)$/i, why: 'GAME-08 · engine asset file — binary or generated format' },
  { re: /(^|\/)(?:Binaries|Intermediate|Saved|DerivedDataCache)\//, why: 'GAME-08 · Unreal generated directory' },
];

/**
 * Mechanical patterns.
 *
 * scope:
 *   code    — source file contents
 *   prose   — markdown and text contents; fenced blocks and inline code are
 *             stripped before matching, because naming a buzzword inside
 *             backticks is a mention, not a use
 *   path    — file path, checked before the write happens
 *   command — shell command, checked before it runs
 *
 * severity:
 *   block   — stops work in strict mode, warns in explore mode
 *   warn    — only ever warns
 */
export const PATTERNS = [
  {
    key: 'code-04-guard-and-go', id: 'CODE-04', scope: 'code', severity: 'warn',
    match: /\bif\s*\(\s*(?:false|0)\s*\)|\bif\s+False\s*:/g,
    detects: 'Code parked on a dead branch — wrapped instead of deleted.',
    fix: 'Delete it. If you need it back, it is in the git history.',
  },
  {
    key: 'code-05-empty-catch', id: 'CODE-05', scope: 'code', severity: 'block',
    match: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/g,
    detects: 'Empty catch body — the error is caught and swallowed.',
    fix: 'Log it, rethrow it, or handle it explicitly.',
  },
  {
    key: 'code-05-comment-only-catch', id: 'CODE-05', scope: 'code', severity: 'block',
    // A body made only of comments is still an empty body: the error is still
    // swallowed, now wearing the appearance of deliberation. A comment
    // explaining the omission does not handle the error.
    match: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\n]*\s*|\/\*(?:[^*]|\*(?!\/)){0,400}\*\/\s*)+\}/g,
    detects: 'Catch body containing only comments — the error is still swallowed.',
    fix: 'Log it or rethrow it. A justification comment is not error handling.',
  },
  {
    key: 'code-05-except-pass', id: 'CODE-05', scope: 'code', severity: 'block',
    match: /^[ \t]*except\b[^\n:]*:[ \t]*(?:\n[ \t]+)?pass[ \t]*$/gm,
    detects: 'except: pass — the exception is silently swallowed.',
    fix: 'Log it or rethrow it.',
  },
  {
    key: 'code-05-catch-noop', id: 'CODE-05', scope: 'code', severity: 'block',
    match: /\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{\s*\}\s*\)/g,
    detects: 'Empty .catch() — the rejected promise is silently swallowed.',
    fix: 'Log it or propagate it.',
  },
  {
    key: 'code-01-versioned-filename', id: 'CODE-01', scope: 'path', severity: 'block',
    match: /(^|\/)[^/]*[._-](?:v\d+|new|old|copy|backup|final)\.[A-Za-z0-9]+$/i,
    detects: 'Version-suffixed filename — a new copy placed beside the old one.',
    fix: 'Edit the existing file. Versioning is git’s job.',
  },
  {
    key: 'test-04-tautological-assert', id: 'TEST-04', scope: 'code', severity: 'block',
    match: /\bassert\s+True\b|\bassert\s*\(\s*(?:true|True|1)\s*\)|expect\(\s*true\s*\)\s*\.\s*toBe\(\s*true\s*\)|assert\.ok\(\s*true\s*\)/g,
    detects: 'An assertion that passes under every condition — it verifies nothing.',
    fix: 'Assert the real behaviour, or delete the test.',
  },
  {
    key: 'test-01-skipped-test', id: 'TEST-01', scope: 'code', severity: 'block',
    match: /\b(?:it|test|describe|context)\s*\.\s*skip\s*\(|\bx(?:it|describe)\s*\(|@pytest\.mark\.skip|\bt\.Skip\(/g,
    detects: 'A skipped test — the shortest route from red to green.',
    fix: 'Fix the test, or write down why it is skipped.',
  },
  {
    key: 'test-03-fake-impl', id: 'TEST-03', scope: 'code', severity: 'warn',
    match: /\braise\s+NotImplementedError\b|throw\s+new\s+\w*Error\(\s*['"`]Not implemented/gi,
    detects: 'Fake implementation — a signature with no body.',
    fix: 'Write the body, or do not add the function yet.',
  },
  {
    key: 'sec-03-inline-secret', id: 'SEC-03', scope: 'code', severity: 'block',
    // Names arrive in two shapes: single word (password) and compound
    // (secret_key, access-token). The first version missed the second.
    match: /\b(?:(?:api|access|secret|auth|private|encryption|refresh)[_-]?(?:key|token|secret)|api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][A-Za-z0-9_\-./+]{16,}['"]/gi,
    detects: 'Secret committed to source.',
    fix: 'Move it to an environment variable; rotate it if it leaked.',
  },
  {
    key: 'sec-03-aws-key', id: 'SEC-03', scope: 'code', severity: 'block',
    match: /\bAKIA[0-9A-Z]{16}\b/g,
    detects: 'AWS access key ID.',
    fix: 'Revoke the key now and move it to an environment variable.',
  },
  {
    key: 'sec-03-private-key', id: 'SEC-03', scope: 'code', severity: 'block',
    match: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g,
    detects: 'Private key embedded in a file.',
    fix: 'Remove it from the file, move it to a secret store, rotate it.',
  },
  {
    key: 'sec-05-sql-concat', id: 'SEC-05', scope: 'code', severity: 'block',
    match: /\b(?:SELECT\b[^\n;'"]{0,120}?\bFROM|UPDATE\b[^\n;'"]{0,120}?\bSET|INSERT\s+INTO|DELETE\s+FROM)\b[^\n;'"]{0,120}['"]\s*(?:\+|\.|%)\s*[A-Za-z_$]/gi,
    detects: 'SQL built by string concatenation — an injection surface.',
    fix: 'Use a parameterised query.',
  },
  {
    key: 'sec-05-sql-fstring', id: 'SEC-05', scope: 'code', severity: 'block',
    match: /f['"][^'"\n]*\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b[^'"\n]*\{/gi,
    detects: 'SQL built with an f-string — an injection surface.',
    fix: 'Use a parameterised query.',
  },
  {
    key: 'sec-01-eval', id: 'SEC-01', scope: 'code', severity: 'block',
    match: /(?<![.\w])eval\s*\(|(?<![.\w])exec\s*\(\s*[A-Za-z_$][\w$]*\s*[,)]/g,
    detects: 'Dynamic code execution.',
    fix: 'Parse the data, do not execute it. Use JSON.parse for JSON.',
  },
  {
    key: 'agent-05-rm-recursive-force', id: 'AGENT-05', scope: 'command', severity: 'block',
    match: /\brm\b(?=[^\n;|&]*(?:-[A-Za-z]*r[A-Za-z]*f|-[A-Za-z]*f[A-Za-z]*r|--recursive[^\n;|&]*--force|--force[^\n;|&]*--recursive))/g,
    detects: 'Recursive forced delete — there is no undo.',
    fix: 'Name each path explicitly, or move it to the trash.',
  },
  {
    key: 'agent-05-git-force-push', id: 'AGENT-05', scope: 'command', severity: 'block',
    match: /\bgit\s+push\b[^\n;|&]*(?:--force(?!-with-lease)|(?:^|\s)-f(?=\s|$))/g,
    detects: 'Force push — it erases someone else’s work.',
    fix: 'Use --force-with-lease, or merge instead of rebasing.',
  },
  {
    key: 'agent-05-git-reset-hard', id: 'AGENT-05', scope: 'command', severity: 'block',
    match: /\bgit\s+reset\s+--hard\b/g,
    detects: 'Uncommitted work is being hard-reset away.',
    fix: 'Stash it first.',
  },
  {
    key: 'agent-05-chmod-777', id: 'AGENT-05', scope: 'command', severity: 'block',
    match: /\bchmod\s+(?:-R\s+)?0?777\b/g,
    detects: 'World-writable permissions.',
    fix: 'Grant the narrowest permission that works (for example 640 or 750).',
  },
  {
    key: 'agent-05-sql-destructive', id: 'AGENT-05', scope: 'command', severity: 'block',
    match: /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/gi,
    detects: 'Destructive schema command.',
    fix: 'Write it as a migration so it can be reviewed.',
  },
  {
    key: 'agent-05-delete-without-where', id: 'AGENT-05', scope: 'command', severity: 'block',
    match: /\bDELETE\s+FROM\s+[\w."`]+\s*(?:;|$)/gi,
    detects: 'DELETE without WHERE — it empties the table.',
    fix: 'Add a WHERE clause.',
  },
  {
    key: 'doc-04-emoji-heading', id: 'DOC-04', scope: 'prose', severity: 'warn',
    match: /^#{1,6}\s+\p{Extended_Pictographic}/gmu,
    detects: 'Heading that opens with an emoji.',
    fix: 'Write the heading in words.',
  },
  {
    key: 'doc-01-buzzword', id: 'DOC-01', scope: 'prose', severity: 'warn',
    // Prose is written in many languages; the alternatives are deliberate.
    match: /\b(?:robust and flexible|seamlessly|cutting[- ]edge|state[- ]of[- ]the[- ]art|leverage the power|güçlü ve esnek|sorunsuzca entegre)\b/gi,
    detects: 'Marketing language carrying no information.',
    fix: 'Say concretely what it does.',
  },
  {
    key: 'proc-08-effort-estimate', id: 'PROC-08', scope: 'prose', severity: 'block',
    // Bidirectional: the marker can lead ("estimated 3 days") or the verb can
    // trail, as it does in Turkish ("3 gün sürer"). Minutes and seconds are
    // absent from the unit list on purpose — effort is estimated in hours, days
    // and weeks, while minutes usually describe measured machine time.
    match: /\b(?:tahmin\w*|yaklaşık|ETA|estimated?|estimates?|roughly|about)\b[^\n]{0,40}\b\d+[-–]?\d*\s*(?:saat|gün|hafta|ay\b|hours?|days?|weeks?|months?)|\b\d+[-–]?\d*\s*(?:saat|gün|hafta|hours?|days?|weeks?)\b[^\n]{0,25}\b(?:sürer|sürecek|sürüyor|alır|alacak|alıyor|takes|will take)\b/gi,
    detects: 'A time estimate that cannot be measured.',
    fix: 'Express scope as files, steps and unknowns instead.',
  },

  // ── GAME ─────────────────────────────────────────────────────────────────
  //
  // These key off engine API names, so they stay silent in non-game projects on
  // their own. Their severity is `warn` by design: hot-path detection is a
  // heuristic, and opening a new domain with blocks would introduce the tool
  // through a false positive. GAME-06 is the exception, because it is a
  // security matter.
  //
  // The `UPDATE` body shape is bounded and tempered: it looks no further than
  // the next method declaration and never past 500 characters. Measured — 0.1 ms
  // on a 400-line non-matching body.
  {
    key: 'game-01-framerate-dependent-motion', id: 'GAME-01', scope: 'code', severity: 'warn',
    match: /\btransform\.Translate\s*\((?![^)]*\bTime\.)[^)]*\)|\btransform\.position\s*\+=\s*(?![^;\n]*\bTime\.)[^;\n]*[*][^;\n]*;/g,
    detects: 'Motion is frame-rate dependent — not scaled by Time.deltaTime.',
    fix: 'Multiply by Time.deltaTime; otherwise the game runs at different speeds at 30 and 144 fps.',
  },
  {
    key: 'game-02-scene-lookup-per-frame', id: 'GAME-02', scope: 'code', severity: 'warn',
    match: /(?:^|\s)(?:private\s+|public\s+|protected\s+)?void\s+(?:Update|LateUpdate)\s*\(\s*\)\s*\{(?:(?!\b(?:void|IEnumerator)\s+\w+\s*\()[\s\S]){0,500}?\b(?:GameObject\.Find\w*\s*\(|Object\.FindObjectOfType|FindObjectOfType\s*<|FindFirstObjectByType\s*<|Camera\.main\b|GetComponent\s*<)/g,
    detects: 'Scene lookup or component resolution inside the frame loop.',
    fix: 'Resolve the reference once in Awake and store it, or wire it with [SerializeField].',
  },
  {
    key: 'game-03-physics-in-update', id: 'GAME-03', scope: 'code', severity: 'warn',
    match: /(?:^|\s)(?:private\s+|public\s+|protected\s+)?void\s+(?:Update|LateUpdate)\s*\(\s*\)\s*\{(?:(?!\b(?:void|IEnumerator)\s+\w+\s*\()[\s\S]){0,500}?(?:\b(?:AddForce|AddRelativeForce|AddTorque|MovePosition|MoveRotation)\s*\(|\.velocity\s*=[^=])/g,
    detects: 'Physics call inside Update — not synchronised with the physics step.',
    fix: 'Move Rigidbody work into FixedUpdate.',
  },
  {
    key: 'game-04-hot-path-allocation', id: 'GAME-04', scope: 'code', severity: 'warn',
    match: /(?:^|\s)(?:private\s+|public\s+|protected\s+)?void\s+(?:Update|LateUpdate)\s*\(\s*\)\s*\{(?:(?!\b(?:void|IEnumerator)\s+\w+\s*\()[\s\S]){0,500}?\.(?:Where|Select|OrderBy|OrderByDescending|ToList|ToArray|FirstOrDefault)\s*\(/g,
    detects: 'LINQ inside the frame loop — garbage every frame, visible as hitching.',
    fix: 'Precompute the result or write the loop by hand; do not allocate on the hot path.',
  },
  {
    key: 'game-05-logging-per-frame', id: 'GAME-05', scope: 'code', severity: 'warn',
    match: /(?:^|\s)(?:private\s+|public\s+|protected\s+)?void\s+(?:Update|LateUpdate)\s*\(\s*\)\s*\{(?:(?!\b(?:void|IEnumerator)\s+\w+\s*\()[\s\S]){0,500}?\bDebug\.Log\w*\s*\(/g,
    detects: 'Logging every frame — measurably lowers frame time in the editor.',
    fix: 'Remove it, or gate it behind a condition or #if UNITY_EDITOR.',
  },
  {
    key: 'game-06-client-side-economy', id: 'GAME-06', scope: 'code', severity: 'block',
    match: /\bPlayerPrefs\.Set(?:Int|Float|String)\s*\(\s*["'][^"']*(?:coin|gem|gold|money|currency|credit|score|level|xp|premium|purchase|unlock)/gi,
    detects: 'Economy or progression value stored on the client (SEC-04).',
    fix: 'PlayerPrefs is plain text and the player can edit it. Keep the value server-side or sign it.',
  },
  {
    key: 'game-07-fragile-node-path', id: 'GAME-07', scope: 'code', severity: 'warn',
    match: /\b(?:get_node|GetNode(?:<[^>]*>)?)\s*\(\s*["'][^"']*\.\.\//g,
    detects: 'Relative scene tree path — it breaks silently when a node moves.',
    fix: 'Use an exported NodePath with @onready, or connect a signal.',
  },

  {
    key: 'logic-02-package-install', id: 'LOGIC-02', scope: 'command', severity: 'block',
    gate: 'package-verification',
    match: /\b(?:npm\s+(?:i|install|add)|yarn\s+add|pnpm\s+(?:add|install)|bun\s+add|pip3?\s+install|uv\s+add|cargo\s+add|go\s+get)\s+(?![-.])/g,
    detects: 'Package install — installing an unverified name is a slopsquatting surface (SEC-02).',
    fix: 'Confirm the package exists and the name is spelled correctly; add names you trust to config.json trustedPackages.',
  },
  {
    key: 'doc-03-empty-commit-msg', id: 'DOC-03', scope: 'command', severity: 'warn',
    match: /\bgit\s+commit\b[^\n]*?-m\s*(['"])(?:update|fix|improve|changes?|wip|stuff|misc)(?:\s+(?:code|issues|stuff|things|bug))?\.?\1/gi,
    detects: 'Empty commit message — it does not say what changed or why.',
    fix: 'Say what changed and why; put the reasoning in the body.',
  },
];

/** Patterns for a given scope. */
export function patternsFor(scope) {
  return PATTERNS.filter((p) => p.scope === scope);
}

export const PATTERN_COUNT = PATTERNS.length;
