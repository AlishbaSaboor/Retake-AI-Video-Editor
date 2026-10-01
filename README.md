# Retake

An AI video editor for fixing the flaws in an existing recording instead of
re-shooting it — re-record one bad sentence and splice it back in, trim a
stumble, cut a tangent. Every edit can be made either by typing a
plain-English command or by hand on a manual timeline. Basic motion
graphics (logos, watermarks, title cards) sit on top of the same timeline.

## Stack

| Layer           | Choice                                                        | Note                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router, Turbopack, React Compiler) + React 19 | See `AGENTS.md` for the v13/14→16 breaking changes that matter                                                                                                                     |
| Styling         | Tailwind CSS v4 (CSS-first, no `tailwind.config.js`)          | Tokens in `src/app/globals.css`, see `DESIGN.md`                                                                                                                                   |
| Database        | Prisma 6                                                      | Schema-only workflow — CI generates and commits migrations, you never hand-write one. Prisma 7 is a deliberate future upgrade, not the default (driver-adapter migration required) |
| Auth            | Supabase Auth                                                 | Auth/session only — Prisma still owns all application data. Removed entirely for landing pages with no accounts, see `docs/rules/auth.md`                                          |
| Server state    | TanStack Query                                                | `QueryClient` created inside `useState`, never module scope                                                                                                                        |
| i18n            | next-intl                                                     | Component-scoped translation files                                                                                                                                                 |
| Observability   | Sentry + PostHog                                              | Both no-op gracefully until real keys are set; unified behind `captureError`/`captureClientError`, see `docs/rules/error-handling.md`                                              |
| Testing         | `node --test` (unit) + Playwright (e2e)                       |                                                                                                                                                                                    |
| Package manager | pnpm                                                          | Version pinned in `package.json`                                                                                                                                                   |

## Project structure

```
retake/
├── .claude/skills/          Claude Code skills — see "Skills" below
├── .claude-logs/            tracked (not gitignored) — AI session transcripts ship with the branch
├── .github/workflows/       ci.yml, deploy-migrations.yml, claude-code-review.yml
├── .githooks/commit-msg     installed automatically by `pnpm install`
├── docs/
│   ├── rules/                one file per engineering rule (see below)
│   ├── STANDARDS.md          what every 8x repo carries, and the check that proves it
│   └── CI_CD_SETUP.md        GitHub secrets/environments + Vercel setup
├── e2e/smoke.spec.ts        Playwright — delete once real coverage exists
├── messages/en.json         i18n strings
├── prisma/schema/            multi-file schema — the only thing you hand-edit
│   └── migrations/           CI-generated only, never by hand
├── prisma/run-once.sql       one-off SQL, applied once per database on the next deploy
├── scripts/                  commit-msg check, migration generator, run-once SQL runner, env-var check, standards check, RLS check
├── src/
│   ├── app/[locale]/         App Router pages, error.tsx, not-found.tsx, [...rest]/ (404 plumbing)
│   ├── app/global-error.tsx  root boundary, inline-styled (see docs/rules/error-handling.md)
│   ├── app/globals.css       design tokens (light + dark)
│   ├── components/           query-provider.tsx, error-page.tsx, error-boundary.tsx, ui/ (Button, Input, Card, toasts, ...)
│   ├── i18n/                 next-intl routing + request config
│   ├── lib/                  cn.ts, env.ts, toast.ts, errors/, observability/, notifications/, posthog/, supabase/
│   ├── server/                db/client.ts (the only file that touches Prisma), api/ (route factory)
│   └── proxy.ts               Supabase session refresh + next-intl locale routing
├── instrumentation.ts        Sentry init + env validation, run once at server boot
├── AGENTS.md                  index into docs/rules/* — read by every coding agent
├── CLAUDE.md                  thin: @AGENTS.md + session-log convention + skills pointer
├── DESIGN.md                  design-token/component conventions
└── .env.example               every variable explained inline
```

## Setup

```bash
pnpm install                       # also installs the commit-msg git hook + generates the Prisma client
cp .env.example .env.local         # fill in DATABASE_URL/DIRECT_URL at minimum
pnpm exec prisma migrate dev       # first migration, local only — see AGENTS.md
pnpm dev
```

Open http://localhost:3000 — English is served unprefixed, and `/en`
redirects back to `/`. Sentry,
PostHog, and Supabase Auth all no-op or fail open locally until you set
their env vars; nothing else requires them to run.

## Environment variables

Every variable the app reads is documented inline in `.env.example` (what
it's for, its fallback behavior, how to generate it) and validated at boot
by `src/lib/env.ts` — a misconfigured deployment fails immediately with a
clear message instead of an obscure error three requests later. Groups:
database (Prisma), Supabase Auth, Sentry, PostHog, Slack alerting, i18n,
cron secret, app URL. `pnpm check:env` fails if any `process.env.X` in `src/` is missing
from either `.env.example` or the schema. See `docs/CI_CD_SETUP.md` for
which of these are Vercel-side vs. GitHub Actions-only secrets — they're
not the same set.

## Database & migrations

Prisma schema (`prisma/schema/*.prisma`, one file per domain area) is the
only thing you hand-edit. **CI writes the migration, you write the
schema** — never touch a file under `prisma/schema/migrations/` yourself.
The one SQL file you do hand-write is `prisma/run-once.sql`: a one-off
change that isn't a schema change (fix a value, insert reference rows,
replace a view). The next deploy applies it to production once, right after
the migrations, and a ledger keyed by content hash makes sure it never runs
again — replace its content for the next one-off. Full workflow, the
destructive-change safety net, and why this approach was chosen over the
org's other migration patterns: `docs/rules/migrations.md`.

## Auth

Supabase Auth by default for any project with real user accounts —
already wired (`src/proxy.ts`, `src/lib/supabase/`), nothing to scaffold.
Auth and session only; Prisma still owns every byte of application data.
Landing pages with nothing to sign into remove it entirely — exact steps
in `docs/rules/auth.md`. `template-setup` asks which one applies.

## Testing

```bash
pnpm test        # node --test over scripts/*.test.mjs — fast, no browser
pnpm test:e2e     # Playwright — boots the app itself unless E2E_BASE_URL is set
```

The `e2e-review` skill runs the e2e suite and reviews failures against
their actual trace/screenshot rather than guessing from the error message.

## Skills

| Skill                                                                      | Run it                                                    | What it does                                                                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `template-setup`                                                           | Once, right after creating a new repo from this template  | Renames placeholders, confirms the repo was created the right way, asks internal- vs. external-facing and accounts-vs-landing-page, recommends packages accordingly                |
| `dev-onboarding`                                                           | Once per developer, joining an already-customized project | Install, env vars, migrations, boot the dev server — not for creating a new project, see `template-setup` for that                                                                 |
| `local-review`                                                             | Before every push                                         | Runs the full local gate (lint/typecheck/format/env/test/build) plus a manual pass against `docs/rules/*` — run before committing, not after CI fails, per `docs/rules/commits.md` |
| `e2e-review`                                                               | Before opening a PR for a UI/flow change                  | Boots the app, runs Playwright, reviews failures against their trace/screenshot, flags uncovered new flows                                                                         |
| `ai-usage-setup`                                                           | Once, when the project's AI answer is settled             | Wires AI spend tracking for the chosen providers and models, or strips it out — one of the two, never half                                                                         |
| `ai-usage-check`                                                           | On any branch touching an AI call or model                | Model map against live OpenRouter prices, pricing/failure-isolation tests, one real priced row written and read back                                                               |
| `staging-migration`, `sql-preview`, `seed-for-pr`, `local-feature-testing` | Day-to-day dev loop                                       | See each `SKILL.md` for detail                                                                                                                                                     |

## Rules live in AGENTS.md, not CLAUDE.md

`AGENTS.md` is a short index into `docs/rules/*.md` — one topic-scoped
file per rule: database access, migrations, auth, AI usage tracking, state
management, code style, code quality, feature approach, commits, pull
requests, deployment.
`AGENTS.md` is the file every coding agent reads (Claude, Codex, Cursor,
...), not just Claude Code, and the individual files are plain markdown
any of them can open directly. `CLAUDE.md` is deliberately thin: it
`@`-includes `AGENTS.md` and holds only the two things that are genuinely
Claude-Code-specific (session-log tracking, the skills list). Add new
rules under `docs/rules/` and link them from `AGENTS.md`; don't grow
`CLAUDE.md` back into a dumping ground.

`DESIGN.md` has the design-token/component conventions — read it before
styling anything. It ships a neutral starter token set (light + dark, via
`prefers-color-scheme`), not a real brand identity; that comes later, from
an actual mockup, via the org's `impeccable` tooling.

## Don't over-commit

Every push triggers a real, paid CI run. Don't commit after every small
step while iterating — run `local-review` locally first, then commit once
the work is actually done, not once per fix as you go. One feature commit,
plus at most one consolidated fix commit if something surfaces while
stabilizing it — not a string of "fix", "actually fix", "fix for real"
commits that each burn a CI run before anyone's looked at the last one.
Full rule, with the reasoning: `docs/rules/commits.md`.

Same principle applies to the PR itself: if you need to open one before
the work is done, open it as a **draft** with a placeholder title — don't
write a final-sounding description for work that isn't final. Write the
real title/description once, when the work is actually done, and mark it
ready for review at the same time. See `docs/rules/pull-requests.md`.

## Deployment

Never run a manual production deploy command — CI/CD handles it (see
`docs/rules/deployment.md`). Before this project's first real PR, read
`docs/CI_CD_SETUP.md` and set up:

- **GitHub**: access to the org's Claude review workflow and token,
  `MIGRATIONS_TOKEN`, the
  `production-database` environment (holding `PRODUCTION_DATABASE_URL`),
  and branch protection on `main`.
- **Vercel**: connect the repo, mirror `.env.example` into project env
  vars per-environment, and decide explicitly between Vercel's default
  auto-deploy-on-push and the org's tag-gated release pattern (see
  `docs/rules/deployment.md`) — don't inherit one silently.

## Still open

1. `prisma/schema/example.prisma` holds the real `User` model despite its
   name — move it into a properly named file (e.g. `user.prisma`) once the
   project's own models land; don't delete it.
2. Delete `e2e/smoke.spec.ts` once real e2e coverage exists.
3. Decide on state management beyond the TanStack Query default (a
   timeline editor may justify a client store — decide when it does), and
   the Prisma 6 → 7 upgrade.
4. Set up GitHub and Vercel per the Deployment section above before
   merging the first PR — without `MIGRATIONS_TOKEN` specifically, the
   CI-generated migration commit's own run sits in `action_required`
   waiting for manual approval.

## Scripts

| Command                                    | What it does                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`             | Standard Next.js                                                                                                                                                                |
| `pnpm lint` / `typecheck` / `format:check` | CI gates, run before pushing                                                                                                                                                    |
| `pnpm test`                                | `node --test` over `scripts/*.test.mjs`                                                                                                                                         |
| `pnpm test:e2e`                            | Playwright — boots the app itself unless `E2E_BASE_URL` is set                                                                                                                  |
| `pnpm check:env`                           | Fails if a `process.env.X` in `src/` isn't declared in `.env.example` + `src/lib/env.ts`                                                                                        |
| `pnpm check:standards`                     | Fails if a standard in `docs/STANDARDS.md` is unwired — rules index, commit hook, CI gates, effective lint/tsc config, tracked-file hygiene. `--root <dir>` audits another repo |
| `pnpm check:rls`                           | Reads `pg_class` on the database `DATABASE_URL` points at: every table has RLS enabled, no policies, never forced. Runs at the end of CI's migrations job                       |
| `pnpm prisma:generate`                     | Regenerate the Prisma client after a schema change                                                                                                                              |
| `pnpm prisma:migrate:generate:check`       | Dry-run what CI's migration generator would write, without writing it                                                                                                           |
| `pnpm db:run-once`                         | Apply `prisma/run-once.sql` once to `DIRECT_URL` (else `DATABASE_URL`) — what a deploy does                                                                                     |
