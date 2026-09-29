# Design system — starter, not a brand

This is a **skeleton**, not a finished visual identity. It exists so a new
project starts from real conventions instead of an empty `globals.css` and
ad hoc Tailwind classes — not to pre-decide what this specific product
should look like. Replace the token _values_ freely; keep the token
_structure_ (semantic names, categories, where things live) unless you have
a specific reason not to, since `docs/rules/code-style.md` and the
`cn()`/`cva` conventions below assume it.

**Once this project has a real visual direction** (a mockup, a Figma file,
or a hand-designed comp), don't keep hand-maintaining this file — the org's
`impeccable` tooling (see the `impeccable` skill family) derives a proper
`DESIGN.md` from a finished build, including a token JSON sidecar. 8x-brands'
`DESIGN.md` is the real example of that output: a fully-specified identity
with named colors, a type scale, and per-component tokens, extracted from
its mockup. This file is the "day one, nothing built yet" starting point;
that's the "day 200, ship it" end state. (Checked: legacy `8x` does not
have an equivalent file — if you're thinking of a past setup there, this
is likely the pattern you're remembering from `8x-brands` instead.)

## 1. Tokens live in `src/app/globals.css`'s `@theme` block

Not a `tailwind.config.js` — Tailwind v4 is CSS-first, tokens are CSS
custom properties. Two categories:

- **Sizing/spacing** — use Tailwind's built-in scale (`p-4`, `gap-2`,
  `text-lg`, ...) rather than inventing a parallel one. It's already a
  token system; redefining it is the more common design-system mistake,
  not a missing piece.
- **Everything brand-specific** — color, radius, shadow, font family — goes
  in `@theme` as semantic custom properties, not literal Tailwind class
  overrides scattered through components.

## 2. Name tokens by role, not by value

`--accent`, not `--blue-500`. A rename should never cascade through every
component that uses it. This template ships a neutral starter set:

| Token                                      | Starter value (light)    | Role                                                            |
| ------------------------------------------ | ------------------------ | --------------------------------------------------------------- |
| `--bg`                                     | near-white               | page background                                                 |
| `--surface`                                | white                    | card/panel background, one step off `--bg`                      |
| `--surface-hover`                          | light gray               | hover state for interactive surfaces                            |
| `--border`                                 | light gray, low contrast | default hairline border                                         |
| `--border-strong`                          | medium gray              | hover/focus-adjacent border                                     |
| `--text`                                   | near-black               | primary text                                                    |
| `--text-muted`                             | mid gray                 | secondary text                                                  |
| `--text-faint`                             | light-mid gray           | placeholder/tertiary text                                       |
| `--accent`                                 | blue                     | primary interactive color — links, primary buttons, focus rings |
| `--accent-hover`                           | darker blue              | accent hover state                                              |
| `--accent-ink`                             | white                    | text/icon color placed on top of an `--accent` surface          |
| `--success` / `--warning` / `--danger`     | green / amber / red      | status-only, never used decoratively                            |
| `--radius-sm` / `--radius` / `--radius-lg` | 6px / 10px / 16px        | never hardcode a `border-radius` outside these                  |

Every token above has a dark-mode pair, swapped automatically via
`prefers-color-scheme` — see `globals.css`. If this project wants a
user-facing toggle instead of (or in addition to) following the OS
preference, switch the dark block's selector from
`@media (prefers-color-scheme: dark)` to `.dark &` / `:root.dark` and add a
small class-toggling script; don't rebuild the token set to do it.

## 3. Component conventions

- Build variant components (buttons, badges, alerts — anything with more
  than two visual states) with `class-variance-authority` (`cva`), not a
  chain of ternaries in `className`. Compose the result through `cn()`
  (`src/lib/cn.ts`, `clsx` + `tailwind-merge`) so a caller can still
  override/extend classes without Tailwind's cascade fighting itself.
- No hardcoded hex colors, pixel radii, or arbitrary spacing values in
  component code — if a value isn't expressible with an existing token or
  Tailwind's default scale, that's a signal to add a token, not to reach
  for `style={{ ... }}` or a one-off `bg-[#...]`.
- Every interactive element gets a visible `:focus-visible` state — the
  default browser outline is acceptable; removing it without replacing it
  is not.
- Respect `prefers-reduced-motion` for any animation beyond a simple
  opacity/color transition.

## 4. Accessibility baseline

- Text-on-`--bg`/`--surface` must hit at least WCAG AA contrast (4.5:1 for
  body text, 3:1 for large text). Check this when you change a token value,
  not just when you add a new component.
- Every form input has an associated `<label>` (visually hidden is fine,
  absent is not).
- Icon-only buttons get an `aria-label`.
