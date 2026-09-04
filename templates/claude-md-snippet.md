<!-- LenaRise.SlopGuard: liveness rule — start -->
## LenaRise.SlopGuard liveness check

This section deliberately lives outside the plugin, in `~/.claude/CLAUDE.md`.

The reasoning: if hooks are not registered then no hook runs — including the one
that would ask "are you running?". An absence cannot be detected by asking the
thing that is absent. This rule is the only layer that can detect the absence of
the strong layer.

Once at the start of a session, look at two files:

```bash
cat ~/.claude/lenarise-slopguard/heartbeat.json 2>/dev/null
cat ~/.claude/lenarise-slopguard/config.json 2>/dev/null
```

**If the stamp is fresh (less than a day old) say nothing.** Working protection is silent.

If the stamp is missing or older than a day, act according to `ui.livenessCheck`
in `config.json`:

| `ui.livenessCheck` | What you do |
|---|---|
| `ask` (default) | Tell the user and **wait for an answer**: diagnose with `/slop-doctor`, or continue unprotected? |
| `warn` | Warn once, do not wait, carry on |
| `off` | Say nothing |

If `config.json` cannot be read, assume `ask`.

If the user chooses to continue unprotected, **do not ask again in the same
session**. A repeated warning gets ignored, and an ignored warning is a form of slop.

Do not skip this check silently. As dangerous as having no protection is
believing you have some.
<!-- LenaRise.SlopGuard: liveness rule — end -->
