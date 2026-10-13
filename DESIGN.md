# Design system

Retake's look, from the owner's design (`design/`, kept out of the repo:
the landing page, the signed-in app and the design notes). Violet on a
violet-black base, dark by default and mirrored in light; Funnel Display for
headlines, Funnel Sans for reading, JetBrains Mono for timecodes and labels.
`src/app/globals.css` is where the code holds it. This file describes what
the code does today, including where it falls short of its own rules
(section 5).

## 1. The rules the design sets

- **60 / 30 / 10.** Roughly 60% base, 30% raised surfaces and lines, 10%
  accent. The accent marks only what you can press or what is happening
  right now.
- **No orange or yellow anywhere**, the footage included: the site's
  pictures of the sample trip are shown in a violet duotone (`.duo` in the
  landing page's stylesheet). The person's own video in the app is always
  shown in its real colours.
- **Pink only for what gets cut**: filler words, pauses, removed parts, and
  a recording in progress (`--cut`).
- **No highlighted or italic words in headlines.** A message's `<em>` reads
  as plain text (`emphasis()` in `src/components/site/display.tsx`).
- **No orbs or glows** behind the content; the landing page's moving
  background is spoken words drifting past, with the ums cut out.

## 2. Tokens live in `src/app/globals.css`

Tailwind v4 is CSS-first: there is no `tailwind.config.js`.

- **`@theme`**: the radii, the brand colours (the logo's dot, the
  gradient lines), `night` and `ink`, and the easing `--ease-out-soft`
  (`cubic-bezier(.2,.8,.2,1)`, the design's).
- **`:root` / `[data-theme='dark']` and `[data-theme='light']`**: the colour
  tokens that change with the scheme, re-exposed to Tailwind by
  `@theme inline` (`bg-surface`, `text-text-muted`, `border-border`, ...).
- **`@utility`**: `bg-brand` (the accent as a fill) and `bg-brand-wide` (the
  design's one gradient: accent into the support blue).

| Token                          | Dark                  | Light               | Role (the design's name)                         |
| ------------------------------ | --------------------- | ------------------- | ------------------------------------------------ |
| `--bg`                         | `#0b0a1a`             | `#f5f4fb`           | base (`--bg`)                                    |
| `--surface`                    | `#151330`             | `#ffffff`           | raised surface (`--panel`)                       |
| `--surface-hover`              | `#1c1940`             | `#f1effb`           | a surface on a surface (`--panel-2`)             |
| `--surface-inset`              | `#100e24`             | `#eceaf7`           | recessed fields and chat (`--bg-2`)              |
| `--border` / `--border-strong` | lilac 12% / 22%       | ink 11% / 20%       | lines (`--line`, `--line-2`)                     |
| `--text`                       | `#f1efff` (17.3:1)    | `#14122b` (16.7:1)  | text (`--fg`)                                    |
| `--text-muted`                 | `#aba6cf` (8.5:1)     | `#514c78` (7.2:1)   | secondary text (`--mute`)                        |
| `--text-faint`                 | `#8c87b6` (5.8:1)     | `#686391` (5.1:1)   | quiet labels (`--faint`)                         |
| `--accent`                     | `#8f7eff`             | `#5b45f0`           | buttons, the playhead, now-playing               |
| `--accent-ink`                 | `#0b0a1a` (6.2:1)     | white (5.9:1)       | text on the accent (`--on-accent`)               |
| `--accent-fg`                  | `#b5a9ff` (9.4:1)     | `#4b36e0` (6.6:1)   | the accent as text and links (`--accent-ink`)    |
| `--accent-soft`                | lilac 16%             | accent 13%          | a picked chip, a focus ring (`--ring`)           |
| `--blue`                       | `#7c9cff` (7.5:1)     | `#2f5be0` (5.2:1)   | support: "Chosen for you", gradients             |
| `--cut` / `--cut-soft`         | `#f27bcb` (7.9:1)     | `#b0267a` (5.6:1)   | what gets cut; also `--filler` and `--warning`   |
| `--success`                    | `#6ee7c1` (12.9:1)    | `#0e7a5b` (4.9:1)   | done: "Applied", checks (`--ok`)                 |
| `--danger`                     | `#ff6b8a`             | `#c5282e`           | errors only (the design has none; kept for them) |
| `--glass`                      | panel at 72%          | white at 78%        | the bars' blurred backgrounds                    |
| `--river` / `--river-cut`      | lilac 5.5% / pink 13% | ink 4.5% / pink 10% | the drifting words behind the landing page       |
| `--shadow-card`                | deep, black           | soft, violet        | raised cards (`--shadow`)                        |

Contrast figures are the design notes', against the base.

**Radii** (static): `rounded-sm` 8px, `rounded` 12px (the app's buttons and
fields), `rounded-lg` 14px, `rounded-xl` 20px, `rounded-2xl` 24px,
`rounded-3xl` 28px; pills are `rounded-full` (the site's buttons, chips).

**Schemes.** The switch (`src/components/theme-toggle.tsx`) is the design's
round button: the sun while it's dark, the moon while it's light; read out
as a switch named "Light mode". It sets `data-theme` on `<html>` and
remembers it in `localStorage` (`retake-theme`); a script in `<head>`
(`src/lib/theme.ts`) applies it before first paint.

## 3. Type and motion

**Type** (`next/font` in `src/app/[locale]/layout.tsx`, self-hosted at
build): Funnel Display for headlines (`font-display`, weight 500, set tight:
`-0.03em` to `-0.035em`, line height 0.98 to 1.02), Funnel Sans for reading
(`font-sans`), JetBrains Mono for timecodes and labels (`font-mono`). Every
`h1`–`h3` defaults to the display face (`@layer base` in `globals.css`).
`display.tsx` holds the headline sizes, each a `clamp()` that shrinks to a
phone's width (`hero` 46 to 124px, `page` 40 to 88px, `section` 36 to 72px,
`small` 30 to 58px), the `Eyebrow` (mono capitals after a short rule), the
`Lead` and the `PageHero`.

**Motion.** Light CSS, every piece under
`prefers-reduced-motion: no-preference`:

- `globals.css`: `rt-rise` (a page's opening), `rt-reveal` (rises in as it
  scrolls into view, by scroll-driven animation; simply there where that
  isn't supported), `rt-btn` (a button lifts 1px on hover), `rt-wordmark`
  (the closing "Retake" slides sideways), `rt-drift` (the sign-in panel's
  words), `rt-snip` (a filler marked pink, cut, then back).
- The landing page (`src/components/site/landing/`): the design's motion
  spec. One scroll listener, batched into `requestAnimationFrame`
  (`landing-motion.tsx`), drives the pinned scenes: the story stage's
  `--s1` to `--s5` (all its movement is `calc()` on those), the Make it
  panes, the sideways tool track, the hero sentence and the corner
  timecode. The word rows drift on their own frame loop. Only transform,
  opacity and CSS variables change on scroll. With reduced motion the
  pinned scenes become ordinary sections, every step's text shows, the
  Make it scene shows the questions and the plan, the tool cards wrap, and
  nothing loops.

## 4. Shared pieces

- **Buttons** (`src/components/ui/button.tsx`, `cva`): `primary` (the
  accent, with its ink), `outline` (the design's "ghost": a line, no fill),
  `ghost`, `secondary`, `contrast` and `destructive`; 12px corners in the
  app, `rounded-full` on the site.
- **The site** (`src/components/site/`): the floating glass pill of a header
  (`site-header.tsx`, with the page links marked by a soft fill), the
  one-line footer, the ending (`closing-band.tsx`: the last line, the way
  in, the outlined wordmark), the logo (the ring-and-dot mark), and the
  landing page's scenes (`landing/landing-scenes.tsx` and its CSS module).
- **The app**: the 62px bar (`app-header.tsx`; the editor's own is
  `editor-shell.tsx`), the segmented switches (Edit with AI / Edit manually,
  Edited / Original) with the accent on the picked one, the plan as a
  written list with thin rules, and Make it's four-step progress bar.
- Icons come from `src/components/ui/icons.tsx` (Phosphor, regular weight),
  never drawn inline.

## 5. Conventions, and where the code stands

- **Variants through `cva`, classes through `cn()`.**
- **Tokens instead of literal values.** An aim the code doesn't fully meet:
  many components still carry arbitrary Tailwind values (pixel font sizes,
  `rounded-[22px]`), most of them the design's own measurements. The
  landing page's stage keeps its numbers in its CSS module, where the
  `calc()` expressions are readable. New code should reach for a token
  first, and add one when a value repeats.
- **A visible `:focus-visible` state** on every interactive element.
- **Reduced motion respected** for anything beyond an opacity or colour
  change.

## 6. Accessibility baseline

- Text on `--bg` and `--surface` meets WCAG AA in both schemes (the
  figures above); recheck when a token value changes.
- Every form input has a `<label>` (visually hidden is fine).
- Icon-only buttons get an `aria-label`; icons themselves render
  `aria-hidden`. The landing page's moving pictures are `aria-hidden` or a
  labelled `role="img"`; the text they illustrate is in the page.
