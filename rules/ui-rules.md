## Interface output (UI · A11Y)

This section loads only in web projects; with no framework, stylesheet config or
`index.html` at the root it is never injected. The patterns are the floor. What
follows is what a regex cannot see.

- **A technique needs a reason, not a ban.** Gradient, glow, glassmorphism and
  motion are all allowed. What is not allowed is using one because it is the
  default. If the reason cannot be written in one line, the decision is not made
  yet.
- **The filter cannot supply direction.** These rules stop generic output; they
  do not produce good output. Without a stated design direction the honest result
  is a plain, labelled draft, not a confident-looking page. Say that it is a
  draft without direction rather than dressing it up.
- **A section exists because the content needs it.** Hero, three feature cards,
  "How It Works" in three steps, a logo bar, three pricing columns, a four-column
  footer: each of these has to earn its place from the product, or it is filling
  a template.
- **Do not ship a control that does nothing.** A button with no action, a link to
  a section that does not exist, a form that validates nothing. If it is not
  wired yet, label it so the reader can see that.
- **Every state ships, not just the full one.** Empty, loading and error are part
  of the interface. A screen that only works with three rows of ideal data is
  one third of a screen.
- **Do not invent evidence.** Numbers, testimonials, logos, avatars and security
  claims are real and attributable, or they are absent. A placeholder that looks
  real is worse than an empty space.
- **The keyboard is not optional.** Tab reaches everything, focus is visible, and
  nothing depends on hover alone. Removing an outline without replacing it takes
  the interface away from anyone not using a mouse.
- **Mobile is a layout, not a breakpoint.** Test the narrow width before calling
  it done: no horizontal scroll, text inside its container, tap targets a finger
  can hit, and no section locked to the viewport height.
- **Contrast is measured, not judged.** Grey on grey passes by eye and fails at
  4.5:1. If a pair is uncertain, compute the ratio; do not assert it.
- **Do not clone a product you admire.** If the design still reads as Linear,
  Stripe or Notion with the logo swapped, it has no identity of its own.
- **Verify before delivering.** Run it, exercise every interactive element once,
  and report what happened. A claim that it works is not evidence that it does.
