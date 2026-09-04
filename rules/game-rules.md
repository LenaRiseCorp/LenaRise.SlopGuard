## Game development (GAME)

This section loads only in game projects; with no engine signature it is never
injected.

- **Do not write frame-rate dependent code.** Motion, timers and smoothing are
  scaled by `Time.deltaTime`. Unscaled code is correct at 30 fps and broken at
  144 — and that is invisible on the machine it was tested on.
- **Do not search on the hot path.** `GameObject.Find`, `FindObjectOfType`,
  `GetComponent` and `Camera.main` are not called every frame. Resolve the
  reference once in `Awake`, or wire it with `[SerializeField]`.
- **Run physics on the physics step.** `Rigidbody` work belongs in `FixedUpdate`;
  inside `Update` it drifts with the frame rate.
- **Do not allocate on the hot path.** LINQ, a new collection or string
  concatenation every frame produces garbage and shows up as hitching.
- **Do not trust the client.** Currency, score, progression and purchase state do
  not live in plain-text stores such as `PlayerPrefs`; the player can edit them.
- **Do not hardcode paths into the scene tree.** `get_node("../../Player")`
  breaks silently when a node moves. Use an exported `NodePath` or a signal.
- **Do not touch engine-generated files.** `.meta`, `.uasset`, `.umap`, `.tscn`,
  `Library/`, `Intermediate/` — the engine writes these. A hand-edited `.meta`
  breaks every reference in the scene, and the damage surfaces long after the commit.
- **Do not use unseeded randomness where determinism matters.** Replays, network
  sync and procedural generation must produce the same result from the same seed.
- **Do not bury balance values in code.** Damage, speed, price and duration
  hardcoded in source cannot be tuned by a designer; move them into data or a
  ScriptableObject.
