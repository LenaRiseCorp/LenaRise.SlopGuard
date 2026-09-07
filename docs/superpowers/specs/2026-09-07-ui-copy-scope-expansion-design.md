# Scope expansion: interface output, accessibility, prose and comments

Date: 2026-09-07
Status: implemented (see the commits on ui-copy-scope-expansion)

## Why

SlopGuard covers engineering slop: security, testing, error handling, agent
operations, process. It does not cover what an agent *produces for a person to
look at* — the interface, the copy, the comments. A survey of the `anti-slop`
rule set (miqdadbadjuber/anti-slop v3.2.4, 38 rules across five skills, roughly
103 individual items) showed that about half of its content has a real
mechanical signal in source files and the other half is judgment.

That split is the whole design. The judgment half cannot become patterns without
breaking the rule this registry is built on:

> Wiring an ID without a real signal to an invented regex would look like
> detection while detecting nothing.

## Constraints

1. **No invented regexes.** An item without a real signal becomes rule text, not
   a pattern.
2. **Useful in every project type.** Comment noise and machine-voice prose are
   universal and extend existing categories. Interface and accessibility items
   are web-specific and go to domain-scoped categories.
3. **Context economy (AGENT-02).** Injected rule text stays short; depth loads
   on demand.

## Precedent

The `GAME` category already solves this shape. Its registry comment states the
mechanism: detection gates the *text injection*, not the scan, because game
patterns key off engine API names and stay silent elsewhere on their own. The
same holds here — `className`, `backdrop-blur` and `.tsx` do not occur in a Go
service.

## Category structure

Universal additions to existing categories. They run in every project:

| ID | Title | Entries |
|---|---|---|
| `CODE-10` | AI comment noise | 10 |
| `DOC-08` | Machine-voice prose | 7 |
| `DOC-09` | Fabricated evidence in delivered output | 6 |

Two new domain-scoped categories, both `layer: 'machine'`,
`enforcement: 'domain-scoped'`:

```
UI:   { name: 'Interface output',                layer: 'machine', enforcement: 'domain-scoped' }
A11Y: { name: 'Accessibility',      layer: 'machine', enforcement: 'domain-scoped' }
```

| ID | Title |
|---|---|
| `UI-01` | Default gradient and palette family |
| `UI-02` | Effect stacking (glassmorphism, glow, shadow) |
| `UI-03` | Decoration without purpose |
| `UI-04` | Generic icon vocabulary |
| `UI-05` | Dead control |
| `UI-06` | Template typography |
| `UI-07` | Illustration with no connection to the product |
| `A11Y-01` | Removed focus indicator |
| `A11Y-03` | Hover-only interaction |
| `A11Y-04` | Zoom disabled |
| `A11Y-05` | Overflow hidden as a leak fix |
| `A11Y-06` | Viewport-locked section |

As shipped: 24 new IDs carrying 45 pattern entries, 36 to 81 in total. Three
designed patterns were dropped for having no signal — bold overuse, tap target
size (A11Y-02, whose number is left unused so the gap stays visible), and the
general "restating the obvious" comment. `A11Y-04` became zoom disabled, which
has an unambiguous signal in the viewport meta tag, rather than fixed-px type,
which does not. Categories go from 9 to
11, not to 14: mobile and responsive items live in `A11Y` rather than in a
category of their own, and `HUMAN` is already taken by the coach layer.

## Scan surface

`.tsx`, `.jsx`, `.vue` and `.svelte` are already classified as `code`, so
JSX-keyed patterns work without a change. `.css`, `.scss` and `.html` are not
scanned at all today. Two new file classes:

```
STYLE_EXTENSIONS  = ['.css', '.scss', '.sass', '.less']
MARKUP_EXTENSIONS = ['.html', '.htm']
```

with matching `scope: 'style'` and `scope: 'markup'`. `classify()` returns the
new class and `scanContent` already selects patterns by scope, so the engine
change is two lines.

Adding `.css` to `CODE_EXTENSIONS` instead was rejected: the 24 existing `code`
patterns would then run over stylesheets for no gain, and the classifier would
be claiming a file is code when it is not.

## Rule text and web detection

`lib/project.mjs` gains `isWebProject(root)`, true when any of these hold:

- `package.json` dependencies or devDependencies name react, vue, svelte, next,
  nuxt, astro, solid or angular
- a `tailwind.config.*` exists at the root
- an `index.html` exists at the root

Like `detectEngines`, it gates text injection only.

Delivery is two-layered:

- `rules/ui-rules.md` — one line per rule, injected by `session-start` only when
  the project is a web project. Same mechanism as `game-rules.md`.
- `skills/slop-ui/SKILL.md` — the tell / why / fix depth for the judgment items,
  loaded on demand.

The split serves AGENT-02: the part that must be guaranteed is short and
injected, the depth is fetched when the work needs it.

## Delivery gate

A fourth block reason in `stop-gate`. The design decision that matters:
**evidence is a run, not a sentence.**

A model writing "PASS" is a claim. `scripts/deliver.mjs` running is an event.
The verification log already records why this distinction is load-bearing:
"the tests passed" is known from the hook firing, not from the text.

- `post-edit` increments `state.interfaceWritesSinceReport` when a write targets a
  style, markup or JSX file in a web project.
- `scripts/deliver.mjs` re-scans the changed interface files and writes a
  per-item PASS/FAIL record into session state.
- `stop-gate` blocks while the counter is above zero and no record exists.

No new platform behaviour is needed: `testRunAt` works exactly this way today.
The existing fingerprint and `maxStopBlocks` ceiling continue to apply, or the
gate would break our own AGENT-08 rule.

## False positive discipline

Every new pattern entry carries a `notFlagged` array: strings that must *not*
match. A test asserts they stay clean.

Three false positives were found in v0.6.5 by measuring; that knowledge lives
only in git history today. This field moves it into the registry and gives
`npm run mutate` a second input.

The known trap is Tailwind: `outline-none` is almost always paired with
`focus-visible:outline-*`. `A11Y-01` must account for that or it fires on every
Tailwind project.

## Severity

Every new pattern lands as `warn`. Promotion to `block` happens only after
measurement on a real project. Going from 36 to 81 patterns with `block`
as the default is the fastest way to make the tool something people switch off.

## Reconciling with our own rules

The rule set says comments are not to be deleted. `CODE-10` flags comment noise.
These do not conflict, but the boundary is written down: `CODE-10` is `warn`, it
fires on newly written content, and its `fix` text says do not write it — never
go and delete it. It grants no licence to strip existing comments.

## Sequence

One commit per step, `npm run verify` between them (PROC-02, AGENT-06):

1. Scan surface: `style` and `markup` classes, `detectWeb`
2. `CODE-10` comment patterns
3. `DOC-08` and `DOC-09` prose patterns
4. `UI` category
5. `A11Y` category
6. Delivery gate
7. `rules/ui-rules.md` and `skills/slop-ui/`
8. `npm run docs` to refresh the generated files

## Risks

- **Scan cost.** v0.6.4 was a release about a large repository silently not being
  scanned. The surface grows here; measure after step 1.
- **Sterility.** A tool that blocks 81 patterns and offers no direction produces
  sterile output. The source rule set hit this wall and answered it with its
  R-37. Our rule text needs the same counter-statement.
- **`disabled` ergonomics.** `disabled: ["UI", "A11Y"]` must switch the whole
  expansion off in one line.
- **Our own self-scan.** `DOC-08` will run over our own documentation. If it
  trips, either the pattern is wrong or the prose is. One of them gets fixed and
  no waiver is written.
