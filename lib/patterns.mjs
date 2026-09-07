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
  UI:    { name: 'Interface output',    layer: 'machine', enforcement: 'domain-scoped' },
  A11Y:  { name: 'Accessibility',       layer: 'machine', enforcement: 'domain-scoped' },
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
  ['CODE-10', 'AI comment noise'],
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
  ['DOC-08', 'Machine-voice prose'],
  ['DOC-09', 'Fabricated evidence in delivered output'],
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
  ['UI-01', 'Default gradient and palette family'],
  ['UI-02', 'Effect stacking'],
  ['UI-03', 'Decoration without purpose'],
  ['UI-04', 'Generic icon vocabulary'],
  ['UI-05', 'Dead control'],
  ['UI-06', 'Template typography'],
  ['UI-07', 'Illustration with no connection to the product'],
  ['A11Y-01', 'Removed focus indicator'],
  ['A11Y-03', 'Hover-only interaction'],
  ['A11Y-04', 'Zoom disabled'],
  ['A11Y-05', 'Overflow hidden as a leak fix'],
  ['A11Y-06', 'Viewport-locked section'],
].map(([id, title]) => ({ id, category: id.slice(0, id.lastIndexOf('-')), title }));

/**
 * IDs this project added; they are not in the source taxonomy.
 *
 * PROC-08: "it takes two hours" is unverifiable output produced because it is
 * pleasant to hear, and the cost of it being wrong falls on whoever planned
 * around it.
 *
 * CODE-10: the taxonomy already had CODE-09 (deleting comments) and DOC-02
 * (comments that do not match the code). Neither covers a comment that is
 * accurate, present, and still worthless — the decorative banner, the numbered
 * step, the label that names a category instead of a fact. It is a separate
 * failure: not a lost comment and not a wrong one, but noise written as one.
 *
 * It stays `warn`, and every fix line says do not write it — never go and
 * delete it. Our own rule set forbids stripping comments you did not write.
 *
 * DOC-08 and DOC-09: DOC-01 catches marketing language, one word at a time.
 * It does not catch the shape of machine prose — the closing offer of further
 * help, the announcement of what the next paragraph will do, the attribution to
 * unnamed experts. DOC-09 is the honesty half: a number, a name or a face
 * presented as real when nothing stands behind it.
 *
 * A bold-overuse pattern was designed and then dropped. Measured against this
 * repository, three bold spans on one line is a table row and a file list, both
 * legitimate. There was no signal to key on, and an ID wired to a regex that
 * cannot separate the two would be exactly the failure this file warns about.
 *
 * UI-* and A11Y-*: domain categories on the GAME model. The patterns key off web
 * tokens — a Tailwind class pair, a stylesheet property, a viewport meta tag —
 * so they stay silent in a Go service without being asked to. Rule text is what
 * detection gates; the scan is not.
 *
 * A11Y-02 was going to be the under-sized tap target and has no number here.
 * A target is too small in relation to a finger, and nothing in the source says
 * which element a person will touch: h-10 is 40px and is correct in a toolbar,
 * wrong as a primary button. There was no signal, so there is no pattern, and
 * the rule lives in rules/ui-rules.md instead.
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
  'CODE-10',
  'DOC-08', 'DOC-09',
  'UI-01', 'UI-02', 'UI-03', 'UI-04', 'UI-05', 'UI-06', 'UI-07',
  'A11Y-01', 'A11Y-03', 'A11Y-04', 'A11Y-05', 'A11Y-06',
  'GAME-01', 'GAME-02', 'GAME-03', 'GAME-04',
  'GAME-05', 'GAME-06', 'GAME-07', 'GAME-08',
];

/** True when a path is part of the interface — the delivery gate counts these. */
export function isInterfaceFile(filePath) {
  const lower = String(filePath || '').toLowerCase();
  return INTERFACE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

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
  '.tf', '.tfvars',   // Terraform — where SEC-08 lives
];

/**
 * `style` patterns run on these. A stylesheet is not code: the code patterns
 * would find nothing in it, and putting these in CODE_EXTENSIONS would make the
 * classifier claim a file is something it is not.
 */
export const STYLE_EXTENSIONS = ['.css', '.scss', '.sass', '.less'];

/** `markup` patterns run on these. JSX already lives in CODE_EXTENSIONS. */
export const MARKUP_EXTENSIONS = ['.html', '.htm'];

/**
 * Extensions each content scope reads. config.mjs validates a local pattern's
 * scope against this and gen-docs derives the semgrep path filter from it; a
 * second hand-written list of scopes would be CODE-01.
 */
export const EXTENSIONS_BY_SCOPE = {
  prose: PROSE_EXTENSIONS,
  code: CODE_EXTENSIONS,
  style: STYLE_EXTENSIONS,
  markup: MARKUP_EXTENSIONS,
};

/**
 * Files that make up an interface. The delivery gate counts writes to these;
 * it is deliberately wider than STYLE + MARKUP, because a React component is
 * where most of the interface actually lives.
 */
export const INTERFACE_EXTENSIONS = [
  ...STYLE_EXTENSIONS, ...MARKUP_EXTENSIONS,
  '.jsx', '.tsx', '.vue', '.svelte',
];

/** Every valid scope: the content scopes above, plus the two that read no file. */
export const SCOPES = [...Object.keys(EXTENSIONS_BY_SCOPE), 'path', 'command'];

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
/**
 * A utility class only means something inside a class attribute.
 *
 * Written once because getting it wrong is not a style problem: `h-screen` as a
 * bare token matched a Python string, and it matched this registry's own source
 * where the class name is quoted as data. A pattern that cannot tell a class
 * from a word fires in projects that have no interface at all, which is the
 * opposite of what a domain-scoped category is for.
 */
const IN_CLASS_ATTR = String.raw`class(?:Name)?\s*=\s*["'\u0060][^"'\u0060]{0,300}?`;

/**
 * One concept that appears in several file classes. A fabricated metric is the
 * same claim in a README, in JSX and in HTML, so the regex is written once and
 * the entries are generated from it (CODE-01). The key carries the scope so a
 * single file class can still be switched off on its own.
 */
function acrossScopes(scopes, base) {
  // sourceKey is the key that exists as a literal in this file. The mutation
  // check edits the source text, so a generated entry has to say where its
  // regex is actually written or it cannot be mutated — and an unmutatable
  // pattern is an unwatched one.
  return scopes.map((scope) => ({ ...base, scope, key: `${base.key}-${scope}`, sourceKey: base.key }));
}

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
    key: 'code-05-comment-only-catch', id: 'CODE-05', scope: 'code', severity: 'warn',
    // A body made only of comments is still an empty body: the error is still
    // swallowed, now wearing the appearance of deliberation. A comment
    // explaining the omission does not handle the error.
    //
    // Warned, not blocked, and the reason is a measurement rather than a change
    // of mind. Across 23 repositories this fired 489 times — by far the largest
    // block-severity source, and its siblings are the ones that matter more:
    // an empty body says nothing at all, a comment-only body at least records
    // that someone thought about it. Refusing 489 commits would have got the
    // whole tool switched off, and a rule nobody runs protects nobody.
    //
    // Its siblings stay at block. This is the one shape where the author left
    // evidence of a decision, so it is surfaced and left to them.
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
    key: 'ui-01-default-gradient-classes', id: 'UI-01', scope: 'code', severity: 'warn',
    // The pair, not the colour. A blue or a purple is a choice; blue running
    // into purple is the palette that arrives when none was chosen.
    match: new RegExp(IN_CLASS_ATTR + String.raw`from-(?:blue|indigo|violet|purple|fuchsia)-\d{2,3}\b[^"'\u0060\n]{0,80}\bto-(?:purple|violet|fuchsia|pink|indigo)-\d{2,3}\b`, 'g'),
    detects: 'The default blue-to-purple gradient pair.',
    fix: 'Name the hierarchy or brand reason for the gradient, or use a flat colour.',
    notFlagged: ['from-blue-500 to-blue-700', 'from-slate-100 to-slate-200'],
  },
  {
    key: 'ui-01-default-gradient-css', id: 'UI-01', scope: 'style', severity: 'warn',
    match: /linear-gradient\([^)]*#(?:6366f1|8b5cf6|a855f7|7c3aed|818cf8|c084fc|4f46e5)\b[^)]*\)/gi,
    detects: 'Gradient built from the default indigo and violet hexes.',
    fix: 'Name the reason for the gradient, or take the colours from the palette in use.',
    notFlagged: ['background: linear-gradient(180deg, #ffffff, #f3f4f6);'],
  },
  {
    key: 'ui-02-glass-stacking', id: 'UI-02', scope: 'code', severity: 'warn',
    match: new RegExp(String.raw`(?:${IN_CLASS_ATTR}backdrop-blur\b[\s\S]{0,700}?){2}${IN_CLASS_ATTR}backdrop-blur\b`, 'g'),
    detects: 'Glassmorphism on three or more elements close together.',
    fix: 'Keep it on the one surface that has to float. Everywhere is not a hierarchy.',
    notFlagged: ['<nav className="backdrop-blur">'],
  },
  {
    key: 'ui-02-glow-stacking', id: 'UI-02', scope: 'style', severity: 'warn',
    match: /box-shadow\s*:\s*0\s+0\s+[\d.]+[a-z%]*[^;]*;[\s\S]{0,500}?box-shadow\s*:\s*0\s+0\s+[\d.]+[a-z%]*[^;]*;[\s\S]{0,500}?box-shadow\s*:\s*0\s+0\s+/g,
    detects: 'Glow applied to three or more elements close together.',
    fix: 'Glow marks one thing. Applied everywhere it marks nothing.',
    notFlagged: ['.btn { box-shadow: 0 0 0 3px rgba(0,0,0,.2); }'],
  },
  ...acrossScopes(['code', 'markup'], {
    key: 'ui-03-button-arrow', id: 'UI-03', severity: 'warn',
    match: />[^<>]{0,40}[→↗][^<>]{0,10}<\/(?:button|a)>/g,
    detects: 'Arrow used as button decoration.',
    fix: 'Keep the arrow where it means "leaves this page". Elsewhere the label carries it.',
    notFlagged: ['<a href="/docs">Read the docs</a>'],
  }),
  {
    key: 'ui-03-background-grid', id: 'UI-03', scope: 'code', severity: 'warn',
    match: new RegExp(IN_CLASS_ATTR + String.raw`bg-(?:grid|dot)(?:-[\w[\]/.]+)?\b`, 'g'),
    detects: 'Grid or dot background applied with no stated visual purpose.',
    fix: 'Write the identity reason for the pattern, or drop it.',
    notFlagged: ['className="bg-gray-50"'],
  },
  {
    key: 'ui-04-generic-icon-import', id: 'UI-04', scope: 'code', severity: 'warn',
    match: /import\s*\{[^}]*\b(?:Sparkles|Zap|Rocket|Wand2|Bot|Gem|Flame)\b[^}]*\}\s*from\s*['"](?:lucide-react|@heroicons\/[^'"]*|react-icons[^'"]*)['"]/g,
    detects: 'Icons picked from the default set rather than for their meaning.',
    fix: 'Write what the icon means here, or use one that names the action.',
    notFlagged: ["import { Search, Trash2 } from 'lucide-react'"],
  },
  ...acrossScopes(['code', 'markup'], {
    key: 'ui-05-empty-anchor', id: 'UI-05', severity: 'warn',
    match: /href\s*=\s*(?:["']#["']|\{?["']#["']\}?)/g,
    detects: 'Link that goes nowhere.',
    fix: 'Point it at the destination, or make it a button, or label it as not wired yet.',
    notFlagged: ['href="#pricing"', 'href={`#${id}`}'],
  }),
  {
    key: 'ui-05-inert-button', id: 'UI-05', scope: 'code', severity: 'warn',
    // The lookahead for [\s/>] is what keeps this from matching its own
    // definition: markup continues `<button` with a space, a slash or a bracket,
    // never with an open parenthesis.
    match: /<button(?=[\s/>])(?![^>]*(?:\bonClick\b|\bonPress\b|\bonSubmit\b|\bdisabled\b|\bform\b|type\s*=\s*["']submit["']))[^>]*>/g,
    detects: 'Button with no action attached.',
    fix: 'Wire it, or leave it out until there is something for it to do.',
    notFlagged: ['<button onClick={save}>Save</button>', '<button type="submit">Send</button>'],
  },
  {
    key: 'ui-06-mono-heading', id: 'UI-06', scope: 'code', severity: 'warn',
    match: /<h[1-3][^>]*className\s*=\s*["'][^"']*\bfont-mono\b/g,
    detects: 'Monospace applied to a heading as a style gesture.',
    fix: 'Write the brand-character reason, or use the text face.',
    notFlagged: ['<h2 className="text-2xl font-semibold">'],
  },
  {
    key: 'ui-06-uppercase-tracking', id: 'UI-06', scope: 'code', severity: 'warn',
    match: new RegExp(IN_CLASS_ATTR + String.raw`(?:uppercase\b[^"'\u0060\n]{0,50}\btracking-(?:wider|widest)|tracking-(?:wider|widest)\b[^"'\u0060\n]{0,50}\buppercase)\b`, 'g'),
    detects: 'The uppercase label with wide tracking, used as a default.',
    fix: 'Write what the treatment marks, or set the label in sentence case.',
    notFlagged: ['className="uppercase text-xs"'],
  },
  {
    key: 'a11y-01-outline-none-css', id: 'A11Y-01', scope: 'style', severity: 'warn',
    // The lookahead is the pattern: removing the outline is fine when something
    // replaces it. Nothing replacing it is what takes the interface away.
    match: /outline\s*:\s*(?:none|0)\b(?![\s\S]{0,400}?focus)/g,
    detects: 'Focus outline removed with no visible replacement.',
    fix: 'Give :focus-visible a visible style, or leave the outline alone.',
    notFlagged: ['a { outline: none; }\n a:focus-visible { outline: 2px solid #000; }'],
  },
  {
    key: 'a11y-01-outline-none-class', id: 'A11Y-01', scope: 'code', severity: 'warn',
    match: new RegExp(IN_CLASS_ATTR + String.raw`outline-none\b(?![^"'\u0060\n]{0,120}\bfocus)`, 'g'),
    detects: 'outline-none with no focus style beside it.',
    fix: 'Add a focus-visible ring in the same class list, or drop outline-none.',
    notFlagged: ['className="outline-none focus-visible:ring-2"'],
  },
  {
    key: 'a11y-03-hover-only-reveal', id: 'A11Y-03', scope: 'style', severity: 'warn',
    match: /:hover[^{]*\{[^}]*(?:visibility\s*:\s*visible|display\s*:\s*(?:block|flex|grid))[^}]*\}(?![\s\S]*:focus)/g,
    detects: 'Content revealed on hover with no focus equivalent anywhere in the file.',
    fix: 'Reveal it on :focus-within too, or make it reachable without a pointer.',
    notFlagged: ['.menu:hover .sub { display: block; }\n.menu:focus-within .sub { display: block; }'],
  },
  {
    key: 'a11y-04-zoom-disabled', id: 'A11Y-04', scope: 'markup', severity: 'warn',
    match: /<meta[^>]+name\s*=\s*["']viewport["'][^>]*content\s*=\s*["'][^"']*(?:user-scalable\s*=\s*no|maximum-scale\s*=\s*1)/gi,
    detects: 'Pinch zoom disabled in the viewport meta tag.',
    fix: 'Remove user-scalable=no and maximum-scale. Zoom is how people read.',
    notFlagged: ['<meta name="viewport" content="width=device-width, initial-scale=1">'],
  },
  {
    key: 'a11y-05-root-overflow-hidden', id: 'A11Y-05', scope: 'style', severity: 'warn',
    match: /(?:^|[\s,}])(?:html|body)\s*(?:,\s*(?:html|body)\s*)*\{[^}]*overflow-x\s*:\s*hidden/gm,
    detects: 'Horizontal overflow hidden on the root — the leak is covered, not fixed.',
    fix: 'Find the element that is too wide. Hiding it keeps the bug and loses the scroll.',
    notFlagged: ['.carousel { overflow-x: hidden; }'],
  },
  {
    key: 'a11y-06-viewport-locked-css', id: 'A11Y-06', scope: 'style', severity: 'warn',
    // min-height is the correct form and is left alone; a fixed height is what
    // clips content on a short window and behind a mobile browser bar.
    match: /(?<!min-)height\s*:\s*100vh\b/g,
    detects: 'Section locked to the viewport height.',
    fix: 'Use min-height: 100svh so content taller than the window can still be reached.',
    notFlagged: ['.hero { min-height: 100vh; }'],
  },
  {
    key: 'a11y-06-viewport-locked-class', id: 'A11Y-06', scope: 'code', severity: 'warn',
    match: new RegExp(IN_CLASS_ATTR + String.raw`(?<![\w-])h-screen\b`, 'g'),
    detects: 'h-screen locks the element to the viewport height.',
    fix: 'Use min-h-screen, or min-h-svh where a mobile browser bar is in play.',
    notFlagged: ['className="min-h-screen"'],
  },
  {
    key: 'doc-08-chatbot-closer', id: 'DOC-08', scope: 'prose', severity: 'warn',
    match: /\b(?:let me know if (?:you|there|this)|i hope (?:this|that) helps|feel free to (?:reach out|ask|let me know)|happy to help|if you have any (?:other |further )?questions)\b/gi,
    detects: 'A chat turn closing a document that has no reader to answer it.',
    fix: 'Delete the closer. A document ends when the last fact ends.',
    notFlagged: ['The hook lets the caller know if the write was refused.'],
  },
  {
    key: 'doc-08-signposting', id: 'DOC-08', scope: 'prose', severity: 'warn',
    match: /\b(?:in this (?:section|article|post|guide|chapter),?\s*(?:we|i)(?:'ll| will)|let'?s dive (?:in|into)|now that we(?:'ve| have) covered|without further ado)\b/gi,
    detects: 'A sentence announcing what the next sentences will do.',
    fix: 'Delete it and start with the content. The heading already said where the reader is.',
    notFlagged: ['In this section the scanner walks the tree twice.'],
  },
  {
    key: 'doc-08-weasel-attribution', id: 'DOC-08', scope: 'prose', severity: 'warn',
    match: /\b(?:experts?\s+(?:say|agree|believe|recommend)|studies\s+(?:show|suggest|have shown)|research\s+(?:shows|suggests|indicates)|it is (?:widely|generally)\s+(?:believed|accepted|known|agreed)|many\s+(?:people|developers|teams|experts)\s+believe)\b/gi,
    detects: 'A claim attributed to an authority that is never named.',
    fix: 'Name the source and link it, or drop the claim.',
    notFlagged: ['The Node documentation says the stream is destroyed on error.'],
  },
  {
    key: 'doc-08-stacked-hedging', id: 'DOC-08', scope: 'prose', severity: 'warn',
    match: /\b(?:may|might|could|can)\s+(?:potentially|possibly|perhaps|conceivably)\b|\bpotentially\s+(?:may|might|could)\b/gi,
    detects: 'Two hedges on one verb — the sentence commits to nothing.',
    fix: 'Keep one hedge, or state the condition under which it is true.',
    notFlagged: ['This may fail when the registry is unreachable.'],
  },
  {
    key: 'doc-08-filler-opener', id: 'DOC-08', scope: 'prose', severity: 'warn',
    match: /\b(?:it'?s important to note that|it is important to note that|it'?s worth noting that|it is worth noting that|in today'?s (?:fast[- ]paced|digital|modern|competitive) world|at the end of the day,)/gi,
    detects: 'An opener that delays the sentence without adding to it.',
    fix: 'Delete the opener and keep the sentence.',
    notFlagged: ['Note that the hook does not fire when the command fails.'],
  },
  {
    key: 'doc-08-negative-parallelism', id: 'DOC-08', scope: 'prose', severity: 'warn',
    match: /\b(?:it'?s|it is|this is)\s+not\s+(?:just|merely|simply|only)?\s*(?:about\s+)?[^.\n]{2,40}[,;:—-]\s*(?:it'?s|it is|this is)\b/gi,
    detects: 'The "not X, but Y" cadence used as emphasis.',
    fix: 'State Y. The reader did not propose X.',
    notFlagged: ['This is not a style guide. The rules are mechanical.'],
  },
  {
    key: 'doc-08-inline-header-list', id: 'DOC-08', scope: 'prose', severity: 'warn',
    // Three in a row, not one: a single bold lead-in is ordinary writing. The
    // tell is the whole list built to one template.
    match: /^[-*][ \t]+\*\*[^*\n]{2,40}\*\*:[^\n]*\n[-*][ \t]+\*\*[^*\n]{2,40}\*\*:[^\n]*\n[-*][ \t]+\*\*[^*\n]{2,40}\*\*:/gm,
    detects: 'A list where every item is a bold lead-in followed by a colon.',
    fix: 'Use a table if the items share a shape, or write them as sentences.',
    notFlagged: ['- **Scope**: the file classes a pattern reads\n- an ordinary second item\n- a third'],
  },
  ...acrossScopes(['prose', 'code', 'markup'], {
    key: 'doc-09-fabricated-metric', id: 'DOC-09', severity: 'warn',
    match: /\b\d[\d,.]*\s*[kKmM]?\+\s*(?:users|customers|companies|developers|downloads|teams|businesses|projects|installs)\b|\b9\d(?:\.\d+)?%\s*(?:uptime|accuracy|satisfaction|reliable)\b|\B#1\s+(?:rated|ranked|choice|platform|tool)\b/gi,
    detects: 'A headline number with nothing behind it.',
    fix: 'Cite where the number comes from, or take it out.',
    notFlagged: ['99.9% of the runs finished under 200ms (see docs/verification-log.md)', 'up to 12 users per workspace'],
  }),
  ...acrossScopes(['prose', 'code', 'markup'], {
    key: 'doc-09-filler-identity', id: 'DOC-09', severity: 'warn',
    match: /\b(?:John|Jane)\s+(?:Doe|Smith)\b|\bAcme\s+(?:Inc|Corp|Corporation|Ltd|Co)\b|\blorem ipsum\b|\bexample@example\.(?:com|org)\b/gi,
    detects: 'Placeholder identity shipped as if it were content.',
    fix: 'Use real content, or label it a placeholder where the reader can see it.',
    notFlagged: ['const PLACEHOLDER_NAME = process.env.DEMO_NAME'],
  }),
  ...acrossScopes(['code', 'markup'], {
    key: 'ui-07-stock-illustration', id: 'UI-07', severity: 'warn',
    match: /\b(?:undraw\.co|storyset\.com|drawkit\.com|humaaans\.com)\b/gi,
    detects: 'Stock illustration with no connection to the product.',
    fix: 'Show the product, or leave the space empty until there is something to show.',
    notFlagged: ['// the illustration set we rejected lives at an external host'],
  }),
  {
    key: 'code-10-banner-rule', id: 'CODE-10', scope: 'code', severity: 'warn',
    // Only decoration, no label: a line of repeated punctuation carries no
    // information at all. A labelled separator is a different thing and is left
    // alone — what is caught here is the ruler with nothing written on it.
    match: /^[ \t]*(?:\/\/|#|;{1,2})[ \t]*[=\-*~_+]{6,}[ \t]*$|\/\*[ \t]*[=\-*~_+]{6,}[ \t]*\*\//gm,
    detects: 'Comment made only of repeated characters — decoration standing in for a section.',
    fix: 'Do not write it. If the section needs a name, write the name.',
    notFlagged: [
      '// ── Shared tables ────────────────',
      '# -*- coding: utf-8 -*-',
      'const RULE = "----------";',
      '// --- see RFC 2822',
    ],
  },
  {
    key: 'code-10-shouted-banner', id: 'CODE-10', scope: 'code', severity: 'warn',
    match: /(?:\/\/|#)[ \t]*[=\-*~_]{2,}[ \t]*[A-Z][A-Z0-9 \t]{2,}[ \t]*[=\-*~_]{2,}/g,
    detects: 'Section name shouted between rows of punctuation.',
    fix: 'Do not write it. A plain lower-case label reads the same and says as much.',
    notFlagged: ['// ── Shared tables ────────────────', '// -- see ADR 14 for the reasoning'],
  },
  {
    key: 'code-10-step-narration', id: 'CODE-10', scope: 'code', severity: 'warn',
    // The control flow is already visible. Numbering it turns the code into a
    // checklist that has to be kept in sync with itself.
    match: /(?:\/\/|#|^[ \t]*\*)[ \t]*Step[ \t]+\d+[ \t]*[:.)-]/gim,
    detects: 'Comment narrating the flow step by step.',
    fix: 'Do not write it. If the flow is hard to follow, that is a structure problem.',
    notFlagged: ['// step size is 4 bytes', '# Steps are recorded in the ledger', '// See step 3 of RFC 7519'],
  },
  {
    key: 'code-10-empty-label', id: 'CODE-10', scope: 'code', severity: 'warn',
    match: /^[ \t]*(?:\/\/|#|\*)[ \t]*(?:(?:main|core|business|helper|utility)[ \t]+(?:logic|functions?|code)|entry[ \t]+point|error[ \t]+handling)[ \t]*[.!]?[ \t]*$/gim,
    detects: 'Comment naming a category instead of stating a fact.',
    fix: 'Do not write it. Keep a label only when it carries information the code does not.',
    notFlagged: ['// error handling is centralised in withRetry(), see below', '// main logic moved to lib/scan.mjs in 0.6.0'],
  },
  {
    key: 'code-10-empty-note', id: 'CODE-10', scope: 'code', severity: 'warn',
    match: /(?:\/\/|#|\*)[ \t]*(?:note|important|warning)[ \t]*:[ \t]*(?:this[ \t]+is[ \t]+important|please[ \t]+read|be[ \t]+careful|do[ \t]+not[ \t]+change[ \t]*[.!]?[ \t]*$)/gim,
    detects: 'A note that announces importance without saying what is important.',
    fix: 'Do not write it. State the fact: what breaks, and under what condition.',
    notFlagged: ['// Note: retries happen only on 5xx', '// Important: this runs before the config is loaded'],
  },
  {
    key: 'code-10-vague-todo', id: 'CODE-10', scope: 'code', severity: 'warn',
    match: /(?:\/\/|#)[ \t]*(?:TODO|FIXME)[ \t]*:?[ \t]*(?:improve|optimi[sz]e|refactor|clean[ \t]*up|enhance|polish|add[ \t]+more)\b[^\n]{0,25}$/gim,
    detects: 'A TODO naming a feeling rather than a task.',
    fix: 'Do not write it. A TODO earns its place when it names what to do and why.',
    notFlagged: ['// TODO: optimise the O(n^2) join once the index lands (see #431)'],
  },
  {
    key: 'code-10-future-work', id: 'CODE-10', scope: 'code', severity: 'warn',
    match: /(?:\/\/|#|\*)[ \t]*(?:future[ \t]+improvements?|additional[ \t]+(?:optimi[sz]ations?|features?|validation)[ \t]+(?:can|could|may)[ \t]+be[ \t]+added|more[ \t]+(?:validation|checks?|tests?)[ \t]+(?:can|could)[ \t]+be[ \t]+added)/gi,
    detects: 'A placeholder promising work that is never specified.',
    fix: 'Do not write it. Unwritten work belongs in an issue, not in a comment.',
    notFlagged: ['// more validation runs in the schema layer, not here'],
  },
  {
    key: 'code-10-signature-echo', id: 'CODE-10', scope: 'code', severity: 'warn',
    // The backreference is the whole pattern: it fires only when the description
    // repeats the parameter name, which is the case where it adds nothing.
    match: /@param[ \t]+(?:\{[^}]*\}[ \t]*)?(\w+)[ \t]+(?:the[ \t]+)?\1[ \t]*\.?[ \t]*$/gim,
    detects: 'Documentation repeating the parameter name back as its description.',
    fix: 'Do not write it. Document the rule, the unit or the edge case, or leave the line out.',
    notFlagged: ['@param price the amount charged before tax, in minor units', '@param root directory scanned for engine signatures'],
  },
  {
    key: 'code-10-comment-emoji', id: 'CODE-10', scope: 'code', severity: 'warn',
    match: /(?:\/\/|#|^[ \t]*\*)[ \t]*[✅❌⚠✨❗⭐🚀🔒💡🎯📦🐛🔥🎉📝]/gm,
    detects: 'Emoji used as decoration in a comment.',
    fix: 'Do not write it. Plain words carry the same meaning and survive every terminal.',
    notFlagged: ['const STATUS_ICON = "✅";', '// the API returns ✅ as a literal status value'],
  },
  {
    key: 'code-10-end-marker', id: 'CODE-10', scope: 'code', severity: 'warn',
    match: /(?:\/\/|#)[ \t]*end[ \t]+(?:of[ \t]+)?(?:if|for|while|loop|function|class|method|switch|try|block)\b/gi,
    detects: 'Comment marking the end of a block the closing brace already ends.',
    fix: 'Do not write it. Keep an end marker only where it prevents real confusion.',
    notFlagged: ['#endif', '// the end of the stream is signalled by a null chunk'],
  },
  {
    key: 'code-01-versioned-filename', id: 'CODE-01', scope: 'path', severity: 'block',
    // Only code files. Measured across 23 repositories: every one of the 45
    // findings was an asset or a document — `web-hero-…-v2.jpg`, a fourth render
    // of an image, a command file called `brand-new.md`. Versioned output is how
    // designers and generators work; the rule is about a second copy of a source
    // file placed beside the first. The extension list comes from
    // CODE_EXTENSIONS so it cannot drift from the classifier.
    match: new RegExp(String.raw`(^|/)[^/]*[._-](?:v\d+|new|old|copy|backup|final)(?:`
      + CODE_EXTENSIONS.map((e) => e.replace('.', '\\.')).join('|') + ')$', 'i'),
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
    // AKIAIOSFODNN7EXAMPLE is AWS's own documentation key and appears in their
    // signing examples, so it turns up in any test that verifies a signature.
    // All three findings across 23 repositories were that key. A published
    // example is not a leaked credential, and blocking on it teaches people that
    // this rule cries wolf.
    match: /\bAKIA(?![0-9A-Z]{9}EXAMPLE\b)[0-9A-Z]{16}\b/g,
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
    key: 'sec-01-tls-verification-disabled', id: 'SEC-01', scope: 'code', severity: 'block',
    // Certificate checking turned off. It is the standard way to make a TLS
    // error go away, and it removes the only thing distinguishing the real
    // server from anyone able to answer in its place. Each of these belongs to
    // one runtime and means nothing else there, so the shape is unambiguous.
    match: /\brejectUnauthorized\s*:\s*false\b|\bverify\s*=\s*False\b|\bInsecureSkipVerify\s*:\s*true\b|\bNODE_TLS_REJECT_UNAUTHORIZED\b\s*[=:]\s*['"]?0\b|\bCURLOPT_SSL_VERIFYPEER\s*,\s*(?:false|0)\b/g,
    detects: 'TLS certificate verification disabled.',
    fix: 'Trust the right certificate authority instead. In development, add the local CA rather than switching the check off.',
  },
  {
    key: 'sec-08-public-write-storage', id: 'SEC-08', scope: 'code', severity: 'block',
    // The read-only canned ACL is how a CDN bucket is meant to be configured.
    // The read-write one lets anyone on the internet replace what is in it, and
    // only that form is matched, so static hosting is left alone.
    match: /\bpublic-read-write\b|\bPublicReadWrite\b/g,
    detects: 'Storage open for anyone to write to.',
    fix: 'Grant write access to a role. public-read is enough to serve files.',
  },
  {
    key: 'sec-08-open-ingress', id: 'SEC-08', scope: 'code', severity: 'warn',
    // A warning, not a refusal: an all-addresses CIDR on a web port is exactly
    // right for a public service. On a database or an SSH port it is the classic
    // exposure, and telling the two apart needs the surrounding rule, which a
    // per-line scanner does not have. Surfaced for a person to judge.
    match: /\b0\.0\.0\.0\/0\b|\b::\/0\b/g,
    detects: 'Network rule open to the whole internet.',
    fix: 'Right for a public web port; check that this is not a database, SSH or admin port.',
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
