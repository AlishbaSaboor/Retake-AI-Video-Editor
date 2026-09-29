---
name: template-setup
description: One-time interactive bootstrap for a project freshly created from this template — confirms it was created the right way, asks for the new project name/description/internal-vs-external classification, renames template placeholders, rewrites README.md from template voice to project voice, and prints a tailored follow-up checklist. Use when the user says "/template-setup", "set up this template", "bootstrap this project", "I just cloned/generated this from the template", or opens a repo where package.json still says "8x-web-template".
---

# Template setup

Run this once, right after creating a new repo from `8x-web-template`, before writing any real feature code. It's the only skill in this repo meant to run exactly once.

## 0. Confirm this hasn't already been run

Check `package.json`'s `"name"` field. If it's anything other than `8x-web-template`, this repo has probably already been set up — tell the user what you found and confirm before proceeding, since they may want to change one thing rather than redo everything.

## 1. Confirm how the repo was created

Ask, don't assume — this determines whether there's a cleanup step needed.

- **Right way: GitHub's "Use this template" button, or `gh repo create <name> --template <org>/8x-web-template`.** This produces one fresh commit with zero connection to this template's own history. Prefer this over both alternatives below.
- **A plain `git clone` + manually repointing `origin`.** This drags along this template repo's _entire_ own scaffolding history forever — every commit this template accumulates over time — showing up in `git blame`/`git log` for files nobody in the new project ever touched. It can't be undone later without discarding history.
- **A fork.** The wrong tool here — forks exist to contribute back to the same upstream project via PRs, which will never happen between an independent new project and this template. GitHub will keep nudging toward a relationship that shouldn't exist.

Check: `git log --oneline | wc -l`. If it's more than 1, or the sole commit's message is `feat(template): scaffold 8x web template first draft`, this almost certainly wasn't generated via the template feature.

If so, tell the user plainly and ask whether they want to flatten history:

```bash
rm -rf .git && git init && git add -A && git commit -m "chore: initial commit from 8x-web-template"
```

**This is destructive — confirm explicitly before running it, never run it unprompted**, and never on a repo that already has real commits past the initial scaffold.

## 2. Ask the user for

- **Project name** (kebab-case) — becomes `package.json`'s `name`, the README title, and the default page `<title>`.
- **One-line description.**
- **Internal-facing or external-facing?** If genuinely unsure, ask: "will anyone outside the company ever load a page from this while logged out?" — external if yes. This decides step 4 below.
- **Does this project have real user accounts, or is it a landing page with nothing to sign into?** Internal tools always answer "accounts" (an internal tool with no auth isn't a real option). External projects can go either way — 8x-brands has accounts, 8x-marketing doesn't. Default is **Supabase Auth** for anything with accounts; a landing page gets auth removed entirely. See `docs/rules/auth.md` for exactly what "wire it up" / "remove it" means — this template ships with Supabase Auth present by default, so a landing-page answer is the one that requires action (removal), not the accounts answer.

- **Does this project make AI provider calls?** Not "might it one day" —
  today, or in the work already planned. If **yes**, ask which providers
  (`anthropic`, `openai`, `google`) and which specific models; push for
  specific, since `claude-opus-5` is the answer and "Claude" isn't. If
  **no**, the AI spend tracking this template ships gets deleted, not left
  dormant. Act on the answer in step 3.7 — both answers require action, and
  leaving it half-done is worse than either.

- **Which icon provider?** Default is **Phosphor** (`@phosphor-icons/react`), already installed and wired through `src/components/ui/icons.tsx`. Offer the alternatives (Lucide, Heroicons, Tabler, Radix icons) but say the default is fine unless the project has a design that specifically calls for another set — this is a one-file swap now and a much bigger one later, which is exactly why the question gets asked here. Act on the answer in step 3.6.

Follow through on the accounts/landing-page answer immediately, using the exact steps in `docs/rules/auth.md`'s "Wiring it up" (nothing to do, already present) or "Removing auth" (uninstall `@supabase/*`, delete `src/lib/supabase/`, simplify `src/proxy.ts`, remove the three Supabase env vars from `.env.example` and `src/lib/env.ts`) sections. Confirm the removal commands with the user before running them, same as the git-history flattening in step 1 — both are destructive.

## 3. Apply the rename

- `package.json` — `"name"` field.
- `messages/en.json` — `HomePage.title` (and `HomePage.description` if it should stop referencing template setup).
- `src/app/[locale]/layout.tsx` — the `metadata.title` string.
- Leave `CLAUDE.md`/`AGENTS.md`/`DESIGN.md` alone — none reference the project name.

## 3.5. Rewrite README.md from template voice to project voice

This is more than a find-and-replace — `README.md` as shipped is written
for someone deciding whether to _use the template_, not for someone
working in the generated project. Two different jobs; don't leave the
first one's copy in place once the second is what's true. Concretely:

**Rewrite (template-specific framing, doesn't describe this project):**

- The `# 8x web template` title → `# <project name>`.
- The intro paragraph ("The standardized starting point for every new 8x
  web project...") → the project's actual one-line description from step 2,
  expanded to a short paragraph if the user has more to say about what
  it's for. If they don't yet, a single honest sentence beats padding.
- "What you get out of the box" — this sells the _template_. Delete it, or
  once the project has real functionality, replace it with what _this
  project_ actually does.
- "Getting a new project from this template" — delete entirely. A
  generated project doesn't need instructions for generating itself.

**Keep, because it's still accurate reference material for this actual
codebase, not template marketing:** Stack, Project structure, Setup,
Environment variables, Database & migrations, Auth, Testing, Skills, "Rules
live in AGENTS.md", Deployment, Scripts. Update anything inside them that's
now stale — e.g. if step 4 below strips `next-intl` for an internal tool,
remove the i18n row from the Stack table and any i18n mention in Project
structure; if auth was removed per `docs/rules/auth.md`, drop the Auth
section and its Stack/structure references too.

**Trim "Before you start replacing things":** it's the checklist for
_this skill's own run_. By the time you reach this step you're already
executing it — strip items step 0–3 already cover (running this skill,
the rename) and keep only what's still forward-looking after setup
finishes: deleting `example.prisma`/`smoke.spec.ts` once real code exists,
the CI/CD secrets setup, and any open decisions (state management, Prisma
major, i18n/Tailwind) that are still genuinely undecided for this project.

Show the user the rewritten README (or a summary of what changed) rather
than silently committing it — this is the one file most likely to need a
human's editorial judgment on tone/detail, not just mechanical rename.

## 3.6. Swap the icon provider, if they picked one

Skip this entirely if they kept Phosphor — it's already installed and working.

Otherwise, all of it happens in `src/components/ui/icons.tsx` (read its
header comment first, it spells out the three edits):

1. `pnpm remove @phosphor-icons/react` and install the chosen package.
2. Replace the provider import with the new one. Check whether the new
   package's icons are Client Components — Phosphor's root entry is (hence
   the `/ssr` import path the template ships), and a provider that is
   without declaring `'use client'` will fail the moment a Server Component
   renders one.
3. Rewrite `Glyph`'s body so `IconProps` maps onto the new provider's own
   props — the prop names differ (Phosphor takes `weight`, Lucide takes
   `strokeWidth`, Heroicons take a size class rather than a `size` prop,
   Radix icons take neither). Keep `IconProps` itself unchanged: it's the
   contract every call site depends on, and widening it to the new
   provider's props defeats the wrapper. Keep the `aria-hidden` — icons in
   this template are always decorative and never take a label prop.
4. Map each exported name to the new provider's equivalent glyph. Keep the
   exported names as they are — they're named for their role in the product
   (`SpinnerIcon`, `EditIcon`), not for the provider's own naming.

Then `pnpm lint && pnpm typecheck` — the `no-restricted-imports` rule in
`eslint.config.mjs` lists the provider packages it blocks. If you installed
one that isn't in that list, add it, or the rule silently stops protecting
anything.

Don't relax or delete that rule to make a swap easier. Per
`docs/rules/icons.md`, it's the thing keeping this a one-file decision.

## 3.7. Act on the AI answer

Run `/ai-usage-setup` and let it do the work — it owns both branches and
`docs/rules/ai-usage.md` is its source of truth. What matters here is that
one of the two branches actually runs. In summary:

**If the project makes AI calls:** trim `OPENROUTER_SLUGS` and
`AI_PROVIDERS` in `src/server/lib/ai-usage/` to the models and providers
named in step 2. There is nothing to provision — MOAD reads the `ai_usage`
table directly over the Supabase Management API, so no key, endpoint or env
var is involved. Then `pnpm check:ai-models && pnpm typecheck && pnpm test`.

**If it doesn't:** delete the whole thing, following the "Removing it" list
in `docs/rules/ai-usage.md`. Confirm before running the deletions, same as
every other destructive step in this skill.

Don't skip this by leaving the tracking installed-but-unused on the theory
that AI might arrive later. Adding it back is one skill run; a dormant
`ai_usage` table reports this project on a shared dashboard as spending
zero, rather than as a project that opted out, and nobody owns that bug.

## 4. Branch on internal vs. external

Don't install anything from the "other" branch speculatively — ask which one applies and only act on that one. These are recommendations to raise with the user, not things to install unprompted; get explicit confirmation before adding a new dependency.

### Internal-facing (dashboards, admin tools, ops panels)

- **Auth is not optional** — covered by the accounts/landing-page question above; an internal tool is always "has accounts," so Supabase Auth (already wired, see `docs/rules/auth.md`) stays in place. If the org needs SSO instead, that's a deliberate swap-out, not a default.
- If the project will have real data tables with filtering/sorting/selection, `@tanstack/react-table` plus Zustand for shared filter/selection state is a reasonable pair once there's an actual table to justify them — don't add either before that.
- i18n is usually unnecessary for an internal-only audience. Consider stripping `next-intl` entirely: delete `src/i18n/`, `messages/`, un-nest `src/app/[locale]/` back to `src/app/`, and simplify `src/proxy.ts`/`next.config.ts` accordingly. Confirm first — some internal tools do serve non-English-speaking staff.

### External-facing (marketing sites, public portals, anything a logged-out stranger can load)

- Keep i18n — it's far more likely to matter here than internally.
- Add bot/abuse protection on any public form (signup, contact, waitlist). Use the org's existing Turnstile pattern/skill rather than rolling a captcha from scratch.
- Add a cookie-consent flow if Sentry/PostHog will run for logged-out EU visitors — port the pattern from 8x-marketing's `CookieConsent` component rather than inventing a new one.
- SEO matters once there's more than one route — fill in `generateMetadata`, add `app/sitemap.ts`/`app/robots.ts` (see 8x-marketing's implementation for the org's existing pattern).
- Auth depends entirely on the accounts/landing-page answer above, not on being external-facing — 8x-brands is external and has accounts, 8x-marketing is external and doesn't. Don't assume "external" means "no auth."

## 5. Print the manual follow-up checklist

Regardless of internal/external, tell the user they still need to do these outside of any skill:

- Create a fresh Postgres database and set `DATABASE_URL`/`DIRECT_URL`. If this project has accounts (Supabase Auth is wired in), that's the same Supabase project — set `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` from its dashboard at the same time.
- Create a fresh Sentry project and set `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`.
- Create a fresh PostHog project and set `NEXT_PUBLIC_POSTHOG_KEY`.
- Provision `MIGRATIONS_TOKEN` (see `docs/CI_CD_SETUP.md`) before the first real schema change, or the CI-generated migration commit's own run sits in `action_required` waiting on manual approval.
- If the project tracks AI spend, tell whoever runs MOAD that this project's
  Supabase database has an `ai_usage` table to read. That is the only step,
  and no skill can do it.
- Delete `prisma/schema/example.prisma` once real models exist.
- Delete `e2e/smoke.spec.ts` once real e2e coverage exists (harmless to keep otherwise).
- Revisit the open decisions in the template's design guide (Prisma v6 vs v7, monorepo vs. flat, second AI reviewer, etc.) if this project needs to diverge from the defaults.

## Don't

- Don't run this against a repo that already has real feature commits past the initial scaffold without confirming with the user first (step 0).
- Don't silently flatten git history — always confirm before running any destructive git command.
- Don't install internal- or external-facing packages speculatively for the type that doesn't apply.
- Don't leave AI usage tracking installed but unused, or half-removed. Step
  3.7 lands in one of two states, never between them.
- Don't leave two icon providers installed. If the user picks a non-default one, remove `@phosphor-icons/react` in the same step — a half-swapped icon set is worse than either provider alone.
