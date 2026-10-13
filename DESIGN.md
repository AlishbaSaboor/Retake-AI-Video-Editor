# Design system

Retake's look: two colour schemes (dark by default), one violet accent, a
serif for display lines. The owner's design files (`design/landing.html`
for the public site, `design/app.html` for the app; 12 MB, kept out of the
repo) are the source of truth; `src/app/globals.css` is where the code
holds it. This file describes what the code does today, including where it
falls short of its own rules (section 4).

## 1. Tokens live in `src/app/globals.css`

Tailwind v4 is CSS-first: there is no `tailwind.config.js`. Three places:

- **`@theme`**: static tokens, the same in both schemes: the radii, the
  brand's four colours, `night` and `ink` (what stays dark in both), `zoom`
  (a zoom's box and the spoken word drawn on the video), `knob` and `sun`
  (the theme switch), and the easing `--ease-out-soft`.
- **`:root` / `[data-theme='dark']` and `[data-theme='light']`**: the colour
  tokens that change with the scheme, re-exposed to Tailwind by
  `@theme inline` so utilities read them live (`bg-surface`, `text-text-muted`,
  `border-border`, ...).
- **`@utility`**: `bg-brand` and `bg-brand-wide` (the brand gradients),
  `text-gradient` and `bg-glow`.

Spacing and font sizes use Tailwind's default scale; there is no parallel
one.

## 2. Tokens, named by role

| Token                                                     | Dark                              | Light                             | Role                                                             |
| --------------------------------------------------------- | --------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `--bg`                                                    | `#09081a`                         | `#f7f6fd`                         | page background                                                  |
| `--surface`                                               | `#121122`                         | `#ffffff`                         | card or panel                                                    |
| `--surface-hover`                                         | `#1b1a2d`                         | `#efeef8`                         | hover on a surface                                               |
| `--surface-inset`                                         | `#07061a`                         | `#f3f2fb`                         | recessed area: inputs, the timeline track                        |
| `--surface-raised`                                        | `#17152e`                         | `#ffffff`                         | a raised card or dialog (the plan card, Pricing, a device frame) |
| `--border` / `--border-strong`                            | white 8% / 17%                    | ink 9% / 18%                      | hairline border / hover and focus-adjacent border                |
| `--text`                                                  | `#f4f3fa`                         | `#12111f`                         | primary text                                                     |
| `--text-muted` / `--text-faint`                           | 70% / 55%                         | 70% / 62%                         | secondary / placeholder text                                     |
| `--accent`                                                | `#6d5bff`                         | `#6d5bff`                         | fills: primary buttons, the playhead, selected chips             |
| `--accent-hover`                                          | `#7b6bff`                         | `#5c49f2`                         | accent hover                                                     |
| `--accent-fg`                                             | `#b8acff`                         | `#4f3fd9`                         | the accent as text or an icon                                    |
| `--accent-ink`                                            | white                             | white                             | text on an `--accent` fill                                       |
| `--accent-soft` / `--accent-glow`                         | accent 16% / 35%                  | accent 10% / 28%                  | tinted backgrounds / glows and focus rings                       |
| `--accent-secondary`                                      | `#9b6bff`                         | `#7b3fd6`                         | second hue for small highlights                                  |
| `--contrast` / `--contrast-ink`                           | white / `#0b0a16`                 | `#12111f` / white                 | the solid button beside the gradient one                         |
| `--success` / `--warning` / `--danger`                    | `#4ade9b` / `#ffd27a` / `#ff6b7a` | `#0b7656` / `#a8640a` / `#c5282e` | status only, never decoration                                    |
| `--filler`                                                | `#ffb067`                         | `#b4570f`                         | filler words on the timeline (silences use `--warning`)          |
| `--glass` / `--glass-border`                              | white 6% / 9%                     | white 62% / ink 9%                | translucent cards                                                |
| `--selected` / `--track`                                  | white 13% / 12%                   | ink 8% / 10%                      | a segmented control's pick / a slider's empty track              |
| `--glow-*`, `--orb-*`, `--shadow-card`, `--gradient-text` | see `globals.css`                 | see `globals.css`                 | the page's glow, floating orbs, card shadow, gradient text       |

**Brand colours** (static): `brand-violet` `#6d5bff`, `brand-purple`
`#9b6bff`, `brand-blue` `#4c7dff`, `brand-lilac` `#d9c2ff`, for the logo,
the gradients and coloured bullets.

**Radii** (static): `rounded-sm` 7px, `rounded` 11px, `rounded-lg` 14px,
`rounded-xl` 18px, `rounded-2xl` 24px, `rounded-3xl` 30px.

**Schemes.** The switch (`src/components/theme-toggle.tsx`, `site` and `app`
sizes) sets `data-theme` on `<html>` and remembers it in `localStorage`
(`retake-theme`); a script in `<head>` (`src/lib/theme.ts`) applies it
before first paint. `data-theme` on any element makes that part wear one
scheme whatever the page's (the day-and-night comparison). Anything drawn
on the video itself (handles, the letterbox, crop shade) stays black and
white in both: it sits on footage, not on the page.

**Contrast**, checked 2026-10-08 (WCAG): muted text 8.8:1 dark / 6.7:1
light, faint 5.7 / 5.1, accent text 9.8 / 6.9, success 11.5 / 5.2, white on
`--accent` 4.6. White on the light end of the button gradient (`#9b6bff`) is
3.5:1, as the design has it.

## 3. Type, motion and shared pieces

**Type** (`next/font` in `src/app/[locale]/layout.tsx`, self-hosted at build): Manrope for
the interface and headings (`font-sans`, `font-display`), Instrument Serif
for the large display lines (`font-serif`), Geist Mono for timecodes
(`font-mono`). `src/components/site/display.tsx` holds the serif heading
sizes, each a `clamp()` that shrinks to a phone's width: `hero` 52 to
128px, `page` 48 to 96px, `section` 40 to 76px, `small` 36 to 64px. A rich
message's `<em>` is its one emphasised phrase, styled by `emphasis()`
(`gradient`, `accent` or `plain`).

**Motion** is CSS only, in `globals.css`: `rt-rise` (a page's opening),
`rt-reveal` (rises in as it scrolls into view, by scroll-driven animation),
`rt-float`, `rt-pulse`, `rt-scrollhint`, `rt-sheen`, `rt-bar`, `rt-fade-in`,
`rt-lift` and `rt-btn`. All of it sits under
`prefers-reduced-motion: no-preference`, so reduced motion shows everything
at once and still.

**Buttons** (`src/components/ui/button.tsx`, `cva`): variants `primary`
(the brand gradient, white extra-bold text), `contrast` (the solid one),
`secondary`, `outline`, `ghost` and `destructive`; sizes `sm`, `default`,
`lg` and `icon`. Every variant has a `focus-visible` outline in the accent.

**Shared pieces:**

- `src/components/ui/`: `badge`, `button`, `card`, `icons` (the only place
  icons are imported from), `input`, `label`, `textarea`, `toast` and
  `toaster`.
- `src/components/site/`: the public pill bar (`site-header.tsx`,
  `mobile-menu.tsx`, `nav-links.tsx`), the app bar (`app-header.tsx`),
  `site-footer.tsx`, `logo.tsx`, `display.tsx` (`Eyebrow`, `DisplayHeading`,
  `PageHero`), `closing-band.tsx`, and the landing page's parts
  (`landing-sections.tsx`, `hero-demo.tsx`, `make-showcase.tsx`,
  `story-scroller.tsx`, `path-switcher.tsx`, `compare-slider.tsx`).
- Pictures of the app are real screenshots, taken from the app by
  `e2e/site-shots.ts` in both schemes at 2x, and shown by `Shot`, `ZoomShot`
  and `Device` (`shot.tsx`, `shot-zoom.tsx`); the one matching the page's
  scheme shows. The `.mock-frame` and `.mock-canvas` rules in `globals.css`
  are left over from drawn pictures and no longer used.

## 4. Conventions, and where the code stands

- **Variants through `cva`, classes through `cn()`** (`src/lib/cn.ts`,
  `clsx` + `tailwind-merge`), so a caller can extend a component's classes.
  Followed in `src/components/ui/`.
- **Tokens instead of literal values.** This is an aim the code doesn't meet
  yet. As of 2026-10-13, `.tsx` files hold 395 arbitrary Tailwind values
  (`[...]` in a colour, size, radius or spacing class), 112 of them pixel
  font sizes (`text-[13px]`), and radii such as `rounded-[14px]` or
  `rounded-[22px]` beside the tokens above; the button sizes themselves use
  `rounded-[9px]`, `rounded-[11px]`, `h-[50px]` and `text-[15.5px]`, from
  the design files. 19 files use inline `style`, mostly for values computed
  at run time (positions on the video, the timeline). Literal hex colours
  appear in `global-error.tsx` (which renders when the app's own CSS may
  not have loaded) and in two editor files as a default band colour and a
  canvas fill. New code should still reach for a token first, and add one
  when a value repeats.
- **A visible `:focus-visible` state** on every interactive element.
- **Reduced motion respected** for anything beyond an opacity or colour
  change.

## 5. Accessibility baseline

- Text on `--bg` and `--surface` meets WCAG AA (4.5:1 for body text, 3:1
  for large text) in both schemes; recheck when a token value changes.
- Every form input has a `<label>` (visually hidden is fine).
- Icon-only buttons get an `aria-label`; icons themselves render
  `aria-hidden` (`docs/rules/icons.md`).
