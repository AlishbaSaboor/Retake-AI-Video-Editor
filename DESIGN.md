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
| `--surface-inset`                          | —                        | recessed area inside a card (e.g. the timeline track)           |
| `--accent-secondary`                       | —                        | second brand hue, for small highlights (badges, gradients)      |
| `--accent-glow`                            | —                        | translucent accent for glows and focus rings                    |
| `--border`                                 | light gray, low contrast | default hairline border                                         |
| `--border-strong`                          | medium gray              | hover/focus-adjacent border                                     |
| `--text`                                   | near-black               | primary text                                                    |
| `--text-muted`                             | mid gray                 | secondary text                                                  |
| `--text-faint`                             | light-mid gray           | placeholder/tertiary text                                       |
| `--accent`                                 | blue                     | primary interactive color — links, primary buttons, focus rings |
| `--accent-hover`                           | darker blue              | accent hover state                                              |
| `--accent-ink`                             | white                    | text/icon color placed on top of an `--accent` surface          |
| `--success` / `--warning` / `--danger`     | green / amber / red      | status-only, never used decoratively                            |
| `--filler`                                 | —                        | filler-word flags on the timeline (silences use `--warning`)    |
| `--radius-sm` / `--radius` / `--radius-lg` | 6px / 10px / 16px        | never hardcode a `border-radius` outside these                  |

**Retake has two schemes, dark by default, and one violet accent**, taken
from the owner's design files (`design/landing.html`, the public site;
`design/app.html`, the app; 12 MB, so kept out of the repo), which are the
source of truth for the look. The live
values are in `globals.css`: dark on `:root` (night-blue `#09081A`, white at
3.5-6% for surfaces), light under `:root[data-theme='light']` (lavender-white
`#F7F6FD`, white surfaces). `--accent` (`#6D5BFF`) is for fills and carries
white ink; `--accent-fg` is the accent as text or an icon (`#B8ACFF` on dark,
`#4F3FD9` on light). The brand's four colours (`brand-violet`,
`brand-purple`, `brand-blue`, `brand-lilac`) are static tokens, the same in
both themes, for the logo, gradients (`bg-brand`, `bg-brand-wide`,
`text-gradient`) and coloured bullets. `--contrast` is the solid button beside
the gradient one: white on dark, ink on light. A part of a page can wear one
theme whatever the page's (`data-theme` on any element: the day-and-night
comparison). The switch sets `data-theme` on `<html>` and remembers it in
`localStorage` (`retake-theme`); a script in `<head>` (`src/lib/theme.ts`)
applies it before first paint. Checked 2026-10-08 (WCAG): muted text 8.8:1
dark / 6.7:1 light, faint 5.7 / 5.1, accent text 9.8 / 6.9, success 11.5 /
5.2, white on `--accent` 4.6. White on the light end of the button gradient
(`#9B6BFF`) is 3.5:1, as the design has it. Anything drawn on the video
itself (handles, the letterbox, crop shade) stays black/white in both
schemes: it sits on footage, not on the page.

**Type:** Manrope for the interface and its headings (`font-sans`,
`font-display`), Instrument Serif for the large display lines with one
italic phrase each (`font-serif`; the `<em>` of a rich message, styled by
`emphasis()` in `src/components/site/display.tsx`), Geist Mono for timecodes
(`font-mono`), all from `next/font` (`layout.tsx`), self-hosted at build.

**Motion:** light CSS only, in `globals.css`: `rt-rise` (a page's opening),
`rt-reveal` (rises in as it scrolls into view, by scroll-driven animation;
simply there where that isn't supported), `rt-float`, `rt-sheen`, `rt-lift`,
`rt-btn`. All of it sits under `prefers-reduced-motion: no-preference`, so
reduced motion shows everything at once and still.

**Shared pieces:** `src/components/site/`: the public pill bar
(`site-header.tsx`), the app bar (`app-header.tsx`), footer, logo,
`display.tsx` (eyebrow, serif headings, page hero), the closing band, and the
pictures of the app drawn in markup (`app-screen.tsx`, `make-screen.tsx`,
`scenes.tsx`; drawn at a fixed size and scaled to fit by `.mock-frame`).
Plus `src/components/theme-toggle.tsx` (`site` and `app` sizes) and the
`ui/` foundation. Primary buttons are the brand gradient with white
extra-bold text; `contrast` is the solid one; cards are `rounded-[22-30px]`
on `bg-surface`/`bg-glass` with `border-border`; inputs are
`bg-surface-inset`.

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
